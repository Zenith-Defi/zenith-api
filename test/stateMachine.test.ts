import { describe, expect, it } from "vitest";
import { canTransition, isTerminal, statusForAmount } from "../src/invoice/stateMachine.js";

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
