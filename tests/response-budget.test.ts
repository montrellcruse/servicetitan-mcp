import { describe, expect, it, vi } from "vitest";
import { toolResult, toolError, MIN_RESPONSE_CHARS } from "../src/utils.js";
import { withRequestContext } from "../src/request-context.js";
import { ServiceTitanApiError } from "../src/client.js";

function bounded(limit: number, callback: () => ReturnType<typeof toolResult>) {
  const result = withRequestContext({ maxResponseChars: limit, timezone: "UTC" }, callback);
  expect(JSON.stringify(result).length).toBeLessThanOrEqual(limit);
  expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  return result;
}

describe("final MCP response budgets", () => {
  it.each([MIN_RESPONSE_CHARS, 500, 1000, 5000])("bounds escaped JSON and both representations at %s chars", (limit) => {
    const result = bounded(limit, () => toolResult({ data: '\\"\n🙂'.repeat(10_000) }));
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: { code: "RESPONSE_TOO_LARGE" } });
    expect(JSON.stringify(result)).not.toContain("_preview");
  });

  it("returns complete records unchanged when the final envelope fits", () => {
    const payload = { page: 1, pageSize: 2, hasMore: true, data: [{ id: 1, text: 'A"B' }, { id: 2, amount: 2.345 }] };
    const result = bounded(2000, () => toolResult(payload));
    expect(result.structuredContent).toEqual(payload);
  });

  it("provides a smaller same-page retry instead of skipping records", () => {
    const result = bounded(2200, () => toolResult({ page: 7, pageSize: 500, hasMore: true, totalCount: 5000, data: Array.from({ length: 500 }, (_, id) => ({ id, name: "A".repeat(20) })) }));
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ complete: false, retrieval: { page: 7 }, upstreamPagination: { page: 7, hasMore: true } });
    expect((result.structuredContent!.retrieval as { pageSize: number }).pageSize).toBeLessThan(500);
    expect(result.structuredContent).not.toHaveProperty("data");
  });

  it("never offers an export cursor as safe to advance after omitting its batch", () => {
    const result = bounded(2200, () => toolResult({ continueFrom: "next-cursor", hasMore: true, data: [{ id: 1, detail: "x".repeat(5000) }] }));
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ retrieval: { cursorUnsafeToAdvance: true }, upstreamPagination: { continueFrom: "next-cursor" } });
  });

  it("wraps array/scalar/void payloads consistently as JSON objects", () => {
    for (const value of [[{ id: 1 }], "done", 0, null, undefined]) {
      const result = bounded(1000, () => toolResult(value));
      expect(result.structuredContent).toEqual({ data: value ?? null });
    }
  });

  it("stores the complete oversized result in a scoped store and returns bounded retrieval metadata", () => {
    const store = vi.fn(() => ({ resultId: "opaque-id", retrievalTool: "st_result_read", totalChars: 10000, expiresAt: "2026-09-04T12:00:00Z" }));
    const payload = { _warnings: ["partial feed"], data: "x".repeat(10000) };
    const result = withRequestContext({ storeOversized: store }, () => bounded(1000, () => toolResult(payload)));
    expect(store).toHaveBeenCalledExactlyOnceWith(payload);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ delivery: "stored", complete: false, resultId: "opaque-id" });
  });

  it("does not recurse when storage is full or its metadata exceeds the budget", () => {
    for (const store of [vi.fn(() => { throw new Error("full"); }), vi.fn(() => ({ resultId: "x".repeat(5000) }))]) {
      const result = withRequestContext({ storeOversized: store }, () => bounded(500, () => toolResult({ data: "x".repeat(10000) })));
      expect(store).toHaveBeenCalledTimes(1);
      expect(result.isError).toBe(true);
    }
  });

  it("bounds errors and invalid JSON responses at the minimum supported budget", () => {
    const circular: Record<string, unknown> = {}; circular.self = circular;
    expect(bounded(MIN_RESPONSE_CHARS, () => toolResult(circular)).isError).toBe(true);
    expect(bounded(MIN_RESPONSE_CHARS, () => toolError('"'.repeat(10000))).isError).toBe(true);
  });

  it("preserves whitelisted API diagnostics without serializing hidden config, response bodies or credentials", () => {
    const error = Object.assign(new ServiceTitanApiError(429, "Denied Bearer AUTH_SECRET alice@example.com", "/crm/v2/tenant/42/customers", {
      phase: "resource", traceId: "trace-123", retryAfterMs: 120000, retryable: true,
    }), { config: { password: "CONFIG_SECRET" }, response: { data: "BODY_SECRET" } });
    const result = bounded(2500, () => toolError(error));
    expect(result.structuredContent).toMatchObject({ error: { status: 429, phase: "resource", path: "/crm/v2/tenant/42/customers", traceId: "trace-123", retryAfterMs: 120000, retryable: true } });
    expect(JSON.stringify(result)).not.toMatch(/AUTH_SECRET|CONFIG_SECRET|BODY_SECRET|alice@example/);
  });

  it("keeps uncertain-write semantics even when all diagnostic details cannot fit", () => {
    const error = new ServiceTitanApiError(0, "x".repeat(5000), "/crm/v2/tenant/42/customers", { phase: "resource", outcomeUnknown: true });
    expect(bounded(MIN_RESPONSE_CHARS, () => toolError(error)).structuredContent).toEqual({ error: { code: "OUTCOME_UNKNOWN", outcomeUnknown: true } });
  });

  it("rejects untrusted error metadata rather than copying arbitrary fields", () => {
    const error = Object.assign(new Error("Failed"), { name: "ServiceTitanApiError", status: NaN, path: "/customers?access_token=SECRET", details: { phase: "SECRET", traceId: "Bearer SECRET", code: "Bearer SECRET", response: "SECRET" } });
    const result = bounded(1000, () => toolError(error));
    expect(result.structuredContent).toEqual({ error: { code: "REQUEST_FAILED", message: "Failed" } });
  });
});
