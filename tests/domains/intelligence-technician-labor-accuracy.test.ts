import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ToolRegistry } from "../../src/registry.js";
import { registerIntelligenceTechnicianPerformanceTool } from "../../src/domains/intelligence/technician-performance.js";
import { registerIntelligenceLaborCostTool } from "../../src/domains/intelligence/labor-cost.js";
import { executeReport, getReportContract } from "../../src/domains/intelligence/report-executor.js";

vi.mock("../../src/domains/intelligence/report-executor.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/domains/intelligence/report-executor.js")>(),
  executeReport: vi.fn(),
}));

const reports = vi.mocked(executeReport);
const period = { startDate: "2026-01-01", endDate: "2026-01-31" };

function report(key: string, data: unknown[][] = [], grossPay = false) {
  return {
    fields: [...getReportContract(key).fields, ...(grossPay ? ["GrossPay"] : [])].map((name) => ({ name })),
    data, page: 1, pageSize: 500, hasMore: false, complete: true, pagesFetched: 1,
    binding: { category: "fixture", reportId: Number(key) },
  };
}

function revenue(id = 101, amount: unknown = 10): unknown[] {
  return ["Fixture technician", amount, 5, 0.5, 2, 1, 4, id, 0, 10];
}

function productivity(id = 101, rate: unknown = 3): unknown[] {
  return ["Fixture technician", rate, 0.25, 0, 0, 0, 0, id, 0, 0];
}

function tool(kind: "technician" | "labor") {
  let handler: (params: unknown) => Promise<any>;
  const registry = {
    timezone: "UTC", reportBindings: undefined,
    register: (definition: { handler: typeof handler }) => { handler = definition.handler; },
  } as unknown as ToolRegistry;
  const client = {} as ServiceTitanClient;
  if (kind === "technician") registerIntelligenceTechnicianPerformanceTool(client, registry);
  else registerIntelligenceLaborCostTool(client, registry);
  return async (args: Record<string, unknown> = {}) => {
    const result = await handler!({ ...period, ...args });
    expect(result.isError).not.toBe(true);
    return result.structuredContent ?? JSON.parse(result.content[0].text);
  };
}

beforeEach(() => {
  reports.mockReset();
  reports.mockImplementation(async (_client, key) => report(key));
});

