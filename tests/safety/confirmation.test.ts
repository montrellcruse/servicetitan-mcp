import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTitanConfig } from "../../src/config.js";
import { ToolRegistry, type ToolDefinition } from "../../src/registry.js";

const ORIGINAL_ST_RESPONSE_SHAPING = process.env.ST_RESPONSE_SHAPING;

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
    ...overrides,
  };
}

function registryWithConfig(overrides: Partial<ServiceTitanConfig> = {}) {
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

function definition(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "crm_customers_delete",
    domain: "crm",
    operation: "delete",
    schema: { id: z.number() },
    handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    ...overrides,
  };
}

describe("safety confirmation wrapper", () => {
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

  it("delete without confirm=true returns preview and does not execute", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "deleted" }] });
    const { registry, server, auditLogger } = registryWithConfig();

    registry.register(definition({ handler }));

    const [, , wrapped] = server.tool.mock.calls[0] ?? [];
    const result = await wrapped({ id: 55 });
    const preview = JSON.parse(result.content[0].text);

    expect(handler).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalled();
    expect(preview.action).toBe("DELETE");
    expect(preview.resource).toBe("customers");
    expect(preview.id).toBe(55);
  });

  it("delete with confirm=true executes", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "deleted" }] });
    const { registry, server } = registryWithConfig();

    registry.register(definition({ handler }));

    const [, , wrapped] = server.tool.mock.calls[0] ?? [];
    await wrapped({ id: 55, confirm: true });

    expect(handler).toHaveBeenCalledWith({ id: 55 });
  });

  it("write tools require confirm=true when ST_CONFIRM_WRITES=true", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "updated" }] });
    const { registry, server } = registryWithConfig({ confirmWrites: true });

    registry.register(
      definition({
        name: "crm_customers_update",
        operation: "write",
        handler,
      }),
    );

    const [, , wrapped] = server.tool.mock.calls[0] ?? [];
    await wrapped({ id: 55 });
    expect(handler).not.toHaveBeenCalled();

    await wrapped({ id: 55, confirm: true });
    expect(handler).toHaveBeenCalledWith({ id: 55 });
  });

  it("write tools execute immediately when ST_CONFIRM_WRITES=false", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "updated" }] });
    const { registry, server } = registryWithConfig({ confirmWrites: false });

    registry.register(
      definition({
        name: "crm_customers_update",
        operation: "write",
        handler,
      }),
    );

    const [, , wrapped] = server.tool.mock.calls[0] ?? [];
    await wrapped({ id: 55 });

    expect(handler).toHaveBeenCalledWith({ id: 55 });
  });
});
