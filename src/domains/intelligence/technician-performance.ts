import { z } from "../../schema.js";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { executeReport, type ReportExecution } from "./report-executor.js";
import { toolError, toolResult } from "../../utils.js";
import {
  countWeekdaysInclusive,
  fetchWithWarning,
  round,
  safeDivide,
  toDateRange,
  toNumber,
  toText,
} from "./helpers.js";
import { resolveBusinessUnitId, resolveTechnicianId } from "./resolvers.js";

const technicianScorecardSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  technicianId: z.number().int().optional().describe("Single technician (omit for all)"),
  technicianName: z.string().optional().describe("Single technician by name (resolved via cache, e.g. 'John'). Alternative to technicianId."),
  businessUnitId: z.number().int().optional().describe("Filter by business unit"),
  businessUnitName: z.string().optional().describe("Filter by business unit name (resolved via cache, e.g. 'HVAC'). Alternative to businessUnitId."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max technicians to return, ranked by completed revenue when available (default 25, max 50)"),
  includeExtendedMetrics: z.boolean().optional().default(false).describe("Include memberships sold and sales from technician and marketing leads by running Reports 171, 173, and 174. Default: false."),
});

interface RevenueByTech {
  id: number;
  name: string;
  revenue: number;
  averageTicket: number;
  opportunities: number;
  convertedJobs: number;
  conversionRate: number;
  customerSatisfaction: number;
}

interface ProductivityByTech {
  id: number;
  name: string;
  revenuePerHour: number;
  billableEfficiency: number;
  recallsCaused: number;
  upsold: number;
}

interface TechnicianIdentity {
  id: number;
  name: string;
}

interface LeadGenerationMetrics {
  replacementOpps: number;
  leadsSet: number;
  avgLeadSale: number;
  conversionRate: number;
  totalLeadSales: number;
}

interface MembershipMetrics {
  opportunities: number;
  sold: number;
  conversionRate: number;
}

interface LeadSalesMetrics {
  totalSales: number;
  avgSale: number;
  closeRate: number;
}

interface LeadGenerationByTech extends TechnicianIdentity, LeadGenerationMetrics {}

interface MembershipsByTech extends TechnicianIdentity, MembershipMetrics {}

interface LeadSalesByTech extends TechnicianIdentity, LeadSalesMetrics {}

interface TechnicianScorecard {
  id: number;
  name: string;
  jobsCompleted: null;
  revenue: number;
  averageTicket: number;
  opportunities: number;
  convertedJobs: number;
  conversionRate: number;
  customerSatisfaction: number;
  revenuePerHour: number;
  billableEfficiency: number;
  recallsCaused: number;
  upsold: number;
  jobsPerDay: null;
  convertedJobsPerWeekday: number | null;
  leadGeneration: LeadGenerationMetrics;
  memberships: MembershipMetrics;
  salesFromTechLeads: LeadSalesMetrics;
  salesFromMarketingLeads: LeadSalesMetrics;
}

function parseTechnicianId(raw: unknown): number {
  return Math.round(toNumber(raw));
}

function parseTechnicianName(raw: unknown, id: number): string {
  return toText(raw) ?? `Technician ${id}`;
}

function toLeadGenerationMetrics(
  metrics?: Partial<LeadGenerationMetrics>,
): LeadGenerationMetrics {
  return {
    replacementOpps: metrics?.replacementOpps ?? 0,
    leadsSet: metrics?.leadsSet ?? 0,
    avgLeadSale: metrics?.avgLeadSale ?? 0,
    conversionRate: metrics?.conversionRate ?? 0,
    totalLeadSales: metrics?.totalLeadSales ?? 0,
  };
}

function toMembershipMetrics(metrics?: Partial<MembershipMetrics>): MembershipMetrics {
  return {
    opportunities: metrics?.opportunities ?? 0,
    sold: metrics?.sold ?? 0,
    conversionRate: metrics?.conversionRate ?? 0,
  };
}

