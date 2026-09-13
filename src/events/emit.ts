import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { redis } from "../lib/redis.js";
import { webhookQueue } from "../webhooks/queue.js";
import type { WebhookEventType, ZenithEvent } from "./types.js";

export function invoiceChannel(invoiceId: bigint): string {
  return `invoice-events:${invoiceId.toString()}`;
}

// Push a live update to any open checkout page. The watcher runs in its own
// process, so this goes over Redis pub/sub rather than an in-process emitter;
// the API's SSE handler subscribes to the same channel.
export async function publishInvoiceUpdate(
  invoiceId: bigint,
  update: Record<string, unknown>,
): Promise<void> {
  await redis.publish(invoiceChannel(invoiceId), JSON.stringify(update));
}

// Record and enqueue a webhook for every endpoint of a merchant subscribed to
// this event type. The delivery row is written before the job is enqueued, so a
// crash between the two leaves a visible pending row rather than a silent loss.
export async function emitWebhook(
  merchantId: string,
  type: WebhookEventType,
  data: Record<string, unknown>,
): Promise<ZenithEvent> {
  const event: ZenithEvent = {
    id: randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    data,
  };

  const endpoints = await db.query.webhookEndpoints.findMany({
    where: and(
      eq(schema.webhookEndpoints.merchantId, merchantId),
    ),
  });

  const queue = webhookQueue();
  for (const endpoint of endpoints) {
    if (endpoint.disabledAt) continue;
    if (endpoint.events.length > 0 && !endpoint.events.includes(type)) continue;

    const [delivery] = await db
      .insert(schema.webhookDeliveries)
      .values({
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: type,
        payload: event as unknown as Record<string, unknown>,
      })
      .returning({ id: schema.webhookDeliveries.id });

    if (delivery) {
      await queue.add("deliver", { deliveryId: delivery.id });
    }
  }

  return event;
}
