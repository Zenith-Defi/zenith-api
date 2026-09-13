export const WEBHOOK_EVENTS = [
  "invoice.created",
  "invoice.paid",
  "invoice.underpaid",
  "invoice.expired",
  "refund.created",
  "settlement.completed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export interface ZenithEvent<T = Record<string, unknown>> {
  id: string;
  type: WebhookEventType;
  createdAt: string;
  data: T;
}
