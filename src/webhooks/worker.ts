import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { buildSignatureHeader } from "../lib/hmac.js";
import { createRedis } from "../lib/redis.js";
import { MAX_ATTEMPTS, RETRY_DELAYS_MS, WEBHOOK_QUEUE, type WebhookJob } from "./queue.js";

async function deliver(deliveryId: string, attemptsMade: number): Promise<void> {
  const delivery = await db.query.webhookDeliveries.findFirst({
    where: eq(schema.webhookDeliveries.id, deliveryId),
  });
  if (!delivery) return;
  if (delivery.status === "delivered" || delivery.status === "dead") return;

  const endpoint = await db.query.webhookEndpoints.findFirst({
    where: eq(schema.webhookEndpoints.id, delivery.endpointId),
  });
  if (!endpoint) return;

  const rawBody = JSON.stringify(delivery.payload);
  const signature = buildSignatureHeader(endpoint.secret, rawBody);

  let responseStatus = 0;
  let responseBody = "";
  let ok = false;
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zenith-signature": signature,
        "x-zenith-event-id": delivery.eventId,
        "x-zenith-event-type": delivery.eventType,
      },
      body: rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    responseStatus = res.status;
    responseBody = (await res.text()).slice(0, 2000);
    ok = res.ok;
  } catch (err) {
    responseBody = err instanceof Error ? err.message : String(err);
  }

  const isLastAttempt = attemptsMade >= MAX_ATTEMPTS;
  const status = ok ? "delivered" : isLastAttempt ? "dead" : "failed";

  await db
    .update(schema.webhookDeliveries)
    .set({
      status,
      attempts: attemptsMade,
      lastResponseStatus: responseStatus || null,
      lastResponseBody: responseBody,
      lastAttemptAt: new Date(),
    })
    .where(eq(schema.webhookDeliveries.id, deliveryId));

  // Throwing tells BullMQ to retry with the backoff schedule until MAX_ATTEMPTS.
  if (!ok) throw new Error(`Delivery failed with status ${responseStatus}`);
}

const worker = new Worker<WebhookJob>(
  WEBHOOK_QUEUE,
  async (job) => {
    await deliver(job.data.deliveryId, job.attemptsMade + 1);
  },
  {
    connection: createRedis(),
    settings: {
      backoffStrategy: (attemptsMade: number) => {
        // attemptsMade is the number already made; pick the matching delay.
        return RETRY_DELAYS_MS[attemptsMade - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
      },
    },
  },
);

worker.on("failed", (job, err) => {
  console.error(`Webhook job ${job?.id} failed:`, err.message);
});

console.log("Webhook worker started");
