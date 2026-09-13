import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

// A single pooled postgres client for the process. `max` is small because the
// API, watcher and webhook worker each run their own process.
const queryClient = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(queryClient, { schema });
export { schema };
export type Database = typeof db;
