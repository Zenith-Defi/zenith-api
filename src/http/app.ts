import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, lt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { streamSSE } from "hono/streaming";
import { authenticate, generateApiKey } from "../auth/apiKey.js";
import { db, schema } from "../db/client.js";
import { createRedis } from "../lib/redis.js";
import { invoiceChannel } from "../events/emit.js";
import { webhookQueue } from "../webhooks/queue.js";
import { cancelInvoice, createInvoice } from "../invoice/service.js";
import { hashRequest, lookupIdempotent, storeIdempotent } from "./idempotency.js";
import { serializeApiKey, serializeEndpoint, serializeInvoice, serializePayment } from "./serialize.js";
import {
  ApiKeySchema,
  CreateApiKeySchema,
  CreateInvoiceSchema,
  CreateWebhookEndpointSchema,
  ErrorSchema,
  InvoiceSchema,
  ListQuerySchema,
  PaymentSchema,
  WebhookEndpointSchema,
} from "./schemas.js";

type Variables = { merchantId: string };

export const app = new OpenAPIHono<{ Variables: Variables }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { error: { code: "invalid_request", message: result.error.issues.map((i) => i.message).join("; ") } },
        400,
      );
    }
  },
});

function err(code: string, message: string) {
  return { error: { code, message } };
}

// API-key auth on everything under /v1 except the public SSE stream, which a
// checkout page opens from the browser with no key.
app.use("/v1/*", async (c, next) => {
  if (c.req.path.match(/^\/v1\/invoices\/[^/]+\/events$/)) return next();
  const merchant = await authenticate(c.req.header("authorization"));
  if (!merchant) return c.json(err("unauthorized", "Missing or invalid API key"), 401);
  c.set("merchantId", merchant.merchantId);
  return next();
});

const jsonError = {
  400: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid request" },
  401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
  404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
};

const createInvoiceRoute = createRoute({
  method: "post",
  path: "/v1/invoices",
  summary: "Create an invoice",
  request: {
    headers: z.object({ "idempotency-key": z.string().optional() }),
    body: { content: { "application/json": { schema: CreateInvoiceSchema } } },
  },
  responses: {
    201: { content: { "application/json": { schema: InvoiceSchema } }, description: "Created" },
    200: { content: { "application/json": { schema: InvoiceSchema } }, description: "Idempotent replay" },
    ...jsonError,
  },
});

app.openapi(createInvoiceRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const body = c.req.valid("json");
  const key = c.req.header("idempotency-key");
  const requestHash = hashRequest(body);

  if (key) {
    const prior = await lookupIdempotent(merchantId, key, requestHash);
    if (prior && "mismatch" in prior) {
      return c.json(err("idempotency_conflict", "Idempotency-Key reused with a different body"), 409 as never);
    }
    if (prior) return c.json(prior.body as never, prior.status as never);
  }

  const invoice = await createInvoice(merchantId, body);
  if (key) {
    await storeIdempotent(merchantId, key, requestHash, { status: 201, body: invoice });
  }
  return c.json(invoice, 201);
});

const getInvoiceRoute = createRoute({
  method: "get",
  path: "/v1/invoices/{id}",
  summary: "Fetch an invoice",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: InvoiceSchema } }, description: "OK" },
    ...jsonError,
  },
});

app.openapi(getInvoiceRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const id = parseInvoiceId(c.req.valid("param").id);
  if (id === null) return c.json(err("not_found", "No such invoice"), 404);
  const row = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id) });
  if (!row || row.merchantId !== merchantId) return c.json(err("not_found", "No such invoice"), 404);
  return c.json(serializeInvoice(row), 200);
});

const listInvoicesRoute = createRoute({
  method: "get",
  path: "/v1/invoices",
  summary: "List invoices",
  request: { query: ListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ data: z.array(InvoiceSchema), nextCursor: z.string().nullable() }) } },
      description: "OK",
    },
    ...jsonError,
  },
});

