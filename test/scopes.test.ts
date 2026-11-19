import { describe, expect, it } from "vitest";
import { scopesAllow } from "../src/auth/scopes.js";

describe("scopesAllow", () => {
  it("lets a read-only key use GET", () => {
    expect(scopesAllow(["read"], "GET")).toBe(true);
    expect(scopesAllow(["read"], "get")).toBe(true);
  });

  it("rejects a read-only key on writes", () => {
    for (const m of ["POST", "DELETE", "PUT", "PATCH"]) {
      expect(scopesAllow(["read"], m)).toBe(false);
    }
  });

  it("lets a read-write key do both", () => {
    expect(scopesAllow(["read", "write"], "GET")).toBe(true);
    expect(scopesAllow(["read", "write"], "POST")).toBe(true);
  });

  it("treats write alone as enough for reads", () => {
    expect(scopesAllow(["write"], "GET")).toBe(true);
  });

  it("rejects an empty scope set", () => {
    expect(scopesAllow([], "GET")).toBe(false);
  });
});
