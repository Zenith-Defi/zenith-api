# Webhooks

An endpoint receives a `POST` with a JSON event body whenever something happens to one of your invoices. Delivery is at-least-once: your handler must be idempotent on the event `id`.

## Events

- `invoice.created`
- `invoice.paid`
- `invoice.underpaid`
- `invoice.expired`
- `refund.created`
- `settlement.completed`

`refund.created` and `settlement.completed` exist in the catalogue but their producers are part of the unbuilt refund and anchor-settlement work; see [../ISSUES.md](../ISSUES.md).

## Event shape

```json
{
  "id": "b3f1c2a4-...",
  "type": "invoice.paid",
  "createdAt": "2026-09-13T10:00:00.000Z",
  "data": { "invoice": { "id": "42", "status": "paid", "...": "..." } }
}
```

Headers on every delivery:

```
X-Zenith-Signature: t=1700000000,v1=<hex hmac>
X-Zenith-Event-Id: <event id>
X-Zenith-Event-Type: invoice.paid
```

## Verifying the signature

The signature is `HMAC-SHA256(secret, "${t}.${rawBody}")`, hex-encoded. Verify against the raw request body before parsing it, compare with a constant-time function, and reject a timestamp more than five minutes old to stop replays. `zenith-sdk` exposes `webhooks.verify(rawBody, header, secret)` that does exactly this.

## Retries

A delivery that does not get a 2xx is retried on this schedule, then dead-lettered:

```
1s, 10s, 1m, 10m, 1h, 6h
```

Every attempt is recorded in `webhook_deliveries` with the response status and body. A dead delivery can be re-enqueued manually:

```
POST /v1/webhook-deliveries/:id/replay
```

## Ordering

Events are not ordered. Use the invoice `status` in the payload as the source of truth rather than assuming `invoice.paid` arrives after `invoice.created`.
