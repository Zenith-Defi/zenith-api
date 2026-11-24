import { expireLapsedInvoices } from "./expiry.js";

const INTERVAL_MS = Number(process.env.EXPIRY_SWEEP_INTERVAL_MS ?? 30_000);

// Periodic job that expires lapsed invoices. Runs as its own process, like the
// watcher and the webhook worker.
async function tick() {
  try {
    const count = await expireLapsedInvoices();
    if (count > 0) console.log(`Expired ${count} invoice(s)`);
  } catch (e) {
    console.error("Expiry sweep failed", e);
  }
}

const timer = setInterval(() => void tick(), INTERVAL_MS);
void tick();
console.log(`Expiry sweeper running every ${INTERVAL_MS} ms`);

const shutdown = () => {
  clearInterval(timer);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
