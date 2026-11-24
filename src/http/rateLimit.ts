import type { MiddlewareHandler } from "hono";

export interface RateLimitHit {
  // Requests counted in the current window, including this one.
  count: number;
  // Milliseconds until the current window ends.
  resetMs: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  store: RateLimitStore;
  // Identifies who is being limited. Return null to skip limiting this request
  // (for example the public SSE stream, which carries no API key).
  keyFor: (c: Parameters<MiddlewareHandler>[0]) => string | null;
}

// Fixed-window limiter. Sets the standard `RateLimit-*` headers on every limited
// response and answers `429` with `Retry-After` once the limit is passed. If the
// store is unavailable the request goes through: a Redis blip must not take the
// API down.
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const windowMs = opts.windowSeconds * 1000;
  return async (c, next) => {
    const id = opts.keyFor(c);
    if (!id) return next();

    let hit: RateLimitHit;
    try {
      hit = await opts.store.hit(`ratelimit:${id}`, windowMs);
    } catch (e) {
      console.error("Rate limit store unavailable, allowing request:", e);
      return next();
    }

    const resetSeconds = Math.max(1, Math.ceil(hit.resetMs / 1000));
    c.header("RateLimit-Limit", String(opts.limit));
    c.header("RateLimit-Remaining", String(Math.max(0, opts.limit - hit.count)));
    c.header("RateLimit-Reset", String(resetSeconds));

    if (hit.count > opts.limit) {
      c.header("Retry-After", String(resetSeconds));
      return c.json(
        { error: { code: "rate_limited", message: "Too many requests. Retry after the time in Retry-After." } },
        429,
      );
    }
    return next();
  };
}

// INCR and the expiry are set in one script so a crash between the two cannot
// leave a counter that never expires.
const HIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then redis.call("PEXPIRE", KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

interface EvalClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

export function redisStore(client: EvalClient): RateLimitStore {
  return {
    async hit(key, windowMs) {
      const [count, ttl] = (await client.eval(HIT_SCRIPT, 1, key, windowMs)) as [number, number];
      return { count, resetMs: ttl };
    },
  };
}
