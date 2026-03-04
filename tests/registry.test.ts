import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanConfig } from "../src/config.js";
import { ToolRegistry, type ToolDefinition } from "../src/registry.js";

function createConfig(overrides: Partial<ServiceTitanConfig> = {}): ServiceTitanConfig {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    appKey: "app-key",
    tenantId: "tenant-id",
    environment: "integration",
    readonlyMode: true,
    enabledDomains: null,
    logLevel: "info",
    ...overrides,
  };
}

function createTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "crm_get_customers",
    domain: "crm",
    operation: "read",
    schema: {
      id: z.number().optional(),
    },
    handler: async () => ({
      content: [{ type: "text", text: "ok" }],
    }),
    ...overrides,
  };
}

describe("ToolRegistry", () => {
  it("registers a tool when domain matches and mode allows", () => {
    const server = { tool: vi.fn() };
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const registry = new ToolRegistry(server as any, createConfig({ readonlyMode: false }), logger as any);

    registry.register(createTool());

    expect(server.tool).toHaveBeenCalledTimes(1);
    expect(registry.getStats()).toEqual({
      registered: 1,
      skipped: 0,
      byDomain: { crm: 1 },
    });
  });

  it("skips tool when domain is filtered out", () => {
    const server = { tool: vi.fn() };
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const registry = new ToolRegistry(
      server as any,
      createConfig({ enabledDomains: ["pricebook"] }),
      logger as any,
    );

    registry.register(createTool({ domain: "crm" }));

    expect(server.tool).not.toHaveBeenCalled();
    expect(registry.getStats()).toEqual({
      registered: 0,
      skipped: 1,
      byDomain: {},
    });
  });

  it("skips write tool in readonly mode", () => {
    const server = { tool: vi.fn() };
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const registry = new ToolRegistry(server as any, createConfig({ readonlyMode: true }), logger as any);

    registry.register(createTool({ operation: "write" }));

    expect(server.tool).not.toHaveBeenCalled();
    expect(registry.getStats().skipped).toBe(1);
  });

  it("skips delete tool in readonly mode", () => {
    const server = { tool: vi.fn() };
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const registry = new ToolRegistry(server as any, createConfig({ readonlyMode: true }), logger as any);

    registry.register(createTool({ operation: "delete" }));

    expect(server.tool).not.toHaveBeenCalled();
    expect(registry.getStats().skipped).toBe(1);
  });

  it("registers read tool in readonly mode", () => {
    const server = { tool: vi.fn() };
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const registry = new ToolRegistry(server as any, createConfig({ readonlyMode: true }), logger as any);

    registry.register(createTool({ operation: "read" }));

    expect(server.tool).toHaveBeenCalledTimes(1);
    expect(registry.getStats().registered).toBe(1);
  });

  it("tracks registered vs skipped stats correctly", () => {
    const server = { tool: vi.fn() };
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const registry = new ToolRegistry(
      server as any,
      createConfig({ readonlyMode: true, enabledDomains: ["crm"] }),
      logger as any,
    );

    registry.register(createTool({ operation: "read", domain: "crm" }));
    registry.register(createTool({ name: "crm_update_customer", operation: "write", domain: "crm" }));
    registry.register(createTool({ name: "jpm_get_jobs", operation: "read", domain: "jpm" }));

    expect(registry.getStats()).toEqual({
      registered: 1,
      skipped: 2,
      byDomain: { crm: 1 },
    });
  });
});
