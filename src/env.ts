import { config } from "dotenv";
import { z } from "zod";

config();

const schema = z.object({
  PORT: z.coerce.number().default(8787),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  STELLAR_NETWORK: z.enum(["testnet"]).default("testnet"),
  HORIZON_URL: z.string().url().default("https://horizon-testnet.stellar.org"),
  NETWORK_PASSPHRASE: z.string().default("Test SDF Network ; September 2015"),
  CHECKOUT_BASE_URL: z.string().url().default("http://localhost:3000"),
  STELLAR_SECRET: z.string().optional(),
  // Allowed browser origin for the public SSE stream. The checkout page opens
  // it cross-origin from another host, so the deployed API must name the web
  // origin (or "*"). Not a secret; it only controls the CORS response header.
  CORS_ORIGIN: z.string().default("*"),
});

// The API refuses to start against anything but Testnet. Zenith is Testnet-only
// until the protocol repo README says otherwise, and a mistaken mainnet Horizon
// URL would move real funds.
function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Environment validation failed");
  }
  const env = parsed.data;
  if (/horizon\.stellar\.org/.test(env.HORIZON_URL)) {
    throw new Error("Refusing to start: HORIZON_URL points at mainnet");
  }
  return env;
}

export const env = loadEnv();
export type Env = typeof env;
