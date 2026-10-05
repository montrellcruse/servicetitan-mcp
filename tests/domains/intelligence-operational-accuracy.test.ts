import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";
import { registerIntelligenceDailySnapshotTool } from "../../src/domains/intelligence/operational.js";
import { registerIntelligenceInvoiceTrackingTool } from "../../src/domains/intelligence/invoice-tracking.js";
import { registerIntelligenceCsrPerformanceTool } from "../../src/domains/intelligence/csr-performance.js";
import { executeReport } from "../../src/domains/intelligence/report-executor.js";

vi.mock("../../src/domains/intelligence/report-executor.js", () => ({ executeReport: vi.fn() }));

const originalShaping = process.env.ST_RESPONSE_SHAPING;
const report = vi.mocked(executeReport);
const period = { startDate: "2026-09-01", endDate: "2026-09-30" };
const emptyReport = { fields: [], data: [], hasMore: false };

function context(register: (client: ServiceTitanClient, registry: ToolRegistry) => void) {
  const get = vi.fn(async () => ({ data: [], hasMore: false, page: 1 }));
  let handler: ((params: unknown) => Promise<ToolResponse>) | undefined;
  const registry = {
    timezone: "UTC",
    reportBindings: {},
    register: (definition: { handler: (params: unknown) => Promise<ToolResponse> }) => { handler = definition.handler; },
  } as unknown as ToolRegistry;
  register({ get } as unknown as ServiceTitanClient, registry);
  return { get, run: async (params: unknown) => {
    const response = await handler!(params);
    expect(response.isError).not.toBe(true);
    return JSON.parse(response.content[0].text!) as Record<string, any>;
  } };
}

function invoice(number: string, amount: unknown) {
  return [number, "Fixture customer", "fixture@example.invalid", amount, 0, 0, null, null, "Fixture job", "Fixture type", "Fixture BU", "Fixture technician"];
}

function csr(name: string, revenue: unknown, status: unknown = "Completed") {
  return [name, "Fixture job", "Fixture invoice", "Fixture type", null, null, null, null, null, status, "Fixture campaign", revenue, "Fixture category"];
}

