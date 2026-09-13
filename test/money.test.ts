import { describe, expect, it } from "vitest";
import { compareAmount, horizonAmountToStroops, parseStroops, stroopsToDisplay } from "../src/lib/money.js";

describe("money in stroops", () => {
  it("parses integer stroop strings", () => {
    expect(parseStroops("125000000")).toBe(125_000_000n);
  });

  it("rejects a float string", () => {
    expect(() => parseStroops("12.5")).toThrow();
  });

  it("converts Horizon decimal amounts without floats", () => {
    expect(horizonAmountToStroops("12.5000000")).toBe(125_000_000n);
    expect(horizonAmountToStroops("0.0000001")).toBe(1n);
    expect(horizonAmountToStroops("100")).toBe(1_000_000_000n);
  });

  it("round-trips a display amount", () => {
    expect(stroopsToDisplay(125_000_000n)).toBe("12.5000000");
    expect(stroopsToDisplay(1n)).toBe("0.0000001");
  });

  it("classifies under, exact and over payment", () => {
    expect(compareAmount(100n, 99n)).toBe("underpaid");
    expect(compareAmount(100n, 100n)).toBe("paid");
    expect(compareAmount(100n, 101n)).toBe("overpaid");
  });
});
