import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  countWeekdaysInclusive,
  fetchWithWarning,
  getErrorMessage,
  isRecord,
  round,
  safeDivide,
  toDateRange,
  toNumber,
  toText,
} from "./helpers.js";

const technicianScorecardSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  technicianId: z.number().int().optional().describe("Single technician (omit for all)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Max technicians to analyze (default 25, max 50)"),
});

const REVENUE_FIELD = {
  Name: 0,
  CompletedRevenue: 1,
  OpportunityJobAverage: 2,
  OpportunityConversionRate: 3,
  Opportunity: 4,
  ConvertedJobs: 5,
  CustomerSatisfaction: 6,
  TechnicianId: 7,
} as const;

const PRODUCTIVITY_FIELD = {
  Name: 0,
  RevenuePerHour: 1,
  BillableEfficiency: 2,
  Upsold: 3,
  RecallsCaused: 6,
  TechnicianId: 7,
} as const;

const JOB_DETAIL_FIELD = {
  AssignedTechnicians: 2,
} as const;

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

interface TechnicianScorecard {
  id: number;
  name: string;
  jobsCompleted: number;
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
  jobsPerDay: number;
}

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function parseTechnicianId(raw: unknown): number {
  return Math.round(toNumber(raw));
}

function parseTechnicianName(raw: unknown, id: number): string {
  return toText(raw) ?? `Technician ${id}`;
}

function parseRevenueReport(response: unknown): RevenueByTech[] {
  const rows = extractReportRows(response);
  const result: RevenueByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row[REVENUE_FIELD.TechnicianId]);
    if (id <= 0) {
      continue;
    }

    result.push({
      id,
      name: parseTechnicianName(row[REVENUE_FIELD.Name], id),
      revenue: round(toNumber(row[REVENUE_FIELD.CompletedRevenue]), 2),
      averageTicket: round(toNumber(row[REVENUE_FIELD.OpportunityJobAverage]), 2),
      opportunities: Math.round(toNumber(row[REVENUE_FIELD.Opportunity])),
      convertedJobs: Math.round(toNumber(row[REVENUE_FIELD.ConvertedJobs])),
      conversionRate: round(toNumber(row[REVENUE_FIELD.OpportunityConversionRate]) * 100, 1),
      customerSatisfaction: round(toNumber(row[REVENUE_FIELD.CustomerSatisfaction]), 2),
    });
  }

  return result;
}

function parseProductivityReport(response: unknown): ProductivityByTech[] {
  const rows = extractReportRows(response);
  const result: ProductivityByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row[PRODUCTIVITY_FIELD.TechnicianId]);
    if (id <= 0) {
      continue;
    }

    result.push({
      id,
      name: parseTechnicianName(row[PRODUCTIVITY_FIELD.Name], id),
      revenuePerHour: round(toNumber(row[PRODUCTIVITY_FIELD.RevenuePerHour]), 2),
      billableEfficiency: round(toNumber(row[PRODUCTIVITY_FIELD.BillableEfficiency]), 3),
      recallsCaused: Math.round(toNumber(row[PRODUCTIVITY_FIELD.RecallsCaused])),
      upsold: round(toNumber(row[PRODUCTIVITY_FIELD.Upsold]), 2),
    });
  }

  return result;
}

function normalizeTechnicianName(name: string): string {
  return name.trim().toLowerCase();
}

function buildNameToTechIds(
  revenueRows: RevenueByTech[],
  productivityRows: ProductivityByTech[],
): Map<string, Set<number>> {
  const byName = new Map<string, Set<number>>();

  const add = (name: string, id: number): void => {
    const key = normalizeTechnicianName(name);
    if (key.length === 0 || id <= 0) {
      return;
    }

    const existing = byName.get(key) ?? new Set<number>();
    existing.add(id);
    byName.set(key, existing);
  };

  for (const tech of revenueRows) {
    add(tech.name, tech.id);
  }

  for (const tech of productivityRows) {
    add(tech.name, tech.id);
  }

  return byName;
}

function countCompletedJobsByTech(
  response: unknown,
  nameToTechIds: Map<string, Set<number>>,
): Map<number, number> {
  const rows = extractReportRows(response);
  const completedByTechId = new Map<number, number>();

  for (const row of rows) {
    const assigned = toText(row[JOB_DETAIL_FIELD.AssignedTechnicians]);
    if (!assigned) {
      continue;
    }

    const matchedIds = new Set<number>();
    for (const rawName of assigned.split(",")) {
      const normalizedName = normalizeTechnicianName(rawName);
      if (normalizedName.length === 0) {
        continue;
      }

      const ids = nameToTechIds.get(normalizedName);
      if (!ids) {
        continue;
      }

      for (const id of ids) {
        matchedIds.add(id);
      }
    }

    for (const id of matchedIds) {
      completedByTechId.set(id, (completedByTechId.get(id) ?? 0) + 1);
    }
  }

  return completedByTechId;
}

