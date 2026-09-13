# Open work — zenith-api

The remaining 35% of the API, filed for contributors. Each issue has a difficulty label and acceptance criteria. Labels: `good first issue`, `intermediate`, `advanced`. The matching SDK and web work lives in `zenith-sdk/ISSUES.md` and `zenith-web/ISSUES.md`.

Claim an issue by commenting on it. For anything touching payment detection, the vault contract, or the mainnet guard, open a discussion first.

## API key scopes

`good first issue`. API keys are all-or-nothing today. Add a `scopes` column and enforce read-only versus read-write per endpoint.

Acceptance criteria: keys carry a scope set; a read-only key is rejected on write endpoints with `403`; the seed script prints a read-write key; scopes documented in `docs/api.md`.

## Invoice expiry sweeper

`intermediate`. An invoice with a past `expiresAt` still shows `open`. Add a periodic job that moves lapsed `open` and `underpaid` invoices to `expired` and emits `invoice.expired`.

Acceptance criteria: a job marks expired invoices without racing the watcher; `invoice.expired` fires exactly once per invoice; a payment that arrives in the same tick as expiry is resolved deterministically and the rule is documented.

## Underpaid top-up flow

`intermediate`. An `underpaid` invoice can already receive more payments, but there is no endpoint that tells a caller how much is left. Add `GET /v1/invoices/:id` fields for `amountRemaining` and expose a top-up address.

Acceptance criteria: response includes remaining stroops; paying the remainder flips the invoice to `paid`; covered by a watcher test with two partial payments.

## Overpayment credit

`intermediate`. Overpayment currently sets `overpaid` and stops. Record the surplus as a credit on the merchant rather than triggering an automatic refund, per PRD section 9.

Acceptance criteria: surplus stroops stored against the merchant; visible in a new response field; no funds moved automatically.

## Rate limiting

`intermediate`. There is no rate limit. Add a per-API-key limiter backed by Redis with standard `RateLimit-*` headers.

Acceptance criteria: configurable limit per key; `429` with `Retry-After` on breach; the SSE stream and health check are exempt; documented.

## Audit log

`intermediate`. Sensitive actions (key create and revoke, endpoint changes, cancels) are not recorded. Add an append-only audit table and write to it from those paths.

Acceptance criteria: an `audit_events` table records actor, action, target and time; rows are never updated or deleted by application code; a listing endpoint exists.

## Watcher scaling across many accounts

`intermediate`. The watcher opens one Horizon stream per merchant in a single process. Shard accounts across workers with a lease so no account is watched twice and none is dropped.

Acceptance criteria: accounts are leased and rebalanced when a worker joins or leaves; a killed worker's accounts are picked up within a bounded time; no double-processing (already guarded by idempotency, but verified).

## Soroban invoice-vault contract

`advanced`. The default muxed mode needs no contract. Vault mode does: a per-merchant Soroban contract holding open invoices, marking them paid, and emitting events, for cases that need programmable behaviour. Build the contract in `contracts/` per PRD section 4.2, deploy to Testnet, and publish the id in `deployments/testnet.json`.

Acceptance criteria: `create_invoice`, `pay`, `get_invoice` implemented with unauthorised-path tests; WASM builds in CI; deployment file published; the API can create a vault-mode invoice end to end on Testnet.

## Payment splits

`advanced`. Depends on the vault contract. Support splitting a paid invoice to multiple recipients by basis points totalling 10,000.

Acceptance criteria: splits validated to total 10,000; funds distributed atomically in `pay`; a test covers a three-way split and a rejected non-10,000 total.

## On-chain refunds

`advanced`. Depends on the vault contract. Implement `refund` and produce the `refund.created` webhook.

Acceptance criteria: only the merchant can refund; a refund cannot exceed the paid amount; `refund.created` fires; a `refunds` row is written.

## Anchor settlement to fiat

`advanced`. The single largest piece. Let a merchant configure an anchor, run the SEP-10 handshake, and, when their balance crosses a threshold, initiate a SEP-24 withdrawal (or SEP-31 where supported), writing `settlements` rows and producing `settlement.completed`. Build behind an `Anchor` interface with one Testnet implementation so contributors can add their own, per PRD section 4.3.

Acceptance criteria: `Anchor` interface with one working Testnet implementation; SEP-10 JWT stored per `anchor_connections`; a threshold breach initiates a withdrawal; settlement rows link to the anchor transaction id; `settlement.completed` fires; no funds routed through a Zenith-controlled account at any step.

## Mainnet configuration

`advanced`. The API refuses to start against mainnet by design. Behind an explicit, reviewed configuration, allow mainnet once the security review in the project README is done. Do not remove the guard; gate it.

Acceptance criteria: mainnet requires an explicit opt-in flag and a funded reviewed account; the Testnet default is unchanged; the change references the security review; documented prominently.
