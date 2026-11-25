import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadIntelligenceDomain } from "../../src/domains/intelligence/index.js";
import { clearIntelCache } from "../../src/domains/intelligence/helpers.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

const revenuePath = "/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data";
const salesPath = "/tenant/{tenant}/report-category/business-unit-dashboard/reports/179/data";
const revenueFields = [
  "Name", "CompletedRevenue", "OpportunityJobAverage", "OpportunityConversionRate", "Opportunity",
  "ConvertedJobs", "CustomerSatisfaction", "AdjustmentRevenue", "TotalRevenue", "NonJobRevenue",
].map((name) => ({ name }));
const salesFields = [
  "Name", "TotalSales", "ClosedAverageSale", "CloseRate", "SalesOpportunity",
  "OptionsPerOpportunity", "AdjustmentRevenue", "TotalRevenue", "NonJobRevenue",
].map((name) => ({ name }));
const emptyReport = (fields: Array<{ name: string }>) => ({ fields, data: [], hasMore: false });
const period = { startDate: "2026-01-01", endDate: "2026-01-31" };

function createConfig(overrides: Partial<ServiceTitanConfig> = {}): ServiceTitanConfig {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    appKey: "app-key",
    tenantId: "tenant-id",
    environment: "integration",
    readonlyMode: true,
    confirmWrites: false,
    maxResponseChars: 100000,
    enabledDomains: null,
    logLevel: "error",
    timezone: "UTC",
    allowedCallers: null,
    ...overrides,
  };
}

function createContext() {
  const server = { registerTool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const registry = new ToolRegistry(server as any, createConfig(), logger as any);
  const client = {
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as ServiceTitanClient;

  registry.attachClient(client);
  loadIntelligenceDomain(client, registry);

  const handlers = new Map<string, (params: unknown) => Promise<ToolResponse>>();
  for (const [name, _schema, handler] of server.registerTool.mock.calls) {
    handlers.set(name as string, handler as (params: unknown) => Promise<ToolResponse>);
  }

  return {
    handlers,
    postMock: (client as any).post,
  };
}

describe("intelligence revenue validation", () => {
  beforeEach(() => {
    process.env.ST_RESPONSE_SHAPING = "false";
    clearIntelCache();
  });

  it("allows passthrough fields on valid Report 175 payloads", async () => {
    const { handlers, postMock } = createContext();
    const handler = handlers.get("intel_revenue_summary")!;

    postMock.mockImplementation(async (path: string) => {
      if (path === salesPath) return emptyReport(salesFields);
      if (path !== revenuePath) throw new Error(`Unexpected path: ${path}`);
      return {
        fields: [
          { name: "Name", label: "Business Unit" },
          ...revenueFields.slice(1),
          { name: "TenantExtra" },
        ],
        data: [["HVAC - Install", 400, 200, 1, 5, 5, 0, 0, 450, 50, null]],
        hasMore: false,
        generatedAt: "2026-01-31T12:00:00Z",
      };
    });

    const result = await handler(period);
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      totalRevenue: 450,
      revenueBreakdown: { completedRevenue: 400, nonJobRevenue: 50, adjustmentRevenue: 0 },
    });
  });

  it("returns complete zero revenue for empty feeds with valid field metadata", async () => {
    const { handlers, postMock } = createContext();
    const handler = handlers.get("intel_revenue_summary")!;
    postMock.mockImplementation(async (path: string) => {
      if (path === revenuePath) return emptyReport(revenueFields);
      if (path === salesPath) return emptyReport(salesFields);
      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler(period);
    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? "{}");
    expect(payload).toMatchObject({ totalRevenue: 0, byBusinessUnit: [] });
    expect(payload).not.toHaveProperty("_warnings");
  });

  it("fails fast when the Report 175 structure changes", async () => {
    const { handlers, postMock } = createContext();
    const handler = handlers.get("intel_revenue_summary")!;
    postMock.mockImplementation(async (path: string) => {
      if (path === salesPath) return emptyReport(salesFields);
      if (path !== revenuePath) throw new Error(`Unexpected path: ${path}`);
      return {
        fields: revenueFields.map((field) => field.name === "TotalRevenue" ? { name: "GrossRevenue" } : field),
        data: [["HVAC - Install", 400, 200, 1, 5, 5, 0, 0, 450, 50]],
        hasMore: false,
      };
    });

    const result = await handler(period);
    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? "{}");
    expect(payload.totalRevenue).toBe(0);
    expect(payload._warnings).toContain(
      "Revenue report (Report 175) unavailable: Report 175 is missing required fields: TotalRevenue",
    );
  });
});
