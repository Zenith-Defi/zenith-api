# API

Base URL in local development: `http://localhost:8787`. Authenticate every `/v1` request except the SSE stream with an API key:

```
Authorization: Bearer zk_test_...
```

The machine-readable contract is [`../openapi.json`](../openapi.json), served live at `/openapi.json`. This page is the human summary.

## Amounts

Every amount is integer stroops as a decimal string. One unit of an asset is 10,000,000 stroops, so 12.5 USDC is `"125000000"`. Strings are used because a 64-bit stroop value does not fit a JSON number without precision loss.

## Create an invoice

```
POST /v1/invoices
Idempotency-Key: <optional, any unique string>
```

```json
{
  "amount": "125000000",
  "asset": { "code": "USDC", "issuer": "GA5ZSE...KZVN" },
  "memo": "order-4821",
  "currencyDisplay": "USD",
  "expiresInSeconds": 3600,
  "metadata": { "orderId": "4821" }
}
```

For native XLM, use `{ "code": "XLM", "issuer": null }`.

The response is the invoice, including `muxedAddress` (where the customer pays) and `checkoutUrl` (the hosted page). Repeating a request with the same `Idempotency-Key` returns the first response and does not create a second invoice. Reusing a key with a different body is a `409`.

## Fetch and list

```
GET /v1/invoices/:id
GET /v1/invoices?limit=20&cursor=<id>
GET /v1/payments?limit=20
```

Lists are newest first. `invoices` paginates by invoice id; `nextCursor` is null on the last page.

## Cancel

```
POST /v1/invoices/:id/cancel
```

Only an `open` or `underpaid` invoice can be cancelled. A `paid`, `overpaid`, `expired` or already `cancelled` invoice returns `409`.

## Live invoice status

```
GET /v1/invoices/:id/events
```

A server-sent events stream, no auth, used by the checkout page. It sends a `snapshot` event with the current invoice immediately, then an `update` event each time the invoice changes, then periodic `ping` events to keep the connection open.

## Webhook endpoints

```
POST   /v1/webhook-endpoints         { "url": "...", "events": ["invoice.paid"] }
GET    /v1/webhook-endpoints
DELETE /v1/webhook-endpoints/:id
POST   /v1/webhook-deliveries/:id/replay
```

Creating an endpoint returns its signing `secret` once. Store it; it is not returned again. An empty `events` array subscribes to everything. See [webhooks.md](webhooks.md).

## Errors

Errors are `{ "error": { "code": "...", "message": "..." } }` with a matching HTTP status: `400` invalid request, `401` bad key, `404` not found, `409` conflict.
