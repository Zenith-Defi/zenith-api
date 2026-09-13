import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export async function loadCursor(merchantId: string, stellarAccount: string): Promise<string> {
  const row = await db.query.watcherCursors.findFirst({
    where: eq(schema.watcherCursors.merchantId, merchantId),
  });
  if (row) return row.cursor;
  await db
    .insert(schema.watcherCursors)
    .values({ merchantId, stellarAccount, cursor: "0" })
    .onConflictDoNothing();
  return "0";
}

// Persisted after each handled operation. Because processPayment is idempotent,
// saving the cursor after the side effect is safe: a crash before the save
// replays the last operation, which is a no-op.
export async function saveCursor(merchantId: string, cursor: string): Promise<void> {
  await db
    .update(schema.watcherCursors)
    .set({ cursor, updatedAt: new Date() })
    .where(eq(schema.watcherCursors.merchantId, merchantId));
}
