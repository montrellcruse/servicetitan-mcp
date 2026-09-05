import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ServiceTitanClient } from "../src/client.js";
import { ExperimentalWritesDisabledError, loadConfig } from "../src/config.js";
import type { Logger } from "../src/logger.js";
import { EXPERIMENTAL_MUTATION_NOTICE, ToolRegistry, type ToolDefinition } from "../src/registry.js";
import { createMcpServer } from "../src/server.js";
import { toolResult } from "../src/utils.js";

const env = { ST_CLIENT_ID: "fixture", ST_CLIENT_SECRET: "fixture-secret", ST_APP_KEY: "fixture-key", ST_TENANT_ID: "42", ST_LOG_LEVEL: "error" };
const logger = () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() });
const tool = (operation: ToolDefinition["operation"], handler = vi.fn(async () => toolResult({ ok: true }))): ToolDefinition => ({
  name: `fixture_items_${operation}`, domain: "_system", operation, description: "Fixture operation", schema: { id: z.number() }, handler,
});

describe("experimental mutation policy for embedded servers", () => {
  it.each([undefined, false, "true"])("rejects a direct writable configuration with opt-in %s", async experimentalWrites => {
    const config = { ...loadConfig(env), readonlyMode: false, experimentalWrites: experimentalWrites as boolean | undefined };
    const server = { registerTool: vi.fn() };
    expect(() => new ToolRegistry(server as never, config, logger() as unknown as Logger)).toThrow(ExperimentalWritesDisabledError);
    expect(server.registerTool).not.toHaveBeenCalled();
    await expect(createMcpServer(config)).rejects.toThrow(ExperimentalWritesDisabledError);
  });

  it("readonly mode overrides an experimental opt-in for discovery", () => {
    const config = loadConfig({ ...env, ST_EXPERIMENTAL_WRITES: "true" });
    const server = { registerTool: vi.fn() };
    const registry = new ToolRegistry(server as never, config, logger() as unknown as Logger);
    for (const operation of ["read", "write", "delete"] as const) registry.register(tool(operation));
    expect(registry.getRegisteredTools().map(value => value.operation)).toEqual(["read"]);
    expect(registry.getRegisteredTools()[0].description).toBe("Fixture operation");
    expect(registry.getUnavailableTools()).toMatchObject({ fixture_items_write: expect.stringMatching(/Readonly/), fixture_items_delete: expect.stringMatching(/Readonly/) });
  });

  it("checks policy again if an embedded configuration changes after registration", async () => {
    const config = loadConfig({ ...env, ST_READONLY: "false", ST_EXPERIMENTAL_WRITES: "true" });
    const handler = vi.fn(async () => toolResult({ ok: true }));
    const registry = new ToolRegistry({ registerTool: vi.fn() } as never, config, logger() as unknown as Logger);
    registry.register(tool("write", handler));
    const registered = registry.getRegisteredTools()[0];
    expect(registered.description).toBe(EXPERIMENTAL_MUTATION_NOTICE + "Fixture operation");
    config.experimentalWrites = false;
    const blocked = await registered.handler({ id: 7, _confirmed: true });
    expect(blocked.isError).toBe(true);
    expect(blocked.structuredContent).toMatchObject({ error: { message: expect.stringMatching(/ST_EXPERIMENTAL_WRITES=true/) } });
    expect(() => registry.register(tool("delete"))).toThrow(ExperimentalWritesDisabledError);
    config.experimentalWrites = true;
    config.readonlyMode = true;
    expect((await registered.handler({ id: 7, _confirmed: true })).isError).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("advertises exactly 264 supported reads and 194 labeled experimental mutations over the SDK", async () => {
    const patch = vi.fn(async () => ({ id: 7, updated: true }));
    const remove = vi.fn(async () => undefined);
    const forbidden = vi.fn(async () => { throw new Error("Unexpected upstream fixture call"); });
    const sink = logger();
    const runtime = await createMcpServer(loadConfig({ ...env, ST_READONLY: "false", ST_EXPERIMENTAL_WRITES: "true", ST_CONFIRM_WRITES: "true" }), {
      client: { patch, delete: remove, get: forbidden, post: forbidden, ensureToken: forbidden } as unknown as ServiceTitanClient,
      logger: sink as unknown as Logger,
    });
    const client = new Client({ name: "experimental-policy-fixture", version: "1" });
    const [left, right] = InMemoryTransport.createLinkedPair();
    try {
      await runtime.server.connect(right); await client.connect(left);
      const { tools } = await client.listTools();
      const reads = tools.filter(value => value.annotations?.readOnlyHint === true);
      const mutations = tools.filter(value => value.annotations?.readOnlyHint === false);
      expect(reads).toHaveLength(264); expect(mutations).toHaveLength(194);
      expect(mutations.every(value => value.description?.startsWith(EXPERIMENTAL_MUTATION_NOTICE))).toBe(true);
      expect(reads.every(value => !value.description?.startsWith(EXPERIMENTAL_MUTATION_NOTICE))).toBe(true);
      const denied = await client.callTool({ name: "crm_customers_update", arguments: { id: 7, payload: { name: "Synthetic customer" } } });
      expect(denied.isError).toBe(true); expect(patch).not.toHaveBeenCalled();
      expect(denied.structuredContent).toMatchObject({ error: { message: expect.stringMatching(/Write confirmation required/) } });
      const preview = await client.callTool({ name: "crm_contacts_delete", arguments: { id: "00000000-0000-4000-8000-000000000007" } });
      expect(preview.isError).not.toBe(true); expect(remove).not.toHaveBeenCalled();
      expect(preview.structuredContent).toMatchObject({ action: "DELETE", confirm: expect.stringMatching(/confirm=true/) });
      expect(sink.audit).not.toHaveBeenCalled();
      const written = await client.callTool({ name: "crm_customers_update", arguments: { id: 7, payload: { name: "Synthetic customer" }, _confirmed: true } });
      expect(written.isError).not.toBe(true);
      expect(patch).toHaveBeenCalledExactlyOnceWith("/tenant/{tenant}/customers/7", { name: "Synthetic customer" });
      const deleted = await client.callTool({ name: "crm_contacts_delete", arguments: { id: "00000000-0000-4000-8000-000000000007", confirm: true } });
      expect(deleted.isError).not.toBe(true);
      expect(remove).toHaveBeenCalledExactlyOnceWith("/tenant/{tenant}/contacts/00000000-0000-4000-8000-000000000007");
      expect(sink.audit).toHaveBeenCalledTimes(2);
      expect(sink.audit.mock.calls.map(call => call[1])).toEqual([
        expect.objectContaining({ tool: "crm_customers_update", operation: "write", success: true }),
        expect.objectContaining({ tool: "crm_contacts_delete", operation: "delete", success: true }),
      ]);
      expect(forbidden).not.toHaveBeenCalled();
    } finally { await client.close(); await runtime.server.close(); }
  });
});