describe("operational intelligence source accuracy", () => {
  beforeEach(() => {
    process.env.ST_RESPONSE_SHAPING = "false";
    report.mockReset();
    report.mockResolvedValue(emptyReport);
  });
  afterEach(() => {
    if (originalShaping === undefined) delete process.env.ST_RESPONSE_SHAPING;
    else process.env.ST_RESPONSE_SHAPING = originalShaping;
  });

  it("preserves sent results without claiming100percent or all sent when not-sent fails", async () => {
    report.mockImplementation(async (_client, id) => {
      if (id === "2282") throw new Error("sanitized report failure");
      return { ...emptyReport, data: [invoice("Fixture sent", 12.5)] };
    });
    const p = await context(registerIntelligenceInvoiceTrackingTool).run(period);
    expect(p).toMatchObject({ sentCount: 1, totalAmountSent: 12.5, notSentCount: null, totalAmountNotSent: null, totalInvoices: null, sendRate: null });
    expect(p._sourceAvailability.invoicesSent.status).toBe("complete");
    expect(p._sourceAvailability.invoicesNotSent.status).toBe("failed");
    expect(p._metricAvailability.sendRate.reason).toBeTruthy();
    expect(p.highlights.join(" ")).not.toMatch(/all .*sent|100%/i);
    expect(p._warnings).toHaveLength(1);
  });

  it("does not certify not-sent deduplication if the sent report fails", async () => {
    report.mockImplementation(async (_client, id) => {
      if (id === "2281") throw new Error("sanitized report failure");
      return { ...emptyReport, data: [invoice("Fixture observed", 20)] };
    });
    const p = await context(registerIntelligenceInvoiceTrackingTool).run(period);
    expect(p).toMatchObject({ sentCount: null, notSentCount: null, reportedNotSentCount: 1, totalInvoices: null, sendRate: null, notSentDeduplicationComplete: false });
    expect(p._sourceAvailability.invoicesNotSent.status).toBe("complete");
  });

  it("keeps valid zero invoice amounts and treats null amounts as unknown", async () => {
    report.mockImplementation(async (_client, id) => ({ ...emptyReport, data: id === "2281" ? [invoice("Fixture zero", 0), invoice("Fixture missing", null)] : [] }));
    const p = await context(registerIntelligenceInvoiceTrackingTool).run(period);
    expect(p.sentCount).toBe(2);
    expect(p.sendRate).toBe(100);
    expect(p.totalAmountSent).toBeNull();
    expect(p._metricAvailability.totalAmountSent.reason).toBeTruthy();
  });

  it("marks an empty successful send-rate denominator undefined instead of all0sent", async () => {
    const p = await context(registerIntelligenceInvoiceTrackingTool).run(period);
    expect(p).toMatchObject({ sentCount: 0, notSentCount: 0, totalAmountSent: 0, totalAmountNotSent: 0, sendRate: null });
    expect(p._sourceAvailability.invoicesSent.status).toBe("complete");
    expect(p.highlights.join(" ")).not.toMatch(/all 0 .*sent|0%/i);
  });

  it("does not turn failed calls into no missed calls or zero call counts", async () => {
    const c = context(registerIntelligenceDailySnapshotTool);
    c.get.mockImplementation(async (path: string) => {
      if (path.includes("/calls")) throw new Error("sanitized calls failure");
      return { data: [], hasMore: false, page: 1 };
    });
    const p = await c.run({ date: "2026-09-01" });
    expect(p.calls).toEqual({ total: null, booked: null, missed: null });
    expect(p._sourceAvailability.calls.status).toBe("failed");
    expect(p.highlights.join(" ")).not.toMatch(/no missed calls/i);
    expect(p.revenue.invoiced).toBe(0);
  });

  it("separates canceled appointments from pending appointments", async () => {
    const c = context(registerIntelligenceDailySnapshotTool);
    c.get.mockImplementation(async (path: string) => ({ data: path.endsWith("/appointments") ? [{ status: "Done" }, { status: "Canceled" }, { status: "Scheduled" }] : [], hasMore: false, page: 1 }));
    const p = await c.run({ date: "2026-09-01" });
    expect(p.appointments).toMatchObject({ total: 3, completed: 1, pending: 1, canceled: 1 });
  });

  it("preserves a zero-revenue activity row but marks missing invoice revenue unknown", async () => {
    const c = context(registerIntelligenceDailySnapshotTool);
    c.get.mockImplementation(async (path: string) => ({ data: path.endsWith("/invoices") ? [{ total: 0 }, { total: null }] : [], hasMore: false, page: 1 }));
    const p = await c.run({ date: "2026-09-01" });
    expect(p.revenue.invoiced).toBeNull();
    expect(p._sourceAvailability.invoices.status).toBe("complete");
    expect(p._metricAvailability["revenue.invoiced"].reason).toBeTruthy();
    expect(p.revenue.collected).toBe(0);
  });

  it("does not claim an unavailable upcoming report has zero scheduled jobs", async () => {
    report.mockRejectedValue(new Error("sanitized upcoming failure"));
    const p = await context(registerIntelligenceDailySnapshotTool).run({ date: "2026-09-01" });
    expect(p.upcomingJobs.total).toBeNull();
    expect(p._sourceAvailability.upcomingJobs.status).toBe("failed");
    expect(p.highlights.join(" ")).not.toMatch(/0 jobs scheduled/i);
  });

  it("returns unavailable CSR aggregates instead of a zero-performance team", async () => {
    report.mockRejectedValue(new Error("sanitized CSR failure"));
    const p = await context(registerIntelligenceCsrPerformanceTool).run(period);
    expect(p.csrs).toBeNull();
    expect(Object.values(p.teamAverages).every(value => value === null)).toBe(true);
    expect(p._sourceAvailability.csrReport.status).toBe("failed");
    expect(p._metricAvailability.teamAverages.reason).toBeTruthy();
  });

  it("preserves CSR booking activity with unknown revenue and retains real zero", async () => {
    report.mockResolvedValue({ ...emptyReport, data: [csr("Fixture unknown CSR", null), csr("Fixture zero CSR", 0)] });
    const p = await context(registerIntelligenceCsrPerformanceTool).run(period);
    const unknown = p.csrs.find((x: any) => x.name === "Fixture unknown CSR");
    const zero = p.csrs.find((x: any) => x.name === "Fixture zero CSR");
    expect(unknown).toMatchObject({ jobsBooked: 1, totalRevenue: null, avgTicket: null });
    expect(unknown.jobTypes[0]).toMatchObject({ jobs: 1, revenue: null });
    expect(zero).toMatchObject({ jobsBooked: 1, totalRevenue: 0, avgTicket: 0 });
    expect(p.teamAverages.totalRevenue).toBeNull();
    expect(p.teamAverages.jobsBooked).toBe(1);
  });

  it("does not classify an unknown CSR job status as open", async () => {
    report.mockResolvedValue({ ...emptyReport, data: [csr("Fixture CSR", 10, null)] });
    const p = await context(registerIntelligenceCsrPerformanceTool).run(period);
    expect(p.csrs[0].conversionMetrics).toMatchObject({ unknownStatusJobs: 1, openJobs: 0, completionRate: null, cancellationRate: null });
    expect(p.csrs[0].conversionMetrics.invoiceRate).toBe(100);
  });

  it("keeps successful empty CSR populations distinct from defined averages", async () => {
    const p = await context(registerIntelligenceCsrPerformanceTool).run(period);
    expect(p.csrs).toEqual([]);
    expect(p._sourceAvailability.csrReport.status).toBe("complete");
    expect(p.teamAverages.avgTicket).toBeNull();
    expect(p.teamAverages.completionRate).toBeNull();
  });

  it("preserves provider monetary precision until highlight formatting", async () => {
    const daily = context(registerIntelligenceDailySnapshotTool);
    daily.get.mockImplementation(async (path: string) => ({ data: path.endsWith("/invoices") ? [{ total: 0.0049 }, { total: 0.0049 }] : [], hasMore: false, page: 1 }));
    expect((await daily.run({ date: "2026-09-01" })).revenue.invoiced).toBe(0.0098);
    report.mockImplementation(async (_client, id) => ({ ...emptyReport, data: id === "2281" ? [invoice("Fixture first", 0.0049), invoice("Fixture second", 0.0049)] : [] }));
    expect((await context(registerIntelligenceInvoiceTrackingTool).run(period)).totalAmountSent).toBe(0.0098);
    report.mockResolvedValue({ ...emptyReport, data: [csr("Fixture precise CSR", 12.123456)] });
    const p = await context(registerIntelligenceCsrPerformanceTool).run(period);
    expect(p.csrs[0].totalRevenue).toBe(12.123456);
    expect(p.csrs[0].topCampaigns[0].revenue).toBe(12.123456);
  });
});
