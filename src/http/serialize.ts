import { env } from "../env.js";
import type { schema } from "../db/client.js";

type InvoiceRow = typeof schema.invoices.$inferSelect;
type PaymentRow = typeof schema.payments.$inferSelect;
type EndpointRow = typeof schema.webhookEndpoints.$inferSelect;
type ApiKeyRow = typeof schema.apiKeys.$inferSelect;

export function checkoutUrl(invoiceId: bigint): string {
  return `${env.CHECKOUT_BASE_URL}/pay/${invoiceId.toString()}`;
}

export function serializeInvoice(row: InvoiceRow) {
  return {
    id: row.id.toString(),
    status: row.status,
    mode: row.mode,
    asset: { code: row.assetCode, issuer: row.assetIssuer },
    amount: row.amount,
    amountReceived: row.amountReceived,
    memo: row.memo,
    currencyDisplay: row.currencyDisplay,
    muxedAddress: row.muxedAddress,
    checkoutUrl: checkoutUrl(row.id),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializePayment(row: PaymentRow) {
  return {
    id: row.id,
    invoiceId: row.invoiceId ? row.invoiceId.toString() : null,
    txHash: row.txHash,
    fromAccount: row.fromAccount,
    asset: { code: row.assetCode, issuer: row.assetIssuer },
    amount: row.amount,
    createdAt: row.createdAt.toISOString(),
  };
}

// The hash and any plaintext are never serialised. Only the non-secret prefix
// leaves the database.
export function serializeApiKey(row: ApiKeyRow) {
  return {
    id: row.id,
    prefix: row.prefix,
    label: row.label,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeEndpoint(row: EndpointRow) {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
