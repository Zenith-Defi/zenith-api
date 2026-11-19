export const API_KEY_SCOPES = ["read", "write"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const DEFAULT_SCOPES: ApiKeyScope[] = ["read", "write"];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Reads need "read" or "write". Anything that can change state needs "write".
export function scopesAllow(scopes: readonly string[], method: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) {
    return scopes.includes("read") || scopes.includes("write");
  }
  return scopes.includes("write");
}
