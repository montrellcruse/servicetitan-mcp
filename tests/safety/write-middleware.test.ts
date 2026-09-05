import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadAccountingDomain } from "../../src/domains/accounting/index.js";
import { loadSchedulingDomain } from "../../src/domains/scheduling/index.js";
import { ToolRegistry, type ToolDefinition } from "../../src/registry.js";

function createConfig(overrides: Partial<ServiceTitanConfig> = {}): ServiceTitanConfig {
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

function createRegistry(options: {
  config?: Partial<ServiceTitanConfig>;
  auditLogger?: { log: ReturnType<typeof vi.fn> };
} = {}) {
  const server = { registerTool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const auditLogger = options.auditLogger ?? { log: vi.fn() };

  const registry = new ToolRegistry(
    server as any,
    createConfig(options.config),
    logger as any,
    auditLogger as any,
  );

  return { registry, server, auditLogger };
}

function createWriteTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: "crm_customers_update",
    domain: "crm",
    operation: "write",
    description: "Patch a customer",
    schema: {
      id: z.number().int().describe("Customer ID"),
    },
    handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    ...overrides,
  };
}

function registerAccountingAndSchedulingWriteTools(
  configOverrides: Partial<ServiceTitanConfig> = {},
) {
  const { registry, server } = createRegistry({ config: configOverrides });
  const client = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as ServiceTitanClient;

  registry.attachClient(client);
  loadAccountingDomain(client, registry);
  loadSchedulingDomain(client, registry);

  return { server };
}

describe("write middleware safety", () => {
  it("readonly mode blocks all write tools", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const { registry, server, auditLogger } = createRegistry({
      config: { readonlyMode: true },
    });

    registry.register(createWriteTool({ handler }));

    expect(server.registerTool).not.toHaveBeenCalled();
    expect(registry.getRegisteredTools()).toHaveLength(0);
    expect(handler).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it("confirmWrites requires the _confirmed flag", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const { registry, server } = createRegistry({
      config: { confirmWrites: true },
    });

    registry.register(createWriteTool({ handler }));

    const [, , wrapped] = server.registerTool.mock.calls[0] ?? [];

    const blocked = await wrapped({ id: 7 });
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0]?.text).toContain(
      "Write confirmation required. Re-call with _confirmed: true to proceed.",
    );
    expect(handler).not.toHaveBeenCalled();

    await wrapped({ id: 7, _confirmed: true });
    expect(handler).toHaveBeenCalledWith({ id: 7 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("audit logger is called for every successful write execution", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const { registry, server, auditLogger } = createRegistry();

    registry.register(createWriteTool({ handler }));

    const [, , wrapped] = server.registerTool.mock.calls[0] ?? [];
    await wrapped({ id: 7 });

    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "crm_customers_update",
        operation: "write",
        resourceId: 7,
        success: true,
      }),
    );
  });

  it("audits thrown write handler failures and returns a structured tool error", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("write exploded"));
    const { registry, server, auditLogger } = createRegistry();

    registry.register(createWriteTool({ handler }));

    const [, , wrapped] = server.registerTool.mock.calls[0] ?? [];

    const result = await wrapped({ id: 7 });
    expect(result).toMatchObject({ isError: true, structuredContent: { error: { code: "REQUEST_FAILED", message: "write exploded" } } });
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "crm_customers_update",
        operation: "write",
        resourceId: 7,
        success: false,
        error: result.content[0].text,
      }),
    );
    const entry = auditLogger.log.mock.calls[0][0];
    expect(JSON.parse(entry.error)).toEqual(result.structuredContent);
    expect(entry).not.toHaveProperty("deliveryError");
    expect(entry).not.toHaveProperty("outcomeUnknown");
  });

  it("hardened write schemas reject empty input", () => {
    const { server } = registerAccountingAndSchedulingWriteTools();
    const registered = new Map(
      server.registerTool.mock.calls.map(([name, config]) => [name as string, config.inputSchema as Record<string, z.ZodTypeAny>]),
    );

    const hardenedToolNames = [
      "scheduling_capacity_calculate",
      "accounting_payments_update_status",
      "accounting_ap_credits_mark_as_exported",
      "accounting_ap_payments_mark_as_exported",
      "accounting_invoices_create_adjustment",
      "accounting_invoices_mark_as_exported",
    ];

    for (const toolName of hardenedToolNames) {
      const schema = registered.get(toolName);
      expect(schema, `${toolName} should be registered`).toBeDefined();
      expect(Object.keys(schema ?? {})).not.toHaveLength(0);
      expect(
        z.object(schema ?? {}).safeParse({}).success,
        `${toolName} should reject empty input`,
      ).toBe(false);
    }
  });
});
