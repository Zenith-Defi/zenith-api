import { Keypair } from "@stellar/stellar-sdk";
import { eq } from "drizzle-orm";
import { hashApiKey } from "../src/auth/apiKey.js";
import { db, schema } from "../src/db/client.js";
import { env } from "../src/env.js";

// Seeds one public demo merchant with a fixed, publishable API key so a hosted
// demo has something to sign in with. The key is not a secret: it is printed in
// the web README and is meant for a shared Testnet demo. It is safe to publish
// only because Zenith is Testnet-only and holds no funds. Re-running is a no-op
// once the key exists, so it can run on every deploy.
//
// The key is not scope-limited yet (see the API key scopes issue), so treat it
// as a demo account rather than a truly read-only credential.
const DEMO_API_KEY = "zk_test_publicdemo0000000000000000";

async function main() {
  const hash = hashApiKey(DEMO_API_KEY);
  const existing = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.hash, hash) });
  if (existing) {
    console.log("Demo merchant already seeded; leaving it untouched.");
    console.log("API key:", DEMO_API_KEY);
    process.exit(0);
  }

  const keypair = Keypair.random();
  const account = keypair.publicKey();
  try {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${account}`);
    if (!res.ok) throw new Error(`Friendbot returned ${res.status}`);
    console.log("Funded demo account via Friendbot");
  } catch (e) {
    console.warn("Could not fund via Friendbot, fund it manually:", (e as Error).message);
  }

  const [merchant] = await db
    .insert(schema.merchants)
    .values({ name: "Public Demo", stellarAccount: account })
    .returning();

  await db
    .insert(schema.watcherCursors)
    .values({ merchantId: merchant!.id, stellarAccount: account, cursor: "0" })
    .onConflictDoNothing();

  await db.insert(schema.apiKeys).values({
    merchantId: merchant!.id,
    hash,
    prefix: DEMO_API_KEY.slice(0, 12),
    label: "public-demo",
  });

  console.log("\n=== Public demo merchant ===");
  console.log("Merchant id:     ", merchant!.id);
  console.log("Stellar account: ", account);
  console.log("API key:         ", DEMO_API_KEY);
  console.log("Horizon:         ", env.HORIZON_URL);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