app.openapi(listInvoicesRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const { limit, cursor } = c.req.valid("query");
  const cursorId = cursor ? parseInvoiceId(cursor) : null;
  const where = cursorId
    ? and(eq(schema.invoices.merchantId, merchantId), lt(schema.invoices.id, cursorId))
    : eq(schema.invoices.merchantId, merchantId);
  const rows = await db.query.invoices.findMany({
    where,
    orderBy: desc(schema.invoices.id),
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return c.json(
    {
      data: page.map(serializeInvoice),
      nextCursor: hasMore ? page[page.length - 1]!.id.toString() : null,
    },
    200,
  );
});

const cancelInvoiceRoute = createRoute({
  method: "post",
  path: "/v1/invoices/{id}/cancel",
  summary: "Cancel an open invoice",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: InvoiceSchema } }, description: "Cancelled" },
    409: { content: { "application/json": { schema: ErrorSchema } }, description: "Not cancellable" },
    ...jsonError,
  },
});

app.openapi(cancelInvoiceRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const id = parseInvoiceId(c.req.valid("param").id);
  if (id === null) return c.json(err("not_found", "No such invoice"), 404);
  const result = await cancelInvoice(merchantId, id);
  if (!result) return c.json(err("not_found", "No such invoice"), 404);
  if (result.conflict) return c.json(err("not_cancellable", "Invoice is not open"), 409 as never);
  return c.json(result.invoice, 200);
});

const listPaymentsRoute = createRoute({
  method: "get",
  path: "/v1/payments",
  summary: "List payments",
  request: { query: ListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ data: z.array(PaymentSchema), nextCursor: z.string().nullable() }) } },
      description: "OK",
    },
    ...jsonError,
  },
});

app.openapi(listPaymentsRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const { limit } = c.req.valid("query");
  const rows = await db.query.payments.findMany({
    where: eq(schema.payments.merchantId, merchantId),
    orderBy: desc(schema.payments.createdAt),
    limit,
  });
  return c.json({ data: rows.map(serializePayment), nextCursor: null }, 200);
});

// Webhook endpoint CRUD.
const createEndpointRoute = createRoute({
  method: "post",
  path: "/v1/webhook-endpoints",
  summary: "Register a webhook endpoint",
  request: { body: { content: { "application/json": { schema: CreateWebhookEndpointSchema } } } },
  responses: {
    201: {
      content: { "application/json": { schema: WebhookEndpointSchema.extend({ secret: z.string() }) } },
      description: "Created; secret is returned once",
    },
    ...jsonError,
  },
});

app.openapi(createEndpointRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const body = c.req.valid("json");
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(schema.webhookEndpoints)
    .values({ merchantId, url: body.url, secret, events: body.events ?? [] })
    .returning();
  return c.json({ ...serializeEndpoint(row!), secret }, 201);
});

const listEndpointsRoute = createRoute({
  method: "get",
  path: "/v1/webhook-endpoints",
  summary: "List webhook endpoints",
  responses: {
    200: { content: { "application/json": { schema: z.object({ data: z.array(WebhookEndpointSchema) }) } }, description: "OK" },
    ...jsonError,
  },
});

app.openapi(listEndpointsRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const rows = await db.query.webhookEndpoints.findMany({
    where: eq(schema.webhookEndpoints.merchantId, merchantId),
  });
  return c.json({ data: rows.map(serializeEndpoint) }, 200);
});

const deleteEndpointRoute = createRoute({
  method: "delete",
  path: "/v1/webhook-endpoints/{id}",
  summary: "Delete a webhook endpoint",
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: "Deleted" },
    ...jsonError,
  },
});

app.openapi(deleteEndpointRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const { id } = c.req.valid("param");
  const row = await db.query.webhookEndpoints.findFirst({ where: eq(schema.webhookEndpoints.id, id) });
  if (!row || row.merchantId !== merchantId) return c.json(err("not_found", "No such endpoint"), 404);
  await db.delete(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, id));
  return c.body(null, 204);
});

const replayRoute = createRoute({
  method: "post",
  path: "/v1/webhook-deliveries/{id}/replay",
  summary: "Re-enqueue a webhook delivery",
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    202: { content: { "application/json": { schema: z.object({ deliveryId: z.string() }) } }, description: "Re-enqueued" },
    ...jsonError,
  },
});

