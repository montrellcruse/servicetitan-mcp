import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceTitanClient } from "../src/client.js";
import { createMcpServer, loadConfig } from "../src/server.js";
import { clearIntelCache } from "../src/domains/intelligence/helpers.js";
import { getReportContract } from "../src/domains/intelligence/report-executor.js";

type Row = Record<string, unknown>;
function report(key: string, rows: Row[]) {
  const fields = getReportContract(key).fields.map(name => ({ name }));
  return { fields, data: rows.map(row => fields.map(({ name }) => row[name] ?? (name === "Name" ? "Example unit" : 0))), totalCount: rows.length, hasMore: false };
}
const args = { startDate: "2026-01-01", endDate: "2026-01-31" };
const env = {
  ST_CLIENT_ID: "fixture", ST_CLIENT_SECRET: "fixture", ST_APP_KEY: "fixture", ST_TENANT_ID: "42",
  ST_READONLY: "true", ST_TOOL_PROFILE: "analytics", ST_TOOLS: "intel_revenue_summary",
  ST_LOG_LEVEL: "error", ST_MAX_RESPONSE_CHARS: "100000", ST_TIMEZONE: "UTC",
};

async function connect(post: ReturnType<typeof vi.fn>) {
  const runtime = await createMcpServer(loadConfig(env), {
    client: { post, get: vi.fn(async () => { throw new Error("Unexpected fixture GET"); }) } as unknown as ServiceTitanClient,
  });
  const client = new Client({ name: "accuracy-fixture", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await runtime.server.connect(st);
  await client.connect(ct);
  return {
    async call(options: Record<string, unknown> = {}) {
      const result = await client.callTool({ name: "intel_revenue_summary", arguments: { ...args, ...options } });
      expect(result.isError).not.toBe(true);
      const text = result.content.find(block => block.type === "text");
      expect(text?.type).toBe("text");
      const payload = JSON.parse((text as { text: string }).text);
      expect(result.structuredContent).toEqual(payload);
      return payload;
    },
    close: async () => { await client.close(); await runtime.server.close(); },
  };
}

function routedPost(overrides: Partial<Record<string, unknown>> = {}) {
  return vi.fn(async (path: string) => {
    const key = path.match(/reports\/(\d+)\/data$/)?.[1];
    if (!key) throw new Error("Unexpected fixture report");
    const value = overrides[key] ?? report(key, []);
    if (value instanceof Error) throw value;
    return value;
  });
}

describe("accurate analytics across the actual MCP output and cache", () => {
  beforeEach(() => { vi.stubEnv("ST_RESPONSE_SHAPING", "false"); clearIntelCache(); });
  afterEach(() => { vi.unstubAllEnvs(); clearIntelCache(); });

  it("retains zero-revenue activity and precision in both output channels and warm cache", async () => {
    const rate = 137.123456789;
    const efficiency = 0.178009765;
    const post = routedPost({
      "175": report("175", [{ Name: "Example unit", CompletedRevenue: 0, TotalRevenue: 0, Opportunity: 5, ConvertedJobs: 2, NonJobRevenue: -10, AdjustmentRevenue: 10 }]),
      "177": report("177", [{ Name: "Example unit", RevenuePerHour: rate, BillableEfficiency: efficiency, TasksPerOpportunity: 1.23456789, OptionsPerOpportunity: 2.3456789 }]),
      "179": report("179", [{ Name: "Example unit", TotalSales: 0, CloseRate: 0.25, ClosedAverageSale: 0, SalesOpportunity: 4 }]),
    });
    const mcp = await connect(post);
    try {
      const result = await mcp.call({ includeProductivityMetrics: true });
      const unit = result.byBusinessUnit.find((row: Row) => row.name === "Example unit");
      expect(unit).toMatchObject({ totalRevenue: 0, opportunities: 5, convertedJobs: 2, nonJobRevenue: -10, adjustmentRevenue: 10 });
      expect(unit.productivity.revenuePerHour).toBe(rate);
      expect(unit.productivity.billableEfficiency).toBe(efficiency);
      expect(result.productivity.averageRevenuePerHour).toBeNull();
      expect(result.sales.averageCloseRate).toBeNull();
      expect(result._metricAvailability).toBeDefined();
      const calls = post.mock.calls.length;
      expect(await mcp.call({ includeProductivityMetrics: true })).toEqual(result);
      expect(post).toHaveBeenCalledTimes(calls);
    } finally { await mcp.close(); }
  });

  it("preserves successful siblings and distinguishes failure, disabled sources and measured zero through recovery", async () => {
    const post = routedPost({ "175": new Error("Synthetic revenue failure") });
    const mcp = await connect(post);
    try {
      const failed = await mcp.call();
      expect(failed.totalRevenue).toBeNull();
      expect(failed.sales.totalSales).toBe(0);
      expect(failed._sourceAvailability.report175.status).toBe("failed");
      expect(failed._sourceAvailability.report177.status).toBe("not_requested");
      expect(failed._warnings.join(" ")).toContain("Synthetic revenue failure");
      const calls = post.mock.calls.length;
      await mcp.call();
      expect(post.mock.calls.length).toBeGreaterThan(calls);
      post.mockImplementation(async (path: string) => report(path.match(/reports\/(\d+)\/data$/)?.[1] ?? "175", []));
      const recovered = await mcp.call();
      expect(recovered.totalRevenue).toBe(0);
      expect(recovered._sourceAvailability.report175.status).toBe("complete");
      expect(recovered._warnings).toBeUndefined();
      const recoveredCalls = post.mock.calls.length;
      expect(await mcp.call()).toEqual(recovered);
      expect(post).toHaveBeenCalledTimes(recoveredCalls);
    } finally { await mcp.close(); }
  });

  it("keeps corrected values isolated between distinct API clients", async () => {
    const first = await connect(routedPost({ "175": report("175", [{ TotalRevenue: 10, CompletedRevenue: 10, ConvertedJobs: 1, Opportunity: 1 }]) }));
    const second = await connect(routedPost({ "175": report("175", [{ TotalRevenue: 20, CompletedRevenue: 20, ConvertedJobs: 1, Opportunity: 1 }]) }));
    try {
      expect((await first.call()).totalRevenue).toBe(10);
      expect((await second.call()).totalRevenue).toBe(20);
    } finally { await first.close(); await second.close(); }
  });
});
