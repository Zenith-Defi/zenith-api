export type InvoiceStatus =
  | "open"
  | "paid"
  | "underpaid"
  | "overpaid"
  | "expired"
  | "cancelled";

// Allowed transitions. An invoice starts `open`. A payment moves it to a paid
// state; an underpaid invoice can still reach `paid` or `overpaid` on a top-up.
// Terminal states (`paid`, `overpaid`, `expired`, `cancelled`) do not move.
const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  open: ["paid", "underpaid", "overpaid", "expired", "cancelled"],
  underpaid: ["paid", "overpaid", "expired"],
  paid: [],
  overpaid: [],
  expired: [],
  cancelled: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: InvoiceStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

// Given the total received against the expected amount, the status a payment
// should drive the invoice to. Kept pure so it is unit-testable without a
// database or Horizon.
export function statusForAmount(expected: bigint, received: bigint): InvoiceStatus {
  if (received === 0n) return "open";
  if (received < expected) return "underpaid";
  if (received > expected) return "overpaid";
  return "paid";
}
