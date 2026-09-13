import { serve } from "@hono/node-server";
import { app } from "./http/app.js";
import { env } from "./env.js";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`zenith-api listening on http://localhost:${info.port}`);
  console.log(`OpenAPI at http://localhost:${info.port}/openapi.json`);
});