function hasAnyActivity(tech: TechnicianScorecard): boolean {
  return (
    tech.jobsCompleted !== 0 ||
    tech.revenue !== 0 ||
    tech.averageTicket !== 0 ||
    tech.opportunities !== 0 ||
    tech.convertedJobs !== 0 ||
    tech.conversionRate !== 0 ||
    tech.customerSatisfaction !== 0 ||
    tech.revenuePerHour !== 0 ||
    tech.billableEfficiency !== 0 ||
    tech.recallsCaused !== 0 ||
    tech.upsold !== 0 ||
    tech.jobsPerDay !== 0
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
    description:
      "Technician performance scorecard using ServiceTitan reports for completed jobs, revenue, opportunities, conversion, productivity, and team averages",
    schema: technicianScorecardSchema.shape,
    handler: async (params) => {
      try {
        const input = technicianScorecardSchema.parse(params);
        const { start, end } = toDateRange(input.startDate, input.endDate, registry.timezone);
        const workingDays = countWeekdaysInclusive(start, end);
        const warnings: string[] = [];
        const maxTechnicians = input.limit ?? 25;

        const revenueParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (input.businessUnitId !== undefined) {
          revenueParams.push({
            name: "BusinessUnitIds",
            value: String(input.businessUnitId),
          });
          warnings.push(
            "Business unit filtering only applies to completed jobs (Report 165). Revenue/productivity metrics are tenant-wide.",
          );
        }

        const productivityParams: Array<{ name: string; value: string }> = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        const completedJobsParams: Array<{ name: string; value: string }> = [
          { name: "DateType", value: "1" },
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (input.businessUnitId !== undefined) {
          completedJobsParams.push({
            name: "BusinessUnitId",
            value: String(input.businessUnitId),
          });
        }

        const revenueReport = await fetchWithWarning(
          warnings,
          "Technician revenue report (Report 168)",
          () =>
            client.post(
              "/tenant/{tenant}/report-category/technician-dashboard/reports/168/data",
              { parameters: revenueParams },
            ),
          null,
        );

        const productivityReport = await fetchWithWarning(
          warnings,
          "Technician productivity report (Report 170)",
          () =>
            client.post(
              "/tenant/{tenant}/report-category/technician-dashboard/reports/170/data",
              { parameters: productivityParams },
            ),
          null,
        );

        const completedJobsReport = await fetchWithWarning(
          warnings,
          "Completed jobs detail report (Report 165)",
          () =>
            client.post("/tenant/{tenant}/report-category/operations/reports/165/data", {
              parameters: completedJobsParams,
            }),
          null,
        );

        let revenueRows = parseRevenueReport(revenueReport);
        let productivityRows = parseProductivityReport(productivityReport);

        if (input.technicianId !== undefined) {
          revenueRows = revenueRows.filter((tech) => tech.id === input.technicianId);
          productivityRows = productivityRows.filter((tech) => tech.id === input.technicianId);
        }

        const revenueById = new Map(revenueRows.map((tech) => [tech.id, tech]));
        const productivityById = new Map(productivityRows.map((tech) => [tech.id, tech]));
        const nameToTechIds = buildNameToTechIds(revenueRows, productivityRows);
        const completedJobsByTechId = countCompletedJobsByTech(completedJobsReport, nameToTechIds);

        const scorecards: TechnicianScorecard[] = [];
        const technicianIds = new Set<number>([
          ...revenueById.keys(),
          ...productivityById.keys(),
        ]);

        for (const id of technicianIds) {
          const revenue = revenueById.get(id);
          const productivity = productivityById.get(id);
          const jobsCompleted = completedJobsByTechId.get(id) ?? 0;
          const jobsPerDay = round(safeDivide(jobsCompleted, workingDays), 2);

          const scorecard: TechnicianScorecard = {
            id,
            name: revenue?.name ?? productivity?.name ?? `Technician ${id}`,
            jobsCompleted,
            revenue: revenue?.revenue ?? 0,
            averageTicket: revenue?.averageTicket ?? 0,
            opportunities: revenue?.opportunities ?? 0,
            convertedJobs: revenue?.convertedJobs ?? 0,
            conversionRate: revenue?.conversionRate ?? 0,
            customerSatisfaction: revenue?.customerSatisfaction ?? 0,
            revenuePerHour: productivity?.revenuePerHour ?? 0,
            billableEfficiency: productivity?.billableEfficiency ?? 0,
            recallsCaused: productivity?.recallsCaused ?? 0,
            upsold: productivity?.upsold ?? 0,
            jobsPerDay,
          };

          if (hasAnyActivity(scorecard)) {
            scorecards.push(scorecard);
          }
        }

        const totalAvailable = scorecards.length;
        const limitedScorecards =
          scorecards.length > maxTechnicians ? scorecards.slice(0, maxTechnicians) : scorecards;
        if (scorecards.length > maxTechnicians) {
          warnings.push(
            `Limited to ${maxTechnicians} of ${totalAvailable} technicians. Use 'limit' param to increase (max 50) or 'technicianId' for a specific tech.`,
          );
        }

        const teamAverages = {
          jobsCompleted: averageBy(limitedScorecards, (tech) => tech.jobsCompleted, 2),
          revenue: averageBy(limitedScorecards, (tech) => tech.revenue, 2),
          averageTicket: averageBy(limitedScorecards, (tech) => tech.averageTicket, 2),
          opportunities: averageBy(limitedScorecards, (tech) => tech.opportunities, 2),
          convertedJobs: averageBy(limitedScorecards, (tech) => tech.convertedJobs, 2),
          conversionRate: averageBy(limitedScorecards, (tech) => tech.conversionRate, 1),
          customerSatisfaction: averageBy(limitedScorecards, (tech) => tech.customerSatisfaction, 2),
          revenuePerHour: averageBy(limitedScorecards, (tech) => tech.revenuePerHour, 2),
          billableEfficiency: averageBy(limitedScorecards, (tech) => tech.billableEfficiency, 3),
          recallsCaused: averageBy(limitedScorecards, (tech) => tech.recallsCaused, 2),
          upsold: averageBy(limitedScorecards, (tech) => tech.upsold, 2),
          jobsPerDay: averageBy(limitedScorecards, (tech) => tech.jobsPerDay, 2),
        };

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          technicians: limitedScorecards,
          teamAverages,
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
