import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const invoiceStatus = pgEnum("invoice_status", [
  "open",
  "paid",
  "underpaid",
  "overpaid",
  "expired",
  "cancelled",
]);

export const paymentMode = pgEnum("payment_mode", ["muxed", "vault"]);

export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "delivered",
  "failed",
  "dead",
]);

export const merchants = pgTable("merchants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  // The merchant's own Stellar account (G...). Funds land here directly; Zenith
  // never holds a key for it.
  stellarAccount: text("stellar_account").notNull(),
  defaultMode: paymentMode("default_mode").notNull().default("muxed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    // Only the hash is stored. The plaintext key is shown once at creation.
    hash: text("hash").notNull(),
    // A short non-secret prefix so a key is recognisable in a list.
    prefix: text("prefix").notNull(),
    label: text("label"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    hashIdx: uniqueIndex("api_keys_hash_idx").on(t.hash),
    prefixIdx: index("api_keys_prefix_idx").on(t.prefix),
  }),
);

export const invoices = pgTable(
  "invoices",
  {
    // A 64-bit numeric id: it is what gets encoded into the muxed address.
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    status: invoiceStatus("status").notNull().default("open"),
    mode: paymentMode("mode").notNull().default("muxed"),
    // Asset code and issuer. Native XLM has a null issuer.
    assetCode: text("asset_code").notNull(),
    assetIssuer: text("asset_issuer"),
    // Expected amount in integer stroops, carried as a decimal string.
    amount: numeric("amount", { precision: 30, scale: 0 }).notNull(),
    // Total received so far, in stroops. Lets underpaid invoices track top-ups.
    amountReceived: numeric("amount_received", { precision: 30, scale: 0 })
      .notNull()
      .default("0"),
    currencyDisplay: text("currency_display"),
    memo: text("memo"),
    muxedAddress: text("muxed_address").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    merchantIdx: index("invoices_merchant_idx").on(t.merchantId),
    statusIdx: index("invoices_status_idx").on(t.status),
  }),
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: bigint("invoice_id", { mode: "bigint" }).references(() => invoices.id, {
      onDelete: "set null",
    }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    // Horizon operation id. Unique so the same payment is never recorded twice,
    // which is what makes the watcher safe to run over the same event again.
    horizonOperationId: text("horizon_operation_id").notNull(),
    txHash: text("tx_hash").notNull(),
    fromAccount: text("from_account").notNull(),
    assetCode: text("asset_code").notNull(),
    assetIssuer: text("asset_issuer"),
    amount: numeric("amount", { precision: 30, scale: 0 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    opIdx: uniqueIndex("payments_op_idx").on(t.horizonOperationId),
    invoiceIdx: index("payments_invoice_idx").on(t.invoiceId),
  }),
);

export const refunds = pgTable("refunds", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: bigint("invoice_id", { mode: "bigint" })
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 30, scale: 0 }).notNull(),
  toAccount: text("to_account").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settlements = pgTable("settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 30, scale: 0 }).notNull(),
  anchorTransactionId: text("anchor_transaction_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    // Signing secret for this endpoint. Used to compute X-Zenith-Signature.
    secret: text("secret").notNull(),
    // Subscribed event names; empty means all.
    events: jsonb("events").$type<string[]>().notNull().default([]),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    merchantIdx: index("webhook_endpoints_merchant_idx").on(t.merchantId),
  }),
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    // Stable per-event id. An endpoint that has seen this id can ignore a resend.
    eventId: uuid("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: deliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastResponseStatus: integer("last_response_status"),
    lastResponseBody: text("last_response_body"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    endpointIdx: index("webhook_deliveries_endpoint_idx").on(t.endpointId),
    statusIdx: index("webhook_deliveries_status_idx").on(t.status),
  }),
);

export const anchorConnections = pgTable("anchor_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  merchantId: uuid("merchant_id")
    .notNull()
    .references(() => merchants.id, { onDelete: "cascade" }),
  anchorHomeDomain: text("anchor_home_domain").notNull(),
  sep10Jwt: text("sep10_jwt"),
  withdrawReference: text("withdraw_reference"),
  thresholdStroops: numeric("threshold_stroops", { precision: 30, scale: 0 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per watched merchant account. The Horizon paging cursor is persisted
// before any side effect, so a crash resumes from the last handled payment and
// the stream neither skips nor replays.
export const watcherCursors = pgTable("watcher_cursors", {
  merchantId: uuid("merchant_id")
    .primaryKey()
    .references(() => merchants.id, { onDelete: "cascade" }),
  stellarAccount: text("stellar_account").notNull(),
  cursor: text("cursor").notNull().default("now"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Idempotency-Key storage for POST /v1/invoices. A repeated key returns the
// first response instead of creating a second invoice.
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyIdx: uniqueIndex("idempotency_merchant_key_idx").on(t.merchantId, t.key),
  }),
);

export const webhookOutbox = pgTable("webhook_outbox", {
  eventId: uuid("event_id").primaryKey().defaultRandom(),
  used: boolean("used").notNull().default(false),
});
