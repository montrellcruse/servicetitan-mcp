import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AuditLogger } from "../src/audit.js";
import { ServiceTitanApiError } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { ToolRegistry, type ToolOperation } from "../src/registry.js";
import type { ToolResponse } from "../src/types.js";
import { toolError, toolResult } from "../src/utils.js";

const CANARY = "AUDIT_ONLY_SECRET_CANARY";
const credentials = { ST_CLIENT_ID: "fixture", ST_CLIENT_SECRET: "fixture-secret", ST_APP_KEY: "fixture-key", ST_TENANT_ID: "42", ST_READONLY: "false", ST_EXPERIMENTAL_WRITES: "true", ST_CONFIRM_WRITES: "true", ST_LOG_LEVEL: "error" };
const confirmed = { _confirmed: true, confirm: true };
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

async function fixture(options: {
  operation?: ToolOperation; budget?: number; handler: () => Promise<ToolResponse>;
  auditMode?: "throw" | "reject" | "real" | "pending"; diagnosticMode?: "throw" | "reject";
  auditEmitter?: "audit" | "info"; auditEmitMode?: "reject";
}) {
  const server = new McpServer({ name: "audit-failure-fixture", version: "1" });
  const diagnostic = vi.fn(() => {
    if (options.diagnosticMode === "throw") throw new Error(CANARY);
    if (options.diagnosticMode === "reject") return Promise.reject(new Error(CANARY));
  });
  const emit = vi.fn(() => options.auditEmitMode === "reject" ? Promise.reject(new Error(CANARY)) : undefined);
  const logger = { debug: vi.fn(), info: options.auditEmitter === "info" ? emit : vi.fn(), warn: diagnostic, error: diagnostic, audit: options.auditEmitter === "info" ? undefined : emit };
  const sink = vi.fn(() => {
    if (options.auditMode === "reject") return Promise.reject(new Error(CANARY));
    if (options.auditMode === "pending") return new Promise<void>(() => {});
    throw new Error(CANARY);
  });
  const audit = options.auditMode === "real" ? new AuditLogger(logger as any) : { log: sink };
  const realLog = options.auditMode === "real" ? vi.spyOn(audit, "log") : undefined;
  const registry = new ToolRegistry(server, loadConfig({ ...credentials, ST_MAX_RESPONSE_CHARS: String(options.budget ?? 2000) }), logger as any, audit as any);
  const handler = vi.fn(options.handler);
  registry.register({ name: "audit_failure_fixture", domain: "crm", operation: options.operation ?? "write", description: "Synthetic mutation", schema: { payload: z.unknown().optional() }, handler });
  const client = new Client({ name: "audit-failure-consumer", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  return {
    handler, sink: realLog ?? sink, diagnostic, registry,
    direct: (args: Record<string, unknown> = confirmed) => registry.getRegisteredTools()[0].handler(args),
    wire: (args: Record<string, unknown> = confirmed) => client.callTool({ name: "audit_failure_fixture", arguments: args }),
    close: async () => { await client.close(); await server.close(); },
  };
}

function safeDiagnostic(run: Awaited<ReturnType<typeof fixture>>, result: unknown) {
  expect(run.diagnostic).toHaveBeenCalledTimes(1);
  const args = run.diagnostic.mock.calls[0];
  expect(args).toHaveLength(1);
  expect(args[0]).toEqual(expect.any(String));
  expect(JSON.stringify(args)).not.toContain(CANARY);
  expect(JSON.stringify(result)).not.toContain(CANARY);
}

describe("audit failures cannot replace business outcomes", () => {
  it.each((["write", "delete"] as const).flatMap(operation => (["direct", "wire"] as const).flatMap(mode => (["throw", "reject"] as const).map(auditMode => ({ operation, mode, auditMode })))))("preserves $operation success via $mode when the audit sink $auditMode fails", async ({ operation, mode, auditMode }) => {
    let expected!: ToolResponse;
    const run = await fixture({ operation, auditMode, handler: async () => expected = toolResult({ id: 7, status: "completed" }) });
    try {
      const result = await run[mode](); await settle();
      expect(result).toEqual(expected);
      if (mode === "direct") expect(result).toBe(expected);
      expect(run.handler).toHaveBeenCalledTimes(1); expect(run.sink).toHaveBeenCalledTimes(1);
      safeDiagnostic(run, result);
    } finally { await run.close(); }
  });

  const outcomes = ["returned-failure", "thrown-failure", "returned-uncertain", "thrown-uncertain", "oversized", "invalid"] as const;
  it.each(outcomes.flatMap(outcome => (["direct", "wire"] as const).map(mode => ({ outcome, mode }))))("preserves $outcome via $mode after a failing audit", async ({ outcome, mode }) => {
    let expected: ToolResponse | undefined;
    const apiError = new ServiceTitanApiError(0, "Verify upstream before retrying", "/crm/v2/tenant/42/customers", { phase: "resource", outcomeUnknown: true, retryable: false });
    const run = await fixture({ budget: 256, handler: async () => {
      if (outcome === "thrown-failure") throw new Error("Synthetic business failure");
      if (outcome === "thrown-uncertain") throw apiError;
      if (outcome === "returned-failure") return expected = toolError("Synthetic business failure");
      if (outcome === "returned-uncertain") return expected = toolError(apiError);
      if (outcome === "oversized") return expected = toolResult({ data: "x".repeat(5000) });
      return expected = toolResult({ amount: 1n });
    } });
    try {
      const result = await run[mode](); await settle();
      if (expected) { expect(result).toEqual(expected); if (mode === "direct") expect(result).toBe(expected); }
      expect(result.isError).toBe(true);
      const body = result.structuredContent as any;
      expect(JSON.parse((result.content[0] as any).text)).toEqual(body);
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(256);
      if (outcome.includes("uncertain")) expect(body.error).toMatchObject({ outcomeUnknown: true, retryable: false });
      else if (outcome === "oversized" || outcome === "invalid") expect(body.error).toMatchObject({ code: outcome === "oversized" ? "RESPONSE_TOO_LARGE" : "INVALID_RESPONSE", mutationCompleted: true, retryable: false });
      else expect(body.error.code).toBe("REQUEST_FAILED");
      expect(run.handler).toHaveBeenCalledTimes(1); expect(run.sink).toHaveBeenCalledTimes(1);
      safeDiagnostic(run, result);
    } finally { await run.close(); }
  });

  it.each(["throw", "reject"] as const)("preserves success even when the fallback diagnostic also fails by %s", async diagnosticMode => {
    let expected!: ToolResponse;
    const run = await fixture({ auditMode: diagnosticMode, diagnosticMode, handler: async () => expected = toolResult({ id: 7 }) });
    try {
      const result = await run.wire(); await settle();
      expect(result).toEqual(expected); expect(run.handler).toHaveBeenCalledTimes(1); expect(run.sink).toHaveBeenCalledTimes(1);
      safeDiagnostic(run, result);
    } finally { await run.close(); }
  });

  it.each(["direct", "wire"] as const)("does not await a hanging injected audit sink via %s", async mode => {
    let expected!: ToolResponse;
    const run = await fixture({ auditMode: "pending", handler: async () => expected = toolResult({ id: 7 }) });
    try {
      const result = await run[mode]();
      expect(result).toEqual(expected); expect(run.handler).toHaveBeenCalledTimes(1); expect(run.sink).toHaveBeenCalledTimes(1);
      expect(run.diagnostic).not.toHaveBeenCalled();
    } finally { await run.close(); }
  }, 1000);

  it.each(["audit", "info"] as const)("observes async rejection from the real AuditLogger %s emitter", async auditEmitter => {
    let expected!: ToolResponse;
    const run = await fixture({ auditMode: "real", auditEmitter, auditEmitMode: "reject", handler: async () => expected = toolResult({ id: 7 }) });
    try {
      const result = await run.wire(); await settle();
      expect(result).toEqual(expected); expect(run.handler).toHaveBeenCalledTimes(1); expect(run.sink).toHaveBeenCalledTimes(1);
      safeDiagnostic(run, result);
    } finally { await run.close(); }
  });

  it("preserves the completed result if audit entry construction encounters a throwing nested getter", async () => {
    const input = Object.defineProperty({}, "memo", { enumerable: true, get: () => { throw new Error(CANARY); } });
    let expected!: ToolResponse;
    const run = await fixture({ handler: async () => expected = toolResult({ id: 7 }) });
    try {
      const result = await run.direct({ ...confirmed, payload: input }); await settle();
      expect(result).toBe(expected); expect(run.handler).toHaveBeenCalledTimes(1);
      expect(run.sink).not.toHaveBeenCalled(); safeDiagnostic(run, result);
    } finally { await run.close(); }
  });

  it("preserves success when real audit serialization invokes a failing toJSON", async () => {
    let expected!: ToolResponse;
    const run = await fixture({ auditMode: "real", handler: async () => expected = toolResult({ id: 7 }) });
    try {
      const result = await run.direct({ ...confirmed, payload: { toJSON() { throw new Error(CANARY); } } }); await settle();
      expect(result).toBe(expected); expect(run.handler).toHaveBeenCalledTimes(1); expect(run.sink).toHaveBeenCalledTimes(1);
      safeDiagnostic(run, result);
    } finally { await run.close(); }
  });

  it.each(["read", "write", "delete"] as const)("does not touch the audit sink for %s reads or unconfirmed operations", async operation => {
    const run = await fixture({ operation, handler: async () => toolResult({ id: 7 }) });
    try {
      await run.wire({}); await settle();
      expect(run.handler).toHaveBeenCalledTimes(operation === "read" ? 1 : 0);
      expect(run.sink).not.toHaveBeenCalled(); expect(run.diagnostic).not.toHaveBeenCalled();
    } finally { await run.close(); }
  });
});
