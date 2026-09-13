import { describe, expect, it } from "vitest";
import { Account, MuxedAccount } from "@stellar/stellar-sdk";
import { deriveMuxedAddress, parseMuxedAddress } from "../src/lib/stellar/muxed.js";

// A fixed vector generated from an ed25519 seed of all 0x07 bytes. Kept as a
// constant so a change in the derivation code is caught, not silently absorbed.
const BASE_G = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const ID = 0n;
const EXPECTED_M = "MDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCYAAAAAAAAAAAAAR5G";

describe("muxed address derivation", () => {
  it("matches the SEP-0023 known vector", () => {
    expect(deriveMuxedAddress(BASE_G, ID)).toBe(EXPECTED_M);
  });

  it("round-trips an arbitrary id", () => {
    const id = 42n;
    const m = deriveMuxedAddress(BASE_G, id);
    const parsed = parseMuxedAddress(m);
    expect(parsed.merchantAccount).toBe(BASE_G);
    expect(parsed.invoiceId).toBe(id);
  });

  it("agrees with the underlying SDK encoding", () => {
    const m = deriveMuxedAddress(BASE_G, ID);
    const sdk = new MuxedAccount(new Account(BASE_G, "0"), ID.toString()).accountId();
    expect(m).toBe(sdk);
  });

  it("rejects an invalid public key", () => {
    expect(() => deriveMuxedAddress("not-a-key", 1n)).toThrow();
  });

  it("rejects an id past the 64-bit range", () => {
    expect(() => deriveMuxedAddress(BASE_G, 2n ** 64n)).toThrow();
  });

  it("rejects a non-muxed address on parse", () => {
    expect(() => parseMuxedAddress(BASE_G)).toThrow();
  });
});
