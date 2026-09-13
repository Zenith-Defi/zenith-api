import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";

const KEY_PREFIX = "zk_test_";

export interface GeneratedKey {
  plaintext: string;
  hash: string;
  prefix: string;
}

// Keys are shown to the merchant exactly once. Only the hash is stored, so a
// database leak does not hand out working keys. The display prefix is the first
// few characters of the plaintext, kept in the clear so a key is identifiable
// in a list without being usable.
export function generateApiKey(): GeneratedKey {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX}${secret}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, KEY_PREFIX.length + 4),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export interface AuthedMerchant {
  merchantId: string;
  apiKeyId: string;
}

export async function authenticate(headerValue: string | undefined): Promise<AuthedMerchant | null> {
  if (!headerValue) return null;
  const token = headerValue.startsWith("Bearer ") ? headerValue.slice(7) : headerValue;
  const hash = hashApiKey(token.trim());
  const row = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.hash, hash) });
  if (!row || row.revokedAt) return null;
  // Touch last-used without blocking the request path.
  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id))
    .catch(() => undefined);
  return { merchantId: row.merchantId, apiKeyId: row.id };
}
