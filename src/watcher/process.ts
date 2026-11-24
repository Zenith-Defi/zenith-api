import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { emitWebhook, publishInvoiceUpdate } from "../events/emit.js";
import { horizonAmountToStroops } from "../lib/money.js";
import { parseMuxedAddress } from "../lib/stellar/muxed.js";
import { serializeInvoice } from "../http/serialize.js";
import { statusForAmount } from "../invoice/stateMachine.js";

// A trimmed view of a Horizon payment operation. Horizon fills `to_muxed` and
// `to_muxed_id` when the destination was a muxed address, which is exactly the
// case Zenith creates: the invoice id is recovered from there.
export interface HorizonPayment {
  id: string;
  transaction_hash: string;
  type: string;
  from: string;
  to?: string;
  to_muxed?: string;
  to_muxed_id?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
}

function recoverInvoiceId(op: HorizonPayment): bigint | null {
  if (op.to_muxed_id) {
    try {
      return BigInt(op.to_muxed_id);
    } catch {
      return null;
    }
  }
  if (op.to_muxed) {
    try {
      return parseMuxedAddress(op.to_muxed).invoiceId;
    } catch {
      return null;
    }
  }
  return null;
}

function assetMatches(op: HorizonPayment, invoice: typeof schema.invoices.$inferSelect): boolean {
  if (op.asset_type === "native") return invoice.assetCode === "XLM" || invoice.assetCode === "native";
  return op.asset_code === invoice.assetCode && (op.asset_issuer ?? null) === invoice.assetIssuer;
}

// Handle one payment. Safe to call twice on the same operation: the payments
// table has a unique index on the Horizon operation id, so a second insert is a
// no-op and the invoice total is only advanced when a row is genuinely new.
export async function processPayment(merchantId: string, op: HorizonPayment): Promise<void> {
  if (op.type !== "payment" && op.type !== "path_payment_strict_receive" && op.type !== "path_payment_strict_send") {
    return;
  }
  const invoiceId = recoverInvoiceId(op);
  if (invoiceId === null || !op.amount) return;

  const invoice = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!invoice || invoice.merchantId !== merchantId) return;
  if (!assetMatches(op, invoice)) return;

  const amountStroops = horizonAmountToStroops(op.amount);

  // Record the payment and advance the invoice in one transaction, holding a
  // row lock on the invoice. The expiry sweeper updates the same row, so the
  // two serialise: whichever takes the lock first decides the outcome.
  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.payments)
      .values({
        invoiceId,
        merchantId,
        horizonOperationId: op.id,
        txHash: op.transaction_hash,
        fromAccount: op.from,
        assetCode: invoice.assetCode,
        assetIssuer: invoice.assetIssuer,
        amount: amountStroops.toString(),
      })
      .onConflictDoNothing({ target: schema.payments.horizonOperationId })
      .returning({ id: schema.payments.id });

    // Already recorded on a prior run. Nothing to advance.
    if (inserted.length === 0) return null;

    const [current] = await tx
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId))
      .for("update");
    if (!current) return null;

    const total = BigInt(current.amountReceived) + amountStroops;
    const nextStatus = statusForAmount(BigInt(current.amount), total);

    // Do not move a terminal invoice backwards. An overpaid invoice stays
    // overpaid, and an invoice the sweeper already expired stays expired: the
    // payment is still recorded and counted in amountReceived so it can be
    // reconciled or refunded, but it does not revive the invoice.
    const finalStatus =
      current.status === "paid" || current.status === "overpaid" || current.status === "expired"
        ? current.status
        : nextStatus;

    const [updated] = await tx
      .update(schema.invoices)
      .set({
        amountReceived: total.toString(),
        status: finalStatus,
        paidAt:
          finalStatus === "paid" || finalStatus === "overpaid"
            ? current.paidAt ?? new Date()
            : current.paidAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.invoices.id, invoiceId))
      .returning();
    return updated ? { updated, finalStatus } : null;
  });

  if (!result) return;
  const { updated, finalStatus } = result;

  const serialized = serializeInvoice(updated);
  await publishInvoiceUpdate(invoiceId, { type: "invoice.updated", invoice: serialized });

  if (finalStatus === "paid" || finalStatus === "overpaid") {
    await emitWebhook(merchantId, "invoice.paid", { invoice: serialized });
  } else if (finalStatus === "underpaid") {
    await emitWebhook(merchantId, "invoice.underpaid", { invoice: serialized });
  }
}
