import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { emitWebhook } from "../events/emit.js";
import { deriveMuxedAddress } from "../lib/stellar/muxed.js";
import { serializeInvoice } from "../http/serialize.js";

export interface CreateInvoiceInput {
  amount: string;
  asset: { code: string; issuer?: string | null };
  memo?: string;
  currencyDisplay?: string;
  expiresInSeconds?: number;
  metadata?: Record<string, unknown>;
}

export async function createInvoice(merchantId: string, input: CreateInvoiceInput) {
  const merchant = await db.query.merchants.findFirst({
    where: eq(schema.merchants.id, merchantId),
  });
  if (!merchant) throw new Error("merchant not found");

  const expiresAt = input.expiresInSeconds
    ? new Date(Date.now() + input.expiresInSeconds * 1000)
    : null;

  // Insert first to get the auto-assigned 64-bit id, then derive the muxed
  // address from it. The id is the only per-invoice input the address needs.
  const [inserted] = await db
    .insert(schema.invoices)
    .values({
      merchantId,
      mode: merchant.defaultMode,
      assetCode: input.asset.code,
      assetIssuer: input.asset.issuer ?? null,
      amount: input.amount,
      memo: input.memo ?? null,
      currencyDisplay: input.currencyDisplay ?? null,
      metadata: input.metadata ?? null,
      expiresAt,
      // Placeholder overwritten immediately below.
      muxedAddress: "",
    })
    .returning();

  if (!inserted) throw new Error("failed to create invoice");

  const muxedAddress = deriveMuxedAddress(merchant.stellarAccount, inserted.id);
  const [updated] = await db
    .update(schema.invoices)
    .set({ muxedAddress })
    .where(eq(schema.invoices.id, inserted.id))
    .returning();

  const invoice = updated ?? inserted;
  const serialized = serializeInvoice(invoice);
  await emitWebhook(merchantId, "invoice.created", { invoice: serialized });
  return serialized;
}

export async function cancelInvoice(merchantId: string, invoiceId: bigint) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(schema.invoices.id, invoiceId),
  });
  if (!invoice || invoice.merchantId !== merchantId) return null;
  if (invoice.status !== "open" && invoice.status !== "underpaid") {
    return { conflict: true as const, invoice: serializeInvoice(invoice) };
  }
  const [updated] = await db
    .update(schema.invoices)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(schema.invoices.id, invoiceId))
    .returning();
  return { conflict: false as const, invoice: serializeInvoice(updated!) };
}
