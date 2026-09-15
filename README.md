# zenith-api

REST API for Zenith, a non-custodial crypto checkout on Stellar. A merchant creates an invoice, the customer pays USDC (or XLM on Testnet) to a per-invoice address, and the funds land straight in the merchant's own Stellar account. Zenith never holds the money.

This is the protocol layer of a three-repository project. It owns the OpenAPI document and the webhook event catalogue, and everything else follows them.

- `zenith-api` (this repo) — API, invoice state machine, muxed address derivation, payment watcher, webhook dispatcher.
- `zenith-sdk` — TypeScript client generated from this repo's `openapi.json`.
- `zenith-web` — Next.js checkout page and dashboard, talking to the API only through the SDK.

Dependencies point one way: api, then sdk, then web. See [docs/multi-repo.md](docs/multi-repo.md).

## How a payment works

1. The merchant has one Stellar account. Zenith holds no key for it.
2. Creating an invoice derives a distinct muxed address (`M...`) from the merchant account and the 64-bit invoice id.
3. The customer pays that muxed address.
4. The payment settles into the merchant account with the invoice id attached.
5. The watcher streams the account's payments from Horizon, recovers the invoice id, and compares asset and amount.
6. The invoice moves to `paid`, `underpaid` or `overpaid`; a signed webhook fires and the checkout page updates over server-sent events.

No pooled account, no smart contract, no custody, minimum fee.

## Requirements

- Node 20 or newer
- pnpm 9
- Docker (for local Postgres and Redis)
- A Stellar Testnet account. `pnpm seed` creates and funds one for you.

## Quickstart

```bash
pnpm install
cp .env.example .env
docker compose up -d           # Postgres and Redis
pnpm db:migrate                # apply schema
pnpm seed                      # create a demo merchant, print its API key

pnpm dev                       # API on http://localhost:8787
pnpm worker                    # webhook delivery worker (separate terminal)
pnpm watcher                   # Horizon payment watcher (separate terminal)
```

Prove the whole loop end to end:

```bash
ZENITH_API_KEY=zk_test_... pnpm tsx scripts/pay-demo.ts
```

It creates an invoice, pays it from a fresh Testnet account, and the API log shows the invoice flip to paid and the webhook fire.

## Configuration

All configuration is environment variables; see `.env.example`. The API refuses to start if `HORIZON_URL` points at mainnet. Zenith is Testnet-only.

Amounts everywhere are integer stroops carried as decimal strings (1 unit = 10,000,000 stroops). No money value is ever a JavaScript float.

## The OpenAPI document

`openapi.json` is generated from the route schemas and committed. It is the interface contract the SDK is generated from. After any route change:

```bash
pnpm openapi:emit
```

and commit the result. A live copy is served at `/openapi.json`.

## Endpoints

- `POST /v1/invoices` — create an invoice; honours an `Idempotency-Key` header
- `GET /v1/invoices/:id`
- `GET /v1/invoices`
- `POST /v1/invoices/:id/cancel`
- `GET /v1/payments`
- `GET /v1/invoices/:id/events` — server-sent events, no auth, for the checkout page
- `POST /v1/webhook-endpoints`, `GET /v1/webhook-endpoints`, `DELETE /v1/webhook-endpoints/:id`
- `POST /v1/webhook-deliveries/:id/replay`

See [docs/api.md](docs/api.md), [docs/webhooks.md](docs/webhooks.md) and [docs/architecture.md](docs/architecture.md).

## Scripts

- `pnpm dev` / `pnpm start` — run the API
- `pnpm worker` — webhook delivery worker
- `pnpm watcher` — Horizon payment watcher
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:check`
- `pnpm seed` — demo merchant and API key
- `pnpm seed:demo` — fixed, publishable demo merchant for a hosted read-only demo
- `pnpm openapi:emit` — regenerate `openapi.json`
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build`

## Deployment

`render.yaml` is a Render Blueprint that runs three always-on services from one Docker image: the HTTP API (`node dist/index.js`, health check at `/healthz`), the webhook worker (`node dist/webhooks/worker.js`), and the payment watcher (`node dist/watcher/index.js`). The watcher is a separate long-running process, not a serverless handler. Migrations and the demo seed run once per deploy through the API service's `preDeployCommand`.

Provision Postgres (Neon or Supabase) and Redis (Upstash) separately and paste their connection strings into the `zenith-shared` environment group. Set `CHECKOUT_BASE_URL` and `CORS_ORIGIN` to the deployed web origin.

## Status

Built to roughly 65% of the product. What works: invoice creation with idempotency, muxed address derivation, the payment watcher against Testnet, signed webhooks with retries and a delivery log, server-sent events, and the demo pay loop. What is deliberately not built and filed in [ISSUES.md](ISSUES.md): the Soroban vault mode, splits, on-chain refunds, anchor settlement, rate limiting, and mainnet.

Deployed on Render (API, webhook worker, payment watcher) against Neon Postgres and Upstash Redis. Everything runs on Stellar Testnet only: the API refuses to start against a mainnet Horizon URL, and there is no custody of funds at any point.

Unaudited and Testnet-only. See [SECURITY.md](SECURITY.md).

Built to roughly 65% of the product. What works: invoice creation with idempotency, muxed address derivation, the payment watcher against Testnet, signed webhooks with retries and a delivery log, server-sent events, and the demo pay loop. What is deliberately not built and filed in [ISSUES.md](ISSUES.md): the Soroban vault mode, splits, on-chain refunds, anchor settlement, rate limiting, and mainnet.

Unaudited and Testnet-only. See [SECURITY.md](SECURITY.md).

## License

Apache-2.0.
