import { z } from "@hono/zod-openapi";

// Amounts are strings of integer stroops. A JSON number could not carry a
// 64-bit stroop value without precision loss, so the wire type is a string and
// it is validated as digits only.
const stroopString = z
  .string()
  .regex(/^\d+$/, "must be integer stroops as a string")
  .openapi({ example: "125000000", description: "Integer stroops as a decimal string" });

export const AssetSchema = z.object({
  code: z.string().min(1).max(12).openapi({ example: "USDC" }),
  issuer: z
    .string()
    .nullable()
    .optional()
    .openapi({ example: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" }),
});

export const CreateInvoiceSchema = z
  .object({
    amount: stroopString,
    asset: AssetSchema,
    memo: z.string().max(28).optional().openapi({ description: "Stellar text memo, max 28 bytes" }),
    currencyDisplay: z.string().optional().openapi({ example: "USD" }),
    expiresInSeconds: z.number().int().positive().max(2_592_000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .openapi("CreateInvoice");

export const InvoiceSchema = z
  .object({
    id: z.string().openapi({ description: "64-bit invoice id as a string", example: "42" }),
    status: z.enum(["open", "paid", "underpaid", "overpaid", "expired", "cancelled"]),
    mode: z.enum(["muxed", "vault"]),
    asset: AssetSchema,
    amount: stroopString,
    amountReceived: stroopString,
    memo: z.string().nullable(),
    currencyDisplay: z.string().nullable(),
    muxedAddress: z.string().openapi({ example: "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLK" }),
    checkoutUrl: z.string().url(),
    expiresAt: z.string().nullable(),
    paidAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Invoice");

export const PaymentSchema = z
  .object({
    id: z.string().uuid(),
    invoiceId: z.string().nullable(),
    txHash: z.string(),
    fromAccount: z.string(),
    asset: AssetSchema,
    amount: stroopString,
    createdAt: z.string(),
  })
  .openapi("Payment");

export const WebhookEndpointSchema = z
  .object({
    id: z.string().uuid(),
    url: z.string().url(),
    events: z.array(z.string()),
    disabledAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("WebhookEndpoint");

export const CreateWebhookEndpointSchema = z
  .object({
    url: z.string().url(),
    events: z.array(z.string()).optional(),
  })
  .openapi("CreateWebhookEndpoint");

export const ApiKeySchema = z
  .object({
    id: z.string().uuid(),
    prefix: z.string().openapi({ example: "zk_test_ABCD" }),
    label: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("ApiKey");

export const CreateApiKeySchema = z
  .object({ label: z.string().max(120).optional() })
  .openapi("CreateApiKey");

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  })
  .openapi("Error");

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
