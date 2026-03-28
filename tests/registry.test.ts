import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditLogger } from "../src/audit.js";
import type { ServiceTitanConfig } from "../src/config.js";
import { ToolRegistry, type ToolDefinition } from "../src/registry.js";

const ORIGINAL_ST_RESPONSE_SHAPING = process.env.ST_RESPONSE_SHAPING;

function createConfig(overrides: Partial<ServiceTitanConfig> = {}): ServiceTitanConfig {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    appKey: "app-key",
    tenantId: "tenant-id",
    environment: "integration",
    readonlyMode: true,
    confirmWrites: false,
    maxResponseChars: 100000,
    enabledDomains: null,
    logLevel: "info",
    timezone: "UTC",
    corsOrigin: "",
    allowedCallers: null,
    ...overrides,
  };
}

function createTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "crm_customers_get",
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

function createRegistry(options: {
  config?: Partial<ServiceTitanConfig>;
  auditLogger?: Partial<AuditLogger>;
} = {}) {
  const server = { tool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const auditLogger = {
    log: vi.fn(),
    ...options.auditLogger,
  };

  const registry = new ToolRegistry(
    server as any,
    createConfig(options.config),
    logger as any,
    auditLogger as AuditLogger,
  );

  return { registry, server, logger, auditLogger };
}

describe("ToolRegistry", () => {
  beforeEach(() => {
    process.env.ST_RESPONSE_SHAPING = "false";
  });

  afterEach(() => {
    if (ORIGINAL_ST_RESPONSE_SHAPING === undefined) {
      delete process.env.ST_RESPONSE_SHAPING;
      return;
    }

    process.env.ST_RESPONSE_SHAPING = ORIGINAL_ST_RESPONSE_SHAPING;
  });

  it("registers a tool when domain matches and mode allows", () => {
    const { registry, server } = createRegistry({
      config: { readonlyMode: false },
    });

    registry.register(createTool());

    expect(server.tool).toHaveBeenCalledTimes(1);
    expect(registry.getStats()).toEqual({
      registered: 1,
      skipped: 0,
      byDomain: { crm: 1 },
    });
  });

  it("getRegisteredTools returns registered tool definitions", () => {
    const { registry } = createRegistry({
      config: { readonlyMode: false },
    });

    registry.register(createTool({ name: "crm_customers_list" }));
    registry.register(createTool({ name: "crm_customers_get", operation: "read" }));

    const tools = registry.getRegisteredTools();

    expect(tools).toHaveLength(2);
    expect(tools[0]?.name).toBe("crm_customers_list");
    expect(tools[1]?.name).toBe("crm_customers_get");
  });

  it("throws when attempting to register the same tool name twice", () => {
    const { registry } = createRegistry({
      config: { readonlyMode: false },
    });

    registry.register(createTool({ name: "crm_customers_get" }));

    expect(() =>
      registry.register(
        createTool({
          name: "crm_customers_get",
          description: "Duplicate tool name",
        }),
      )).toThrow('Tool "crm_customers_get" is already registered');
  });

  it("always enables _system domain even when ST_DOMAINS is filtered", () => {
    const { registry, server } = createRegistry({
      config: {
        readonlyMode: false,
        enabledDomains: ["crm"],
      },
    });

    registry.register(
      createTool({
        name: "st_health_check",
        domain: "_system",
      }),
    );

    expect(server.tool).toHaveBeenCalledTimes(1);
    expect(registry.getStats().registered).toBe(1);
  });

  it("injects confirm schema and returns preview for delete without confirmation", async () => {
    const handlerSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "deleted" }],
    });
    const { registry, server, auditLogger } = createRegistry({
      config: { readonlyMode: false },
    });

    registry.register(
      createTool({
        name: "crm_customers_delete",
        operation: "delete",
        handler: handlerSpy,
      }),
    );

    const [, schema, wrappedHandler] = server.tool.mock.calls[0] ?? [];
    expect((schema as Record<string, z.ZodTypeAny>).confirm).toBeDefined();

    const result = await wrappedHandler({ id: 42 });
    const payload = JSON.parse(result.content[0].text);

    expect(handlerSpy).not.toHaveBeenCalled();
    expect(payload.action).toBe("DELETE");
    expect(payload.resource).toBe("customers");
    expect(payload.id).toBe(42);
    expect(payload.confirm).toContain("confirm=true");
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it("executes delete with confirm=true and logs audit", async () => {
    const handlerSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "deleted" }],
    });
    const { registry, server, auditLogger } = createRegistry({
      config: { readonlyMode: false },
    });

    registry.register(
      createTool({
        name: "crm_customers_delete",
        operation: "delete",
        handler: handlerSpy,
      }),
    );

    const [, , wrappedHandler] = server.tool.mock.calls[0] ?? [];
    await wrappedHandler({ id: 42, confirm: true, token: "secret-token" });

    expect(handlerSpy).toHaveBeenCalledWith({ id: 42, token: "secret-token" }, undefined);
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "crm_customers_delete",
        operation: "delete",
        success: true,
        resourceId: 42,
        params: { id: 42 },
      }),
    );
  });

  it("requires confirmation for writes when confirmWrites=true", async () => {
    const handlerSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "updated" }],
    });
    const { registry, server } = createRegistry({
      config: {
        readonlyMode: false,
        confirmWrites: true,
      },
    });

    registry.register(
      createTool({
        name: "crm_customers_update",
        operation: "write",
        handler: handlerSpy,
      }),
    );

    const [, schema, wrappedHandler] = server.tool.mock.calls[0] ?? [];
    expect((schema as Record<string, z.ZodTypeAny>)._confirmed).toBeDefined();

    const preview = await wrappedHandler({ id: 42 });

    expect(preview.isError).toBe(true);
    expect(preview.content[0]?.text).toContain("Write confirmation required");
    expect(handlerSpy).not.toHaveBeenCalled();

    await wrappedHandler({ id: 42, _confirmed: true });
    expect(handlerSpy).toHaveBeenCalledTimes(1);
  });

  it("does not require confirmation for writes when confirmWrites=false", async () => {
    const handlerSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "updated" }],
    });
    const { registry, server, auditLogger } = createRegistry({
      config: {
        readonlyMode: false,
        confirmWrites: false,
      },
    });

    registry.register(
      createTool({
        name: "crm_customers_update",
        operation: "write",
        handler: handlerSpy,
      }),
    );

    const [, schema, wrappedHandler] = server.tool.mock.calls[0] ?? [];
    expect((schema as Record<string, z.ZodTypeAny>)._confirmed).toBeDefined();

    await wrappedHandler({ id: 42 });

    expect(handlerSpy).toHaveBeenCalledWith({ id: 42 }, undefined);
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
  });

  it("registers write tools in readonly mode and blocks execution in middleware", async () => {
    const handlerSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "updated" }],
    });
    const { registry, server, auditLogger } = createRegistry({
      config: {
        readonlyMode: true,
      },
    });

    registry.register(
      createTool({
        name: "crm_customers_update",
        operation: "write",
        handler: handlerSpy,
      }),
    );

    expect(server.tool).toHaveBeenCalledTimes(1);

    const [, , wrappedHandler] = server.tool.mock.calls[0] ?? [];
    const result = await wrappedHandler({ id: 42 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Readonly mode: operation not permitted");
    expect(handlerSpy).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it("registers delete tools in readonly mode and blocks execution in middleware", async () => {
    const handlerSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "deleted" }],
    });
    const { registry, server, auditLogger } = createRegistry({
      config: {
        readonlyMode: true,
      },
    });

    registry.register(
      createTool({
        name: "crm_customers_delete",
        operation: "delete",
        handler: handlerSpy,
      }),
    );

    expect(server.tool).toHaveBeenCalledTimes(1);

    const [, , wrappedHandler] = server.tool.mock.calls[0] ?? [];
    const result = await wrappedHandler({ id: 42, confirm: true });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Readonly mode: operation not permitted");
    expect(handlerSpy).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it("enforces the optional caller allowlist when configured", async () => {
    const handlerSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });
    const { registry, server } = createRegistry({
      config: {
        readonlyMode: false,
        allowedCallers: ["alice@example.com"],
      },
    });

    registry.register(
      createTool({
        name: "crm_customers_get",
        operation: "read",
        handler: handlerSpy,
      }),
    );

    const [, , wrappedHandler] = server.tool.mock.calls[0] ?? [];
    const unauthorized = await wrappedHandler(
      { id: 42 },
      { requestInfo: { headers: { "x-user-email": "mallory@example.com" } } },
    );

    expect(unauthorized.isError).toBe(true);
    expect(unauthorized.content[0]?.text).toContain("caller not permitted");
    expect(handlerSpy).not.toHaveBeenCalled();

    await wrappedHandler(
      { id: 42 },
      { requestInfo: { headers: { "x-user-email": "Alice@Example.com" } } },
    );

    expect(handlerSpy).toHaveBeenCalledWith(
      { id: 42 },
      expect.objectContaining({
        requestInfo: { headers: { "x-user-email": "Alice@Example.com" } },
      }),
    );
  });

  it("rejects allowlisted mode when caller identity is unavailable", async () => {
    const handlerSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });
    const { registry, server } = createRegistry({
      config: {
        readonlyMode: false,
        allowedCallers: ["alice@example.com"],
      },
    });

    registry.register(
      createTool({
        name: "crm_customers_get",
        operation: "read",
        handler: handlerSpy,
      }),
    );

    const [, , wrappedHandler] = server.tool.mock.calls[0] ?? [];
    const result = await wrappedHandler({ id: 42 });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("caller identity unavailable");
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it("does not audit read operations", async () => {
    const handlerSpy = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });
    const { registry, server, auditLogger } = createRegistry({
      config: {
        readonlyMode: false,
      },
    });

    registry.register(
      createTool({
        name: "crm_customers_get",
        operation: "read",
        handler: handlerSpy,
      }),
    );

    const [, , wrappedHandler] = server.tool.mock.calls[0] ?? [];
    await wrappedHandler({ id: 42 });

    expect(handlerSpy).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).not.toHaveBeenCalled();
  });
});
