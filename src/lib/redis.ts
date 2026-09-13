import { Redis } from "ioredis";
import { env } from "../env.js";

// BullMQ requires maxRetriesPerRequest to be null on its connection.
export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

// A shared connection for non-queue use (pub/sub publisher, plain commands).
// lazyConnect keeps importing this module from opening a socket, so tooling
// that only needs the route definitions (OpenAPI emit) does not hang on Redis.
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
