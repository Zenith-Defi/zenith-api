import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

export function hashRequest(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export interface StoredResponse {
  status: number;
  body: Record<string, unknown>;
}

// Look up a prior response for this merchant and key. If the key was used with a
// different request body, that is a client error: the same key must mean the
// same request. The watcher and the SDK both retry, so every write path that a
// retry can hit must be idempotent.
export async function lookupIdempotent(
  merchantId: string,
  key: string,
  requestHash: string,
): Promise<StoredResponse | { mismatch: true } | null> {
  const row = await db.query.idempotencyKeys.findFirst({
    where: and(
      eq(schema.idempotencyKeys.merchantId, merchantId),
      eq(schema.idempotencyKeys.key, key),
    ),
  });
  if (!row) return null;
  if (row.requestHash !== requestHash) return { mismatch: true };
  return { status: row.responseStatus, body: row.responseBody };
}

export async function storeIdempotent(
  merchantId: string,
  key: string,
  requestHash: string,
  response: StoredResponse,
): Promise<void> {
  await db
    .insert(schema.idempotencyKeys)
    .values({
      merchantId,
      key,
      requestHash,
      responseStatus: response.status,
      responseBody: response.body,
    })
    .onConflictDoNothing();
}