function toLeadSalesMetrics(metrics?: Partial<LeadSalesMetrics>): LeadSalesMetrics {
  return {
    totalSales: metrics?.totalSales ?? 0,
    avgSale: metrics?.avgSale ?? 0,
    closeRate: metrics?.closeRate ?? 0,
  };
}

function parseRevenueReport(report: ReportExecution | null): RevenueByTech[] {
  const rows = report?.data ?? [];
  const result: RevenueByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row.TechnicianId);
    if (id <= 0) {
      continue;
    }

    result.push({
      id,
      name: parseTechnicianName(row.Name, id),
      revenue: round(toNumber(row.CompletedRevenue), 2),
      averageTicket: round(toNumber(row.OpportunityJobAverage), 2),
      opportunities: Math.round(toNumber(row.Opportunity)),
      convertedJobs: Math.round(toNumber(row.ConvertedJobs)),
      conversionRate: round(toNumber(row.OpportunityConversionRate) * 100, 1),
      customerSatisfaction: round(toNumber(row.CustomerSatisfaction), 2),
    });
  }

  return result;
}

function parseProductivityReport(report: ReportExecution | null): ProductivityByTech[] {
  const rows = report?.data ?? [];
  const result: ProductivityByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row.TechnicianId);
    if (id <= 0) {
      continue;
    }

    result.push({
      id,
      name: parseTechnicianName(row.Name, id),
      revenuePerHour: round(toNumber(row.RevenuePerHour), 2),
      billableEfficiency: round(toNumber(row.BillableEfficiency), 3),
      recallsCaused: Math.round(toNumber(row.RecallsCaused)),
      upsold: round(toNumber(row.Upsold), 2),
    });
  }

  return result;
}

function hasAnyLeadGenerationMetrics(metrics: LeadGenerationMetrics): boolean {
  return (
    metrics.replacementOpps !== 0 ||
    metrics.leadsSet !== 0 ||
    metrics.avgLeadSale !== 0 ||
    metrics.conversionRate !== 0 ||
    metrics.totalLeadSales !== 0
  );
}

function hasAnyMembershipMetrics(metrics: MembershipMetrics): boolean {
  return (
    metrics.opportunities !== 0 ||
    metrics.sold !== 0 ||
    metrics.conversionRate !== 0
  );
}

function hasAnyLeadSalesMetrics(metrics: LeadSalesMetrics): boolean {
  return (
    metrics.totalSales !== 0 ||
    metrics.avgSale !== 0 ||
    metrics.closeRate !== 0
  );
}

function parseLeadGenerationReport(report: ReportExecution | null): LeadGenerationByTech[] {
  const rows = report?.data ?? [];
  const result: LeadGenerationByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row.TechnicianId);
    if (id <= 0) {
      continue;
    }

    const tech: LeadGenerationByTech = {
      id,
      name: parseTechnicianName(row.Name, id),
      replacementOpps: Math.round(toNumber(row.ReplacementOpportunity)),
      leadsSet: Math.round(toNumber(row.LeadsSet)),
      avgLeadSale: round(toNumber(row.AverageLeadSale), 2),
      conversionRate: round(
        toNumber(row.ReplacementLeadConversionRate) * 100,
        1,
      ),
      totalLeadSales: round(toNumber(row.TotalLeadSales), 2),
    };

    if (hasAnyLeadGenerationMetrics(tech)) {
      result.push(tech);
    }
  }

  return result;
}

function parseMembershipsReport(report: ReportExecution | null): MembershipsByTech[] {
  const rows = report?.data ?? [];
  const result: MembershipsByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row.TechnicianId);
    if (id <= 0) {
      continue;
    }

    const tech: MembershipsByTech = {
      id,
      name: parseTechnicianName(row.Name, id),
      opportunities: Math.round(toNumber(row.MembershipOpportunities)),
      sold: Math.round(toNumber(row.MembershipsSold)),
      conversionRate: round(toNumber(row.MembershipConversionRate) * 100, 1),
    };

    if (hasAnyMembershipMetrics(tech)) {
      result.push(tech);
    }
  }

  return result;
}