app.openapi(replayRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const { id } = c.req.valid("param");
  const delivery = await db.query.webhookDeliveries.findFirst({
    where: eq(schema.webhookDeliveries.id, id),
  });
  if (!delivery) return c.json(err("not_found", "No such delivery"), 404);
  const endpoint = await db.query.webhookEndpoints.findFirst({
    where: eq(schema.webhookEndpoints.id, delivery.endpointId),
  });
  if (!endpoint || endpoint.merchantId !== merchantId) {
    return c.json(err("not_found", "No such delivery"), 404);
  }
  await db.update(schema.webhookDeliveries).set({ status: "pending" }).where(eq(schema.webhookDeliveries.id, id));
  await webhookQueue().add("deliver", { deliveryId: id });
  return c.json({ deliveryId: id }, 202);
});

// API key management. A key authenticates as its merchant and can mint and
// revoke sibling keys for that same merchant. The plaintext is returned once on
// creation and never again; only the hash is stored.
const createApiKeyRoute = createRoute({
  method: "post",
  path: "/v1/api-keys",
  summary: "Create an API key",
  request: { body: { content: { "application/json": { schema: CreateApiKeySchema } } } },
  responses: {
    201: {
      content: { "application/json": { schema: ApiKeySchema.extend({ plaintext: z.string() }) } },
      description: "Created; plaintext is returned once",
    },
    ...jsonError,
  },
});

app.openapi(createApiKeyRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const { label } = c.req.valid("json");
  const key = generateApiKey();
  const [row] = await db
    .insert(schema.apiKeys)
    .values({ merchantId, hash: key.hash, prefix: key.prefix, label: label ?? null })
    .returning();
  return c.json({ ...serializeApiKey(row!), plaintext: key.plaintext }, 201);
});

const listApiKeysRoute = createRoute({
  method: "get",
  path: "/v1/api-keys",
  summary: "List API keys",
  responses: {
    200: { content: { "application/json": { schema: z.object({ data: z.array(ApiKeySchema) }) } }, description: "OK" },
    ...jsonError,
  },
});

app.openapi(listApiKeysRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const rows = await db.query.apiKeys.findMany({ where: eq(schema.apiKeys.merchantId, merchantId) });
  return c.json({ data: rows.map(serializeApiKey) }, 200);
});

const revokeApiKeyRoute = createRoute({
  method: "post",
  path: "/v1/api-keys/{id}/revoke",
  summary: "Revoke an API key",
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { content: { "application/json": { schema: ApiKeySchema } }, description: "Revoked" },
    ...jsonError,
  },
});

app.openapi(revokeApiKeyRoute, async (c) => {
  const merchantId = c.get("merchantId");
  const { id } = c.req.valid("param");
  const row = await db.query.apiKeys.findFirst({ where: eq(schema.apiKeys.id, id) });
  if (!row || row.merchantId !== merchantId) return c.json(err("not_found", "No such key"), 404);
  const [updated] = await db
    .update(schema.apiKeys)
    .set({ revokedAt: row.revokedAt ?? new Date() })
    .where(eq(schema.apiKeys.id, id))
    .returning();
  return c.json(serializeApiKey(updated!), 200);
});

// Server-sent events for a single invoice. Public: the checkout page opens this
// with no API key so the page can flip to paid the moment the watcher detects a
// payment. Each connection subscribes to a per-invoice Redis channel.
app.get("/v1/invoices/:id/events", async (c) => {
  const id = parseInvoiceId(c.req.param("id"));
  if (id === null) return c.json(err("not_found", "No such invoice"), 404);
  const invoice = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id) });
  if (!invoice) return c.json(err("not_found", "No such invoice"), 404);

  return streamSSE(c, async (stream) => {
    const sub = createRedis();
    await sub.subscribe(invoiceChannel(id));
    await stream.writeSSE({ event: "snapshot", data: JSON.stringify(serializeInvoice(invoice)) });

    sub.on("message", (_channel, message) => {
      void stream.writeSSE({ event: "update", data: message });
    });

    const heartbeat = setInterval(() => {
      void stream.writeSSE({ event: "ping", data: "1" });
    }, 15_000);

    stream.onAbort(() => {
      clearInterval(heartbeat);
      void sub.quit();
    });

    // Hold the stream open until the client disconnects.
    await new Promise<void>((resolve) => stream.onAbort(resolve));
  });
});

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    version: "0.1.0",
    title: "Zenith API",
    description: "Non-custodial crypto checkout on Stellar. Testnet only.",
  },
  servers: [{ url: "http://localhost:8787", description: "Local" }],
});

app.get("/healthz", (c) => c.json({ ok: true }));

function parseInvoiceId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}
