import { and, inArray, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { emitWebhook, publishInvoiceUpdate } from "../events/emit.js";
import { serializeInvoice } from "../http/serialize.js";

// Move every lapsed `open` or `underpaid` invoice to `expired`.
//
// The status change is a single conditional UPDATE, so each invoice leaves the
// open/underpaid set exactly once, and only the rows that actually changed come
// back from RETURNING. That is what makes `invoice.expired` fire once per
// invoice, even if two sweeper processes overlap. The watcher locks the invoice
// row while it applies a payment (see processPayment), so a payment landing in
// the same tick is resolved by whichever transaction takes the lock first.
export async function expireLapsedInvoices(now: Date = new Date()): Promise<number> {
  const expired = await db
    .update(schema.invoices)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        inArray(schema.invoices.status, ["open", "underpaid"]),
        isNotNull(schema.invoices.expiresAt),
        lte(schema.invoices.expiresAt, now),
      ),
    )
    .returning();

  for (const row of expired) {
    const serialized = serializeInvoice(row);
    try {
      await publishInvoiceUpdate(row.id, { type: "invoice.updated", invoice: serialized });
      await emitWebhook(row.merchantId, "invoice.expired", { invoice: serialized });
    } catch (e) {
      console.error(`Failed to announce expiry of invoice ${row.id}`, e);
    }
  }
  return expired.length;
}
