import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadIntelligenceDomain } from "../../src/domains/intelligence/index.js";
import {
  clearIntelCache,
  fetchAllPages,
  safeDivide,
} from "../../src/domains/intelligence/helpers.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

const ORIGINAL_ST_RESPONSE_SHAPING = process.env.ST_RESPONSE_SHAPING;

interface TestContext {
  getMock: ReturnType<typeof vi.fn>;
  postMock: ReturnType<typeof vi.fn>;
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>;
  registry: ToolRegistry;
  server: { tool: ReturnType<typeof vi.fn> };
}

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
    ...overrides,
  };
}

function createContext(overrides: Partial<ServiceTitanConfig> = {}): TestContext {
  const server = { tool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const registry = new ToolRegistry(server as any, createConfig(overrides), logger as any);
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
    getMock: (client as any).get,
    postMock: (client as any).post,
    handlers,
    registry,
    server,
  };
}

function getHandler(
  handlers: Map<string, (params: unknown) => Promise<ToolResponse>>,
  toolName: string,
): (params: unknown) => Promise<ToolResponse> {
  const handler = handlers.get(toolName);
  if (!handler) {
    throw new Error(`Missing handler for ${toolName}`);
  }

  return handler;
}

function payloadFrom(result: ToolResponse): Record<string, any> {
  expect(result.isError).not.toBe(true);
  const text = result.content[0]?.text;
  expect(typeof text).toBe("string");
  return JSON.parse(text ?? "{}");
}

function expectAllNumbersFinite(value: unknown): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => expectAllNumbersFinite(item));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => expectAllNumbersFinite(item));
  }
}

const PER_CAMPAIGN_REVENUE_WARNING =
  "Per-campaign revenue unavailable (ServiceTitan invoices API does not support campaign-level filtering). Total period revenue shown in totals only.";
const EMPTY_REPORT = { fields: [], data: [], hasMore: false };
const ZERO_TECHNICIAN_LEAD_GENERATION = {
  replacementOpps: 0,
  leadsSet: 0,
  avgLeadSale: 0,
  conversionRate: 0,
  totalLeadSales: 0,
};
const ZERO_TECHNICIAN_MEMBERSHIPS = {
  opportunities: 0,
  sold: 0,
  conversionRate: 0,
};
const ZERO_TECHNICIAN_LEAD_SALES = {
  totalSales: 0,
  avgSale: 0,
  closeRate: 0,
};

