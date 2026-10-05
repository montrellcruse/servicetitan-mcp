import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchWithWarning,
  isRecord,
  round,
  safeDivide,
  toDateRange,
  toText,
} from "./helpers.js";
import { resolveBusinessUnitId } from "./resolvers.js";
import { executeReport } from "./report-executor.js";

const csrPerformanceSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
  businessUnitName: z.string().optional().describe("Filter by business unit name (resolved via cache, e.g. 'HVAC'). Alternative to businessUnitId."),
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
  revenue: number | null;
}

interface JobTypeAggregate {
  name: string;
  jobs: number;
  revenue: number | null;
}

interface CsrAccumulator {
  name: string;
  jobsBooked: number;
  totalRevenue: number | null;
  knownRevenueSubtotal: number;
  unknownRevenueRows: number;
  completedJobs: number;
  invoicedJobs: number;
  canceledJobs: number;
  openJobs: number;
  unknownStatusJobs: number;
  campaigns: Map<string, CampaignAggregate>;
  jobTypes: Map<string, JobTypeAggregate>;
}

interface CampaignSummary {
  name: string;
  category: string | null;
  jobs: number;
  revenue: number | null;
}

interface JobTypeSummary {
  name: string;
  jobs: number;
  revenue: number | null;
}

interface ConversionMetrics {
  completedJobs: number;
  invoicedJobs: number;
  canceledJobs: number;
  openJobs: number;
  unknownStatusJobs: number;
  completionRate: number | null;
  invoiceRate: number;
  cancellationRate: number | null;
}

interface CsrPerformance {
  name: string;
  jobsBooked: number;
  totalRevenue: number | null;
  knownRevenueSubtotal: number | null;
  unknownRevenueRows: number;
  avgTicket: number | null;
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

function numericRevenue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function averageBy(
  csrs: CsrPerformance[],
  mapper: (csr: CsrPerformance) => number | null,
  decimals = 2,
): number | null {
  if (csrs.length === 0) return null;
  const values = csrs.map(mapper);
  if (values.some(value => value === null)) return null;
  const total = values.reduce<number>((sum, value) => sum + (value as number), 0);
  if (!Number.isFinite(total)) return null;
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
      revenue: campaign.revenue === null || !Number.isFinite(campaign.revenue) ? null : campaign.revenue,
    }))
    .sort((a, b) => b.jobs - a.jobs || (b.revenue ?? 0) - (a.revenue ?? 0))
    .slice(0, limit);
}

