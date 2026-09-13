# Architecture

Zenith runs as three processes over one Postgres database and one Redis instance.

```
                    +-------------------+
   merchant  ---->  |  API (Hono)       |  POST /v1/invoices, ...
                    |                   |  GET  /v1/invoices/:id/events (SSE)
                    +---------+---------+
                              |
        Postgres  <-----------+-----------> Redis
        (Drizzle)             |            (BullMQ queue + pub/sub)
                              |
     +------------------------+------------------------+
     |                                                 |
+----v-----+                                     +-----v------+
| Watcher  |  streams Horizon payments,          | Worker     |  delivers webhooks
| process  |  recovers invoice id, updates       | process    |  with retries and a
|          |  invoice, emits events              |            |  delivery log
+----------+                                     +------------+
```

## Why three processes

The API serves requests and must stay responsive. The watcher holds long-lived Horizon streams and does its own reconnect and backfill. The webhook worker makes outbound HTTP calls that can be slow or hang. Separating them keeps a slow webhook receiver or a Horizon reconnect from touching request latency. They share state only through Postgres and Redis.

## Payment detection

The watcher streams `payments().forAccount(merchantAccount)` from Horizon with a cursor persisted per merchant in `watcher_cursors`. On each payment it recovers the invoice id from the muxed destination (`to_muxed_id`), checks asset and amount, and advances the invoice.

Two properties make this safe:

- **Idempotent.** `payments.horizon_operation_id` is unique. A second sight of the same operation inserts nothing and advances no total, so the watcher is safe to run twice on the same payment.
- **Resumable.** The cursor is saved after each handled operation. A crash resumes from the last one; because processing is idempotent, replaying the final operation is a no-op.

## Live updates

When an invoice changes, the watcher publishes to a per-invoice Redis channel. The API's SSE handler subscribes to that channel, so a checkout page open in the browser flips to paid within about a second of detection, across process boundaries.

## Webhooks

`emitWebhook` writes a `webhook_deliveries` row and enqueues a BullMQ job before returning. The worker signs `timestamp.rawBody` with the endpoint secret, POSTs, records the response, and throws on failure so BullMQ retries on the fixed backoff schedule until it dead-letters.

## Non-custody

There is no Zenith-controlled account anywhere in this diagram. The muxed address is the merchant's own account addressed with an id. Funds never pause in anything Zenith holds a key to.