describe("intelligence domain", () => {
  beforeEach(() => {
    process.env.ST_RESPONSE_SHAPING = "false";
    clearIntelCache();
  });

  afterEach(() => {
    if (ORIGINAL_ST_RESPONSE_SHAPING === undefined) {
      delete process.env.ST_RESPONSE_SHAPING;
      return;
    }

    process.env.ST_RESPONSE_SHAPING = ORIGINAL_ST_RESPONSE_SHAPING;
  });

  it("registers all 9 intelligence tools as read operations", () => {
    const { server, registry } = createContext();

    expect(server.tool).toHaveBeenCalledTimes(10);

    const names = new Set(
      server.tool.mock.calls.map((call) => call[0] as string),
    );

    expect(names).toEqual(
      new Set([
        "intel_lookup",
        "intel_revenue_summary",
        "intel_technician_scorecard",
        "intel_membership_health",
        "intel_estimate_pipeline",
        "intel_campaign_performance",
        "intel_daily_snapshot",
        "intel_csr_performance",
        "intel_labor_cost",
        "intel_invoice_tracking",
      ]),
    );

    const registeredTools = registry.getRegisteredTools();
    for (const tool of registeredTools) {
      expect(tool.domain).toBe("intelligence");
      expect(tool.operation).toBe("read");
    }
  });

  it("fetchAllPages paginates through all pages", async () => {
    const mockClient = {
      get: vi.fn(async (_path: string, params?: Record<string, unknown>) => {
        const page = Number(params?.page ?? 1);
        if (page === 1) {
          return { data: [{ id: 1 }], hasMore: true, page: 1 };
        }

        if (page === 2) {
          return { data: [{ id: 2 }], hasMore: true, page: 2 };
        }

        return { data: [{ id: 3 }], hasMore: false, page: 3 };
      }),
    } as unknown as ServiceTitanClient;

    const rows = await fetchAllPages<{ id: number }>(
      mockClient,
      "/tenant/{tenant}/invoices",
      {
        someFilter: "value",
      },
    );

    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect((mockClient as any).get).toHaveBeenCalledTimes(3);
    expect((mockClient as any).get).toHaveBeenNthCalledWith(
      1,
      "/tenant/{tenant}/invoices",
      expect.objectContaining({ page: 1, pageSize: 500, includeTotal: true }),
    );
    expect((mockClient as any).get).toHaveBeenNthCalledWith(
      2,
      "/tenant/{tenant}/invoices",
      expect.objectContaining({ page: 2, pageSize: 500, includeTotal: true }),
    );
  });

  it("safeDivide handles finite and zero-denominator edge cases", () => {
    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(10, 0)).toBe(0);
    expect(safeDivide(10, Number.NaN)).toBe(0);
    expect(safeDivide(10, Number.POSITIVE_INFINITY)).toBe(0);
    expect(safeDivide(10, 0, 7)).toBe(7);
  });

  it("intel_revenue_summary uses Report 175 for revenue and payments for collections", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_revenue_summary");

    postMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data") {
        // Report 175 field order:
        // [Name, CompletedRevenue, OpportunityJobAvg, ConversionRate, Opportunity, ConvertedJobs,
        //  CustomerSatisfaction, AdjustmentRevenue, TotalRevenue, NonJobRevenue]
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
            { name: "TotalRevenue" },
            { name: "NonJobRevenue" },
          ],
          data: [
            ["HVAC - Install", 400, 200, 1.0, 5, 5, 0, 0, 450, 50],
            ["HVAC - Service", 100, 100, 0.5, 10, 5, 0, 0, 150, 50],
            ["Admin", 0, 0, 0, 0, 0, 0, 0, 0, 0],
          ],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/177/data") {
        return {
          fields: [],
          data: [
            ["HVAC - Install", 100, 0.8, 300, 2, 1.5, 1, 0, 450, 50],
            ["HVAC - Service", 80, 0.7, 100, 1.5, 1, 0, 0, 150, 50],
            ["Admin", 0, 0, 0, 0, 0, 0, 0, 0, 0],
          ],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/179/data") {
        return {
          fields: [],
          data: [
            ["HVAC - Install", 1000, 500, 0.5, 4, 1.2, 0, 450, 50],
            ["HVAC - Service", 300, 300, 1.0, 1, 1, 0, 150, 50],
            ["Admin", 0, 0, 0, 0, 0, 0, 0, 0],
          ],
          hasMore: false,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/payments") {
        return {
          data: [
            { id: 1, amount: 250 },
            { id: 2, amount: 100 },
          ],
          hasMore: false,
          page: 1,
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      businessUnitId: 7,
      includeCollections: true,
    });
    const payload = payloadFrom(result);

    expect(payload.totalRevenue).toBe(600);
    expect(payload.revenueBreakdown).toEqual({
      completedRevenue: 500,
      nonJobRevenue: 100,
      adjustmentRevenue: 0,
    });
    expect(payload.totalCollected).toBe(350);
    expect(payload.outstanding).toBe(250);
    expect(payload.avgTicket).toBe(50);
    expect(payload.totalConvertedJobs).toBe(10);
    expect(payload.totalOpportunities).toBe(15);
    expect(payload.overallConversionRate).toBe(66.7);
    expect(payload.productivity).toEqual({
      averageRevenuePerHour: 90,
      averageBillableEfficiency: 0.75,
      totalUpsold: 400,
      averageTasksPerOpportunity: 1.75,
      averageOptionsPerOpportunity: 1.25,
      totalRecallsCaused: 1,
    });
    expect(payload.sales).toEqual({
      totalSales: 1300,
      averageClosedAvgSale: 400,
      averageCloseRate: 75,
      totalSalesOpportunity: 5,
      averageOptionsPerOpportunity: 1.1,
    });

    // Verify BU breakdown (zero-revenue "Admin" should be filtered out)
    expect(payload.byBusinessUnit).toEqual([
      expect.objectContaining({
        name: "HVAC - Install",
        productivity: {
          revenuePerHour: 100,
          billableEfficiency: 0.8,
          upsold: 300,
          tasksPerOpportunity: 2,
          optionsPerOpportunity: 1.5,
          recallsCaused: 1,
        },
        sales: {
          totalSales: 1000,
          closedAvgSale: 500,
          closeRate: 50,
          salesOpportunity: 4,
          optionsPerOpportunity: 1.2,
        },
      }),
      expect.objectContaining({
        name: "HVAC - Service",
        productivity: {
          revenuePerHour: 80,
          billableEfficiency: 0.7,
          upsold: 100,
          tasksPerOpportunity: 1.5,
          optionsPerOpportunity: 1,
          recallsCaused: 0,
        },
        sales: {
          totalSales: 300,
          closedAvgSale: 300,
          closeRate: 100,
          salesOpportunity: 1,
          optionsPerOpportunity: 1,
        },
      }),
    ]);

    // Verify Report 175 was called with correct parameters
    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-31" },
          { name: "BusinessUnitIds", value: "7" },
        ],
      },
    );
    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/business-unit-dashboard/reports/177/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-31" },
          { name: "BusinessUnitIds", value: "7" },
        ],
      },
    );
    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/business-unit-dashboard/reports/179/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-31" },
          { name: "BusinessUnitIds", value: "7" },
        ],
      },
    );
  });

  it("intel_revenue_summary returns partial results with warnings on report failure", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_revenue_summary");

    postMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data") {
        throw new Error("report outage");
      }

      if (
        path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/177/data" ||
        path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/179/data"
      ) {
        return EMPTY_REPORT;
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/payments") {
        return {
          data: [{ amount: 125 }],
          hasMore: false,
          page: 1,
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      includeCollections: true,
    });
    const payload = payloadFrom(result);

    expect(payload.totalRevenue).toBe(0);
    expect(payload.totalCollected).toBe(125);
    expect(payload.productivity).toEqual({
      averageRevenuePerHour: 0,
      averageBillableEfficiency: 0,
      totalUpsold: 0,
      averageTasksPerOpportunity: 0,
      averageOptionsPerOpportunity: 0,
      totalRecallsCaused: 0,
    });
    expect(payload.sales).toEqual({
      totalSales: 0,
      averageClosedAvgSale: 0,
      averageCloseRate: 0,
      totalSalesOpportunity: 0,
      averageOptionsPerOpportunity: 0,
    });
    expect(payload._warnings).toEqual([
      "Revenue report (Report 175) unavailable: report outage",
    ]);
  });

  it("intel_revenue_summary handles empty datasets with zero values", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_revenue_summary");

    postMock.mockResolvedValue({ fields: [], data: [], hasMore: false });
    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1 });

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31", includeCollections: true });
    const payload = payloadFrom(result);

    expect(payload.totalRevenue).toBe(0);
    expect(payload.totalCollected).toBe(0);
    expect(payload.outstanding).toBe(0);
    expect(payload.avgTicket).toBe(0);
    expect(payload.overallConversionRate).toBe(0);
    expect(payload.byBusinessUnit).toEqual([]);
    expectAllNumbersFinite(payload);
  });

  it("intel_technician_scorecard computes per-tech and team metrics with date handling", async () => {
    const { handlers, postMock } = createContext();
    const handler = getHandler(handlers, "intel_technician_scorecard");

    postMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/168/data") {
        return {
          fields: [],
          data: [
            ["Mike Johnson", 1000, 250, 0.5, 4, 2, 4.8, 10, 0, 1000],
            ["Nina Lopez", 0, 0, 0, 0, 0, 0, 11, 0, 0],
            ["Install Leader", 0, 0, 0, 0, 0, 0, 12, 0, 0],
          ],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/170/data") {
        return {
          fields: [],
          data: [
            ["Mike Johnson", 200, 0.85, 300, 0, 0, 1, 10, 0, 1000],
            ["Nina Lopez", 0, 0, 0, 0, 0, 0, 11, 0, 0],
            ["Install Leader", 0, 0, 0, 0, 0, 0, 12, 0, 0],
          ],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/169/data") {
        return {
          fields: [],
          data: [
            ["Mike Johnson", 3, 2, 750, 0.5, 1, 1500, 750, 10],
            ["Nina Lopez", 0, 0, 0, 0, 0, 0, 0, 11],
            ["Install Leader", 0, 0, 0, 0, 0, 0, 0, 12],
          ],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/171/data") {
        return {
          fields: [],
          data: [
            ["Mike Johnson", 4, 1, 0.25, 10, 0, 0],
            ["Nina Lopez", 0, 0, 0, 11, 0, 0],
            ["Install Leader", 0, 0, 0, 12, 0, 0],
          ],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/173/data") {
        return {
          fields: [],
          data: [
            ["Mike Johnson", "HVAC Service", 500, 250, 0.4, 1.5, 3, "Service", 8, 0, 0, 10],
            ["Nina Lopez", "HVAC Service", 0, 0, 0, 0, 3, "Service", 8, 0, 0, 11],
            ["Install Leader", "Install", 0, 0, 0, 0, 4, "Install", 8, 0, 0, 12],
          ],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/174/data") {
        return {
          fields: [],
          data: [
            ["Mike Johnson", 300, 300, 0.6, 1.2, 10, 0, 0],
            ["Nina Lopez", 0, 0, 0, 0, 11, 0, 0],
            ["Install Leader", 0, 0, 0, 0, 12, 0, 0],
          ],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/operations/reports/165/data") {
        return {
          fields: [],
          data: [
            ["INV-1", "HVAC Service", "Mike Johnson, Kevin Herrera"],
            ["INV-2", "HVAC Service", "Mike Johnson"],
            ["INV-3", "HVAC Service", "Kevin Herrera"],
            ["INV-4", "HVAC Service", "Install Leader"],
            ["INV-5", "HVAC Service", "Install Leader"],
          ],
          hasMore: false,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      businessUnitId: 3,
    });
    const payload = payloadFrom(result);

    expect(payload.technicians).toEqual([
      {
        id: 10,
        name: "Mike Johnson",
        jobsCompleted: 2,
        revenue: 1000,
        averageTicket: 250,
        opportunities: 4,
        convertedJobs: 2,
        conversionRate: 50,
        customerSatisfaction: 4.8,
        revenuePerHour: 200,
        billableEfficiency: 0.85,
        recallsCaused: 1,
        upsold: 300,
        jobsPerDay: 0.29,
        leadGeneration: {
          replacementOpps: 3,
          leadsSet: 2,
          avgLeadSale: 750,
          conversionRate: 50,
          totalLeadSales: 1500,
        },
        memberships: {
          opportunities: 4,
          sold: 1,
          conversionRate: 25,
        },
        salesFromTechLeads: {
          totalSales: 500,
          avgSale: 250,
          closeRate: 40,
        },
        salesFromMarketingLeads: {
          totalSales: 300,
          avgSale: 300,
          closeRate: 60,
        },
      },
    ]);

    expect(payload.teamAverages).toEqual({
      jobsCompleted: 2,
      revenue: 1000,
      averageTicket: 250,
      opportunities: 4,
      convertedJobs: 2,
      conversionRate: 50,
      customerSatisfaction: 4.8,
      revenuePerHour: 200,
      billableEfficiency: 0.85,
      recallsCaused: 1,
      upsold: 300,
      jobsPerDay: 0.29,
      leadGeneration: {
        replacementOpps: 3,
        leadsSet: 2,
        avgLeadSale: 750,
        conversionRate: 50,
        totalLeadSales: 1500,
      },
      memberships: {
        opportunities: 4,
        sold: 1,
        conversionRate: 25,
      },
      salesFromTechLeads: {
        totalSales: 500,
        avgSale: 250,
        closeRate: 40,
      },
      salesFromMarketingLeads: {
        totalSales: 300,
        avgSale: 300,
        closeRate: 60,
      },
    });

    expect(payload._warnings).toEqual([
      "Business unit filtering only applies to completed jobs (Report 165) and lead generation (Report 169). Revenue, productivity, memberships, and lead-sales metrics are tenant-wide.",
    ]);

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/technician-dashboard/reports/168/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-10" },
          { name: "BusinessUnitIds", value: "3" },
        ],
      },
    );

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/technician-dashboard/reports/170/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-10" },
        ],
      },
    );

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/technician-dashboard/reports/169/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-10" },
          { name: "BusinessUnitId", value: "3" },
        ],
      },
    );

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/technician-dashboard/reports/171/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-10" },
        ],
      },
    );

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/technician-dashboard/reports/173/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-10" },
        ],
      },
    );

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/technician-dashboard/reports/174/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-10" },
        ],
      },
    );

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/operations/reports/165/data",
      {
        parameters: [
          { name: "DateType", value: "1" },
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-10" },
          { name: "BusinessUnitId", value: "3" },
        ],
      },
    );
  });

  it("intel_technician_scorecard keeps partial data when one endpoint fails", async () => {
    const { handlers, postMock } = createContext();
    const handler = getHandler(handlers, "intel_technician_scorecard");

    postMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/168/data") {
        throw new Error("report outage");
      }

      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/170/data") {
        return {
          fields: [],
          data: [["Mike Johnson", 150, 0.6, 80, 0, 0, 2, 10, 0, 0]],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/169/data") {
        return {
          fields: [],
          data: [["Mike Johnson", 2, 1, 200, 0.5, 1, 200, 200, 10]],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/171/data") {
        return {
          fields: [],
          data: [["Mike Johnson", 3, 1, 0.333, 10, 0, 0]],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/173/data") {
        return {
          fields: [],
          data: [["Mike Johnson", "HVAC Service", 400, 200, 0.5, 0, 0, 0, 0, 0, 0, 10]],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/technician-dashboard/reports/174/data") {
        return {
          fields: [],
          data: [["Mike Johnson", 250, 250, 1, 0, 10, 0, 0]],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/operations/reports/165/data") {
        return {
          fields: [],
          data: [["INV-101", "HVAC Service", "Mike Johnson"]],
          hasMore: false,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.technicians[0]).toEqual({
      id: 10,
      name: "Mike Johnson",
      jobsCompleted: 1,
      revenue: 0,
      averageTicket: 0,
      opportunities: 0,
      convertedJobs: 0,
      conversionRate: 0,
      customerSatisfaction: 0,
      revenuePerHour: 150,
      billableEfficiency: 0.6,
      recallsCaused: 2,
      upsold: 80,
      jobsPerDay: 0.05,
      leadGeneration: {
        replacementOpps: 2,
        leadsSet: 1,
        avgLeadSale: 200,
        conversionRate: 50,
        totalLeadSales: 200,
      },
      memberships: {
        opportunities: 3,
        sold: 1,
        conversionRate: 33.3,
      },
      salesFromTechLeads: {
        totalSales: 400,
        avgSale: 200,
        closeRate: 50,
      },
      salesFromMarketingLeads: {
        totalSales: 250,
        avgSale: 250,
        closeRate: 100,
      },
    });
    expect(payload._warnings).toEqual([
      "Technician revenue report (Report 168) unavailable: report outage",
    ]);
  });

  it("intel_technician_scorecard returns zeros for empty technician data", async () => {
    const { handlers, postMock } = createContext();
    const handler = getHandler(handlers, "intel_technician_scorecard");

    postMock.mockResolvedValue(EMPTY_REPORT);

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.technicians).toEqual([]);
    expect(payload.teamAverages).toEqual({
      jobsCompleted: 0,
      revenue: 0,
      averageTicket: 0,
      opportunities: 0,
      convertedJobs: 0,
      conversionRate: 0,
      customerSatisfaction: 0,
      revenuePerHour: 0,
      billableEfficiency: 0,
      recallsCaused: 0,
      upsold: 0,
      jobsPerDay: 0,
      leadGeneration: ZERO_TECHNICIAN_LEAD_GENERATION,
      memberships: ZERO_TECHNICIAN_MEMBERSHIPS,
      salesFromTechLeads: ZERO_TECHNICIAN_LEAD_SALES,
      salesFromMarketingLeads: ZERO_TECHNICIAN_LEAD_SALES,
    });
    expectAllNumbersFinite(payload);
  });

  it("intel_membership_health computes retention and total revenue context", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_membership_health");

    postMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/report-category/marketing/reports/182/data") {
        return {
          fields: [
            { name: "Name" },
            { name: "Suspended" },
            { name: "Canceled" },
            { name: "Expired" },
            { name: "Deleted" },
            { name: "Renewed" },
            { name: "Reactivated" },
            { name: "NewSales" },
            { name: "ActiveAtEnd" },
          ],
          data: [
            ["Gold Plan", 2, 1, 0, 0, 5, 1, 3, 20],
            ["Silver Plan", 1, 2, 1, 1, 4, 0, 1, 5],
            ["Legacy Plan", 0, 0, 0, 0, 0, 0, 0, 0],
          ],
          hasMore: false,
        };
      }

      if (path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/178/data") {
        return {
          fields: [],
          data: [
            ["HVAC", 8, 3, 0.375],
            ["Plumbing", 2, 1, 0.5],
            ["Admin", 0, 0, 0],
          ],
          hasMore: false,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/invoices") {
        return {
          data: [
            { id: 1, total: 100 },
            { id: 2, total: 200 },
            { id: 3, total: 50 },
            { id: 4, total: 80 },
            { id: 5, total: 150 },
          ],
          hasMore: false,
          page: 1,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.activeMemberships).toBe(25);
    expect(payload.newSignups).toBe(4);
    expect(payload.cancellations).toBe(3);
    expect(payload.expirations).toBe(1);
    expect(payload.renewals).toBe(9);
    expect(payload.suspended).toBe(3);
    expect(payload.reactivated).toBe(1);
    expect(payload.deleted).toBe(1);
    expect(payload.retentionRate).toBeCloseTo(0.88, 3);
    expect(payload.totalRevenue).toBe(580);
    expect(payload.conversionTotals).toEqual({
      opportunities: 10,
      converted: 4,
      conversionRate: 40,
    });
    expect(payload.conversionByBusinessUnit).toEqual([
      { name: "HVAC", opportunities: 8, converted: 3, conversionRate: 37.5 },
      { name: "Plumbing", opportunities: 2, converted: 1, conversionRate: 50 },
    ]);
    expect(payload.membershipTypes).toEqual([
      {
        name: "Gold Plan",
        activeAtEnd: 20,
        newSales: 3,
        canceled: 1,
        expired: 0,
        renewed: 5,
        suspended: 2,
        reactivated: 1,
      },
      {
        name: "Silver Plan",
        activeAtEnd: 5,
        newSales: 1,
        canceled: 2,
        expired: 1,
        renewed: 4,
        suspended: 1,
        reactivated: 0,
      },
    ]);

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/marketing/reports/182/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-31" },
        ],
      },
    );
    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/business-unit-dashboard/reports/178/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-31" },
        ],
      },
    );

    expect(getMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/invoices",
      expect.objectContaining({
        invoicedOnOrAfter: "2026-01-01T00:00:00.000Z",
        invoicedOnBefore: "2026-01-31T23:59:59.999Z",
      }),
    );
  });

  it("intel_membership_health supports partial failures with warnings", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_membership_health");

    postMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/report-category/marketing/reports/182/data") {
        throw new Error("report outage");
      }

      if (path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/178/data") {
        return {
          fields: [],
          data: [["HVAC", 4, 2, 0.5]],
          hasMore: false,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/invoices") {
        return {
          data: [
            { total: 50 },
            { total: 75 },
          ],
          hasMore: false,
          page: 1,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.activeMemberships).toBe(0);
    expect(payload.newSignups).toBe(0);
    expect(payload.cancellations).toBe(0);
    expect(payload.expirations).toBe(0);
    expect(payload.renewals).toBe(0);
    expect(payload.suspended).toBe(0);
    expect(payload.reactivated).toBe(0);
    expect(payload.deleted).toBe(0);
    expect(payload.totalRevenue).toBe(125);
    expect(payload.conversionTotals).toEqual({
      opportunities: 4,
      converted: 2,
      conversionRate: 50,
    });
    expect(payload.conversionByBusinessUnit).toEqual([
      { name: "HVAC", opportunities: 4, converted: 2, conversionRate: 50 },
    ]);
    expect(payload.membershipTypes).toEqual([]);
    expect(payload._warnings).toEqual([
      "Membership summary report (Report 182) unavailable: report outage",
    ]);
  });

  it("intel_membership_health handles empty datasets", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_membership_health");

    postMock.mockResolvedValue({ fields: [], data: [], hasMore: false });
    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1 });

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.activeMemberships).toBe(0);
    expect(payload.newSignups).toBe(0);
    expect(payload.cancellations).toBe(0);
    expect(payload.expirations).toBe(0);
    expect(payload.renewals).toBe(0);
    expect(payload.suspended).toBe(0);
    expect(payload.reactivated).toBe(0);
    expect(payload.deleted).toBe(0);
    expect(payload.retentionRate).toBe(0);
    expect(payload.totalRevenue).toBe(0);
    expect(payload.conversionTotals).toEqual({
      opportunities: 0,
      converted: 0,
      conversionRate: 0,
    });
    expect(payload.membershipTypes).toEqual([]);
    expectAllNumbersFinite(payload);
  });

  it("intel_estimate_pipeline computes funnel, age buckets, stale list, and date params", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_estimate_pipeline");

    getMock.mockImplementation(async (path: string) => {
      if (path !== "/tenant/{tenant}/estimates") {
        throw new Error(`Unexpected path: ${path}`);
      }

      return {
        data: [
          { id: 1, status: "Open", createdOn: "2026-01-30T08:00:00.000Z", total: 1000, customerName: "A" },
          { id: 2, status: "Open", createdOn: "2026-01-20T08:00:00.000Z", total: 2000, customerName: "B" },
          { id: 3, status: "Open", createdOn: "2026-01-01T08:00:00.000Z", total: 3000, customerName: "C" },
          { id: 4, status: "Open", createdOn: "2025-12-15T08:00:00.000Z", total: 4000, customerName: "D" },
          {
            id: 5,
            status: "Sold",
            createdOn: "2026-01-10T08:00:00.000Z",
            soldOn: "2026-01-15T08:00:00.000Z",
            total: 5000,
            customerName: "E",
          },
          {
            id: 6,
            status: "Sold",
            createdOn: "2026-01-05T08:00:00.000Z",
            soldOn: "2026-01-06T08:00:00.000Z",
            total: 1000,
            customerName: "F",
          },
          { id: 7, status: "Dismissed", createdOn: "2026-01-07T08:00:00.000Z", total: 800, customerName: "G" },
        ],
        hasMore: false,
        page: 1,
      };
    });

    postMock.mockResolvedValue({
      fields: [],
      data: [
        ["Jamie Tech", 15000, 7500, 0.5, 6, 1.8, 77, 100, 15100],
        ["Pat Tech", 9000, 4500, 0.25, 8, 1.2, 88, 0, 9000],
        // Zero-activity tech — should be filtered out
        ["Admin Ghost", 0, 0, 0, 0, 0, 99, 0, 0],
      ],
      hasMore: false,
    });

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      soldById: 77,
    });
    const payload = payloadFrom(result);

    expect(payload.totalEstimates).toBe(7);
    expect(payload.pipeline).toEqual({
      open: { count: 4, value: 10000 },
      sold: { count: 2, value: 6000 },
      dismissed: { count: 1, value: 800 },
    });
    expect(payload.conversionRate).toBe(0.286);
    expect(payload.averageDaysToClose).toBe(3);
    expect(payload.openByAge).toEqual([
      { bucket: "0-7 days", count: 1, value: 1000 },
      { bucket: "8-14 days", count: 1, value: 2000 },
      { bucket: "15-30 days", count: 1, value: 3000 },
      { bucket: "30+ days", count: 1, value: 4000 },
    ]);
    expect(payload.staleEstimates).toEqual([
      { id: 4, customer: "D", value: 4000, daysOld: 47 },
    ]);
    // Zero-activity "Admin Ghost" should be filtered out; soldById=77 filters to Jamie only
    expect(payload.salesFunnel).toEqual({
      totalSales: 15000,
      averageCloseRate: 50,
      totalOpportunities: 6,
      averageClosedSale: 7500,
      byTechnician: [
        {
          id: 77,
          name: "Jamie Tech",
          totalSales: 15000,
          closedAverageSale: 7500,
          closeRate: 50,
          salesOpportunity: 6,
          optionsPerOpportunity: 1.8,
        },
      ],
    });

    expect(getMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/estimates",
      expect.objectContaining({
        createdOnOrAfter: "2026-01-01T00:00:00.000Z",
        createdBefore: "2026-01-31T23:59:59.999Z",
        soldById: 77,
      }),
    );

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/technician-dashboard/reports/172/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-31" },
        ],
      },
    );
  });

  it("intel_estimate_pipeline returns warning and zeroed funnel on failure", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_estimate_pipeline");

    getMock.mockRejectedValue(new Error("pipeline unavailable"));
    postMock.mockResolvedValue({
      fields: [],
      data: [["Jordan Tech", 1200, 600, 0.5, 2, 1.1, 10, 0, 1200]],
      hasMore: false,
    });

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.totalEstimates).toBe(0);
    expect(payload.pipeline).toEqual({
      open: { count: 0, value: 0 },
      sold: { count: 0, value: 0 },
      dismissed: { count: 0, value: 0 },
    });
    expect(payload.salesFunnel).toEqual({
      totalSales: 1200,
      averageCloseRate: 50,
      totalOpportunities: 2,
      averageClosedSale: 600,
      byTechnician: [
        {
          id: 10,
          name: "Jordan Tech",
          totalSales: 1200,
          closedAverageSale: 600,
          closeRate: 50,
          salesOpportunity: 2,
          optionsPerOpportunity: 1.1,
        },
      ],
    });
    expect(payload._warnings).toEqual([
      "Estimate data unavailable: pipeline unavailable",
    ]);
  });

  it("intel_estimate_pipeline handles empty estimate data", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_estimate_pipeline");

    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1 });
    postMock.mockResolvedValue({ fields: [], data: [], hasMore: false });

    const result = await handler({});
    const payload = payloadFrom(result);

    expect(payload.totalEstimates).toBe(0);
    expect(payload.conversionRate).toBe(0);
    expect(payload.averageDaysToClose).toBe(0);
    expect(payload.staleEstimates).toEqual([]);
    expect(payload.salesFunnel).toEqual({
      totalSales: 0,
      averageCloseRate: 0,
      totalOpportunities: 0,
      averageClosedSale: 0,
      byTechnician: [],
    });
    expectAllNumbersFinite(payload);
  });

  it("intel_estimate_pipeline returns report 172 sales funnel output shape", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_estimate_pipeline");

    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1 });
    postMock.mockResolvedValue({
      fields: [],
      data: [
        ["Sam Keller", 1000, 500, 0.4, 5, 1.2, 20, 0, 1000],
        ["Ria Brooks", 2000, 1000, 0.6, 10, 1.6, 21, 0, 2000],
      ],
      hasMore: false,
    });

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.salesFunnel).toEqual({
      totalSales: 3000,
      averageCloseRate: 50,
      totalOpportunities: 15,
      averageClosedSale: 750,
      byTechnician: [
        {
          id: 20,
          name: "Sam Keller",
          totalSales: 1000,
          closedAverageSale: 500,
          closeRate: 40,
          salesOpportunity: 5,
          optionsPerOpportunity: 1.2,
        },
        {
          id: 21,
          name: "Ria Brooks",
          totalSales: 2000,
          closedAverageSale: 1000,
          closeRate: 60,
          salesOpportunity: 10,
          optionsPerOpportunity: 1.6,
        },
      ],
    });
  });

  it("intel_estimate_pipeline keeps existing metrics when report 172 fails", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_estimate_pipeline");

    getMock.mockResolvedValue({
      data: [
        {
          id: 1,
          status: "Open",
          createdOn: "2026-01-10T08:00:00.000Z",
          total: 1000,
          customerName: "Alpha",
        },
        {
          id: 2,
          status: "Sold",
          createdOn: "2026-01-05T08:00:00.000Z",
          soldOn: "2026-01-06T08:00:00.000Z",
          total: 2000,
          customerName: "Beta",
        },
      ],
      hasMore: false,
      page: 1,
    });
    postMock.mockRejectedValue(new Error("report outage"));

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.totalEstimates).toBe(2);
    expect(payload.pipeline).toEqual({
      open: { count: 1, value: 1000 },
      sold: { count: 1, value: 2000 },
      dismissed: { count: 0, value: 0 },
    });
    expect(payload.conversionRate).toBe(0.5);
    expect(payload.salesFunnel).toEqual({
      totalSales: 0,
      averageCloseRate: 0,
      totalOpportunities: 0,
      averageClosedSale: 0,
      byTechnician: [],
    });
    expect(payload._warnings).toEqual([
      "Technician sales report (Report 172) unavailable: report outage",
    ]);
  });

  it("intel_campaign_performance sorts by activity and keeps revenue in totals only", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_campaign_performance");

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/campaigns") {
        return {
          data: [
            { id: 1, name: "zExisting Client" },
            { id: 2, name: "Google Ads - AC Repair" },
            { id: 3, name: "zYelp" },
          ],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/v3/tenant/{tenant}/calls") {
        // v3 calls nest campaign inside leadCall (matches real ST API structure)
        return {
          data: [
            { id: 101, leadCall: { campaign: { id: 2, name: "Google Ads" } } },
            { id: 102, leadCall: { campaign: { id: 2, name: "Google Ads" } } },
            { id: 103, leadCall: { campaign: { id: 2, name: "Google Ads" } } },
            { id: 104, leadCall: { campaign: { id: 2, name: "Google Ads" } } },
            { id: 105, leadCall: { campaign: { id: 2, name: "Google Ads" } } },
            { id: 106, leadCall: { campaign: { id: 1, name: "Existing Client" } } },
            { id: 107, leadCall: { campaign: { id: 3, name: "Yelp" } } },
            { id: 108, leadCall: { campaign: { id: 3, name: "Yelp" } } },
          ],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/tenant/{tenant}/bookings") {
        return {
          data: [{ campaignId: 2 }, { campaignId: 2 }, { campaignId: 3 }],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/tenant/{tenant}/invoices") {
        return {
          data: [{ total: 1000 }, { total: 500 }, { total: 700 }],
          hasMore: false,
          page: 1,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    postMock.mockResolvedValue({
      fields: [],
      data: [
        ["HVAC", 10, 4, 0.4, 2500, 5, 2, 0.4, 1200, 50, 2750, 25],
        ["Plumbing", 3, 1, 0.333, 1500, 2, 1, 0.5, 300, 0, 1800, 0],
        // Zero-activity BU — should be filtered out
        ["Admin", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ],
      hasMore: false,
    });

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    const payload = payloadFrom(result);

    expect(payload.campaigns).toEqual([
      {
        id: 2,
        name: "Google Ads - AC Repair",
        calls: 5,
        bookings: 2,
        conversionRate: 0.4,
        revenue: 0,
        revenuePerCall: 0,
      },
      {
        id: 3,
        name: "zYelp",
        calls: 2,
        bookings: 1,
        conversionRate: 0.5,
        revenue: 0,
        revenuePerCall: 0,
      },
      {
        id: 1,
        name: "zExisting Client",
        calls: 1,
        bookings: 0,
        conversionRate: 0,
        revenue: 0,
        revenuePerCall: 0,
      },
    ]);

    // Revenue now comes from Report 175 (row[8] = TotalRevenue per BU),
    // not invoice pagination. Mock data: HVAC row[8]=1200 + Plumbing row[8]=300 = 1500
    expect(payload.totals).toEqual({
      calls: 8,
      bookings: 3,
      conversionRate: 0.375,
      revenue: 1500,
    });
    expect(payload._warnings).toEqual([PER_CAMPAIGN_REVENUE_WARNING]);

    // Zero-activity "Admin" BU should be filtered out
    expect(payload.leadGeneration).toHaveLength(2);
    expect(payload.leadGeneration).toEqual([
      {
        name: "HVAC",
        leadGenerationOpportunity: 10,
        leadsSet: 4,
        leadConversionRate: 0.4,
        averageLeadSale: 2500,
        replacementOpportunity: 5,
        replacementLeadsSet: 2,
        replacementLeadConversionRate: 0.4,
        membershipSales: 1200,
        adjustmentRevenue: 50,
        totalRevenue: 2750,
        nonJobRevenue: 25,
      },
      {
        name: "Plumbing",
        leadGenerationOpportunity: 3,
        leadsSet: 1,
        leadConversionRate: 0.333,
        averageLeadSale: 1500,
        replacementOpportunity: 2,
        replacementLeadsSet: 1,
        replacementLeadConversionRate: 0.5,
        membershipSales: 300,
        adjustmentRevenue: 0,
        totalRevenue: 1800,
        nonJobRevenue: 0,
      },
    ]);

    expect(getMock).toHaveBeenCalledWith(
      "/v3/tenant/{tenant}/calls",
      expect.objectContaining({
        createdOnOrAfter: "2026-01-01T00:00:00.000Z",
        createdBefore: "2026-01-31T23:59:59.999Z",
        active: "Any",
      }),
    );
    // Revenue now comes from Report 175 (POST) instead of invoice pagination (GET)
    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-31" },
        ],
      },
    );

    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/business-unit-dashboard/reports/176/data",
      {
        parameters: [
          { name: "From", value: "2026-01-01" },
          { name: "To", value: "2026-01-31" },
        ],
      },
    );
  });

  it("intel_campaign_performance continues when batch bookings endpoint fails", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_campaign_performance");

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/campaigns") {
        return {
          data: [{ id: 1, name: "Google Ads - AC Repair" }],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/v3/tenant/{tenant}/calls") {
        return {
          data: [
            { id: 201, leadCall: { campaign: { id: 1, name: "Google Ads" } } },
            { id: 202, leadCall: { campaign: { id: 1, name: "Google Ads" } } },
          ],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/tenant/{tenant}/bookings") {
        throw new Error("bookings unavailable");
      }

      if (path === "/tenant/{tenant}/invoices") {
        return { data: [{ total: 500 }], hasMore: false, page: 1 };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    postMock.mockResolvedValue({ fields: [], data: [], hasMore: false });

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    const payload = payloadFrom(result);

    expect(payload.campaigns[0]).toEqual(
      expect.objectContaining({
        calls: 2,
        bookings: 0,
        revenue: 0,
        conversionRate: 0,
      }),
    );
    // Revenue now comes from Report 175 (empty mock = 0), not invoice pagination
    expect(payload.totals.revenue).toBe(0);
    expect(payload._warnings).toEqual([
      "Booking data unavailable: bookings unavailable",
      PER_CAMPAIGN_REVENUE_WARNING,
    ]);
  });

  it("intel_campaign_performance warns when Report 176 is unavailable", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_campaign_performance");

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/campaigns") {
        return {
          data: [{ id: 1, name: "Google Ads - AC Repair" }],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/v3/tenant/{tenant}/calls") {
        return {
          data: [{ id: 301, leadCall: { campaign: { id: 1, name: "Google Ads" } } }],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/tenant/{tenant}/bookings") {
        return { data: [{ campaignId: 1 }], hasMore: false, page: 1 };
      }

      if (path === "/tenant/{tenant}/invoices") {
        return { data: [{ total: 250 }], hasMore: false, page: 1 };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    postMock.mockRejectedValue(new Error("lead report unavailable"));

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    const payload = payloadFrom(result);

    expect(payload.leadGeneration).toEqual([]);
    // Both Report 175 (revenue) and 176 (lead gen) fail since postMock rejects all POSTs
    expect(payload._warnings).toEqual([
      "Revenue report (Report 175) unavailable: lead report unavailable",
      "Lead generation report (Report 176) unavailable: lead report unavailable",
      PER_CAMPAIGN_REVENUE_WARNING,
    ]);
  });

  it("intel_campaign_performance handles no campaign data", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_campaign_performance");

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/campaigns") {
        return { data: [], hasMore: false, page: 1 };
      }

      if (
        path === "/v3/tenant/{tenant}/calls" ||
        path === "/tenant/{tenant}/bookings" ||
        path === "/tenant/{tenant}/invoices"
      ) {
        return { data: [], hasMore: false, page: 1 };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    postMock.mockResolvedValue({ fields: [], data: [], hasMore: false });

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    const payload = payloadFrom(result);

    expect(payload.campaigns).toEqual([]);
    expect(payload.totals).toEqual({
      calls: 0,
      bookings: 0,
      conversionRate: 0,
      revenue: 0,
    });
    expect(payload.leadGeneration).toEqual([]);
    expect(payload._warnings).toEqual([PER_CAMPAIGN_REVENUE_WARNING]);
    expectAllNumbersFinite(payload);
  });

  it("intel_daily_snapshot computes counts, revenues, upcoming jobs, highlights, and date params", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_daily_snapshot");

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/appointments") {
        return {
          data: [
            { status: "Done" },
            { status: "Working" },
            { status: "Scheduled" },
            { status: "Canceled" },
          ],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/tenant/{tenant}/jobs") {
        return {
          data: [
            { status: "Completed" },
            { status: "InProgress" },
            { status: "Canceled" },
          ],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/tenant/{tenant}/invoices") {
        return {
          data: [{ total: 100 }, { total: 200 }],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/tenant/{tenant}/payments") {
        return {
          data: [{ amount: 120 }],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/tenant/{tenant}/estimates") {
        return {
          data: [{ total: 400 }, { total: 600 }],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/v3/tenant/{tenant}/calls") {
        return {
          data: [
            { leadCall: { callType: "Booked" } },
            { leadCall: { callType: "booked" } },
            { leadCall: { callType: "Missed" } },
            { leadCall: { callType: "Abandoned" } },
            { status: "NoAnswer" },
            { bookingId: 9 },
          ],
          hasMore: false,
          page: 1,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    postMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/report-category/operations/reports/163/data") {
        return {
          fields: [],
          data: [
            [
              "JOB-1001",
              "2026-03-05 09:00",
              "Acme Industries",
              "",
              "",
              "",
              "",
              "123 Main St",
              "",
              "",
              "HVAC Service",
              "Mike Johnson",
            ],
            [
              "JOB-1002",
              "2026-03-05 11:00",
              "Beta Homes",
              "",
              "",
              "",
              "",
              "456 Oak Ave",
              "",
              "",
              "Maintenance",
              "Nina Lopez",
            ],
          ],
          hasMore: false,
        };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler({ date: "2026-03-04" });
    const payload = payloadFrom(result);

    expect(payload.appointments).toEqual({
      total: 4,
      completed: 1,
      inProgress: 1,
      pending: 2,
    });
    expect(payload.jobs).toEqual({
      total: 3,
      completed: 1,
      inProgress: 1,
      canceled: 1,
    });
    expect(payload.revenue).toEqual({
      invoiced: 300,
      collected: 120,
      estimatesSold: 1000,
    });
    expect(payload.calls).toEqual({
      total: 6,
      booked: 3,
      missed: 3,
    });
    expect(payload.upcomingJobs).toEqual({
      total: 2,
      breakdownByJobType: [
        { jobType: "HVAC Service", count: 1 },
        { jobType: "Maintenance", count: 1 },
      ],
      jobs: [
        {
          jobNumber: "JOB-1001",
          scheduledDate: "2026-03-05 09:00",
          customerName: "Acme Industries",
          locationAddress: "123 Main St",
          jobType: "HVAC Service",
          assignedTechnicians: "Mike Johnson",
        },
        {
          jobNumber: "JOB-1002",
          scheduledDate: "2026-03-05 11:00",
          customerName: "Beta Homes",
          locationAddress: "456 Oak Ave",
          jobType: "Maintenance",
          assignedTechnicians: "Nina Lopez",
        },
      ],
    });
    expect(payload.highlights).toEqual([
      "1 of 4 appointments completed (25%)",
      "3 missed calls today may need follow-up",
      "2 jobs scheduled for tomorrow",
      "$1,000 in estimates sold",
    ]);

    expect(getMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/appointments",
      expect.objectContaining({
        startsOnOrAfter: "2026-03-04T00:00:00.000Z",
        startsBefore: "2026-03-05T00:00:00.000Z",
      }),
    );
    expect(postMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/report-category/operations/reports/163/data",
      {
        parameters: [
          { name: "DateType", value: "Appointment Date" },
          { name: "From", value: "2026-03-05" },
          { name: "To", value: "2026-03-05" },
        ],
      },
    );
  });

  it("intel_daily_snapshot returns partial results and warnings when one feed fails", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_daily_snapshot");

    getMock.mockImplementation(async (path: string) => {
      if (path === "/v3/tenant/{tenant}/calls") {
        throw new Error("calls down");
      }

      return {
        data: [],
        hasMore: false,
        page: 1,
      };
    });

    postMock.mockResolvedValue(EMPTY_REPORT);

    const result = await handler({ date: "2026-03-04" });
    const payload = payloadFrom(result);

    expect(payload.calls).toEqual({ total: 0, booked: 0, missed: 0 });
    expect(payload.upcomingJobs).toEqual({ total: 0, breakdownByJobType: [], jobs: [] });
    expect(payload._warnings).toEqual([
      "Call data unavailable: calls down",
    ]);
  });

  it("intel_daily_snapshot handles empty day without errors", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_daily_snapshot");

    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1 });
    postMock.mockResolvedValue(EMPTY_REPORT);

    const result = await handler({ date: "2026-03-04" });
    const payload = payloadFrom(result);

    expect(payload.appointments).toEqual({ total: 0, completed: 0, inProgress: 0, pending: 0 });
    expect(payload.jobs).toEqual({ total: 0, completed: 0, inProgress: 0, canceled: 0 });
    expect(payload.revenue).toEqual({ invoiced: 0, collected: 0, estimatesSold: 0 });
    expect(payload.calls).toEqual({ total: 0, booked: 0, missed: 0 });
    expect(payload.upcomingJobs).toEqual({ total: 0, breakdownByJobType: [], jobs: [] });
    expect(payload.highlights).toEqual([
      "0 of 0 appointments completed (0%)",
      "No missed calls recorded today",
      "0 jobs scheduled for tomorrow",
      "$0 in estimates sold",
    ]);
    expect(payload.highlights.join(" ")).not.toContain("NaN");
    expect(payload.highlights.join(" ")).not.toContain("Infinity");
    expectAllNumbersFinite(payload);
  });

  it("intel_csr_performance avoids NaN when no CSR rows are returned", async () => {
    const { handlers, postMock } = createContext();
    const handler = getHandler(handlers, "intel_csr_performance");

    postMock.mockResolvedValue(EMPTY_REPORT);

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.csrs).toEqual([]);
    expect(payload.teamAverages).toEqual({
      jobsBooked: 0,
      totalRevenue: 0,
      avgTicket: 0,
      completedJobs: 0,
      invoicedJobs: 0,
      canceledJobs: 0,
      openJobs: 0,
      completionRate: 0,
      invoiceRate: 0,
      cancellationRate: 0,
    });
    expectAllNumbersFinite(payload);
  });

  it("intel_labor_cost avoids Infinity when gross pay exists with zero hours", async () => {
    const { handlers, postMock } = createContext();
    const handler = getHandler(handlers, "intel_labor_cost");

    postMock.mockImplementation(async (path: string) => {
      if (path !== "/tenant/{tenant}/report-category/accounting/reports/166/data") {
        throw new Error(`Unexpected path: ${path}`);
      }

      return {
        fields: [],
        data: [
          [
            "Jamie Tech",
            "Training",
            "2026-01-15",
            "INV-1",
            "HVAC",
            0,
            0,
            0,
            0,
            120,
            "Customer",
            "Project",
            "Zone",
            "TaxZone",
            "85001",
            "Phoenix",
            "123 Main St",
            "TRAIN",
          ],
        ],
        hasMore: false,
      };
    });

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.avgHourlyRate).toBe(0);
    expect(payload.overtimePercent).toBe(0);
    expect(payload.employees).toEqual([
      {
        name: "Jamie Tech",
        businessUnits: ["HVAC"],
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        doubleOvertimeHours: 0,
        grossPay: 120,
        avgHourlyRate: 0,
        activityBreakdown: [
          {
            activity: "Training",
            entries: 1,
            hours: 0,
            grossPay: 120,
            avgHourlyRate: 0,
          },
        ],
      },
    ]);
    expect(payload.byBusinessUnit).toEqual([
      {
        name: "HVAC",
        employeeCount: 1,
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        doubleOvertimeHours: 0,
        grossPay: 120,
        avgHourlyRate: 0,
        overtimePercent: 0,
      },
    ]);
    expectAllNumbersFinite(payload);
  });

  it("intel_invoice_tracking avoids NaN when no invoices are returned", async () => {
    const { handlers, postMock } = createContext();
    const handler = getHandler(handlers, "intel_invoice_tracking");

    postMock.mockResolvedValue(EMPTY_REPORT);

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.sentCount).toBe(0);
    expect(payload.notSentCount).toBe(0);
    expect(payload.sendRate).toBe(0);
    expect(payload.totalAmountSent).toBe(0);
    expect(payload.totalAmountNotSent).toBe(0);
    expect(payload.notSentBreakdown).toEqual({
      byBusinessUnit: [],
      byTechnician: [],
    });
    expect(payload.highlights).toEqual([
      "All 0 invoices in the period were sent.",
    ]);
    expectAllNumbersFinite(payload);
  });
});
