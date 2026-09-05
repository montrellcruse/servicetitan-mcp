import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { loadConfig } from "../src/config.js";
import { ToolRegistry, type ToolOperation } from "../src/registry.js";
import { ResultStore } from "../src/result-store.js";
import type { ToolResponse } from "../src/types.js";
import { toolError, toolResult } from "../src/utils.js";

const fixtureEnv = {
  ST_CLIENT_ID: "fixture", ST_CLIENT_SECRET: "fixture-secret", ST_APP_KEY: "fixture-key", ST_TENANT_ID: "42",
  ST_READONLY: "false", ST_EXPERIMENTAL_WRITES: "true", ST_CONFIRM_WRITES: "true", ST_LOG_LEVEL: "error",
};
const confirmations = { _confirmed: true, confirm: true };

async function fixture(operation: ToolOperation, budget: number, handler: () => Promise<ToolResponse>) {
  const server = new McpServer({ name: "mutation-delivery-fixture", version: "1" });
  const audit = { log: vi.fn() };
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const registry = new ToolRegistry(server, loadConfig({ ...fixtureEnv, ST_MAX_RESPONSE_CHARS: String(budget) }), logger as any, audit as any);
  const called = vi.fn(handler);
  registry.register({ name: "fixture_operation", domain: "crm", operation, description: "Synthetic operation", schema: {}, handler: called });
  registry.register({ name: "st_result_read", domain: "_system", operation: "read", description: "Synthetic stored result retrieval", schema: { resultId: z.string(), offset: z.number().int().optional() }, handler: async params => {
    const { resultId, offset = 0 } = params as { resultId: string; offset?: number };
    try { return toolResult(registry.readResult(resultId, offset)); }
    catch (error) { return toolError(error); }
  } });
  const client = new Client({ name: "mutation-delivery-consumer", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  return {
    client, registry, called, audit,
    direct: (args: Record<string, unknown> = confirmations) => registry.getRegisteredTools().find(tool => tool.name === "fixture_operation")!.handler(args),
    wire: (args: Record<string, unknown> = confirmations) => client.callTool({ name: "fixture_operation", arguments: args }),
    close: async () => { await client.close(); await server.close(); },
  };
}

function payload(result: unknown, budget: number): Record<string, any> {
  const response = result as ToolResponse;
  expect(JSON.stringify(response).length).toBeLessThanOrEqual(budget);
  expect(JSON.parse(response.content[0].text)).toEqual(response.structuredContent);
  return response.structuredContent!;
}

function completedDelivery(result: unknown, budget: number, code: string) {
  expect((result as ToolResponse).isError).toBe(true);
  expect(payload(result, budget)).toMatchObject({ error: { code, mutationCompleted: true, retryable: false } });
  expect(payload(result, budget).error).not.toHaveProperty("outcomeUnknown");
  expect(JSON.stringify(result)).not.toMatch(/retry the same page|repeat.*original|narrow the query/i);
}

describe("completed mutation response delivery", () => {
  it.each((["write", "delete"] as const).flatMap(operation => (["direct", "wire"] as const).flatMap(mode => [256, 1000].map(budget => ({ operation, mode, budget })))))("$operation $mode at $budget chars preserves completion when storage refuses the result", async ({ operation, mode, budget }) => {
    const run = await fixture(operation, budget, async () => toolResult({ data: "x".repeat(4_000_001), page: 1, pageSize: 100 }));
    try {
      const result = await run[mode]();
      completedDelivery(result, budget, "RESPONSE_TOO_LARGE");
      expect(run.called).toHaveBeenCalledTimes(1);
      expect(run.audit.log).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ success: true, deliveryError: "RESPONSE_TOO_LARGE", operation }));
      expect(run.audit.log.mock.calls[0][0]).not.toHaveProperty("outcomeUnknown");
    } finally { await run.close(); }
  });

  it.each((["circular", "bigint"] as const).flatMap(kind => (["direct", "wire"] as const).map(mode => ({ kind, mode }))))("$kind JSON failure via $mode preserves completed-write semantics", async ({ kind, mode }) => {
    const data: Record<string, unknown> = kind === "bigint" ? { value: 1n } : {};
    if (kind === "circular") data.self = data;
    const run = await fixture("write", 256, async () => toolResult(data));
    try {
      completedDelivery(await run[mode](), 256, "INVALID_RESPONSE");
      expect(run.called).toHaveBeenCalledTimes(1);
      expect(run.audit.log).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ success: true, deliveryError: "INVALID_RESPONSE" }));
    } finally { await run.close(); }
  });

  it("keeps completion when a stored pointer cannot fit the minimum budget without storing pointers recursively", async () => {
    const put = vi.spyOn(ResultStore.prototype, "put");
    const run = await fixture("write", 256, async () => toolResult({ data: "x".repeat(5000) }));
    try {
      completedDelivery(await run.wire(), 256, "RESPONSE_TOO_LARGE");
      expect(put).toHaveBeenCalledTimes(1);
      expect(run.called).toHaveBeenCalledTimes(1);
      expect(run.audit.log).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ success: true, deliveryError: "RESPONSE_TOO_LARGE" }));
    } finally { put.mockRestore(); await run.close(); }
  });

  it("returns a completed-write pointer, retrieves its original result, and never recommends replay after removal", async () => {
    const original = { id: 7, data: "x".repeat(5000) };
    const run = await fixture("write", 1000, async () => toolResult(original));
    try {
      const result = await run.wire();
      expect(result.isError).not.toBe(true);
      const pointer = payload(result, 1000);
      expect(pointer).toMatchObject({ delivery: "stored", retrievalTool: "st_result_read", mutationCompleted: true, retryable: false });
      let text = "", offset = 0;
      for (let page = 0; page < 200; page++) {
        const chunkResult = await run.client.callTool({ name: "st_result_read", arguments: { resultId: pointer.resultId, offset } });
        expect(chunkResult.isError).not.toBe(true);
        const chunk = payload(chunkResult, 1000);
        text += chunk.text;
        if (chunk.nextOffset === null) break;
        expect(chunk.nextOffset).toBeGreaterThan(offset); offset = chunk.nextOffset;
      }
      expect(JSON.parse(text)).toEqual(original);
      run.registry.clearResults();
      const expired = await run.client.callTool({ name: "st_result_read", arguments: { resultId: pointer.resultId } });
      expect(expired.isError).toBe(true);
      expect(JSON.stringify(expired)).not.toMatch(/repeat.*original|retry.*original/i);
      expect(run.called).toHaveBeenCalledTimes(1);
      expect(run.audit.log).toHaveBeenCalledTimes(1);
      expect(run.audit.log.mock.calls[0][0]).toMatchObject({ success: true });
      expect(run.audit.log.mock.calls[0][0]).not.toHaveProperty("deliveryError");
    } finally { await run.close(); }
  });

  it.each(["RESPONSE_TOO_LARGE", "INVALID_RESPONSE"])("does not infer audit success from an untrusted custom %s error code", async code => {
    const error = { error: { code, message: "Synthetic custom handler failure" } };
    const run = await fixture("write", 1000, async () => ({ isError: true, structuredContent: error, content: [{ type: "text", text: JSON.stringify(error) }] }));
    try {
      const result = await run.wire();
      expect(result.isError).toBe(true);
      expect(payload(result, 1000).error).not.toHaveProperty("mutationCompleted");
      expect(run.audit.log).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ success: false }));
      expect(run.audit.log.mock.calls[0][0]).not.toHaveProperty("deliveryError");
    } finally { await run.close(); }
  });

  it.each(["write", "delete"] as const)("does not mark an unconfirmed %s as completed", async operation => {
    const run = await fixture(operation, 256, async () => toolResult({ id: 7 }));
    try {
      const result = await run.wire({});
      const body = payload(result, 256);
      expect(JSON.stringify(body)).not.toContain("mutationCompleted");
      expect(run.called).not.toHaveBeenCalled();
      expect(run.audit.log).not.toHaveBeenCalled();
    } finally { await run.close(); }
  });

  it("does not recommend repeating a mutation when its stored result expires or belongs to another store", () => {
    let now = 0;
    const store = new ResultStore(1000, 10, () => now);
    const pointer = store.put({ id: 7 });
    const other = new ResultStore(1000, 10, () => now);
    for (const read of [() => other.read(pointer.resultId as string, 0, 100), () => { now = 10; return store.read(pointer.resultId as string, 0, 100); }]) {
      let failure: unknown;
      try { read(); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(/unavailable or expired/);
      expect((failure as Error).message).not.toMatch(/repeat.*original|retry.*original/i);
    }
  });

  it("isolates concurrent readonly delivery failure from completed mutation metadata", async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const run = await fixture("write", 256, async () => { entered.resolve(); await release.promise; return toolResult({ data: "x".repeat(5000) }); });
    run.registry.register({ name: "fixture_read", domain: "crm", operation: "read", description: "Synthetic read", schema: {}, handler: async () => toolResult({ data: "x".repeat(5000) }) });
    const mutation = run.direct();
    try {
      await entered.promise;
      const read = await run.registry.getRegisteredTools().find(tool => tool.name === "fixture_read")!.handler({});
      expect(read.isError).toBe(true);
      expect(JSON.stringify(payload(read, 256))).not.toContain("mutationCompleted");
      release.resolve();
      completedDelivery(await mutation, 256, "RESPONSE_TOO_LARGE");
      expect(run.audit.log).toHaveBeenCalledTimes(1);
    } finally { release.resolve(); await mutation; await run.close(); }
  });
});
