import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { rateLimit, type RateLimitStore } from "../src/http/rateLimit.js";

function memoryStore(): RateLimitStore {
  const counts = new Map<string, number>();
  return {
    async hit(key) {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { count, resetMs: 42_000 };
    },
  };
}

function appWith(store: RateLimitStore, limit = 2) {
  const app = new Hono();
  app.use(
    "*",
    rateLimit({
      limit,
      windowSeconds: 60,
      store,
      keyFor: (c) => c.req.header("x-key") ?? null,
    }),
  );
  app.get("/ping", (c) => c.json({ ok: true }));
  return app;
}

const call = (app: Hono, key?: string) =>
  app.request("/ping", { headers: key ? { "x-key": key } : {} });

describe("rateLimit", () => {
  it("sets RateLimit headers on allowed requests", async () => {
    const res = await call(appWith(memoryStore()), "a");
    expect(res.status).toBe(200);
    expect(res.headers.get("RateLimit-Limit")).toBe("2");
    expect(res.headers.get("RateLimit-Remaining")).toBe("1");
    expect(res.headers.get("RateLimit-Reset")).toBe("42");
  });

  it("answers 429 with Retry-After once the limit is passed", async () => {
    const app = appWith(memoryStore());
    await call(app, "a");
    await call(app, "a");
    const res = await call(app, "a");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(res.headers.get("RateLimit-Remaining")).toBe("0");
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rate_limited");
  });

  it("counts each key separately", async () => {
    const app = appWith(memoryStore());
    await call(app, "a");
    await call(app, "a");
    expect((await call(app, "a")).status).toBe(429);
    expect((await call(app, "b")).status).toBe(200);
  });

  it("skips requests that have no key, like the public SSE stream", async () => {
    const app = appWith(memoryStore(), 1);
    for (let i = 0; i < 5; i++) {
      const res = await call(app);
      expect(res.status).toBe(200);
      expect(res.headers.get("RateLimit-Limit")).toBeNull();
    }
  });

  it("lets the request through when the store is down", async () => {
    const broken: RateLimitStore = {
      hit: async () => {
        throw new Error("redis down");
      },
    };
    const orig = console.error;
    console.error = () => {};
    try {
      expect((await call(appWith(broken), "a")).status).toBe(200);
    } finally {
      console.error = orig;
    }
  });
});
