/**
 * MCP wire contract tests.
 *
 * These tests connect a real MCP Client to a real McpServer over an in-memory
 * transport and inspect what `tools/list` actually returns. They exist because
 * the registry can register a tool in a way that silently drops metadata: the
 * tool name and input schema still arrive, but the description and annotations
 * do not, and no unit test on the registry alone would notice.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../src/client.js";
import type { ServiceTitanConfig } from "../src/config.js";
import { loadDomainModules } from "../src/domains/loader.js";
import { ToolRegistry, type ToolDefinition } from "../src/registry.js";
import { toolResult } from "../src/utils.js";

function createConfig(): ServiceTitanConfig {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    appKey: "app-key",
    tenantId: "tenant-id",
    environment: "integration",
    readonlyMode: false, experimentalWrites: true,
    confirmWrites: false,
    maxResponseChars: 100_000,
    enabledDomains: null,
    logLevel: "error",
    timezone: "UTC",
    corsOrigin: "",
    allowedCallers: null,
  };
}

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

/**
 * Build a server, run `register` against its registry, then connect a real
 * client and return every tool from `tools/list` (following pagination).
 */
async function listToolsOverWire(
  register: (registry: ToolRegistry) => Promise<void> | void,
): Promise<{ tools: Tool[]; registry: ToolRegistry }> {
  const server = new McpServer({ name: "contract-test", version: "0.0.0" });
  const registry = new ToolRegistry(server, createConfig(), logger as any);
  registry.attachClient({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as ServiceTitanClient);

  await register(registry);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "contract-test-client", version: "0.0.0" });
  await client.connect(clientTransport);

  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools({ cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);

  await client.close();
  await server.close();

  return { tools, registry };
}

async function listAllDomainTools(): Promise<{ tools: Tool[]; registry: ToolRegistry }> {
  return listToolsOverWire((registry) => loadDomainModules(registry, logger as any));
}

function toolNamed(tools: Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Tool "${name}" was not returned by tools/list`);
  }
  return tool;
}

// Hand-derived expectations. These are literals, not computed from the registry,
// so a wrong mapping in production cannot make the assertion pass by accident.
const EXPECTED_ANNOTATIONS_BY_OPERATION: Record<ToolDefinition["operation"], ToolAnnotations> = {
  read: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  write: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  delete: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

describe("MCP wire contract: tools/list", () => {
  it("delivers every registered tool and description to the client", async () => {
    const { tools, registry } = await listAllDomainTools();

    expect(tools.length).toBeGreaterThan(400);
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      registry
        .getRegisteredTools()
        .map((tool) => tool.name)
        .sort(),
    );

    const missingDescription = tools
      .filter((tool) => typeof tool.description !== "string" || tool.description.trim() === "")
      .map((tool) => tool.name);

    expect(
      missingDescription,
      `${missingDescription.length} tools arrived without a description`,
    ).toEqual([]);
  });

  it("delivers the description text verbatim", async () => {
    const { tools } = await listAllDomainTools();

    // Literal copied from src/domains/crm/customers.ts, not read from the registry.
    expect(toolNamed(tools, "crm_customers_get").description).toBe("Get a customer by ID");
  });

  it("delivers the input schema alongside the description", async () => {
    const { tools } = await listAllDomainTools();

    const schema = toolNamed(tools, "crm_customers_get").inputSchema;
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("id");
    expect(schema.required).toEqual(["id"]);
  });

  it.each([
    ["crm_customers_get", "read"],
    ["crm_customers_update", "write"],
    ["crm_customers_notes_delete", "delete"],
  ] as const)("annotates %s as a %s operation", async (name, operation) => {
    const { tools } = await listAllDomainTools();

    expect(toolNamed(tools, name).annotations).toEqual(
      EXPECTED_ANNOTATIONS_BY_OPERATION[operation],
    );
  });

  it("annotates every tool consistently with its registered operation", async () => {
    const { tools, registry } = await listAllDomainTools();
    const definitionByName = new Map(
      registry.getRegisteredTools().map((tool) => [tool.name, tool]),
    );

    const mismatches: string[] = [];
    for (const tool of tools) {
      const definition = definitionByName.get(tool.name);
      if (!definition) {
        mismatches.push(`${tool.name}: not present in registry`);
        continue;
      }

      const defaults = EXPECTED_ANNOTATIONS_BY_OPERATION[definition.operation];
      const expected = {
        ...defaults,
        ...definition.annotations,
        readOnlyHint: defaults.readOnlyHint,
      };
      const actual = tool.annotations;
      const matches =
        actual !== undefined &&
        actual.readOnlyHint === expected.readOnlyHint &&
        actual.destructiveHint === expected.destructiveHint &&
        actual.idempotentHint === expected.idempotentHint &&
        actual.openWorldHint === expected.openWorldHint;

      if (!matches) {
        mismatches.push(`${tool.name} (${definition.operation}): ${JSON.stringify(actual)}`);
      }
    }

    expect(mismatches, mismatches.slice(0, 10).join("\n")).toEqual([]);
  });

  it("lets a tool override individual annotation hints", async () => {
    const { tools } = await listToolsOverWire((registry) => {
      registry.register({
        name: "crm_customers_touch",
        domain: "crm",
        operation: "write",
        description: "Idempotent write used to exercise annotation overrides",
        schema: { id: z.number().int() },
        annotations: { destructiveHint: false, idempotentHint: true },
        handler: async () => toolResult({ ok: true }),
      });
    });

    expect(toolNamed(tools, "crm_customers_touch").annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it("does not let an annotation override contradict the registered operation", async () => {
    const { tools } = await listToolsOverWire((registry) => {
      registry.register({
        name: "crm_customers_touch",
        domain: "crm",
        operation: "write",
        description: "Write used to exercise the read-only annotation invariant",
        schema: { id: z.number().int() },
        annotations: { readOnlyHint: true } as unknown as ToolDefinition["annotations"],
        handler: async () => toolResult({ ok: true }),
      });
    });

    expect(toolNamed(tools, "crm_customers_touch").annotations?.readOnlyHint).toBe(false);
  });
});
