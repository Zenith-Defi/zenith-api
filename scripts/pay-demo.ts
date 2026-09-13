/*
 * End-to-end local proof: create an invoice through the API, then pay it from a
 * fresh Testnet account. Run it after `docker compose up`, `pnpm db:migrate`,
 * `pnpm seed`, `pnpm dev`, `pnpm worker` and `pnpm watcher` are up.
 *
 *   ZENITH_API_KEY=zk_test_... pnpm tsx scripts/pay-demo.ts
 *
 * It pays in native XLM so no trustline setup is needed. Watch the API logs:
 * the invoice flips to paid and a webhook fires.
 */
import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const API = process.env.ZENITH_BASE_URL ?? "http://localhost:8787";
const HORIZON = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const apiKey = process.env.ZENITH_API_KEY;

if (!apiKey) {
  console.error("Set ZENITH_API_KEY (printed by `pnpm seed`).");
  process.exit(1);
}

async function main() {
  const create = await fetch(`${API}/v1/invoices`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ amount: "10000000", asset: { code: "XLM", issuer: null }, memo: "demo" }),
  });
  if (!create.ok) throw new Error(`Create failed: ${create.status} ${await create.text()}`);
  const invoice = (await create.json()) as { id: string; muxedAddress: string; checkoutUrl: string };
  console.log("Invoice:", invoice.id);
  console.log("Pay to:", invoice.muxedAddress);
  console.log("Checkout:", invoice.checkoutUrl);

  const payer = Keypair.random();
  const fund = await fetch(`https://friendbot.stellar.org/?addr=${payer.publicKey()}`);
  if (!fund.ok) throw new Error("Friendbot funding failed");
  console.log("Funded payer", payer.publicKey());

  const server = new Horizon.Server(HORIZON);
  const account = await server.loadAccount(payer.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: "1000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: invoice.muxedAddress,
        asset: Asset.native(),
        amount: "1.0000000",
      }),
    )
    .setTimeout(60)
    .build();
  tx.sign(payer);
  const res = await server.submitTransaction(tx);
  console.log("Paid in tx", res.hash);
  console.log("Watch the API log for the invoice.paid webhook.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
