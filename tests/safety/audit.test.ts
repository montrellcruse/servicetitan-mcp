import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanConfig } from "../../src/config.js";
import { ToolRegistry, type ToolDefinition } from "../../src/registry.js";

function config(overrides: Partial<ServiceTitanConfig> = {}): ServiceTitanConfig {
  return {
    clientId: "id",
    clientSecret: "secret",
    appKey: "key",
    tenantId: "tenant",
    environment: "integration",
    readonlyMode: false,
    confirmWrites: false,
    maxResponseChars: 100000,
    enabledDomains: null,
    logLevel: "error",
    timezone: "UTC",
    corsOrigin: "",
    allowedCallers: null,
    ...overrides,
  };
}

function createRegistry(overrides: Partial<ServiceTitanConfig> = {}) {
  const server = { tool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const auditLogger = { log: vi.fn() };

  const registry = new ToolRegistry(
    server as any,
    config(overrides),
    logger as any,
    auditLogger as any,
  );

  return { registry, server, auditLogger };
}

function createTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "crm_customers_update",
    domain: "crm",
    operation: "write",
    schema: { id: z.number() },
    handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    ...overrides,
  };
}

describe("safety audit wrapper", () => {
  it("write operations produce audit log entries", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const { registry, server, auditLogger } = createRegistry({ confirmWrites: false });

    registry.register(createTool({ handler }));

    const [, , wrapped] = server.tool.mock.calls[0] ?? [];
    await wrapped({ id: 1 });

    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "crm_customers_update",
        operation: "write",
        success: true,
      }),
    );
  });

  it("delete operations only log on confirmed execution", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const { registry, server, auditLogger } = createRegistry();

    registry.register(
      createTool({
        name: "crm_customers_delete",
        operation: "delete",
        handler,
      }),
    );

    const [, , wrapped] = server.tool.mock.calls[0] ?? [];

    await wrapped({ id: 1 });
    expect(auditLogger.log).not.toHaveBeenCalled();

    await wrapped({ id: 1, confirm: true });
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
  });

  it("read operations do not produce audit entries", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const { registry, server, auditLogger } = createRegistry();

    registry.register(
      createTool({
        name: "crm_customers_get",
        operation: "read",
        handler,
      }),
    );

    const [, , wrapped] = server.tool.mock.calls[0] ?? [];
    await wrapped({ id: 1 });

    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it("failed operations log success false and error details", async () => {
    const handler = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Error: request failed" }],
      isError: true,
    });
    const { registry, server, auditLogger } = createRegistry();

    registry.register(createTool({ handler }));

    const [, , wrapped] = server.tool.mock.calls[0] ?? [];
    await wrapped({ id: 1 });

    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "Error: request failed",
      }),
    );
  });

  it("sanitizes params before logging", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const { registry, server, auditLogger } = createRegistry();

    registry.register(createTool({ handler }));

    const [, , wrapped] = server.tool.mock.calls[0] ?? [];
    await wrapped({
      id: 1,
      clientSecret: "pw",
      accessToken: "tok",
      refreshToken: "refresh",
      apiKey: "api",
      authorizationCode: "code",
      authorization: "Bearer secret",
      nested: { credentialType: "value", keep: "safe" },
      keep: true,
    });

    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          id: 1,
          nested: { keep: "safe" },
          keep: true,
        },
      }),
    );
  });
});
