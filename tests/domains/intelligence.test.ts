import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadIntelligenceDomain } from "../../src/domains/intelligence/index.js";
import { fetchAllPages } from "../../src/domains/intelligence/helpers.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

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

describe("intelligence domain", () => {
  it("registers all 6 intelligence tools as read operations", () => {
    const { server, registry } = createContext();

    expect(server.tool).toHaveBeenCalledTimes(6);

    const names = new Set(
      server.tool.mock.calls.map((call) => call[0] as string),
    );

    expect(names).toEqual(
      new Set([
        "intel_revenue_summary",
        "intel_technician_scorecard",
        "intel_membership_health",
        "intel_estimate_pipeline",
        "intel_campaign_performance",
        "intel_daily_snapshot",
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

  it("intel_revenue_summary uses Report 175 for revenue and payments for collections", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_revenue_summary");

    // Report 175 returns array-of-arrays with field order:
    // [Name, CompletedRevenue, OpportunityJobAvg, ConversionRate, Opportunity, ConvertedJobs,
    //  CustomerSatisfaction, AdjustmentRevenue, TotalRevenue, NonJobRevenue]
    postMock.mockResolvedValue({
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

    // Verify BU breakdown (zero-revenue "Admin" should be filtered out)
    expect(payload.byBusinessUnit).toHaveLength(2);
    expect((payload.byBusinessUnit as any[])[0].name).toBe("HVAC - Install");
    expect((payload.byBusinessUnit as any[])[1].name).toBe("HVAC - Service");

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
  });

  it("intel_revenue_summary returns partial results with warnings on report failure", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_revenue_summary");

    postMock.mockRejectedValue(new Error("report outage"));

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
    });
    const payload = payloadFrom(result);

    expect(payload.totalRevenue).toBe(0);
    expect(payload.totalCollected).toBe(125);
    expect(payload._warnings).toEqual([
      "Revenue report (Report 175) unavailable: report outage",
    ]);
  });

  it("intel_revenue_summary handles empty datasets with zero values", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_revenue_summary");

    postMock.mockResolvedValue({ fields: [], data: [], hasMore: false });
    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1 });

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.totalRevenue).toBe(0);
    expect(payload.totalCollected).toBe(0);
    expect(payload.outstanding).toBe(0);
    expect(payload.avgTicket).toBe(0);
    expect(payload.byBusinessUnit).toEqual([]);
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
    });

    expect(payload._warnings).toEqual([
      "Business unit filtering only applies to completed jobs (Report 165). Revenue/productivity metrics are tenant-wide.",
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
    });
    expect(payload._warnings).toEqual([
      "Technician revenue report (Report 168) unavailable: report outage",
    ]);
  });

  it("intel_technician_scorecard returns zeros for empty technician data", async () => {
    const { handlers, postMock } = createContext();
    const handler = getHandler(handlers, "intel_technician_scorecard");

    postMock.mockResolvedValue({ fields: [], data: [], hasMore: false });

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
    });
  });

  it("intel_membership_health computes retention and member revenue mix", async () => {
    const { handlers, getMock, postMock } = createContext();
    const handler = getHandler(handlers, "intel_membership_health");

    postMock.mockResolvedValue({
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
    });

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/invoices") {
        return {
          data: [
            { id: 1, total: 100, membershipTypeId: 1, membershipTypeName: "Gold Plan" },
            { id: 2, total: 200, membershipTypeId: 1 },
            { id: 3, total: 50, membershipTypeId: 2, membershipType: { name: "Silver Plan" } },
            { id: 4, total: 80, isMember: true },
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
    expect(payload.memberRevenue).toBe(430);
    expect(payload.nonMemberRevenue).toBe(150);
    expect(payload.memberAverageTicket).toBe(107.5);
    expect(payload.nonMemberAverageTicket).toBe(150);
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
        revenue: 300,
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
        revenue: 50,
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

    postMock.mockRejectedValue(new Error("report outage"));

    getMock.mockImplementation(async (path: string) => {
      if (path === "/tenant/{tenant}/invoices") {
        return {
          data: [
            { total: 50, isMember: true },
            { total: 75, membershipTypeId: 99 },
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
    expect(payload.memberRevenue).toBe(125);
    expect(payload.nonMemberRevenue).toBe(0);
    expect(payload.memberAverageTicket).toBe(62.5);
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
    expect(payload.memberRevenue).toBe(0);
    expect(payload.nonMemberRevenue).toBe(0);
    expect(payload.membershipTypes).toEqual([]);
  });

  it("intel_estimate_pipeline computes funnel, age buckets, stale list, and date params", async () => {
    const { handlers, getMock } = createContext();
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

    expect(getMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/estimates",
      expect.objectContaining({
        createdOnOrAfter: "2026-01-01T00:00:00.000Z",
        createdBefore: "2026-01-31T23:59:59.999Z",
        soldById: 77,
      }),
    );
  });

  it("intel_estimate_pipeline returns warning and zeroed funnel on failure", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "intel_estimate_pipeline");

    getMock.mockRejectedValue(new Error("pipeline unavailable"));

    const result = await handler({ startDate: "2026-01-01", endDate: "2026-01-31" });
    const payload = payloadFrom(result);

    expect(payload.totalEstimates).toBe(0);
    expect(payload.pipeline).toEqual({
      open: { count: 0, value: 0 },
      sold: { count: 0, value: 0 },
      dismissed: { count: 0, value: 0 },
    });
    expect(payload._warnings).toEqual([
      "Estimate data unavailable: pipeline unavailable",
    ]);
  });

  it("intel_estimate_pipeline handles empty estimate data", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "intel_estimate_pipeline");

    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1 });

    const result = await handler({});
    const payload = payloadFrom(result);

    expect(payload.totalEstimates).toBe(0);
    expect(payload.conversionRate).toBe(0);
    expect(payload.averageDaysToClose).toBe(0);
    expect(payload.staleEstimates).toEqual([]);
  });

  it("intel_campaign_performance computes campaign-level and total ROI metrics", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "intel_campaign_performance");

    getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      if (path === "/tenant/{tenant}/campaigns") {
        return {
          data: [
            { id: 1, name: "Google Ads - AC Repair" },
            { id: 2, name: "Direct Mail" },
          ],
          hasMore: false,
          page: 1,
        };
      }

      if (path === "/v3/tenant/{tenant}/calls") {
        if (params?.campaignId === 1) {
          return {
            data: [{}, {}, {}, {}, {}],
            hasMore: false,
            page: 1,
          };
        }

        if (params?.campaignId === 2) {
          return {
            data: [{}, {}, {}],
            hasMore: false,
            page: 1,
          };
        }
      }

      if (path === "/tenant/{tenant}/bookings") {
        if (params?.campaignId === 1) {
          return {
            data: [{}, {}],
            hasMore: false,
            page: 1,
          };
        }

        if (params?.campaignId === 2) {
          return {
            data: [{}],
            hasMore: false,
            page: 1,
          };
        }
      }

      if (path === "/tenant/{tenant}/invoices") {
        if (params?.campaignId === 1) {
          return {
            data: [{ total: 1000 }, { total: 500 }],
            hasMore: false,
            page: 1,
          };
        }

        if (params?.campaignId === 2) {
          return {
            data: [{ total: 700 }],
            hasMore: false,
            page: 1,
          };
        }
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    const payload = payloadFrom(result);

    expect(payload.campaigns).toEqual([
      {
        id: 1,
        name: "Google Ads - AC Repair",
        calls: 5,
        bookings: 2,
        conversionRate: 0.4,
        revenue: 1500,
        revenuePerCall: 300,
      },
      {
        id: 2,
        name: "Direct Mail",
        calls: 3,
        bookings: 1,
        conversionRate: 0.333,
        revenue: 700,
        revenuePerCall: 233.33,
      },
    ]);

    expect(payload.totals).toEqual({
      calls: 8,
      bookings: 3,
      conversionRate: 0.375,
      revenue: 2200,
    });

    expect(getMock).toHaveBeenCalledWith(
      "/v3/tenant/{tenant}/calls",
      expect.objectContaining({
        campaignId: 1,
        createdOnOrAfter: "2026-01-01T00:00:00.000Z",
        createdBefore: "2026-01-31T23:59:59.999Z",
      }),
    );
  });

  it("intel_campaign_performance continues when one per-campaign endpoint fails", async () => {
    const { handlers, getMock } = createContext();
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
        return { data: [{}, {}], hasMore: false, page: 1 };
      }

      if (path === "/tenant/{tenant}/bookings") {
        throw new Error("bookings unavailable");
      }

      if (path === "/tenant/{tenant}/invoices") {
        return { data: [{ total: 500 }], hasMore: false, page: 1 };
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await handler({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    const payload = payloadFrom(result);

    expect(payload.campaigns[0]).toEqual(
      expect.objectContaining({
        calls: 2,
        bookings: 0,
        revenue: 500,
        conversionRate: 0,
      }),
    );
    expect(payload._warnings).toEqual([
      "Booking data for Google Ads - AC Repair unavailable: bookings unavailable",
    ]);
  });

  it("intel_campaign_performance handles no campaign data", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "intel_campaign_performance");

    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1 });

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
  });

  it("intel_daily_snapshot computes counts, revenues, highlights, and date params", async () => {
    const { handlers, getMock } = createContext();
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
            { status: "Answered", bookingId: 9 },
            { status: "Missed" },
            { status: "NoAnswer" },
            { status: "Answered", booked: true },
          ],
          hasMore: false,
          page: 1,
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
      total: 4,
      booked: 2,
      missed: 2,
    });
    expect(payload.highlights).toEqual([
      "1 of 4 appointments completed (25%)",
      "2 missed calls today may need follow-up",
      "$1,000 in estimates sold",
    ]);

    expect(getMock).toHaveBeenCalledWith(
      "/tenant/{tenant}/appointments",
      expect.objectContaining({
        startsOnOrAfter: "2026-03-04T00:00:00.000Z",
        startsBefore: "2026-03-05T00:00:00.000Z",
      }),
    );
  });

  it("intel_daily_snapshot returns partial results and warnings when one feed fails", async () => {
    const { handlers, getMock } = createContext();
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

    const result = await handler({ date: "2026-03-04" });
    const payload = payloadFrom(result);

    expect(payload.calls).toEqual({ total: 0, booked: 0, missed: 0 });
    expect(payload._warnings).toEqual([
      "Call data unavailable: calls down",
    ]);
  });

  it("intel_daily_snapshot handles empty day without errors", async () => {
    const { handlers, getMock } = createContext();
    const handler = getHandler(handlers, "intel_daily_snapshot");

    getMock.mockResolvedValue({ data: [], hasMore: false, page: 1 });

    const result = await handler({ date: "2026-03-04" });
    const payload = payloadFrom(result);

    expect(payload.appointments).toEqual({ total: 0, completed: 0, inProgress: 0, pending: 0 });
    expect(payload.jobs).toEqual({ total: 0, completed: 0, inProgress: 0, canceled: 0 });
    expect(payload.revenue).toEqual({ invoiced: 0, collected: 0, estimatesSold: 0 });
    expect(payload.calls).toEqual({ total: 0, booked: 0, missed: 0 });
    expect(payload.highlights).toEqual([
      "0 of 0 appointments completed (0%)",
      "No missed calls recorded today",
      "$0 in estimates sold",
    ]);
  });
});
