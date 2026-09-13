import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://zenith:zenith@localhost:5432/zenith",
  },
  strict: true,
});
