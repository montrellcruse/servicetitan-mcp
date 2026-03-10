import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchWithWarning,
  getErrorMessage,
  isRecord,
  round,
  safeDivide,
  toDateRange,
  toNumber,
  toText,
} from "./helpers.js";

const csrPerformanceSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
});

const FIELD = {
  BookedBy: 0,
  JobNumber: 1,
  InvoiceNumber: 2,
  JobType: 3,
  CustomerName: 4,
  LocationAddress: 5,
  CustomerPhone: 6,
  JobSummary: 7,
  FirstDispatch: 8,
  JobStatus: 9,
  Campaign: 10,
  Total: 11,
  CampaignCategory: 12,
  IsPrevailingWageJob: 13,
} as const;

interface CampaignAggregate {
  name: string;
  category: string | null;
  jobs: number;
  revenue: number;
}

interface JobTypeAggregate {
  name: string;
  jobs: number;
  revenue: number;
}

interface CsrAccumulator {
  name: string;
  jobsBooked: number;
  totalRevenue: number;
  completedJobs: number;
  invoicedJobs: number;
  canceledJobs: number;
  openJobs: number;
  campaigns: Map<string, CampaignAggregate>;
  jobTypes: Map<string, JobTypeAggregate>;
}

interface CampaignSummary {
  name: string;
  category: string | null;
  jobs: number;
  revenue: number;
}

interface JobTypeSummary {
  name: string;
  jobs: number;
  revenue: number;
}

interface ConversionMetrics {
  completedJobs: number;
  invoicedJobs: number;
  canceledJobs: number;
  openJobs: number;
  completionRate: number;
  invoiceRate: number;
  cancellationRate: number;
}

interface CsrPerformance {
  name: string;
  jobsBooked: number;
  totalRevenue: number;
  avgTicket: number;
  topCampaigns: CampaignSummary[];
  jobTypes: JobTypeSummary[];
  conversionMetrics: ConversionMetrics;
}

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function statusIn(status: string, values: string[]): boolean {
  return values.some((value) => status.includes(value));
}

function averageBy(
  csrs: CsrPerformance[],
  mapper: (csr: CsrPerformance) => number,
  decimals = 2,
): number {
  const total = csrs.reduce((sum, csr) => sum + mapper(csr), 0);
  return round(safeDivide(total, csrs.length), decimals);
}

function buildCampaignSummaries(
  campaigns: Map<string, CampaignAggregate>,
  limit = 5,
): CampaignSummary[] {
  return Array.from(campaigns.values())
    .map((campaign) => ({
      name: campaign.name,
      category: campaign.category,
      jobs: campaign.jobs,
      revenue: round(campaign.revenue, 2),
    }))
    .sort((a, b) => b.jobs - a.jobs || b.revenue - a.revenue)
    .slice(0, limit);
}

function buildJobTypeSummaries(jobTypes: Map<string, JobTypeAggregate>): JobTypeSummary[] {
  return Array.from(jobTypes.values())
    .map((jobType) => ({
      name: jobType.name,
      jobs: jobType.jobs,
      revenue: round(jobType.revenue, 2),
    }))
    .sort((a, b) => b.jobs - a.jobs || b.revenue - a.revenue);
}

export function registerIntelligenceCsrPerformanceTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_csr_performance",
    domain: "intelligence",
    operation: "read",
    description:
      "CSR booking performance using Job Detail By CSR with booked jobs, revenue, average ticket, campaign mix, job type mix, and team averages" +
      '\n\nExamples:\n- "How are our CSRs performing this month?" -> startDate="2026-03-01", endDate="2026-04-01"\n- "Show CSR booking revenue for last quarter" -> startDate="2025-10-01", endDate="2026-01-01"\n- "Which CSR is booking the most revenue for plumbing?" -> startDate="2026-01-01", endDate="2026-03-10", businessUnitId=<Plumbing BU ID>',
    schema: csrPerformanceSchema.shape,
    handler: async (params) => {
      try {
        const input = csrPerformanceSchema.parse(params);
        toDateRange(input.startDate, input.endDate, registry.timezone);
        const warnings: string[] = [];

        const reportParams: Array<{ name: string; value: string }> = [
          { name: "DateType", value: "Job Completion Date" },
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (input.businessUnitId !== undefined) {
          reportParams.push({
            name: "BusinessUnitId",
            value: String(input.businessUnitId),
          });
        }

        const reportResponse = await fetchWithWarning(
          warnings,
          "CSR performance report (Report 162)",
          () =>
            client.post("/tenant/{tenant}/report-category/operations/reports/162/data", {
              parameters: reportParams,
            }),
          null,
        );

        const rows = reportResponse ? extractReportRows(reportResponse) : [];
        const csrMap = new Map<string, CsrAccumulator>();

        for (const row of rows) {
          const csrName = toText(row[FIELD.BookedBy]) ?? "Unassigned";
          const csrKey = normalizeKey(csrName);
          const revenue = toNumber(row[FIELD.Total]);
          const status = (toText(row[FIELD.JobStatus]) ?? "").toLowerCase();
          const invoiceNumber = toText(row[FIELD.InvoiceNumber]);
          const campaignName = toText(row[FIELD.Campaign]) ?? "Unattributed";
          const campaignCategory = toText(row[FIELD.CampaignCategory]);
          const jobTypeName = toText(row[FIELD.JobType]) ?? "Unknown";

          const csr =
            csrMap.get(csrKey) ??
            {
              name: csrName,
              jobsBooked: 0,
              totalRevenue: 0,
              completedJobs: 0,
              invoicedJobs: 0,
              canceledJobs: 0,
              openJobs: 0,
              campaigns: new Map<string, CampaignAggregate>(),
              jobTypes: new Map<string, JobTypeAggregate>(),
            };

          csr.jobsBooked += 1;
          csr.totalRevenue += revenue;

          if (statusIn(status, ["cancel"])) {
            csr.canceledJobs += 1;
          } else if (statusIn(status, ["complete", "done"])) {
            csr.completedJobs += 1;
          } else {
            csr.openJobs += 1;
          }

          if (invoiceNumber || statusIn(status, ["invoice"])) {
            csr.invoicedJobs += 1;
          }

          const campaignKey = normalizeKey(campaignName);
          const campaign =
            csr.campaigns.get(campaignKey) ??
            {
              name: campaignName,
              category: campaignCategory,
              jobs: 0,
              revenue: 0,
            };
          campaign.jobs += 1;
          campaign.revenue += revenue;
          if (campaign.category === null) {
            campaign.category = campaignCategory;
          }
          csr.campaigns.set(campaignKey, campaign);

          const jobTypeKey = normalizeKey(jobTypeName);
          const jobType =
            csr.jobTypes.get(jobTypeKey) ??
            {
              name: jobTypeName,
              jobs: 0,
              revenue: 0,
            };
          jobType.jobs += 1;
          jobType.revenue += revenue;
          csr.jobTypes.set(jobTypeKey, jobType);

          csrMap.set(csrKey, csr);
        }

        const csrs: CsrPerformance[] = Array.from(csrMap.values())
          .map((csr) => ({
            name: csr.name,
            jobsBooked: csr.jobsBooked,
            totalRevenue: round(csr.totalRevenue, 2),
            avgTicket: round(safeDivide(csr.totalRevenue, csr.jobsBooked), 2),
            topCampaigns: buildCampaignSummaries(csr.campaigns),
            jobTypes: buildJobTypeSummaries(csr.jobTypes),
            conversionMetrics: {
              completedJobs: csr.completedJobs,
              invoicedJobs: csr.invoicedJobs,
              canceledJobs: csr.canceledJobs,
              openJobs: csr.openJobs,
              completionRate: round(safeDivide(csr.completedJobs, csr.jobsBooked) * 100, 1),
              invoiceRate: round(safeDivide(csr.invoicedJobs, csr.jobsBooked) * 100, 1),
              cancellationRate: round(safeDivide(csr.canceledJobs, csr.jobsBooked) * 100, 1),
            },
          }))
          .sort((a, b) => b.totalRevenue - a.totalRevenue || b.jobsBooked - a.jobsBooked);

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          csrs,
          teamAverages: {
            jobsBooked: averageBy(csrs, (csr) => csr.jobsBooked, 2),
            totalRevenue: averageBy(csrs, (csr) => csr.totalRevenue, 2),
            avgTicket: averageBy(csrs, (csr) => csr.avgTicket, 2),
            completedJobs: averageBy(csrs, (csr) => csr.conversionMetrics.completedJobs, 2),
            invoicedJobs: averageBy(csrs, (csr) => csr.conversionMetrics.invoicedJobs, 2),
            canceledJobs: averageBy(csrs, (csr) => csr.conversionMetrics.canceledJobs, 2),
            openJobs: averageBy(csrs, (csr) => csr.conversionMetrics.openJobs, 2),
            completionRate: averageBy(csrs, (csr) => csr.conversionMetrics.completionRate, 1),
            invoiceRate: averageBy(csrs, (csr) => csr.conversionMetrics.invoiceRate, 1),
            cancellationRate: averageBy(
              csrs,
              (csr) => csr.conversionMetrics.cancellationRate,
              1,
            ),
          },
        };

        if (warnings.length > 0) {
          result._warnings = warnings;
        }

        return toolResult(result);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
