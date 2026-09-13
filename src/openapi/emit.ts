import { writeFileSync } from "node:fs";
import { app } from "../http/app.js";

// Emits the OpenAPI document from the live route definitions. The committed
// openapi.json is the interface contract the SDK is generated from, so it is
// regenerated here rather than hand-edited. Run `pnpm openapi:emit` after any
// route change and commit the result.
const doc = app.getOpenAPIDocument({
  openapi: "3.0.0",
  info: {
    version: "0.1.0",
    title: "Zenith API",
    description: "Non-custodial crypto checkout on Stellar. Testnet only.",
  },
  servers: [{ url: "http://localhost:8787", description: "Local" }],
});

writeFileSync("openapi.json", JSON.stringify(doc, null, 2) + "\n");
console.log("Wrote openapi.json");
process.exit(0);
