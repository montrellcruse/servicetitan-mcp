import { describe, expect, it, vi } from "vitest";
import { z } from "../src/schema.js";
import * as legacy from "zod/v3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, loadConfig } from "../src/server.js";
import { zodFromOfficialSchema } from "../src/contracts/request-schema.js";
import type { ServiceTitanClient } from "../src/client.js";

describe("bounded collection validation", () => {
  it.each(["sync", "async"])("rejects an oversized array before parsing children (%s)", async mode => {
    const visit = vi.fn(() => true);
    const schema = z.array(z.unknown().refine(visit)).max(50, "Too many statuses");
    const input = Array.from({ length: 1000 }, () => ({ unexpected: true }));
    const result = mode === "async" ? await schema.safeParseAsync(input) : schema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual([
      expect.objectContaining({ code: "too_big", type: "array", maximum: 50, message: "Too many statuses", path: [] }),
    ]);
    expect(visit.mock.calls.length).toBe(0);
  });

  const chains: [string, (child: z.ZodTypeAny) => z.ZodTypeAny][] = [
    ["max then min", child => z.array(child).max(2).min(1)],
    ["min then max", child => z.array(child).min(1).max(2)],
    ["exact length", child => z.array(child).length(2)],
    ["nonempty", child => z.array(child).nonempty().max(2)],
    ["described", child => z.array(child).max(2).describe("Values")],
    ["optional", child => z.array(child).max(2).optional()],
    ["default", child => z.array(child).max(2).default([])],
    ["nullable", child => z.array(child).max(2).nullable()],
    ["nested object", child => z.object({ values: z.array(child).max(2) }).transform(value => value.values)],
    ["array of arrays", child => z.array(child).array().max(2)],
  ];
  it.each(chains)("retains the early size check after %s", async (name, build) => {
    const visit = vi.fn(() => true);
    const schema = build(z.unknown().refine(visit));
    const values = new Array(1000).fill(null);
    const input = name === "nested object" ? { values } : values;
    const result = await schema.safeParseAsync(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(1);
    expect(visit.mock.calls.length).toBe(0);
  });

  it("does not allocate per-element errors for oversized invalid objects or visit them through a union/record", async () => {
    const visit = vi.fn(value => value);
    const child = z.preprocess(visit, z.object({ id: z.number(), name: z.string() }));
    const schema = z.record(z.union([z.array(child).max(2), z.string()]));
    const result = await schema.safeParseAsync({ values: new Array(1000).fill({ id: "bad" }) });
    expect(result.success).toBe(false);
    expect(visit.mock.calls.length).toBe(0);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      const issue = result.error.issues[0];
      expect(issue.code).toBe("invalid_union");
      if (issue.code === "invalid_union") expect(issue.unionErrors[0].issues).toEqual([
        expect.objectContaining({ code: "too_big", path: ["values"] }),
      ]);
    }
  });

  it("preserves custom error maps and rejects wrong types without inventing a size error", () => {
    const schema = z.array(z.string(), { errorMap: () => ({ message: "Collection rejected" }) }).max(1);
    for (const input of [[null, null], "not an array"]) {
      const result = schema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toBe("Collection rejected");
    }
    expect(schema.safeParse("not an array").error?.issues[0].code).toBe("invalid_type");
  });

  it("preserves at-limit/unbounded arrays, defaults, optionality, stripping, and strict errors", () => {
    const schema = z.object({ values: z.array(z.number()).min(1).max(2), optional: z.array(z.string()).max(2).optional(), defaults: z.array(z.string()).max(2).default([]) });
    expect(schema.parse({ values: [1, 2], unknown: true })).toEqual({ values: [1, 2], defaults: [] });
    expect(z.array(z.number()).parse(new Array(1000).fill(1))).toHaveLength(1000);
    expect(z.object({ value: z.number() }).passthrough().parse({ value: 1, extra: true })).toEqual({ value: 1, extra: true });
    expect(z.object({ value: z.number() }).strict().safeParse({ value: 1, extra: true }).success).toBe(false);
    expect(z.array(z.number()).length(2).safeParse([1]).error?.issues[0].code).toBe("too_small");
    expect(z.array(z.number()).max(2).safeParse(["bad"]).error?.issues[0].code).toBe("invalid_type");
  });

  it("keeps the legacy integer, UUID, datetime, and unknown-field contract", () => {
    const schema = z.object({ id: z.number().int(), resultId: z.string().uuid(), date: z.string().datetime({ offset: true }), value: z.unknown() });
    const control = { id: 9007199254740992, resultId: "00000000-0000-0000-0000-000000000001", date: "2026-10-25T10:30:00+02:00", extra: true };
    expect(schema.parse(control)).toEqual({ id: control.id, resultId: control.resultId, date: control.date });
    expect(schema.safeParse({ ...control, id: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ ...control, resultId: "invalid" }).success).toBe(false);
    expect(schema.safeParse({ ...control, date: "2026-02-30T10:30:00Z" }).success).toBe(false);
  });

  it("protects generated nested official schemas and their valid controls", async () => {
    const schema = zodFromOfficialSchema({ type: "object", required: ["rows"], properties: { rows: { type: "array", minItems: 1, maxItems: 2, items: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "integer" } } } } } });
    const result = await schema.safeParseAsync({ rows: new Array(1000).fill({ id: "bad" }) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual([expect.objectContaining({ code: "too_big", path: ["rows"], maximum: 2 })]);
    expect(schema.parse({ rows: [{ id: 9007199254740992 }] })).toEqual({ rows: [{ id: 9007199254740992 }] });
  });

  it("protects every registered bounded array, including nested experimental request schemas", async () => {
    const config = loadConfig({ ST_CLIENT_ID: "fixture", ST_CLIENT_SECRET: "fixture", ST_APP_KEY: "fixture", ST_TENANT_ID: "1", ST_LOG_LEVEL: "error", ST_READONLY: "false", ST_EXPERIMENTAL_WRITES: "true" });
    const runtime = await createMcpServer(config, { client: {} as ServiceTitanClient });
    const seen = new Set<z.ZodTypeAny>();
    let boundedArrays = 0;
    function check(schema: z.ZodTypeAny): void {
      if (seen.has(schema)) return;
      seen.add(schema);
      if (schema instanceof legacy.ZodArray) {
        expect(schema).toBeInstanceOf(z.ZodArray);
        const bound = schema._def.maxLength ?? schema._def.exactLength;
        if (bound) {
          boundedArrays++;
          const visit = vi.spyOn(schema.element, "_parse");
          try {
            const result = schema.safeParse(new Array(bound.value + 1));
            expect(result.success).toBe(false);
            expect(visit.mock.calls.length).toBe(0);
          } finally { visit.mockRestore(); }
        }
      }
      const def = schema._def as Record<string, unknown>;
      const children = [def.type, def.innerType, def.schema, def.valueType, def.catchall, ...(Array.isArray(def.options) ? def.options : [])];
      if (schema instanceof z.ZodObject) children.push(...Object.values(schema.shape));
      for (const child of children) if (child instanceof z.ZodType) check(child);
    }
    try {
      for (const tool of runtime.registry.getRegisteredTools()) for (const schema of Object.values(tool.schema)) check(schema);
      expect(runtime.registry.getStats().registered).toBe(458);
      expect(boundedArrays).toBeGreaterThanOrEqual(3);
    } finally { await runtime.server.close(); }
  });

  it("rejects before child parsing and handler execution at the real SDK boundary", async () => {
    const visit = vi.fn(() => true);
    const handler = vi.fn(async () => ({ content: [] }));
    const server = new McpServer({ name: "bounded-input", version: "1" });
    server.registerTool("bounded", { inputSchema: { values: z.array(z.unknown().refine(visit)).max(2) } }, handler);
    const client = new Client({ name: "bounded-client", version: "1" });
    const [left, right] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(right); await client.connect(left);
      const result = await client.callTool({ name: "bounded", arguments: { values: new Array(1000).fill(null) } });
      expect(result.isError).toBe(true);
      expect(visit.mock.calls.length).toBe(0);
      expect(handler.mock.calls.length).toBe(0);
      expect((await client.callTool({ name: "bounded", arguments: { values: [1, 2] } })).isError).not.toBe(true);
      expect(handler.mock.calls.length).toBe(1);
      expect(visit.mock.calls.length).toBe(2);
    } finally { await client.close(); await server.close(); }
  });
});
