import { Queue } from "bullmq";
import { createRedis } from "../lib/redis.js";

export const WEBHOOK_QUEUE = "webhooks";

// Retry schedule in milliseconds: 1s, 10s, 1m, 10m, 1h, 6h, then dead-letter.
// Index 0 is the delay before the first retry (after attempt 1 fails).
export const RETRY_DELAYS_MS = [1_000, 10_000, 60_000, 600_000, 3_600_000, 21_600_000];

// attempts = one initial delivery plus one per retry delay.
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export interface WebhookJob {
  deliveryId: string;
}

let queue: Queue<WebhookJob> | null = null;

export function webhookQueue(): Queue<WebhookJob> {
  if (!queue) {
    queue = new Queue<WebhookJob>(WEBHOOK_QUEUE, {
      connection: createRedis(),
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        backoff: { type: "custom" },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    });
  }
  return queue;
}