describe("technician source availability and source meaning", () => {
  it("retains productivity when revenue fails without manufacturing revenue zero", async () => {
    reports.mockImplementation(async (_client, key) => {
      if (key === "168") throw new Error("Fixture revenue unavailable");
      return report(key, key === "170" ? [productivity()] : []);
    });
    const result = await tool("technician")();
    expect(result.technicians[0]).toMatchObject({ revenue: null, revenuePerHour: 3, convertedJobs: null });
    expect(result._sourceAvailability.revenue.status).toBe("failed");
    expect(result._sourceAvailability.productivity.status).toBe("complete");
    expect(result._warnings.join(" ")).toContain("Fixture revenue unavailable");
  });

  it("distinguishes disabled extended metrics from failed requested metrics", async () => {
    reports.mockImplementation(async (_client, key) => {
      if (key === "171") throw new Error("Fixture memberships unavailable");
      return report(key, key === "168" ? [revenue()] : []);
    });
    const disabled = await tool("technician")();
    expect(disabled.technicians[0].memberships.sold).toBeNull();
    expect(disabled._sourceAvailability.memberships.status).toBe("not_requested");
    expect(reports.mock.calls.some((call) => call[1] === "171")).toBe(false);
    const requested = await tool("technician")({ includeExtendedMetrics: true });
    expect(requested.technicians[0].memberships.sold).toBeNull();
    expect(requested._sourceAvailability.memberships.status).toBe("failed");
  });

  it("keeps provider null distinct from literal zero and does not average unknown as zero", async () => {
    reports.mockImplementation(async (_client, key) => report(key,
      key === "168" ? [revenue(101, null), revenue(102, 0)]
        : key === "170" ? [productivity(101), productivity(102)] : []));
    const result = await tool("technician")();
    expect(result.technicians.find((row: any) => row.id === 101).revenue).toBeNull();
    expect(result.technicians.find((row: any) => row.id === 102).revenue).toBe(0);
    expect(result.teamAverages.revenue).toBeNull();
  });

  it("does not label converted jobs as completed jobs or completed jobs per day", async () => {
    reports.mockImplementation(async (_client, key) => report(key, key === "168" ? [revenue()] : []));
    const result = await tool("technician")();
    expect(result.technicians[0]).toMatchObject({ convertedJobs: 1, jobsCompleted: null, jobsPerDay: null });
    expect(result._metricAvailability.jobsCompleted.reason).toContain("completed");
  });

  it("retains technicians whose only activity is a negative financial adjustment", async () => {
    const negative = ["Fixture adjustment", -10, 0, 0, 0, 0, 0, 103, 0, -10];
    reports.mockImplementation(async (_client, key) => report(key, key === "168" ? [negative] : []));
    const result = await tool("technician")();
    expect(result.technicians).toHaveLength(1);
    expect(result.technicians[0].revenue).toBe(-10);
  });

  it("does not silently overwrite duplicate technician grain", async () => {
    reports.mockImplementation(async (_client, key) => report(key,
      key === "168" ? [revenue(101, 10), revenue(101, 20)] : key === "170" ? [productivity()] : []));
    const result = await tool("technician")();
    expect(result.technicians[0]).toMatchObject({ revenue: null, revenuePerHour: 3 });
    expect(result._warnings.join(" ")).toMatch(/duplicate.*technician/i);
  });

  it("preserves provider productivity precision without reconstructing hours", async () => {
    const row = productivity(101, 137.1234567890123);
    row[2] = 0.3141592653589793;
    reports.mockImplementation(async (_client, key) => report(key, key === "170" ? [row] : []));
    const result = await tool("technician")();
    expect(result.technicians[0].revenuePerHour).toBe(137.1234567890123);
    expect(result.technicians[0].billableEfficiency).toBe(0.3141592653589793);
  });

  it("keeps conversion and close rates in percent units while efficiency remains a fraction", async () => {
    reports.mockImplementation(async (_client, key) => report(key,
      key === "168" ? [revenue()]
        : key === "170" ? [productivity()]
          : key === "169" ? [["Fixture technician", 2, 1, 5, 0.25, 1, 5, 5, 101]]
            : key === "171" ? [["Fixture technician", 4, 1, 0.25, 101]]
              : key === "173" ? [["Fixture technician", "Fixture BU", 8, 4, 0.125, 1, 1, "Fixture division", 0, 0, 0, 101]]
                : key === "174" ? [["Fixture technician", 8, 4, 0.375, 1, 101]] : []));
    const result = await tool("technician")({ includeExtendedMetrics: true });
    expect(result.technicians[0]).toMatchObject({
      conversionRate: 50, billableEfficiency: 0.25,
      leadGeneration: { conversionRate: 25 }, memberships: { conversionRate: 25 },
      salesFromTechLeads: { closeRate: 12.5 }, salesFromMarketingLeads: { closeRate: 37.5 },
    });
  });

  it("leaves every team mean null when successfully requested reports contain no technicians", async () => {
    const result = await tool("technician")({ includeExtendedMetrics: true });
    expect(result.technicians).toEqual([]);
    expect(Object.values(result._sourceAvailability).every((source: any) => source.status === "complete")).toBe(true);
    const values = Object.values(result.teamAverages).flatMap((value) =>
      value !== null && typeof value === "object" ? Object.values(value) : [value]);
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((value) => value === null)).toBe(true);
  });
});

