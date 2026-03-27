/**
 * CRM domain — representative tool tests.
 *
 * Tests:
 *  - crm_customers_list: returns paginated results correctly
 *  - crm_customers_list: forwards filter params to the API client
 *  - crm_customers_list: surfaces API errors as tool errors
 *  - crm_customers_get: returns a single customer by ID
 *  - crm_customers_get: surfaces API errors as tool errors
 *  - crm_customers_create: creates a new customer and returns the result
 *  - crm_customers_notes_list: returns paginated notes for a customer
 *  - crm_customers_list: available in readonly mode; write tools are not
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadCrmDomain } from "../../src/domains/crm/index.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Constants & original env
// ---------------------------------------------------------------------------

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
    ...overrides,
  };
}

interface CrmContext {
  getMock: ReturnType<typeof vi.fn>;
  postMock: ReturnType<typeof vi.fn>;
  patchMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>;
}

function createContext(overrides: Partial<ServiceTitanConfig> = {}): CrmContext {
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
  loadCrmDomain(client, registry);

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

describe("crm domain", () => {
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

  // ── crm_customers_list ──

  it("crm_customers_list returns paginated results correctly", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "crm_customers_list");

    getMock.mockResolvedValue({
      page: 1,
      pageSize: 25,
      totalCount: 2,
      hasMore: false,
      data: [
        { id: 1001, name: "Acme Corp", active: true },
        { id: 1002, name: "Beta LLC", active: true },
      ],
    });

    const result = await handler({ page: 1, pageSize: 25 });
    const payload = parsePayload(result);

    expect(payload).toMatchObject({ page: 1, pageSize: 25, totalCount: 2, hasMore: false });
    const data = payload.data as Array<{ id: number; name: string }>;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ id: 1001, name: "Acme Corp" });
    expect(data[1]).toMatchObject({ id: 1002, name: "Beta LLC" });
  });

  it("crm_customers_list forwards filter params to the API client", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "crm_customers_list");

    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1 });

    await handler({ name: "Acme", city: "Phoenix", active: true });

    expect(getMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/customers",
      expect.objectContaining({
        name: "Acme",
        city: "Phoenix",
        active: true,
      }),
    );
  });

  it("crm_customers_list surfaces API errors as tool errors", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "crm_customers_list");

    getMock.mockRejectedValue(new Error("API rate limit exceeded"));

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("API rate limit exceeded");
  });

  // ── crm_customers_get ──

  it("crm_customers_get returns a single customer by ID", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "crm_customers_get");

    const customer = {
      id: 42,
      name: "John Doe Enterprises",
      active: true,
      type: "Commercial",
      balance: 0,
    };
    getMock.mockResolvedValue(customer);

    const result = await handler({ id: 42 });
    const payload = parsePayload(result);

    expect(payload).toMatchObject({
      id: 42,
      name: "John Doe Enterprises",
      active: true,
    });
    expect(getMock).toHaveBeenCalledWith("/tenant/{tenant}/customers/42");
  });

  it("crm_customers_get surfaces API errors as tool errors", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "crm_customers_get");

    getMock.mockRejectedValue(new Error("Customer not found"));

    const result = await handler({ id: 9999 });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Customer not found");
  });

  // ── crm_customers_create ──

  it("crm_customers_create creates a new customer and returns the created data", async () => {
    const { handlers, postMock } = createContext();
    const handler = getHandler(handlers, "crm_customers_create");

    const createdCustomer = {
      id: 500,
      name: "New Customer Inc",
      active: true,
      type: "Residential",
    };
    postMock.mockResolvedValue(createdCustomer);

    const result = await handler({
      name: "New Customer Inc",
      type: "Residential",
    });
    const payload = parsePayload(result);

    expect(payload).toMatchObject({ id: 500, name: "New Customer Inc" });
    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/customers",
      expect.objectContaining({ name: "New Customer Inc", type: "Residential" }),
    );
  });

  // ── crm_customers_notes_list ──

  it("crm_customers_notes_list returns paginated notes for a customer", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "crm_customers_notes_list");

    getMock.mockResolvedValue({
      page: 1,
      pageSize: 10,
      totalCount: 2,
      hasMore: false,
      data: [
        { id: 301, text: "Called customer, left message", isPinned: false },
        { id: 302, text: "Follow-up scheduled", isPinned: true },
      ],
    });

    const result = await handler({ id: 42, page: 1, pageSize: 10 });
    const payload = parsePayload(result);

    const data = payload.data as Array<{ id: number; text: string }>;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ id: 301, text: "Called customer, left message" });
    expect(getMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/customers/42/notes",
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  // ── readonly mode enforcement ──

  it("crm_customers_list is available in readonly mode; write tools are not", () => {
    const { handlers } = createContext({ readonlyMode: true });
    // Read tools should be registered
    expect(handlers.has("crm_customers_list")).toBe(true);
    expect(handlers.has("crm_customers_get")).toBe(true);
    // Write tools should not be registered
    expect(handlers.has("crm_customers_create")).toBe(false);
    expect(handlers.has("crm_customers_update")).toBe(false);
    // Delete tools should not be registered
    expect(handlers.has("crm_customers_notes_delete")).toBe(false);
  });
});
