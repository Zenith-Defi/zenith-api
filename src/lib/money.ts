// Stellar amounts are integers of stroops: 1 unit of an asset is 10_000_000
// stroops. Every money value in Zenith is a stroop integer carried as a bigint
// or a decimal string. A JavaScript float never touches a money path, because
// 0.1 + 0.2 is not 0.3 and a payment is not a place to discover that.

export const STROOPS_PER_UNIT = 10_000_000n;

const AMOUNT_RE = /^\d+$/;

export function parseStroops(value: string): bigint {
  if (!AMOUNT_RE.test(value)) {
    throw new Error(`Not an integer stroop amount: ${value}`);
  }
  return BigInt(value);
}

// Horizon reports payment amounts as a decimal string with up to seven places,
// e.g. "12.5000000". Convert that to stroops without ever building a float.
export function horizonAmountToStroops(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  if (whole === undefined || !/^\d+$/.test(whole) || !/^\d*$/.test(frac)) {
    throw new Error(`Malformed Horizon amount: ${amount}`);
  }
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(fracPadded || "0");
}

export function stroopsToDisplay(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_UNIT;
  const frac = (stroops % STROOPS_PER_UNIT).toString().padStart(7, "0");
  return `${whole}.${frac}`;
}

export type PaymentComparison = "paid" | "underpaid" | "overpaid";

export function compareAmount(expected: bigint, received: bigint): PaymentComparison {
  if (received < expected) return "underpaid";
  if (received > expected) return "overpaid";
  return "paid";
}