function parseSalesFromTechLeadsReport(report: ReportExecution | null): LeadSalesByTech[] {
  const rows = report?.data ?? [];
  const result: LeadSalesByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row.TechnicianId);
    if (id <= 0) {
      continue;
    }

    const tech: LeadSalesByTech = {
      id,
      name: parseTechnicianName(row.Name, id),
      totalSales: round(toNumber(row.TotalSalesFromTgl), 2),
      avgSale: round(toNumber(row.ClosedAverageSaleFromTgl), 2),
      closeRate: round(toNumber(row.CloseRateFromTgl) * 100, 1),
    };

    if (hasAnyLeadSalesMetrics(tech)) {
      result.push(tech);
    }
  }

  return result;
}

function parseSalesFromMarketingLeadsReport(report: ReportExecution | null): LeadSalesByTech[] {
  const rows = report?.data ?? [];
  const result: LeadSalesByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row.TechnicianId);
    if (id <= 0) {
      continue;
    }

    const tech: LeadSalesByTech = {
      id,
      name: parseTechnicianName(row.Name, id),
      totalSales: round(
        toNumber(row.TotalSalesFromMarketingLeads),
        2,
      ),
      avgSale: round(
        toNumber(row.ClosedAverageSaleFromMarketingLeads),
        2,
      ),
      closeRate: round(
        toNumber(row.CloseRateFromMarketingLeads) * 100,
        1,
      ),
    };

    if (hasAnyLeadSalesMetrics(tech)) {
      result.push(tech);
    }
  }

  return result;
}

function hasAnyActivity(tech: TechnicianScorecard): boolean {
  return (
    tech.convertedJobs > 0 ||
    tech.revenue !== 0 ||
    tech.opportunities > 0 ||
    tech.customerSatisfaction > 0 ||
    tech.revenuePerHour > 0 ||
    tech.billableEfficiency > 0 ||
    tech.recallsCaused > 0 ||
    tech.upsold > 0 ||
    hasAnyLeadGenerationMetrics(tech.leadGeneration) ||
    hasAnyMembershipMetrics(tech.memberships) ||
    hasAnyLeadSalesMetrics(tech.salesFromTechLeads) ||
    hasAnyLeadSalesMetrics(tech.salesFromMarketingLeads)
  );
}

function averageBy(
  scorecards: TechnicianScorecard[],
  mapper: (tech: TechnicianScorecard) => number,
  decimals = 2,
): number {
  const total = scorecards.reduce((sum, tech) => sum + mapper(tech), 0);
  return round(safeDivide(total, scorecards.length), decimals);
}

export function registerIntelligenceTechnicianPerformanceTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_technician_scorecard",
    domain: "intelligence",
    operation: "read",
    reports: { required: ["168", "169", "170"], optional: ["171", "173", "174"] },
    description:
      "Build a technician scorecard for the selected date range from ServiceTitan technician reports. Returns revenue, converted jobs, opportunities, conversion, productivity, recalls, upsells, and lead-generation metrics; includeExtendedMetrics adds membership and tech/marketing-lead sales reports. Filter by technician or business unit. Results rank by Report 168 completed revenue before applying limit; converted jobs are distinct from completed jobs, which this scorecard does not measure. Report calls may wait for per-report/client spacing, and partial source failures are returned in _warnings." +
      '\n\nExamples:\n- "How are our techs performing this month?" -> startDate="2026-03-01", endDate="2026-04-01"\n- "Show me Andrew\'s numbers for Q1" -> startDate="2026-01-01", endDate="2026-04-01", technicianName="Andrew"\n- "Who is our top performer this year?" -> startDate="2026-01-01", endDate="2026-03-10"',
    schema: technicianScorecardSchema.shape,
    handler: async (params) => {
      try {
        const input = technicianScorecardSchema.parse(params);
        const { start, end } = toDateRange(input.startDate, input.endDate, registry.timezone);
        const workingDays = countWeekdaysInclusive(start, end, registry.timezone);
        const warnings: string[] = [];
        const maxTechnicians = input.limit ?? 25;

        // Resolve name-based filters via cache
        const techResolved = await resolveTechnicianId(client, input.technicianId, input.technicianName);
        const effectiveTechId = techResolved.id;
        if (input.technicianName && !effectiveTechId) {
          warnings.push(`Technician "${input.technicianName}" not found. Showing all technicians.`);
        }
        if (techResolved.resolvedName) {
          warnings.push(`Resolved "${input.technicianName}" → ${techResolved.resolvedName} (ID: ${effectiveTechId})`);
        }

        const buResolved = await resolveBusinessUnitId(client, input.businessUnitId, input.businessUnitName);
        const effectiveBuId = buResolved.id;
        if (input.businessUnitName && !effectiveBuId) {
          warnings.push(`Business unit "${input.businessUnitName}" not found. Showing all business units.`);
        }
        if (buResolved.resolvedName) {
          warnings.push(`Resolved "${input.businessUnitName}" → ${buResolved.resolvedName} (ID: ${effectiveBuId})`);
        }

        const revenueParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        const productivityParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        const leadGenerationParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        const membershipsParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        const salesFromTechLeadsParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        const salesFromMarketingLeadsParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (effectiveBuId !== undefined) {
          revenueParams.push({ name: "BusinessUnitId", value: String(effectiveBuId) });
          productivityParams.push({ name: "BusinessUnitId", value: String(effectiveBuId) });
          leadGenerationParams.push({
            name: "BusinessUnitId",
            value: String(effectiveBuId),
          });
          membershipsParams.push({ name: "BusinessUnitId", value: String(effectiveBuId) });
          salesFromTechLeadsParams.push({
            name: "BusinessUnitId",
            value: String(effectiveBuId),
          });
          salesFromMarketingLeadsParams.push({
            name: "BusinessUnitId",
            value: String(effectiveBuId),
          });
        }

        // Parallelize all 6 report fetches — independent API calls
        const [
          revenueReport,
          productivityReport,
          leadGenerationReport,
          membershipsReport,
          salesFromTechLeadsReport,
          salesFromMarketingLeadsReport,
        ] = await Promise.all([
          fetchWithWarning(
            warnings,
            "Technician revenue report (Report 168)",
            () =>
              executeReport(client, "168", revenueParams, registry.reportBindings),
            null,
          ),
          fetchWithWarning(
            warnings,
            "Technician productivity report (Report 170)",
            () =>
              executeReport(client, "170", productivityParams, registry.reportBindings),
            null,
          ),
          fetchWithWarning(
            warnings,
            "Technician lead generation report (Report 169)",
            () =>
              executeReport(client, "169", leadGenerationParams, registry.reportBindings),
            null,
          ),
          input.includeExtendedMetrics
            ? fetchWithWarning(
                warnings,
                "Technician memberships report (Report 171)",
                () =>
                  executeReport(client, "171", membershipsParams, registry.reportBindings),
                null,
              )
            : Promise.resolve(null),
          input.includeExtendedMetrics
            ? fetchWithWarning(
                warnings,
                "Technician sales from tech leads report (Report 173)",
                () =>
                  executeReport(client, "173", salesFromTechLeadsParams, registry.reportBindings),
                null,
              )
            : Promise.resolve(null),
          input.includeExtendedMetrics
            ? fetchWithWarning(
                warnings,
                "Technician sales from marketing leads report (Report 174)",
                () =>
                  executeReport(client, "174", salesFromMarketingLeadsParams, registry.reportBindings),
                null,
              )
            : Promise.resolve(null),
        ]);

        let revenueRows = parseRevenueReport(revenueReport);
        let productivityRows = parseProductivityReport(productivityReport);
        let leadGenerationRows = parseLeadGenerationReport(leadGenerationReport);
        let membershipsRows = parseMembershipsReport(membershipsReport);
        let salesFromTechLeadRows = parseSalesFromTechLeadsReport(salesFromTechLeadsReport);
        let salesFromMarketingLeadRows = parseSalesFromMarketingLeadsReport(
          salesFromMarketingLeadsReport,
        );

        if (effectiveTechId !== undefined) {
          revenueRows = revenueRows.filter((tech) => tech.id === effectiveTechId);
          productivityRows = productivityRows.filter((tech) => tech.id === effectiveTechId);
          leadGenerationRows = leadGenerationRows.filter((tech) => tech.id === effectiveTechId);
          membershipsRows = membershipsRows.filter((tech) => tech.id === effectiveTechId);
          salesFromTechLeadRows = salesFromTechLeadRows.filter(
            (tech) => tech.id === effectiveTechId,
          );
          salesFromMarketingLeadRows = salesFromMarketingLeadRows.filter(
            (tech) => tech.id === effectiveTechId,
          );
        }

        const revenueById = new Map(revenueRows.map((tech) => [tech.id, tech]));
        const productivityById = new Map(productivityRows.map((tech) => [tech.id, tech]));
        const leadGenerationById = new Map(leadGenerationRows.map((tech) => [tech.id, tech]));
        const membershipsById = new Map(membershipsRows.map((tech) => [tech.id, tech]));
        const salesFromTechLeadById = new Map(salesFromTechLeadRows.map((tech) => [tech.id, tech]));
        const salesFromMarketingLeadById = new Map(
          salesFromMarketingLeadRows.map((tech) => [tech.id, tech]),
        );

        const scorecards: TechnicianScorecard[] = [];
        const technicianIds = new Set<number>([
          ...revenueById.keys(),
          ...productivityById.keys(),
          ...leadGenerationById.keys(),
          ...membershipsById.keys(),
          ...salesFromTechLeadById.keys(),
          ...salesFromMarketingLeadById.keys(),
        ]);

        if (effectiveTechId !== undefined) {
          technicianIds.forEach((id) => {
            if (id !== effectiveTechId) {
              technicianIds.delete(id);
            }
          });
        }

        for (const id of technicianIds) {
          const revenue = revenueById.get(id);
          const productivity = productivityById.get(id);
          const leadGeneration = leadGenerationById.get(id);
          const memberships = membershipsById.get(id);
          const salesFromTechLeads = salesFromTechLeadById.get(id);
          const salesFromMarketingLeads = salesFromMarketingLeadById.get(id);
          const convertedJobs = revenue?.convertedJobs ?? 0;

          const scorecard: TechnicianScorecard = {
            id,
            name:
              revenue?.name ??
              productivity?.name ??
              leadGeneration?.name ??
              memberships?.name ??
              salesFromTechLeads?.name ??
              salesFromMarketingLeads?.name ??
              `Technician ${id}`,
            jobsCompleted: null,
            revenue: revenue?.revenue ?? 0,
            averageTicket: revenue?.averageTicket ?? 0,
            opportunities: revenue?.opportunities ?? 0,
            convertedJobs,
            conversionRate: revenue?.conversionRate ?? 0,
            customerSatisfaction: revenue?.customerSatisfaction ?? 0,
            revenuePerHour: productivity?.revenuePerHour ?? 0,
            billableEfficiency: productivity?.billableEfficiency ?? 0,
            recallsCaused: productivity?.recallsCaused ?? 0,
            upsold: productivity?.upsold ?? 0,
            jobsPerDay: null,
            convertedJobsPerWeekday: revenueReport ? round(safeDivide(convertedJobs, workingDays), 2) : null,
            leadGeneration: toLeadGenerationMetrics(leadGeneration),
            memberships: toMembershipMetrics(memberships),
            salesFromTechLeads: toLeadSalesMetrics(salesFromTechLeads),
            salesFromMarketingLeads: toLeadSalesMetrics(salesFromMarketingLeads),
          };

          if (hasAnyActivity(scorecard)) {
            scorecards.push(scorecard);
          }
        }

        const totalAvailable = scorecards.length;
        const teamAverages = {
          jobsCompleted: null,
          revenue: averageBy(scorecards, (tech) => tech.revenue, 2),
          averageTicket: averageBy(scorecards, (tech) => tech.averageTicket, 2),
          opportunities: averageBy(scorecards, (tech) => tech.opportunities, 2),
          convertedJobs: averageBy(scorecards, (tech) => tech.convertedJobs, 2),
          conversionRate: averageBy(scorecards, (tech) => tech.conversionRate, 1),
          customerSatisfaction: averageBy(scorecards, (tech) => tech.customerSatisfaction, 2),
          revenuePerHour: averageBy(scorecards, (tech) => tech.revenuePerHour, 2),
          billableEfficiency: averageBy(scorecards, (tech) => tech.billableEfficiency, 3),
          recallsCaused: averageBy(scorecards, (tech) => tech.recallsCaused, 2),
          upsold: averageBy(scorecards, (tech) => tech.upsold, 2),
          jobsPerDay: null,
          convertedJobsPerWeekday: revenueReport
            ? averageBy(scorecards, (tech) => tech.convertedJobsPerWeekday ?? 0, 2)
            : null,
          leadGeneration: {
            replacementOpps: averageBy(scorecards, (tech) => tech.leadGeneration.replacementOpps, 2),
            leadsSet: averageBy(scorecards, (tech) => tech.leadGeneration.leadsSet, 2),
            avgLeadSale: averageBy(scorecards, (tech) => tech.leadGeneration.avgLeadSale, 2),
            conversionRate: averageBy(scorecards, (tech) => tech.leadGeneration.conversionRate, 1),
            totalLeadSales: averageBy(scorecards, (tech) => tech.leadGeneration.totalLeadSales, 2),
          },
          memberships: {
            opportunities: averageBy(scorecards, (tech) => tech.memberships.opportunities, 2),
            sold: averageBy(scorecards, (tech) => tech.memberships.sold, 2),
            conversionRate: averageBy(scorecards, (tech) => tech.memberships.conversionRate, 1),
          },
          salesFromTechLeads: {
            totalSales: averageBy(scorecards, (tech) => tech.salesFromTechLeads.totalSales, 2),
            avgSale: averageBy(scorecards, (tech) => tech.salesFromTechLeads.avgSale, 2),
            closeRate: averageBy(scorecards, (tech) => tech.salesFromTechLeads.closeRate, 1),
          },
          salesFromMarketingLeads: {
            totalSales: averageBy(
              scorecards,
              (tech) => tech.salesFromMarketingLeads.totalSales,
              2,
            ),
            avgSale: averageBy(scorecards, (tech) => tech.salesFromMarketingLeads.avgSale, 2),
            closeRate: averageBy(
              scorecards,
              (tech) => tech.salesFromMarketingLeads.closeRate,
              1,
            ),
          },
        };
        if (revenueReport) {
          scorecards.sort((left, right) => right.revenue - left.revenue || left.id - right.id);
        }
        const limitedScorecards = scorecards.slice(0, maxTechnicians);
        if (scorecards.length > maxTechnicians) {
          warnings.push(
            `Limited to ${maxTechnicians} of ${totalAvailable} technicians. Use 'limit' param to increase (max 50) or 'technicianId' for a specific tech.`,
          );
        }

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          technicians: limitedScorecards,
          rankedBy: revenueReport ? "revenue" : null,
          teamAverages,
          metricDefinitions: {
            revenue: "CompletedRevenue from technician Report 168.",
            jobsCompleted: "Actual completed-job counts and jobsPerDay are unavailable in the selected scorecard reports.",
            convertedJobsPerWeekday: "Report 168 converted jobs divided by weekdays in the selected window.",
          },
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
