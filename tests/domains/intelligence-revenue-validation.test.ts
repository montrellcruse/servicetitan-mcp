import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadIntelligenceDomain } from "../../src/domains/intelligence/index.js";
import { clearIntelCache } from "../../src/domains/intelligence/helpers.js";
import {
  extractReportRows,
  validateReport175Response,
} from "../../src/domains/intelligence/revenue.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

const EMPTY_REPORT = { fields: [], data: [], hasMore: false };
const REPORT_175_STRUCTURE_ERROR =
  "Report 175 response structure changed — expected fields: Name, CompletedRevenue, OpportunityConversionRate, Opportunity, ConvertedJobs, AdjustmentRevenue, TotalRevenue, NonJobRevenue";

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
  const server = { tool: vi.fn() };
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
  for (const [name, _schema, handler] of server.tool.mock.calls) {
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

  it("allows passthrough fields on valid Report 175 payloads", () => {
    const response = validateReport175Response({
      fields: [
        { name: "Name", label: "Business Unit" },
        { name: "CompletedRevenue" },
        { name: "OpportunityJobAverage" },
        { name: "OpportunityConversionRate" },
        { name: "Opportunity" },
        { name: "ConvertedJobs" },
        { name: "CustomerSatisfaction" },
        { name: "AdjustmentRevenue" },
        { name: "TotalRevenue" },
        { name: "NonJobRevenue" },
      ],
      data: [
        ["HVAC - Install", 400, 200, 1.0, 5, 5, 0, 0, 450, 50],
      ],
      hasMore: false,
      generatedAt: "2026-01-31T12:00:00Z",
    });

    expect(response).toMatchObject({
      hasMore: false,
      generatedAt: "2026-01-31T12:00:00Z",
      data: [["HVAC - Install", 400, 200, 1.0, 5, 5, 0, 0, 450, 50]],
    });
    expect(response.fields[0]).toMatchObject({
      name: "Name",
      label: "Business Unit",
    });
  });

  it("normalizes empty Report 175 payloads to data/count", () => {
    expect(extractReportRows(EMPTY_REPORT)).toEqual({
      data: [],
      count: 0,
    });
  });

  it("fails fast when the Report 175 structure changes", async () => {
    const { handlers, postMock } = createContext();
    const handler = handlers.get("intel_revenue_summary");
    if (!handler) {
      throw new Error("Missing intel_revenue_summary handler");
    }

    postMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data") {
        return {
          fields: [
            { name: "Name" },
            { name: "CompletedRevenue" },
            { name: "OpportunityJobAverage" },
            { name: "OpportunityConversionRate" },
            { name: "Opportunity" },
            { name: "ConvertedJobs" },
            { name: "CustomerSatisfaction" },
            { name: "AdjustmentRevenue" },
            { name: "GrossRevenue" },
            { name: "NonJobRevenue" },
          ],
          data: [
            ["HVAC - Install", 400, 200, 1.0, 5, 5, 0, 0, 450, 50],
          ],
          hasMore: false,
        };
      }

      if (
        path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/177/data" ||
        path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/179/data"
      ) {
        return EMPTY_REPORT;
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(`Error: ${REPORT_175_STRUCTURE_ERROR}`);
  });
});
