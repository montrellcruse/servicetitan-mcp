import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadCrmDomain } from "../../src/domains/crm/index.js";
import { loadMarketingDomain } from "../../src/domains/marketing/index.js";
import type { DomainLoader } from "../../src/registry.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

interface DomainTestContext {
  getMock: ReturnType<typeof vi.fn>;
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>;
  schemas: Map<string, Record<string, z.ZodTypeAny>>;
}

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

function createDomainContext(loader: DomainLoader): DomainTestContext {
  const server = { registerTool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const registry = new ToolRegistry(server as any, createConfig(), logger as any);
  const getMock = vi.fn();
  const client = {
    get: getMock,
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as ServiceTitanClient;

  registry.attachClient(client);
  registry.registerDomain("test", loader);

  const handlers = new Map<string, (params: unknown) => Promise<ToolResponse>>();
  const schemas = new Map<string, Record<string, z.ZodTypeAny>>();

  for (const [name, config, handler] of server.registerTool.mock.calls) {
    handlers.set(name as string, handler as (params: unknown) => Promise<ToolResponse>);
    schemas.set(name as string, config.inputSchema as Record<string, z.ZodTypeAny>);
  }

  return { getMock, handlers, schemas };
}

describe("path validation", () => {
  it("rejects unsafe CRM relationship type slugs", () => {
    const { schemas } = createDomainContext(loadCrmDomain);
    const schema = z.object(schemas.get("crm_contact_relationships_create") ?? {});

    expect(
      schema.safeParse({
        contactId: "550e8400-e29b-41d4-a716-446655440000",
        relatedEntityId: 12,
        typeSlug: "../account",
      }).success,
    ).toBe(false);

    expect(
      schema.safeParse({
        contactId: "550e8400-e29b-41d4-a716-446655440000",
        relatedEntityId: 12,
        typeSlug: "account_link-1",
      }).success,
    ).toBe(true);
  });

  it("rejects unsafe marketing scheduler IDs", () => {
    const { schemas } = createDomainContext(loadMarketingDomain);
    const schema = z.object(schemas.get("marketing_scheduler_scheduler_performance") ?? {});

    expect(
      schema.safeParse({
        id: "scheduler/../admin",
        sessionCreatedOnOrAfter: "2026-03-01T00:00:00Z",
        sessionCreatedBefore: "2026-03-31T00:00:00Z",
      }).success,
    ).toBe(false);

    expect(
      schema.safeParse({
        id: "scheduler_01-alpha",
        sessionCreatedOnOrAfter: "2026-03-01T00:00:00Z",
        sessionCreatedBefore: "2026-03-31T00:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("does not publish undocumented suppression operations", () => {
    const { handlers } = createDomainContext(loadMarketingDomain);
    expect(handlers.has("marketing_suppressions_get")).toBe(false);
    expect(handlers.has("marketing_suppressions_create")).toBe(false);
    expect(handlers.has("marketing_suppressions_delete")).toBe(false);
  });
});
