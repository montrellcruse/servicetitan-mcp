import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ToolRegistry } from "../../src/registry.js";
import { registerIntelligenceRevenueTool, sumReport175TotalRevenue } from "../../src/domains/intelligence/revenue.js";
import { getReportContract } from "../../src/domains/intelligence/report-executor.js";

const ORIGINAL_SHAPING = process.env.ST_RESPONSE_SHAPING;
const PERIOD = { startDate: "2026-09-01", endDate: "2026-09-30" };

function report(id: string, data: unknown[][] = []) {
  return {
    fields: getReportContract(id).fields.map((name) => ({ name, label: name })),
    data,
    page: 1,
    pageSize: 1000,
    hasMore: false,
    totalCount: data.length,
  };
}

function revenue(name: string, changes: Record<number, unknown> = {}) {
  const row: unknown[] = [name, 100, 25, 0.5, 4, 2, 4.75, 0, 100, 0];
  for (const [index, value] of Object.entries(changes)) row[Number(index)] = value;
  return row;
}

function productivity(name: string, changes: Record<number, unknown> = {}) {
  const row: unknown[] = [name, 123.456789, 0.123456789, 0.0049, 2.3456789, 1.23456789, 1, 0, 100, 0];
  for (const [index, value] of Object.entries(changes)) row[Number(index)] = value;
  return row;
}

function sales(name: string, changes: Record<number, unknown> = {}) {
  const row: unknown[] = [name, 10.0049, 9.123456, 0.123456789, 3, 1.987654321, 0, 100, 0];
  for (const [index, value] of Object.entries(changes)) row[Number(index)] = value;
  return row;
}

function context(feeds: Record<string, unknown> = {}, paymentFeed: unknown = { data: [], hasMore: false, page: 1 }) {
  let handler: ((params: unknown) => Promise<any>) | undefined;
  const post = vi.fn(async (path: string) => {
    const id = path.match(/reports\/(\d+)\/data/)?.[1];
    if (!id) throw new Error("Unexpected offline report route");
    const feed = feeds[id] ?? report(id);
    if (feed instanceof Error) throw feed;
    return feed;
  });
  const get = vi.fn(async () => {
    if (paymentFeed instanceof Error) throw paymentFeed;
    return paymentFeed;
  });
  const registry = {
    timezone: "America/New_York",
    reportBindings: {},
    register: (definition: { handler: typeof handler }) => { handler = definition.handler; },
  } as unknown as ToolRegistry;
  registerIntelligenceRevenueTool({ post, get } as unknown as ServiceTitanClient, registry);
  return {
    post, get,
    run: async (extra: Record<string, unknown> = {}) => {
      const response = await handler!({ ...PERIOD, ...extra });
      expect(response.isError).not.toBe(true);
      return JSON.parse(response.content[0].text);
    },
  };
}

