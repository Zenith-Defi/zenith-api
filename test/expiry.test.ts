import { beforeEach, describe, expect, it, vi } from "vitest";

const returning = vi.fn();
const where = vi.fn(() => ({ returning }));
const set = vi.fn(() => ({ where }));
const update = vi.fn(() => ({ set }));

vi.mock("../src/db/client.js", () => ({
  db: { update },
  schema: {
    invoices: { status: "status", expiresAt: "expires_at" },
  },
}));

const emitWebhook = vi.fn();
const publishInvoiceUpdate = vi.fn();
vi.mock("../src/events/emit.js", () => ({ emitWebhook, publishInvoiceUpdate }));

vi.mock("../src/http/serialize.js", () => ({
  serializeInvoice: (row: { id: bigint; status: string }) => ({ id: row.id.toString(), status: row.status }),
}));

const { expireLapsedInvoices } = await import("../src/invoice/expiry.js");

describe("expireLapsedInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits invoice.expired once per invoice that changed state", async () => {
    returning.mockResolvedValue([
      { id: 1n, merchantId: "m1", status: "expired" },
      { id: 2n, merchantId: "m2", status: "expired" },
    ]);
    const count = await expireLapsedInvoices(new Date("2026-01-01T00:00:00Z"));
    expect(count).toBe(2);
    expect(emitWebhook).toHaveBeenCalledTimes(2);
    expect(emitWebhook).toHaveBeenCalledWith("m1", "invoice.expired", {
      invoice: { id: "1", status: "expired" },
    });
  });

  it("emits nothing when no invoice lapsed", async () => {
    returning.mockResolvedValue([]);
    expect(await expireLapsedInvoices()).toBe(0);
    expect(emitWebhook).not.toHaveBeenCalled();
  });

  it("sets the expired status with the supplied clock", async () => {
    returning.mockResolvedValue([]);
    const now = new Date("2026-01-01T00:00:00Z");
    await expireLapsedInvoices(now);
    expect(set).toHaveBeenCalledWith({ status: "expired", updatedAt: now });
  });

  it("keeps sweeping when one announcement fails", async () => {
    returning.mockResolvedValue([
      { id: 1n, merchantId: "m1", status: "expired" },
      { id: 2n, merchantId: "m1", status: "expired" },
    ]);
    emitWebhook.mockRejectedValueOnce(new Error("redis down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await expireLapsedInvoices()).toBe(2);
    expect(emitWebhook).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
