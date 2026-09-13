# Security Policy

Zenith is unaudited and runs on Stellar Testnet only. Do not put mainnet funds through it.

## Reporting a vulnerability

Report privately to security@zenith.example. Do not open a public issue for a vulnerability. Include steps to reproduce and the impact you see. You will get an acknowledgement, and a fix or an explanation of why it is not a vulnerability.

The same address is used across all three Zenith repositories.

## Sensitive surfaces in this repository

- **Muxed address derivation** (`src/lib/stellar/muxed.ts`). A wrong derivation would send funds to the wrong invoice or the wrong account. It is pinned to a known vector in the tests.
- **API key handling** (`src/auth/apiKey.ts`). Keys are stored only as SHA-256 hashes with a non-secret display prefix. A change that logs or stores a plaintext key is a vulnerability.
- **Webhook signing** (`src/lib/hmac.ts`). The HMAC covers `timestamp.rawBody`. Weakening it, or comparing signatures without constant-time equality on the receiving side, breaks replay and forgery protection.
- **The payment watcher** (`src/watcher/`). It must stay idempotent: it will see the same Horizon payment more than once, and a non-idempotent write could double-credit an invoice.
- **The mainnet guard** (`src/env.ts`). The API refuses to start against a mainnet Horizon URL. Do not remove it.

## What Zenith does not hold

Zenith never takes custody. There is no pooled account and no hot wallet, not even in tests. Funds move from customer to merchant account directly. A change that routes funds through a Zenith-controlled account is rejected regardless of how convenient it is.