function buildJobTypeSummaries(jobTypes: Map<string, JobTypeAggregate>): JobTypeSummary[] {
  return Array.from(jobTypes.values())
    .map((jobType) => ({
      name: jobType.name,
      jobs: jobType.jobs,
      revenue: jobType.revenue === null || !Number.isFinite(jobType.revenue) ? null : jobType.revenue,
    }))
    .sort((a, b) => b.jobs - a.jobs || (b.revenue ?? 0) - (a.revenue ?? 0));
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
      "Summarize CSR-attributed jobs from Report 162 for the selected date range. Returns booked-job counts, revenue, average ticket, campaign and job-type mixes, rankings, and team averages; an optional business-unit filter is passed to the report. Missing numeric cells and unavailable source metrics are null with availability reasons; zero-revenue jobs remain in activity counts. Report execution is cached briefly and may wait for per-report/client spacing; source failures also appear in _warnings." +
      '\n\nExamples:\n- "How are our CSRs performing this month?" -> startDate="2026-03-01", endDate="2026-04-01"\n- "Show CSR booking revenue for last quarter" -> startDate="2025-10-01", endDate="2026-01-01"\n- "Which CSR is booking the most revenue for plumbing?" -> startDate="2026-01-01", endDate="2026-03-10", businessUnitName="Plumbing"',
    schema: csrPerformanceSchema.shape,
    handler: async (params) => {
      try {
        const input = csrPerformanceSchema.parse(params);
        toDateRange(input.startDate, input.endDate, registry.timezone);
        const warnings: string[] = [];

        const buResolved = await resolveBusinessUnitId(client, input.businessUnitId, input.businessUnitName);
        const effectiveBuId = buResolved.id;
        if (input.businessUnitName && !effectiveBuId) {
          warnings.push(`Business unit "${input.businessUnitName}" not found. Showing all business units.`);
        }
        if (buResolved.resolvedName) {
          warnings.push(`Resolved "${input.businessUnitName}" → ${buResolved.resolvedName} (ID: ${effectiveBuId})`);
        }

        const reportParams: Array<{ name: string; value: unknown }> = [
          { name: "DateType", value: 1 },
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (effectiveBuId !== undefined) {
          reportParams.push({
            name: "BusinessUnitId",
            value: String(effectiveBuId),
          });
        }

        const reportResponse = await fetchWithWarning(
          warnings,
          "CSR performance report (Report 162)",
          () =>
            executeReport(client, "162", reportParams, registry.reportBindings),
          null,
        );

        const rows = reportResponse ? extractReportRows(reportResponse) : [];
        const csrMap = new Map<string, CsrAccumulator>();

        for (const row of rows) {
          const csrName = toText(row[FIELD.BookedBy]) ?? "Unassigned";
          const csrKey = normalizeKey(csrName);
          const revenue = numericRevenue(row[FIELD.Total]);
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
              knownRevenueSubtotal: 0,
              unknownRevenueRows: 0,
              completedJobs: 0,
              invoicedJobs: 0,
              canceledJobs: 0,
              openJobs: 0,
              unknownStatusJobs: 0,
              campaigns: new Map<string, CampaignAggregate>(),
              jobTypes: new Map<string, JobTypeAggregate>(),
            };

          csr.jobsBooked += 1;
          csr.totalRevenue = csr.totalRevenue === null || revenue === null ? null : csr.totalRevenue + revenue;
          if (revenue === null) csr.unknownRevenueRows += 1;
          else csr.knownRevenueSubtotal += revenue;

          if (["canceled", "cancelled"].includes(status)) {
            csr.canceledJobs += 1;
          } else if (["completed", "done"].includes(status)) {
            csr.completedJobs += 1;
          } else if (["scheduled", "inprogress", "working", "dispatched", "hold", "open"].includes(status)) {
            csr.openJobs += 1;
          } else {
            csr.unknownStatusJobs += 1;
          }

          if (invoiceNumber || status === "invoiced") {
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
          campaign.revenue = campaign.revenue === null || revenue === null ? null : campaign.revenue + revenue;
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
          jobType.revenue = jobType.revenue === null || revenue === null ? null : jobType.revenue + revenue;
          csr.jobTypes.set(jobTypeKey, jobType);

          csrMap.set(csrKey, csr);
        }

        const csrs: CsrPerformance[] = Array.from(csrMap.values())
          .map((csr) => ({
            name: csr.name,
            jobsBooked: csr.jobsBooked,
            totalRevenue: csr.totalRevenue === null || !Number.isFinite(csr.totalRevenue) ? null : csr.totalRevenue,
            knownRevenueSubtotal: Number.isFinite(csr.knownRevenueSubtotal) ? csr.knownRevenueSubtotal : null,
            unknownRevenueRows: csr.unknownRevenueRows,
            avgTicket: csr.totalRevenue === null || !Number.isFinite(csr.totalRevenue) ? null : round(safeDivide(csr.totalRevenue, csr.jobsBooked), 2),
            topCampaigns: buildCampaignSummaries(csr.campaigns),
            jobTypes: buildJobTypeSummaries(csr.jobTypes),
            conversionMetrics: {
              completedJobs: csr.completedJobs,
              invoicedJobs: csr.invoicedJobs,
              canceledJobs: csr.canceledJobs,
              openJobs: csr.openJobs,
              unknownStatusJobs: csr.unknownStatusJobs,
              completionRate: csr.unknownStatusJobs > 0 ? null : round(safeDivide(csr.completedJobs, csr.jobsBooked) * 100, 1),
              invoiceRate: round(safeDivide(csr.invoicedJobs, csr.jobsBooked) * 100, 1),
              cancellationRate: csr.unknownStatusJobs > 0 ? null : round(safeDivide(csr.canceledJobs, csr.jobsBooked) * 100, 1),
            },
          }))
          .sort((a, b) => {
            if (a.totalRevenue === null || b.totalRevenue === null) return Number(a.totalRevenue === null) - Number(b.totalRevenue === null) || b.jobsBooked - a.jobsBooked;
            return b.totalRevenue - a.totalRevenue || b.jobsBooked - a.jobsBooked;
          });

        const sourceAvailable = reportResponse !== null;
        const teamAverages = {
          jobsBooked: averageBy(csrs, (csr) => csr.jobsBooked, 2),
          totalRevenue: averageBy(csrs, (csr) => csr.totalRevenue, 2),
          avgTicket: averageBy(csrs, (csr) => csr.avgTicket, 2),
          completedJobs: averageBy(csrs, (csr) => csr.conversionMetrics.completedJobs, 2),
          invoicedJobs: averageBy(csrs, (csr) => csr.conversionMetrics.invoicedJobs, 2),
          canceledJobs: averageBy(csrs, (csr) => csr.conversionMetrics.canceledJobs, 2),
          openJobs: averageBy(csrs, (csr) => csr.conversionMetrics.openJobs, 2),
          completionRate: averageBy(csrs, (csr) => csr.conversionMetrics.completionRate, 1),
          invoiceRate: averageBy(csrs, (csr) => csr.conversionMetrics.invoiceRate, 1),
          cancellationRate: averageBy(csrs, (csr) => csr.conversionMetrics.cancellationRate, 1),
        };
        const metricAvailability: Record<string, { available: boolean; reason?: string }> = {};
        if (!sourceAvailable) {
          metricAvailability.csrs = { available: false, reason: "CSR performance report unavailable." };
          metricAvailability.teamAverages = { available: false, reason: "CSR performance report unavailable." };
        }
        for (const [name, value] of Object.entries(teamAverages)) {
          metricAvailability[`teamAverages.${name}`] = value === null
            ? { available: false, reason: !sourceAvailable ? "CSR performance report unavailable." : csrs.length === 0 ? "No CSR rows provide a team-average denominator." : "One or more CSR values needed for this average are unknown." }
            : { available: true };
        }
        csrs.forEach((csr, index) => {
          if (csr.knownRevenueSubtotal === null) metricAvailability[`csrs.${index}.knownRevenueSubtotal`] = { available: false, reason: "Known revenue subtotal exceeded finite numeric representation." };
          if (csr.totalRevenue === null) metricAvailability[`csrs.${index}.totalRevenue`] = { available: false, reason: "One or more revenue cells are missing or invalid." };
          if (csr.avgTicket === null) metricAvailability[`csrs.${index}.avgTicket`] = { available: false, reason: "Complete revenue is required for an average ticket." };
          if (csr.conversionMetrics.unknownStatusJobs > 0) {
            metricAvailability[`csrs.${index}.conversionMetrics.completionRate`] = { available: false, reason: "One or more job statuses are unknown." };
            metricAvailability[`csrs.${index}.conversionMetrics.cancellationRate`] = { available: false, reason: "One or more job statuses are unknown." };
          }
          csr.topCampaigns.forEach((campaign, campaignIndex) => {
            if (campaign.revenue === null) metricAvailability[`csrs.${index}.topCampaigns.${campaignIndex}.revenue`] = { available: false, reason: "One or more campaign revenue cells are missing or invalid." };
          });
          csr.jobTypes.forEach((jobType, jobTypeIndex) => {
            if (jobType.revenue === null) metricAvailability[`csrs.${index}.jobTypes.${jobTypeIndex}.revenue`] = { available: false, reason: "One or more job-type revenue cells are missing or invalid." };
          });
        });

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          csrs: sourceAvailable ? csrs : null,
          teamAverages,
          _sourceAvailability: { csrReport: sourceAvailable ? { status: "complete" } : { status: "failed", reason: "CSR performance report unavailable." } },
          _metricAvailability: metricAvailability,
        };

        if (warnings.length > 0) {
          result._warnings = warnings;
        }

        return toolResult(result, { shape: true });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
