/**
 * Accounting domain — representative tool tests.
 *
 * Tests:
 *  - accounting_invoices_list: returns paginated results correctly
 *  - accounting_invoices_list: filters are forwarded to the client
 *  - accounting_invoices_list: surfaces API errors as tool errors (isError)
 *  - accounting_invoices_update: patches an invoice by ID (write path)
 *  - accounting_payments_list: returns paginated payment results
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadAccountingDomain } from "../../src/domains/accounting/index.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

const ORIGINAL_ST_RESPONSE_SHAPING = process.env.ST_RESPONSE_SHAPING;

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

function createConfig(overrides: Partial<ServiceTitanConfig> = {}): ServiceTitanConfig {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    appKey: "app-key",
    tenantId: "tenant-id",
    environment: "integration",
    readonlyMode: false,
    confirmWrites: false,
    maxResponseChars: 100_000,
    enabledDomains: null,
    logLevel: "error",
    timezone: "UTC",
    corsOrigin: "",
    allowedCallers: null,
    ...overrides,
  };
}

interface AccountingContext {
  getMock: ReturnType<typeof vi.fn>;
  postMock: ReturnType<typeof vi.fn>;
  patchMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>;
}

function createContext(overrides: Partial<ServiceTitanConfig> = {}): AccountingContext {
  const server = { tool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const registry = new ToolRegistry(server as any, createConfig(overrides), logger as any);
  const getMock = vi.fn();
  const postMock = vi.fn();
  const patchMock = vi.fn();
  const deleteMock = vi.fn();
  const client = { get: getMock, post: postMock, patch: patchMock, delete: deleteMock } as unknown as ServiceTitanClient;

  registry.attachClient(client);
  loadAccountingDomain(client, registry);

  const handlers = new Map<string, (params: unknown) => Promise<ToolResponse>>();
  for (const [name, _schema, handler] of server.tool.mock.calls) {
    handlers.set(name as string, handler as (params: unknown) => Promise<ToolResponse>);
  }

  return { getMock, postMock, patchMock, deleteMock, handlers };
}

function getHandler(
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>,
  toolName: string,
): (params: unknown) => Promise<ToolResponse> {
  const handler = handlers.get(toolName);
  if (!handler) {
    throw new Error(`Missing handler for ${toolName}`);
  }
  return handler;
}

function parsePayload(result: ToolResponse): Record<string, unknown> {
  expect(result.isError).not.toBe(true);
  const text = result.content[0]?.text;
  expect(typeof text).toBe("string");
  return JSON.parse(text ?? "{}") as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("accounting domain", () => {
  beforeEach(() => {
    // Disable response shaping so tests see raw API responses
    process.env.ST_RESPONSE_SHAPING = "false";
  });

  afterEach(() => {
    if (ORIGINAL_ST_RESPONSE_SHAPING === undefined) {
      delete process.env.ST_RESPONSE_SHAPING;
    } else {
      process.env.ST_RESPONSE_SHAPING = ORIGINAL_ST_RESPONSE_SHAPING;
    }
  });

  // ── accounting_invoices_list ──

  it("accounting_invoices_list returns paginated results correctly", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "accounting_invoices_list");

    getMock.mockResolvedValue({
      page: 1,
      pageSize: 50,
      totalCount: 2,
      hasMore: false,
      data: [
        { id: 101, total: 500, status: "Posted", jobId: 1 },
        { id: 102, total: 750, status: "Posted", jobId: 2 },
      ],
    });

    const result = await handler({ page: 1, pageSize: 50 });
    const payload = parsePayload(result);

    expect(payload).toMatchObject({
      page: 1,
      pageSize: 50,
      totalCount: 2,
      hasMore: false,
    });
    expect(Array.isArray(payload.data)).toBe(true);
    const data = payload.data as Array<{ id: number; total: number }>;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ id: 101, total: 500 });
    expect(data[1]).toMatchObject({ id: 102, total: 750 });
  });

  it("accounting_invoices_list forwards filter params to the API client", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "accounting_invoices_list");

    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1, pageSize: 50 });

    await handler({
      customerId: 99,
      jobId: 12,
      invoicedOnOrAfter: "2026-01-01T00:00:00Z",
      invoicedOnBefore: "2026-01-31T23:59:59Z",
    });

    expect(getMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/invoices",
      expect.objectContaining({
        customerId: 99,
        jobId: 12,
        invoicedOnOrAfter: "2026-01-01T00:00:00Z",
        invoicedOnBefore: "2026-01-31T23:59:59Z",
      }),
    );
  });

  it("accounting_invoices_list surfaces API errors as tool errors", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "accounting_invoices_list");

    getMock.mockRejectedValue(new Error("ServiceTitan API timeout"));

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("ServiceTitan API timeout");
  });

  // ── accounting_invoices_update ──

  it("accounting_invoices_update patches an invoice by ID and returns updated data", async () => {
    const { handlers, patchMock } = createContext();
    const handler = getHandler(handlers, "accounting_invoices_update");

    const updatedInvoice = { id: 55, total: 1200, status: "Exported", memo: "Q1 service" };
    patchMock.mockResolvedValue(updatedInvoice);

    // confirmWrites=false in config, so the middleware allows the write immediately.
    const result = await handler({ id: 55, payload: { memo: "Q1 service", total: 1200 } });
    const payload = parsePayload(result);

    expect(payload).toMatchObject({ id: 55, total: 1200 });
    expect(patchMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/invoices/55",
      expect.objectContaining({ memo: "Q1 service", total: 1200 }),
    );
  });

  it("accounting_invoices_update surfaces API errors as tool errors", async () => {
    const { handlers, patchMock } = createContext();
    const handler = getHandler(handlers, "accounting_invoices_update");

    patchMock.mockRejectedValue(new Error("Invoice not found"));

    const result = await handler({ id: 999, payload: { memo: "test" } });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Invoice not found");
  });

  // ── accounting_payments_list ──

  it("accounting_payments_list returns paginated payment results", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "accounting_payments_list");

    getMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      totalCount: 1,
      hasMore: false,
      data: [
        { id: 200, amount: 300, typeId: 1, status: "Applied" },
      ],
    });

    const result = await handler({ page: 1, pageSize: 20 });
    const payload = parsePayload(result);

    const data = payload.data as Array<{ id: number; amount: number }>;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: 200, amount: 300 });
  });

  // ── accounting_invoices_list: readonly mode ──

  it("accounting_invoices_list is available in readonly mode", async () => {
    const { handlers, patchMock } = createContext({ readonlyMode: true });
    // Read tools stay available in readonly mode.
    expect(handlers.has("accounting_invoices_list")).toBe(true);
    // Write-operation tools stay registered and are blocked by middleware.
    expect(handlers.has("accounting_invoices_update")).toBe(true);

    const result = await getHandler(handlers, "accounting_invoices_update")({
      id: 55,
      payload: { memo: "should not patch" },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Readonly mode: operation not permitted");
    expect(patchMock).not.toHaveBeenCalled();
  });
});
