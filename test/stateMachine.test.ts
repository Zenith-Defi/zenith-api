import { describe, expect, it } from "vitest";
import { amountRemaining, canTransition, isTerminal, statusForAmount } from "../src/invoice/stateMachine.js";

describe("invoice state machine", () => {
  it("allows open to any paid or closed state", () => {
    expect(canTransition("open", "paid")).toBe(true);
    expect(canTransition("open", "underpaid")).toBe(true);
    expect(canTransition("open", "cancelled")).toBe(true);
  });

  it("lets an underpaid invoice reach paid on a top-up", () => {
    expect(canTransition("underpaid", "paid")).toBe(true);
    expect(canTransition("underpaid", "overpaid")).toBe(true);
  });

  it("keeps terminal states terminal", () => {
    expect(isTerminal("paid")).toBe(true);
    expect(isTerminal("overpaid")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(canTransition("paid", "underpaid")).toBe(false);
    expect(canTransition("cancelled", "paid")).toBe(false);
  });

  it("derives status from amounts", () => {
    expect(statusForAmount(100n, 0n)).toBe("open");
    expect(statusForAmount(100n, 50n)).toBe("underpaid");
    expect(statusForAmount(100n, 100n)).toBe("paid");
    expect(statusForAmount(100n, 150n)).toBe("overpaid");
  });
});

describe("amountRemaining", () => {
  it("is the full amount on an untouched open invoice", () => {
    expect(amountRemaining("open", 100n, 0n)).toBe(100n);
  });

  it("shrinks as partial payments arrive and reaches zero on the second one", () => {
    expect(amountRemaining("underpaid", 100n, 40n)).toBe(60n);
    expect(amountRemaining("paid", 100n, 100n)).toBe(0n);
    expect(statusForAmount(100n, 40n + 60n)).toBe("paid");
  });

  it("is zero for settled and closed invoices", () => {
    expect(amountRemaining("overpaid", 100n, 150n)).toBe(0n);
    expect(amountRemaining("expired", 100n, 40n)).toBe(0n);
    expect(amountRemaining("cancelled", 100n, 0n)).toBe(0n);
  });
});
