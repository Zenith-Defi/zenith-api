import { createHmac, timingSafeEqual } from "node:crypto";

// Webhook signatures are HMAC-SHA256 over `${timestamp}.${rawBody}`. Signing
// the timestamp with the body is what lets a receiver reject a replayed request
// outside its time window. The SDK's `webhooks.verify` mirrors this exactly.

export function signPayload(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function buildSignatureHeader(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = signPayload(secret, timestamp, rawBody);
  return `t=${timestamp},v1=${signature}`;
}

export interface ParsedSignature {
  timestamp: number;
  v1: string;
}

export function parseSignatureHeader(header: string): ParsedSignature | null {
  const parts = header.split(",").map((p) => p.trim());
  let timestamp: number | undefined;
  let v1: string | undefined;
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t" && value) timestamp = Number(value);
    if (key === "v1" && value) v1 = value;
  }
  if (timestamp === undefined || Number.isNaN(timestamp) || !v1) return null;
  return { timestamp, v1 };
}

export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