describe("revenue summary accuracy", () => {
  beforeEach(() => { process.env.ST_RESPONSE_SHAPING = "false"; });
  afterEach(() => {
    if (ORIGINAL_SHAPING === undefined) delete process.env.ST_RESPONSE_SHAPING;
    else process.env.ST_RESPONSE_SHAPING = ORIGINAL_SHAPING;
  });

  it("does not label unweighted unequal-BU means as native pooled ratios", async () => {
    const ctx = context({
      "175": report("175", [revenue("Large"), revenue("Small", { 4: 1, 5: 1 })]),
      "177": report("177", [productivity("Large"), productivity("Small", { 1: 999, 2: 0.9 })]),
      "179": report("179", [sales("Large"), sales("Small", { 3: 0.9, 4: 100 })]),
    });
    const p = await ctx.run({ includeProductivityMetrics: true });
    expect(p.productivity.averageRevenuePerHour).toBeNull();
    expect(p.productivity.averageBillableEfficiency).toBeNull();
    expect(p.productivity.averageTasksPerOpportunity).toBeNull();
    expect(p.productivity.averageOptionsPerOpportunity).toBeNull();
    expect(p.sales.averageClosedAvgSale).toBeNull();
    expect(p.sales.averageCloseRate).toBeNull();
    expect(p.sales.averageOptionsPerOpportunity).toBeNull();
    expect(p._metricAvailability["productivity.averageRevenuePerHour"].reason).toMatch(/hours/i);
    expect(p._metricAvailability["sales.averageCloseRate"].reason).toMatch(/closed/i);
  });

  it("preserves provider BU precision and sums before any currency display rounding", async () => {
    const ctx = context({
      "175": report("175", [revenue("A", { 1: 0.0049, 8: 0.0049 }), revenue("B", { 1: 0.0049, 8: 0.0049 })]),
      "177": report("177", [productivity("A")]),
      "179": report("179", [sales("A")]),
    });
    const p = await ctx.run({ includeProductivityMetrics: true });
    expect(p.totalRevenue).toBeCloseTo(0.0098, 12);
    const a = p.byBusinessUnit.find((bu: any) => bu.name === "A");
    expect(a.completedRevenue).toBe(0.0049);
    expect(a.opportunityJobAverage).toBe(25);
    expect(a.customerSatisfaction).toBe(4.75);
    expect(a.productivity.billableEfficiency).toBe(0.123456789);
    expect(a.productivity.tasksPerOpportunity).toBe(2.3456789);
    expect(a.sales.totalSales).toBe(10.0049);
    expect(a.sales.closeRate).toBeCloseTo(12.3456789, 12);
  });

  it("retains zero-money opportunities, cancellation components and all-zero native rows", async () => {
    const p = await context({ "175": report("175", [
      revenue("Count only", { 1: 0, 2: 0, 3: 0, 4: 7, 5: 0, 6: 0, 8: 0 }),
      revenue("Offset", { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: -5, 8: 0, 9: 5 }),
      ["Zero", 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]) }).run();
    expect(p.byBusinessUnit).toHaveLength(3);
    expect(p.totalOpportunities).toBe(7);
    expect(p.revenueBreakdown).toMatchObject({ nonJobRevenue: 5, adjustmentRevenue: -5 });
    expect(p.totalRevenue).toBe(0);
    expect(p.overallConversionRate).toBe(0);
  });

  it("marks failed revenue unknown while retaining successful Sales values", async () => {
    const p = await context({ "175": new Error("offline revenue failure"), "179": report("179", [sales("Sales only")]) }).run();
    expect(p._sourceAvailability.report175.status).toBe("failed");
    expect(p._sourceAvailability.report179.status).toBe("complete");
    expect(p._sourceAvailability.report177.status).toBe("not_requested");
    expect(p.totalRevenue).toBeNull();
    expect(p.totalOpportunities).toBeNull();
    expect(p.avgTicket).toBeNull();
    expect(p.sales.totalSales).toBe(10.0049);
    expect(p.byBusinessUnit[0].completedRevenue).toBeNull();
    expect(p._warnings.join(" ")).toContain("offline revenue failure");
  });

  it("keeps a null provider metric unknown without discarding its measured siblings", async () => {
    const p = await context({ "175": report("175", [revenue("Partial", { 8: null, 1: 12.345678 })]) }).run();
    expect(p._sourceAvailability.report175.status).toBe("complete");
    expect(p.totalRevenue).toBeNull();
    expect(p.revenueBreakdown.completedRevenue).toBe(12.345678);
    expect(p.byBusinessUnit[0].totalRevenue).toBeNull();
    expect(p.byBusinessUnit[0].completedRevenue).toBe(12.345678);
    expect(p._metricAvailability.totalRevenue.available).toBe(false);
  });

  it("preserves null native productivity and sales cells rather than inventing zero", async () => {
    const p = await context({
      "177": report("177", [productivity("Partial", { 2: null })]),
      "179": report("179", [sales("Partial", { 3: null })]),
    }).run({ includeProductivityMetrics: true });
    expect(p.byBusinessUnit[0].productivity.billableEfficiency).toBeNull();
    expect(p.byBusinessUnit[0].productivity.revenuePerHour).toBe(123.456789);
    expect(p.byBusinessUnit[0].sales.closeRate).toBeNull();
    expect(p.sales.totalSales).toBe(10.0049);
  });

  it("treats an invalid source as failed while preserving valid sibling sources", async () => {
    const p = await context({ "175": report("175", [revenue("Bad", { 8: "12cash" })]), "179": report("179", [sales("Valid")]) }).run();
    expect(p._sourceAvailability.report175.status).toBe("failed");
    expect(p.totalRevenue).toBeNull();
    expect(p.sales.totalSales).toBe(10.0049);
    expect(p._warnings.length).toBeGreaterThan(0);
  });

  it("distinguishes successful empty, failed, and not-requested sources", async () => {
    const p = await context().run({ includeCollections: true });
    expect(p.totalRevenue).toBe(0);
    expect(p.totalOpportunities).toBe(0);
    expect(p.avgTicket).toBeNull();
    expect(p.overallConversionRate).toBeNull();
    expect(p.paymentsReceivedInPeriod).toBe(0);
    expect(p.productivity.totalUpsold).toBeNull();
    expect(p._sourceAvailability.report175.status).toBe("complete");
    expect(p._sourceAvailability.payments.status).toBe("complete");
    expect(p._sourceAvailability.report177.status).toBe("not_requested");
  });

  it("leaves failed payments and explicit missing amounts unknown", async () => {
    const failed = await context({ "175": report("175", [revenue("A")]) }, new Error("offline payments failure")).run({ includeCollections: true });
    expect(failed.paymentsReceivedInPeriod).toBeNull();
    expect(failed.totalRevenue).toBe(100);
    expect(failed._sourceAvailability.payments.status).toBe("failed");
    const missing = await context({}, { data: [{ amount: null, total: 999 }], hasMore: false, page: 1 }).run({ includeCollections: true });
    expect(missing.paymentsReceivedInPeriod).toBeNull();
  });

  it("labels the converted-denominator average as custom and exposes native job average separately", async () => {
    const p = await context({ "175": report("175", [revenue("A", { 1: 200, 2: 20, 4: 10, 5: 1, 8: 200 })]) }).run();
    expect(p.avgTicket).toBe(200);
    expect(p.byBusinessUnit[0].opportunityJobAverage).toBe(20);
    expect(p.metricDefinitions.avgTicket).toMatch(/ConvertedJobs/);
    expect(p.metricDefinitions.avgTicket).toMatch(/custom|derived/i);
    expect(p.metricDefinitions.avgTicket).toMatch(/OpportunityJobAverage/);
  });

  it("uses typed numeric-array BU filters without changing report dates", async () => {
    const ctx = context();
    await ctx.run({ businessUnitId: 7 });
    for (const [, body] of ctx.post.mock.calls) {
      expect((body as any).parameters).toEqual([
        { name: "From", value: "2026-09-01" }, { name: "To", value: "2026-09-30" },
        { name: "BusinessUnitIds", value: [7] },
      ]);
    }
  });

  it("merges normalized cross-source aliases once, without double-counting revenue", async () => {
    const p = await context({ "175": report("175", [revenue("Unit A")]), "179": report("179", [sales("Unit A ")]) }).run();
    expect(p.byBusinessUnit).toHaveLength(1);
    expect(p.totalRevenue).toBe(100);
    expect(p.sales.totalSales).toBe(10.0049);
  });

  it("does not round fractional counts into observed integer jobs", async () => {
    const p = await context({ "175": report("175", [revenue("Invalid count", { 4: 1.25 })]), "179": report("179", [sales("Valid")]) }).run();
    expect(p._sourceAvailability.report175.status).toBe("failed");
    expect(p.totalOpportunities).toBeNull();
    expect(p.sales.totalSales).toBe(10.0049);
  });

  it("does not hide missing revenue inside its exported additive helper", () => {
    expect(sumReport175TotalRevenue(report("175", [revenue("Missing", { 8: null })]))).toBeNull();
    expect(sumReport175TotalRevenue(report("175", [revenue("A", { 8: 0.0049 }), revenue("B", { 8: 0.0049 })]))).toBeCloseTo(0.0098, 12);
  });
});
