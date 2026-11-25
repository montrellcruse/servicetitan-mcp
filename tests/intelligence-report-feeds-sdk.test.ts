import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import type { ServiceTitanClient } from "../src/client.js";
import { createMcpServer, loadConfig } from "../src/server.js";

const period = { startDate: "2026-01-01", endDate: "2026-01-31" };
const fields = (...names: string[]) => names.map((name) => ({ name }));

type ReportPost = (
  path: string,
  body: unknown,
  query: { page: number },
) => Promise<unknown>;

async function withMcpReportFixture(
  toolName: string,
  post: ReportPost,
  run: (client: Client) => Promise<void>,
  reportBindings?: string,
): Promise<void> {
  const config = loadConfig({
    ST_CLIENT_ID: "fixture",
    ST_CLIENT_SECRET: "fixture",
    ST_APP_KEY: "fixture",
    ST_TENANT_ID: "123",
    ST_LOG_LEVEL: "error",
    ST_TIMEZONE: "UTC",
    ST_TOOL_PROFILE: "analytics",
    ST_TOOLS: toolName,
    ST_REPORT_BINDINGS: reportBindings,
  });
  const api = { post } as unknown as ServiceTitanClient;
  const { server } = await createMcpServer(config, { client: api });
  const client = new Client({ name: "report-fixture", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("intelligence report feeds over MCP", () => {
  it("combines rearranged columns from both pages of a configured labor report", async () => {
    await withMcpReportFixture(
      "intel_labor_cost",
      async (path, _body, { page }) => {
        expect(path).toBe("/tenant/{tenant}/report-category/custom/reports/9166/data");
        if (page === 1) {
          return {
            fields: fields("EmployeeName", "Date", "RegularHours", "OvertimeHours", "DoubleOvertimeHours", "GrossPay"),
            data: [["Ada", "2026-01-01", 7, 1, 0, 160]],
            page: 1,
            hasMore: true,
            totalCount: null,
          };
        }
        expect(page).toBe(2);
        return {
          fields: fields("GrossPay", "DoubleOvertimeHours", "Date", "RegularHours", "EmployeeName", "OvertimeHours"),
          data: [[0, 1, "2026-01-02", 4, "Lin", 2]],
          page: 2,
          hasMore: false,
          totalCount: 2,
        };
      },
      async (client) => {
        const response = await client.callTool({ name: "intel_labor_cost", arguments: period });
        expect(response.isError).not.toBe(true);
        expect(response.structuredContent).toMatchObject({
          totalHours: 15,
          regularHours: 11,
          overtimeHours: 3,
          doubleOvertimeHours: 1,
          totalGrossPay: 160,
          avgHourlyRate: 10.67,
          costAvailability: { available: true },
          employees: [
            { name: "Ada", totalHours: 8, grossPay: 160 },
            { name: "Lin", totalHours: 7, grossPay: 0 },
          ],
        });
        expect(response.structuredContent).not.toHaveProperty("_warnings");
      },
      '{"166":{"category":"custom","reportId":9166}}',
    );
  });

  it("discards a technician feed with an object-valued ID and keeps other scorecard metrics", async () => {
    let technicianId: unknown = { id: 10 };
    await withMcpReportFixture(
      "intel_technician_scorecard",
      async (path) => {
        switch (path) {
          case "/tenant/{tenant}/report-category/technician-dashboard/reports/168/data":
            return {
              fields: fields(
                "Name", "CompletedRevenue", "OpportunityJobAverage", "OpportunityConversionRate", "Opportunity",
                "ConvertedJobs", "CustomerSatisfaction", "TechnicianId", "AdjustmentRevenue", "CompletedRevenueWithAdjustments",
              ),
              data: [["Ada", "120.50", null, 0.5, 2, 1, null, technicianId, 0, 120.5]],
              hasMore: false,
            };
          case "/tenant/{tenant}/report-category/technician-dashboard/reports/169/data":
            return {
              fields: fields(
                "Name", "ReplacementOpportunity", "LeadsSet", "AverageLeadSale", "ReplacementLeadConversionRate",
                "ReplacementLeadsSold", "TotalLeadSales", "AverageReplacementLeadSale", "TechnicianId",
              ),
              data: [],
              hasMore: false,
            };
          case "/tenant/{tenant}/report-category/technician-dashboard/reports/170/data":
            return {
              fields: fields(
                "Name", "RevenuePerHour", "BillableEfficiency", "Upsold", "TasksPerOpportunity",
                "OptionsPerOpportunity", "RecallsCaused", "TechnicianId", "AdjustmentRevenue", "CompletedRevenueWithAdjustments",
              ),
              data: [["Ada", 60, 0.5, 0, 0, 0, 0, 10, 0, 0]],
              hasMore: false,
            };
          default:
            throw new Error(`Unexpected fixture request ${path}`);
        }
      },
      async (client) => {
        const request = { name: "intel_technician_scorecard", arguments: period };
        const partial = await client.callTool(request);
        expect(partial.isError).not.toBe(true);
        expect(partial.structuredContent).toMatchObject({
          technicians: [{ id: 10, revenue: 0, revenuePerHour: 60 }],
          _warnings: [expect.stringMatching(/Report 168.*invalid value for TechnicianId/)],
        });

        technicianId = "10";
        const complete = await client.callTool(request);
        expect(complete.isError).not.toBe(true);
        expect(complete.structuredContent).toMatchObject({
          technicians: [{ id: 10, revenue: 120.5, revenuePerHour: 60, customerSatisfaction: 0 }],
        });
        expect(complete.structuredContent).not.toHaveProperty("_warnings");
      },
    );
  });

  const revenuePage = {
    fields: fields(
      "Name", "CompletedRevenue", "OpportunityJobAverage", "OpportunityConversionRate",
      "Opportunity", "ConvertedJobs", "CustomerSatisfaction", "AdjustmentRevenue",
      "TotalRevenue", "NonJobRevenue",
    ),
    data: [["Plumbing", 50, 50, 1, 1, 1, 0, 0, 60, 10]],
    hasMore: false,
  };

  it.each([
    {
      failure: "a non-array row",
      badPage: () => ({ ...revenuePage, data: [{ Name: "Plumbing" }] }),
      reason: /page 2.*invalid row/,
    },
    {
      failure: "an invalid revenue cell",
      badPage: () => ({ ...revenuePage, data: [["Plumbing", "invalid", 50, 1, 1, 1, 0, 0, 60, 10]] }),
      reason: /page 2.*invalid value for CompletedRevenue/,
    },
    {
      failure: "invalid field metadata",
      badPage: () => ({ ...revenuePage, fields: [...revenuePage.fields, { label: "Missing name" }] }),
      reason: /page 2.*invalid field/,
    },
    {
      failure: "a changed field set",
      badPage: () => ({ ...revenuePage, fields: [...revenuePage.fields.slice(0, -1), { name: "OtherRevenue" }] }),
      reason: /fields changed between pages/,
    },
    {
      failure: "a duplicate field",
      badPage: () => ({ ...revenuePage, fields: [...revenuePage.fields, { name: "Name" }] }),
      reason: /page 2.*duplicate field/,
    },
    {
      failure: "a failed later request",
      badPage: () => { throw new Error("Synthetic report outage"); },
      reason: /page 2 failed/,
    },
    {
      failure: "an empty continuation page",
      badPage: () => ({ ...revenuePage, data: [] }),
      reason: /page 2.*no rows/,
    },
    {
      failure: "an incorrect reported page size",
      badPage: () => ({ ...revenuePage, pageSize: 500 }),
      reason: /page 2.*pageSize/,
    },
    {
      failure: "a total first declared on the final page that exceeds the row count",
      badPage: () => ({ ...revenuePage, totalCount: 3 }),
      reason: /returned 2 rows but totalCount was 3/,
    },
    {
      failure: "conflicting totals on different pages",
      firstPageTotal: 2,
      badPage: () => ({ ...revenuePage, totalCount: 3 }),
      reason: /changed totalCount from 2 to 3/,
    },
  ])("preserves sales and retries a revenue feed after $failure", async ({ badPage, reason, firstPageTotal }) => {
    let firstAttempt = true;
    await withMcpReportFixture(
      "intel_revenue_summary",
      async (path, _body, { page }) => {
        if (path === "/tenant/{tenant}/report-category/business-unit-dashboard/reports/179/data") {
          return {
            fields: fields(
              "Name", "TotalSales", "ClosedAverageSale", "CloseRate", "SalesOpportunity",
              "OptionsPerOpportunity", "AdjustmentRevenue", "TotalRevenue", "NonJobRevenue",
            ),
            data: [["HVAC", 300, 150, 0.5, 4, 2, 0, 300, 0]],
            hasMore: false,
          };
        }

        expect(path).toBe("/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data");
        if (page === 1) {
          return {
            fields: revenuePage.fields,
            data: [["HVAC", 100, 100, 0.5, 2, 1, 0, 0, 120, 20]],
            hasMore: true,
            ...(firstPageTotal === undefined ? {} : { totalCount: firstPageTotal }),
          };
        }

        expect(page).toBe(2);
        if (firstAttempt) {
          firstAttempt = false;
          return badPage();
        }
        return revenuePage;
      },
      async (client) => {
        const request = { name: "intel_revenue_summary", arguments: period };
        const partial = await client.callTool(request);
        expect(partial.isError).not.toBe(true);
        expect(partial.structuredContent).toMatchObject({
          totalRevenue: 0,
          sales: { totalSales: 300 },
          _warnings: [expect.stringContaining("Revenue report (Report 175) unavailable:")],
        });

        expect(partial.structuredContent?._warnings).toEqual([expect.stringMatching(reason)]);

        const complete = await client.callTool(request);
        expect(complete.isError).not.toBe(true);
        expect(complete.structuredContent).toMatchObject({
          totalRevenue: 180,
          totalOpportunities: 3,
          totalConvertedJobs: 2,
          overallConversionRate: 66.7,
          sales: { totalSales: 300 },
        });
        expect(complete.structuredContent).not.toHaveProperty("_warnings");
      },
    );
  });
});
