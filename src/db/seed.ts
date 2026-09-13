import { Keypair } from "@stellar/stellar-sdk";
import { generateApiKey } from "../auth/apiKey.js";
import { db, schema } from "./client.js";
import { env } from "../env.js";

// Creates one demo merchant and prints its API key. The merchant needs a real
// Testnet account so the watcher has something to stream; this generates a
// keypair and funds it with Friendbot. Zenith never stores the secret key: it
// is printed once for local use and the merchant keeps it. That is the whole
// point of the non-custodial design, and the seed script honours it too.
async function main() {
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
    .values({ name: "Demo Merchant", stellarAccount: account })
    .returning();

  await db
    .insert(schema.watcherCursors)
    .values({ merchantId: merchant!.id, stellarAccount: account, cursor: "0" })
    .onConflictDoNothing();

  const key = generateApiKey();
  await db.insert(schema.apiKeys).values({
    merchantId: merchant!.id,
    hash: key.hash,
    prefix: key.prefix,
    label: "seed",
  });

  console.log("\n=== Demo merchant ===");
  console.log("Merchant id:      ", merchant!.id);
  console.log("Stellar account:  ", account);
  console.log("Secret (keep it): ", keypair.secret());
  console.log("API key:          ", key.plaintext);
  console.log("Horizon:          ", env.HORIZON_URL);
  console.log("\nExport the key for the SDK and CLI:");
  console.log(`  export ZENITH_API_KEY=${key.plaintext}\n`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
