import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";
import { registerIntelligenceEstimatePipelineTool } from "../../src/domains/intelligence/pipeline.js";
import { registerIntelligenceCampaignPerformanceTool } from "../../src/domains/intelligence/campaign-roi.js";
import { registerIntelligenceMembershipHealthTool } from "../../src/domains/intelligence/membership-health.js";
import { getReportContract } from "../../src/domains/intelligence/report-executor.js";

// Invented records only. Every request is handled by these local fake clients.
const PERIOD = { startDate: "2026-02-01", endDate: "2026-02-28" };
const sales = ["Public technician", 1200, 300, 0.75, 4, 1.5, 11, 0, 1200];
const lead = ["Public unit", 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const membership = ["Public membership", 1, 2, 3, 4, 5, 6, 7, 8];
const conversion = ["Public unit", 4, 2, 0.5, 0, 0, 0];
const revenue = ["Public unit", 0, 0, 0, 0, 0, 0, 0, 0, 0];

function report(key: string, data: unknown[][] = []) {
  return { fields: getReportContract(key).fields.map((name) => ({ name })), data, page: 1, pageSize: 1000, hasMore: false, totalCount: data.length };
}

function context(tool: "pipeline" | "campaign" | "membership", options: {
  records?: Record<string, unknown[]>;
  reports?: Record<string, unknown[][]>;
  failPaths?: string[];
  failReports?: string[];
} = {}) {
  let definition: { handler: (params: unknown) => Promise<ToolResponse>; description: string } | undefined;
  const registry = { timezone: "UTC", reportBindings: undefined, register: (value: typeof definition) => { definition = value; } } as unknown as ToolRegistry;
  const get = vi.fn(async (path: string) => {
    if (options.failPaths?.includes(path)) throw new Error("Public source failure");
    return { data: options.records?.[path] ?? [], page: 1, hasMore: false };
  });
  const post = vi.fn(async (path: string) => {
    const key = /reports\/(\d+)\/data/.exec(path)?.[1];
    if (!key) throw new Error("Unexpected public report route");
    if (options.failReports?.includes(key)) throw new Error("Public report failure");
    return report(key, options.reports?.[key] ?? []);
  });
  const client = { get, post } as unknown as ServiceTitanClient;
  ({ pipeline: registerIntelligenceEstimatePipelineTool, campaign: registerIntelligenceCampaignPerformanceTool, membership: registerIntelligenceMembershipHealthTool })[tool](client, registry);
  return {
    get, post,
    description: definition!.description,
    invoke: async (params: unknown = PERIOD): Promise<Record<string, any>> => {
      const result = await definition!.handler(params);
      expect(result.isError, result.content[0]?.text).not.toBe(true);
      return JSON.parse(result.content[0].text);
    },
  };
}

describe("pipeline accuracy with independent source availability", () => {
  it("does not divide sales money by opportunities or invent closed-count weights", async () => {
    const payload = await context("pipeline", { reports: { "172": [sales] } }).invoke();
    expect(payload.salesFunnel).toMatchObject({ totalSales: 1200, totalOpportunities: 4, averageCloseRate: null, averageClosedSale: null });
    expect(payload.salesFunnel.byTechnician[0]).toMatchObject({ closeRate: 75, closedAverageSale: 300 });
    expect(payload._metricAvailability["salesFunnel.averageCloseRate"].reason).toMatch(/closed|cohort/i);
    expect(payload._sourceAvailability.technicianSales.status).toBe("complete");
  });

  it("preserves technician values when estimates fail, without a measured zero pipeline", async () => {
    const payload = await context("pipeline", { failPaths: ["/tenant/{tenant}/estimates"], reports: { "172": [sales] } }).invoke();
    expect(payload.totalEstimates).toBeNull();
    expect(payload.pipeline.open).toEqual({ count: null, value: null });
    expect(payload.conversionRate).toBeNull();
    expect(payload.salesFunnel.totalSales).toBe(1200);
    expect(payload._sourceAvailability.estimates.status).toBe("failed");
  });

  it("distinguishes a failed sales report from an optional report not requested", async () => {
    const failed = await context("pipeline", { failReports: ["172"] }).invoke();
    expect(failed.salesFunnel.totalSales).toBeNull();
    expect(failed.salesFunnel.byTechnician).toBeNull();
    expect(failed._sourceAvailability.technicianSales.status).toBe("failed");
    const skippedContext = context("pipeline");
    const skipped = await skippedContext.invoke({});
    expect(skipped.salesFunnel.totalSales).toBeNull();
    expect(skipped._sourceAvailability.technicianSales.status).toBe("not_requested");
    expect(skippedContext.post).not.toHaveBeenCalled();
  });

  it("keeps null sales cells unknown and retains opportunity-only activity", async () => {
    const row = [...sales]; row[1] = null as any; row[3] = null as any; row[2] = 0;
    const payload = await context("pipeline", { reports: { "172": [row] } }).invoke();
    expect(payload.salesFunnel.totalSales).toBeNull();
    expect(payload.salesFunnel.totalOpportunities).toBe(4);
    expect(payload.salesFunnel.byTechnician[0]).toMatchObject({ totalSales: null, closedAverageSale: 0, closeRate: null });
  });

  it("uses estimate subtotal and exact statuses; unknown status and age are visible", async () => {
    const payload = await context("pipeline", { records: { "/tenant/{tenant}/estimates": [
      { id: 1, status: { name: "Open", value: 0 }, subtotal: 0 },
      { id: 2, status: { name: "Dismissed", value: 2 }, subtotal: 5, soldOn: "2026-02-01T00:00:00Z" },
      { id: 3, status: { name: "Not sold", value: 99 }, subtotal: null, total: 900 },
      { id: 4, status: null, subtotal: 2 },
    ] } }).invoke();
    expect(payload.pipeline.open).toEqual({ count: 1, value: 0 });
    expect(payload.pipeline.sold).toEqual({ count: 0, value: 0 });
    expect(payload.pipeline.dismissed).toEqual({ count: 1, value: 5 });
    expect(payload.pipeline.unknown).toEqual({ count: 2, value: null });
    expect(payload.openByAge).toContainEqual({ bucket: "Unknown age", count: 1, value: 0 });
    expect(payload.conversionRate).toBeNull();
  });

  it("distinguishes complete empty estimates from undefined ratios and close timing", async () => {
    const payload = await context("pipeline").invoke();
    expect(payload.totalEstimates).toBe(0);
    expect(payload.pipeline.open).toEqual({ count: 0, value: 0 });
    expect(payload.conversionRate).toBeNull();
    expect(payload.averageDaysToClose).toBeNull();
  });

  it("does not relabel the estimate title as a customer identity", async () => {
    const payload = await context("pipeline", { records: { "/tenant/{tenant}/estimates": [{ id: 15, status: "Open", subtotal: 0, name: "Public estimate title", createdOn: "2025-12-01T00:00:00Z" }] } }).invoke();
    expect(payload.staleEstimates[0]).toMatchObject({ customer: null, estimateName: "Public estimate title", value: 0 });
  });
});

describe("campaign source truth and independent attribution", () => {
  const campaigns = [{ id: 1, name: "Public campaign" }];
  it("preserves bookings and tenant revenue when calls fail", async () => {
    const payload = await context("campaign", { records: { "/tenant/{tenant}/campaigns": campaigns, "/tenant/{tenant}/bookings": [{ campaignId: 1 }] }, failPaths: ["/v3/tenant/{tenant}/calls"] }).invoke();
    expect(payload.campaigns[0]).toMatchObject({ calls: null, bookings: 1, bookingsPerCallRatio: null, revenue: null });
    expect(payload.totals).toMatchObject({ calls: null, bookings: 1, unattributedCalls: null, tenantRevenueForPeriod: 0 });
    expect(payload._sourceAvailability.calls.status).toBe("failed");
  });

  it("does not fabricate an empty campaign catalogue after a failed source", async () => {
    const payload = await context("campaign", { failPaths: ["/tenant/{tenant}/campaigns"], reports: { "176": [lead] } }).invoke();
    expect(payload.campaigns).toBeNull();
    expect(payload.totals.calls).toBeNull();
    expect(payload.leadGeneration[0].leadGenerationOpportunity).toBe(2);
    expect(payload._sourceAvailability.campaigns.status).toBe("failed");
  });

  it("returns null failed report revenue and preserves a successful lead source", async () => {
    const payload = await context("campaign", { failReports: ["175"], reports: { "176": [lead] } }).invoke();
    expect(payload.totals.tenantRevenueForPeriod).toBeNull();
    expect(payload.leadGeneration[0].leadsSet).toBe(0);
    expect(payload._sourceAvailability.revenue.status).toBe("failed");
    expect(payload._sourceAvailability.leadGeneration.status).toBe("complete");
  });

  it("preserves null lead cells and offset revenue activity", async () => {
    const row = [...lead]; row[1] = null as any; row[2] = 0; row[9] = 4; row[11] = -4;
    const payload = await context("campaign", { reports: { "176": [row] } }).invoke();
    expect(payload.leadGeneration[0]).toMatchObject({ leadGenerationOpportunity: null, leadsSet: 0, adjustmentRevenue: 4, totalRevenue: 0, nonJobRevenue: -4 });
  });

  it("keeps null tenant revenue cells unknown and treats zero-call ratios as undefined", async () => {
    const row = [...revenue]; row[8] = null as any;
    const payload = await context("campaign", { records: { "/tenant/{tenant}/campaigns": campaigns }, reports: { "175": [row] } }).invoke();
    expect(payload.totals.tenantRevenueForPeriod).toBeNull();
    expect(payload.campaigns[0].bookingsPerCallRatio).toBeNull();
    expect(payload._sourceAvailability.revenue.status).toBe("complete");
  });

  it("describes the consumed sources and avoids an invoice attribution or ROI promise", () => {
    const description = context("campaign").description;
    expect(description).toMatch(/tenant-wide|unallocated/i);
    expect(description).not.toMatch(/invoice pages|attributed revenue|booked-call conversion/i);
  });
});

describe("membership fields preserve source and cell availability", () => {
  it("preserves conversion metrics when the membership summary fails", async () => {
    const payload = await context("membership", { failReports: ["182"], reports: { "178": [conversion] } }).invoke();
    expect(payload.activeMemberships).toBeNull();
    expect(payload.membershipTypes).toBeNull();
    expect(payload.activeToCancellationRatio).toBeNull();
    expect(payload.conversionTotals).toEqual({ opportunities: 4, converted: 2, conversionRate: 50 });
    expect(payload._sourceAvailability.membershipSummary.status).toBe("failed");
    expect(payload._sourceAvailability.serviceRevenue.status).toBe("not_requested");
  });

  it("nulls only unavailable membership cells and preserves distinct status movements", async () => {
    const row = [...membership]; row[7] = null as any;
    const payload = await context("membership", { reports: { "182": [row], "178": [conversion] } }).invoke();
    expect(payload).toMatchObject({ activeMemberships: 8, newSignups: null, cancellations: 2, expirations: 3, suspended: 1, deleted: 4 });
    expect(payload.membershipTypes[0]).toMatchObject({ newSales: null, activeAtEnd: 8, canceled: 2, expired: 3 });
    expect(payload.conversionTotals.conversionRate).toBe(50);
  });

  it("keeps unavailable conversion counts and failed optional invoice revenue null", async () => {
    const row = [...conversion]; row[1] = null as any;
    const payload = await context("membership", { reports: { "178": [row], "182": [membership] }, failPaths: ["/tenant/{tenant}/invoices"] }).invoke({ ...PERIOD, includeServiceRevenue: true });
    expect(payload.conversionTotals).toEqual({ opportunities: null, converted: 2, conversionRate: null });
    expect(payload.conversionByBusinessUnit[0]).toMatchObject({ opportunities: null, converted: 2, conversionRate: 50 });
    expect(payload.totalServiceRevenue).toBeNull();
    expect(payload.activeMemberships).toBe(8);
    expect(payload._sourceAvailability.serviceRevenue.status).toBe("failed");
  });

  it("returns measured empty-source zeros with undefined zero-denominator ratios", async () => {
    const payload = await context("membership").invoke({ ...PERIOD, includeServiceRevenue: true });
    expect(payload).toMatchObject({ activeMemberships: 0, cancellations: 0, totalServiceRevenue: 0, activeToCancellationRatio: null });
    expect(payload.conversionTotals).toEqual({ opportunities: 0, converted: 0, conversionRate: null });
    expect(payload._sourceAvailability.serviceRevenue.status).toBe("complete");
  });
});

describe("provider precision survives projection and aggregation", () => {
  it("preserves sub-cent sales/subtotals and provider rate/options precision", async () => {
    const row = [...sales]; row[1] = 123.456789; row[2] = 299.995; row[3] = 0.333333333333; row[5] = 1.23456789;
    const payload = await context("pipeline", { reports: { "172": [row] }, records: { "/tenant/{tenant}/estimates": [{ status: "Open", subtotal: 1.005, createdOn: "2026-02-02T00:00:00Z" }] } }).invoke();
    expect(payload.salesFunnel.totalSales).toBe(123.456789);
    expect(payload.salesFunnel.byTechnician[0]).toMatchObject({ totalSales: 123.456789, closedAverageSale: 299.995, optionsPerOpportunity: 1.23456789, closeRate: 0.333333333333 * 100 });
    expect(payload.pipeline.open.value).toBe(1.005);
  });

  it("preserves native lead monetary and fractional rate cells", async () => {
    const row = [...lead]; row[4] = 11.005; row[3] = 0.123456789;
    const payload = await context("campaign", { reports: { "176": [row] } }).invoke();
    expect(payload.leadGeneration[0]).toMatchObject({ averageLeadSale: 11.005, leadConversionRate: 0.123456789 });
  });

  it("sums invoice totals before any display rounding and preserves provider conversion precision", async () => {
    const row = [...conversion]; row[3] = 0.123456789;
    const payload = await context("membership", { records: { "/tenant/{tenant}/invoices": [{ total: "11.005" }, { total: "2.005" }] }, reports: { "178": [row] } }).invoke({ ...PERIOD, includeServiceRevenue: true });
    expect(payload.totalServiceRevenue).toBeCloseTo(13.01, 12);
    expect(payload.conversionByBusinessUnit[0].conversionRate).toBe(0.123456789 * 100);
  });
});
