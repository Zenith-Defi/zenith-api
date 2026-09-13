import { Horizon } from "@stellar/stellar-sdk";
import { db } from "../db/client.js";
import { env } from "../env.js";
import { loadCursor, saveCursor } from "./cursor.js";
import { processPayment, type HorizonPayment } from "./process.js";

const server = new Horizon.Server(env.HORIZON_URL);

// Stream one merchant account's payments. Horizon's SSE stream reconnects on
// its own; on top of that we persist the cursor after each handled payment so a
// process restart resumes from where it stopped. A backfill on start catches
// anything that arrived while the process was down.
function watchAccount(merchantId: string, account: string): () => void {
  let closed = false;
  let close: (() => void) | null = null;

  async function start() {
    const cursor = await loadCursor(merchantId, account);
    if (closed) return;
    close = server
      .payments()
      .forAccount(account)
      .cursor(cursor)
      .stream({
        onmessage: (record: unknown) => {
          const op = record as HorizonPayment;
          void handle(merchantId, op);
        },
        onerror: (e: unknown) => {
          console.error(`Stream error for ${account}, reconnecting:`, e);
        },
      });
  }

  async function handle(mid: string, op: HorizonPayment) {
    try {
      await processPayment(mid, op);
      await saveCursor(mid, op.id);
    } catch (e) {
      console.error("Failed to process payment", op.id, e);
    }
  }

  void start();
  return () => {
    closed = true;
    if (close) close();
  };
}

async function main() {
  const merchants = await db.query.merchants.findMany();
  if (merchants.length === 0) {
    console.log("No merchants to watch. Run pnpm seed first.");
  }
  const stoppers = merchants.map((m) => watchAccount(m.id, m.stellarAccount));
  console.log(`Watching ${merchants.length} merchant account(s)`);

  const shutdown = () => {
    stoppers.forEach((stop) => stop());
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