describe("labor report financial completeness", () => {
  it("does not mark an optional GrossPay column with a null cell as measured zero", async () => {
    reports.mockResolvedValue(report("166", [["Fixture employee", "2026-01-02", 8, 0, 0, null]], true));
    const result = await tool("labor")();
    expect(result.totalHours).toBe(8);
    expect(result.totalGrossPay).toBeNull();
    expect(result.employees[0]).toMatchObject({ grossPay: null, avgHourlyRate: null });
    expect(result.costAvailability.available).toBe(false);
  });

  it("keeps valid employee pay but does not manufacture a complete mixed-pay total", async () => {
    reports.mockResolvedValue(report("166", [
      ["Fixture employee A", "2026-01-02", 8, 0, 0, 80],
      ["Fixture employee B", "2026-01-02", 4, 0, 0, null],
    ], true));
    const result = await tool("labor")();
    expect(result.totalHours).toBe(12);
    expect(result.totalGrossPay).toBeNull();
    expect(result.employees.find((row: any) => row.name === "Fixture employee A").grossPay).toBe(80);
    expect(result.employees.find((row: any) => row.name === "Fixture employee B").grossPay).toBeNull();
  });

  it("returns unknown hour totals after source failure instead of an empty measured result", async () => {
    reports.mockRejectedValue(new Error("Fixture labor unavailable"));
    const result = await tool("labor")();
    expect(result.totalHours).toBeNull();
    expect(result.regularHours).toBeNull();
    expect(result._sourceAvailability.laborHours.status).toBe("failed");
    expect(result.costAvailability.reason).toContain("unavailable");
    expect(result._warnings.join(" ")).toContain("Fixture labor unavailable");
  });

  it("retains literal zero pay and marks an undefined zero-hour effective rate null", async () => {
    reports.mockResolvedValue(report("166", [["Fixture zero", "2026-01-02", 0, 0, 0, 5]], true));
    const result = await tool("labor")();
    expect(result.totalGrossPay).toBe(5);
    expect(result.avgHourlyRate).toBeNull();
    expect(result.employees[0].avgHourlyRate).toBeNull();
    reports.mockResolvedValue(report("166", [["Fixture zero pay", "2026-01-02", 8, 0, 0, 0]], true));
    const zero = await tool("labor")();
    expect(zero.totalGrossPay).toBe(0);
    expect(zero.avgHourlyRate).toBe(0);
  });

  it("preserves empty successful hours as zero and an undefined rate as null", async () => {
    const result = await tool("labor")();
    expect(result.totalHours).toBe(0);
    expect(result._sourceAvailability.laborHours.status).toBe("complete");
    expect(result.avgHourlyRate).toBeNull();
    expect(result.overtimePercent).toBeNull();
  });

  it("retains available hour categories when a different hour cell is unknown", async () => {
    reports.mockResolvedValue(report("166", [["Fixture partial", "2026-01-02", 8, null, 0, 80]], true));
    const result = await tool("labor")();
    expect(result).toMatchObject({ regularHours: 8, overtimeHours: null, doubleOvertimeHours: 0, totalHours: null, totalGrossPay: 80, avgHourlyRate: null });
    expect(result.employees[0].totalHours).toBeNull();
    expect(result._sourceAvailability.laborHours.status).toBe("complete");
    expect(result._warnings.join(" ")).toContain("unavailable hour");
  });

  it("retains small positive provider hours and sums them before presentation", async () => {
    reports.mockResolvedValue(report("166", [
      ["Fixture small A", "2026-01-02", 0.004, 0, 0, 0],
      ["Fixture small B", "2026-01-02", 0.004, 0, 0, 0],
      ["Fixture small C", "2026-01-02", 0.004, 0, 0, 0],
    ], true));
    const result = await tool("labor")();
    expect(result.totalHours).toBe(0.012);
    expect(result.employees).toHaveLength(3);
    expect(result.employees.every((row: any) => row.totalHours === 0.004)).toBe(true);
    expect(result.byBusinessUnit).toEqual([]);
    expect(result._metricAvailability.businessUnits.available).toBe(false);
  });
});
