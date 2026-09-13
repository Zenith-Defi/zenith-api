import { describe, expect, it } from "vitest";
import { buildSignatureHeader, parseSignatureHeader, safeEqualHex, signPayload } from "../src/lib/hmac.js";

describe("webhook signing", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });

  it("produces a stable signature for a fixed timestamp and body", () => {
    const sig = signPayload(secret, 1_700_000_000, body);
    expect(sig).toBe(signPayload(secret, 1_700_000_000, body));
    expect(sig).toHaveLength(64);
  });

  it("changes when the body changes", () => {
    const a = signPayload(secret, 1_700_000_000, body);
    const b = signPayload(secret, 1_700_000_000, body + " ");
    expect(a).not.toBe(b);
  });

  it("builds and parses a header round-trip", () => {
    const header = buildSignatureHeader(secret, body, 1_700_000_000);
    const parsed = parseSignatureHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.timestamp).toBe(1_700_000_000);
    expect(parsed!.v1).toBe(signPayload(secret, 1_700_000_000, body));
  });

  it("returns null for a malformed header", () => {
    expect(parseSignatureHeader("garbage")).toBeNull();
  });

  it("compares hex constant-time and rejects different lengths", () => {
    expect(safeEqualHex("abcd", "abcd")).toBe(true);
    expect(safeEqualHex("abcd", "abce")).toBe(false);
    expect(safeEqualHex("ab", "abcd")).toBe(false);
  });
});
