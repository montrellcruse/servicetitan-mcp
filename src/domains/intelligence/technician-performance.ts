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

const LEAD_GENERATION_FIELD = {
  Name: 0,
  ReplacementOpportunity: 1,
  LeadsSet: 2,
  AverageLeadSale: 3,
  ReplacementLeadConversionRate: 4,
  ReplacementLeadsSold: 5,
  TotalLeadSales: 6,
  AverageReplacementLeadSale: 7,
  TechnicianId: 8,
} as const;

const MEMBERSHIPS_FIELD = {
  Name: 0,
  MembershipOpportunities: 1,
  MembershipsSold: 2,
  MembershipConversionRate: 3,
  TechnicianId: 4,
  AdjustmentRevenue: 5,
  CompletedRevenueWithAdjustments: 6,
} as const;

const SALES_FROM_TECH_LEADS_FIELD = {
  Name: 0,
  TechnicianBusinessUnit: 1,
  TotalSalesFromTgl: 2,
  ClosedAverageSaleFromTgl: 3,
  CloseRateFromTgl: 4,
  OptionsPerOpportunityFromTgl: 5,
  TechnicianBusinessUnitId: 6,
  TechnicianDivision: 7,
  PaidTimeByBusinessUnit: 8,
  AdjustmentRevenue: 9,
  CompletedRevenueWithAdjustments: 10,
  TechnicianId: 11,
} as const;

const SALES_FROM_MARKETING_LEADS_FIELD = {
  Name: 0,
  TotalSalesFromMarketingLeads: 1,
  ClosedAverageSaleFromMarketingLeads: 2,
  CloseRateFromMarketingLeads: 3,
  OptionsPerOpportunityFromMarketingLeads: 4,
  TechnicianId: 5,
  AdjustmentRevenue: 6,
  CompletedRevenueWithAdjustments: 7,
} as const;

const JOB_DETAIL_FIELD = {
  AssignedTechnicians: 2,
} as const;

const REPORT_165_ASSIGNED_TECHNICIAN_ID_FIELDS = [
  "AssignedTechnicianId",
  "AssignedTechnicianIds",
  "TechnicianId",
  "TechnicianIds",
] as const;

const REPORT_165_ASSIGNED_TECHNICIAN_NAME_FIELDS = [
  "AssignedTechnicians",
  "AssignedTechnician",
  "Assigned Technician(s)",
  "Technician",
  "Technicians",
] as const;

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
  leadGeneration: LeadGenerationMetrics;
  memberships: MembershipMetrics;
  salesFromTechLeads: LeadSalesMetrics;
  salesFromMarketingLeads: LeadSalesMetrics;
}

interface CompletedJobAttribution {
  countsByTechId: Map<number, number>;
  namesByTechId: Map<number, string>;
  technicianIds: Set<number>;
  warnings: string[];
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

function parseLeadGenerationReport(response: unknown): LeadGenerationByTech[] {
  const rows = extractReportRows(response);
  const result: LeadGenerationByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row[LEAD_GENERATION_FIELD.TechnicianId]);
    if (id <= 0) {
      continue;
    }

    const tech: LeadGenerationByTech = {
      id,
      name: parseTechnicianName(row[LEAD_GENERATION_FIELD.Name], id),
      replacementOpps: Math.round(toNumber(row[LEAD_GENERATION_FIELD.ReplacementOpportunity])),
      leadsSet: Math.round(toNumber(row[LEAD_GENERATION_FIELD.LeadsSet])),
      avgLeadSale: round(toNumber(row[LEAD_GENERATION_FIELD.AverageLeadSale]), 2),
      conversionRate: round(
        toNumber(row[LEAD_GENERATION_FIELD.ReplacementLeadConversionRate]) * 100,
        1,
      ),
      totalLeadSales: round(toNumber(row[LEAD_GENERATION_FIELD.TotalLeadSales]), 2),
    };

    if (hasAnyLeadGenerationMetrics(tech)) {
      result.push(tech);
    }
  }

  return result;
}

function parseMembershipsReport(response: unknown): MembershipsByTech[] {
  const rows = extractReportRows(response);
  const result: MembershipsByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row[MEMBERSHIPS_FIELD.TechnicianId]);
    if (id <= 0) {
      continue;
    }

    const tech: MembershipsByTech = {
      id,
      name: parseTechnicianName(row[MEMBERSHIPS_FIELD.Name], id),
      opportunities: Math.round(toNumber(row[MEMBERSHIPS_FIELD.MembershipOpportunities])),
      sold: Math.round(toNumber(row[MEMBERSHIPS_FIELD.MembershipsSold])),
      conversionRate: round(toNumber(row[MEMBERSHIPS_FIELD.MembershipConversionRate]) * 100, 1),
    };

    if (hasAnyMembershipMetrics(tech)) {
      result.push(tech);
    }
  }

  return result;
}

function parseSalesFromTechLeadsReport(response: unknown): LeadSalesByTech[] {
  const rows = extractReportRows(response);
  const result: LeadSalesByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row[SALES_FROM_TECH_LEADS_FIELD.TechnicianId]);
    if (id <= 0) {
      continue;
    }

    const tech: LeadSalesByTech = {
      id,
      name: parseTechnicianName(row[SALES_FROM_TECH_LEADS_FIELD.Name], id),
      totalSales: round(toNumber(row[SALES_FROM_TECH_LEADS_FIELD.TotalSalesFromTgl]), 2),
      avgSale: round(toNumber(row[SALES_FROM_TECH_LEADS_FIELD.ClosedAverageSaleFromTgl]), 2),
      closeRate: round(toNumber(row[SALES_FROM_TECH_LEADS_FIELD.CloseRateFromTgl]) * 100, 1),
    };

    if (hasAnyLeadSalesMetrics(tech)) {
      result.push(tech);
    }
  }

  return result;
}

function parseSalesFromMarketingLeadsReport(response: unknown): LeadSalesByTech[] {
  const rows = extractReportRows(response);
  const result: LeadSalesByTech[] = [];

  for (const row of rows) {
    const id = parseTechnicianId(row[SALES_FROM_MARKETING_LEADS_FIELD.TechnicianId]);
    if (id <= 0) {
      continue;
    }

    const tech: LeadSalesByTech = {
      id,
      name: parseTechnicianName(row[SALES_FROM_MARKETING_LEADS_FIELD.Name], id),
      totalSales: round(
        toNumber(row[SALES_FROM_MARKETING_LEADS_FIELD.TotalSalesFromMarketingLeads]),
        2,
      ),
      avgSale: round(
        toNumber(row[SALES_FROM_MARKETING_LEADS_FIELD.ClosedAverageSaleFromMarketingLeads]),
        2,
      ),
      closeRate: round(
        toNumber(row[SALES_FROM_MARKETING_LEADS_FIELD.CloseRateFromMarketingLeads]) * 100,
        1,
      ),
    };

    if (hasAnyLeadSalesMetrics(tech)) {
      result.push(tech);
    }
  }

  return result;
}

function normalizeTechnicianName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeReportFieldName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function buildNameToTechIds(
  ...techGroups: ReadonlyArray<ReadonlyArray<TechnicianIdentity>>
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

  for (const techGroup of techGroups) {
    for (const tech of techGroup) {
      add(tech.name, tech.id);
    }
  }

  return byName;
}

function findReportFieldIndex(
  response: unknown,
  candidateNames: readonly string[],
  fallbackIndex?: number,
): number | null {
  if (isRecord(response) && Array.isArray(response.fields)) {
    const normalizedCandidates = new Set(candidateNames.map(normalizeReportFieldName));
    const matchedIndex = response.fields.findIndex((field) => {
      if (!isRecord(field) || typeof field.name !== "string") {
        return false;
      }
      return normalizedCandidates.has(normalizeReportFieldName(field.name));
    });

    if (matchedIndex >= 0) {
      return matchedIndex;
    }
  }

  return fallbackIndex ?? null;
}

function splitAssignedTechnicianNames(value: unknown): string[] {
  const text = toText(value);
  if (!text) {
    return [];
  }

  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseAssignedTechnicianIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => Math.round(toNumber(entry)))
      .filter((entry) => entry > 0);
  }

  if (typeof value === "number") {
    const id = Math.round(value);
    return id > 0 ? [id] : [];
  }

  const text = toText(value);
  if (!text) {
    return [];
  }

  return text
    .split(/[;,]/)
    .map((part) => Math.round(toNumber(part.trim())))
    .filter((entry) => entry > 0);
}

function countCompletedJobsByTech(
  response: unknown,
  nameToTechIds: Map<string, Set<number>>,
): CompletedJobAttribution {
  const rows = extractReportRows(response);
  const completedByTechId = new Map<number, number>();
  const namesByTechId = new Map<number, string>();
  const technicianIds = new Set<number>();
  const warningMessages = new Set<string>();
  const assignedTechnicianIdIndex = findReportFieldIndex(
    response,
    REPORT_165_ASSIGNED_TECHNICIAN_ID_FIELDS,
  );
  const assignedTechnicianNameIndex = findReportFieldIndex(
    response,
    REPORT_165_ASSIGNED_TECHNICIAN_NAME_FIELDS,
    JOB_DETAIL_FIELD.AssignedTechnicians,
  );

  for (const row of rows) {
    const assignedNames = assignedTechnicianNameIndex === null
      ? []
      : splitAssignedTechnicianNames(row[assignedTechnicianNameIndex]);
    const assignedIds = assignedTechnicianIdIndex === null
      ? []
      : parseAssignedTechnicianIds(row[assignedTechnicianIdIndex]);

    if (assignedNames.length === 0 && assignedIds.length === 0) {
      continue;
    }

    const matchedIds = new Set<number>();

    if (assignedIds.length > 0) {
      assignedIds.forEach((id, index) => {
        matchedIds.add(id);
        technicianIds.add(id);

        const assignedName = assignedNames[index] ?? (assignedNames.length === 1 ? assignedNames[0] : undefined);
        if (assignedName) {
          namesByTechId.set(id, assignedName);
        }
      });
    } else {
      for (const rawName of assignedNames) {
        const normalizedName = normalizeTechnicianName(rawName);
        if (normalizedName.length === 0) {
          continue;
        }

        const ids = nameToTechIds.get(normalizedName);
        if (!ids) {
          continue;
        }

        if (ids.size > 1) {
          warningMessages.add(
            `Skipped completed-job attribution for ambiguous technician name "${rawName}" in Report 165.`,
          );
          console.warn(
            `Skipped completed-job attribution for ambiguous technician name "${rawName}" in Report 165.`,
          );
          continue;
        }

        const [id] = ids;
        if (id === undefined) {
          continue;
        }

        matchedIds.add(id);
        technicianIds.add(id);
        namesByTechId.set(id, rawName);
      }
    }

    for (const id of matchedIds) {
      completedByTechId.set(id, (completedByTechId.get(id) ?? 0) + 1);
    }
  }

  return {
    countsByTechId: completedByTechId,
    namesByTechId,
    technicianIds,
    warnings: Array.from(warningMessages),
  };
}

function hasAnyActivity(tech: TechnicianScorecard): boolean {
  return (
    tech.jobsCompleted > 0 ||
    tech.revenue > 0 ||
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
    description:
      "Technician performance scorecard using ServiceTitan reports for completed jobs, revenue, opportunities, conversion, productivity, lead generation, memberships, sales from tech leads, sales from marketing leads, and team averages" +
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

        const completedJobsParams: Array<{ name: string; value: string }> = [
          { name: "DateType", value: "1" },
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (effectiveBuId !== undefined) {
          revenueParams.push({ name: "BusinessUnitIds", value: String(effectiveBuId) });
          productivityParams.push({ name: "BusinessUnitIds", value: String(effectiveBuId) });
          leadGenerationParams.push({
            name: "BusinessUnitId",
            value: String(effectiveBuId),
          });
          membershipsParams.push({ name: "BusinessUnitIds", value: String(effectiveBuId) });
          salesFromTechLeadsParams.push({
            name: "BusinessUnitIds",
            value: String(effectiveBuId),
          });
          salesFromMarketingLeadsParams.push({
            name: "BusinessUnitIds",
            value: String(effectiveBuId),
          });
          completedJobsParams.push({
            name: "BusinessUnitId",
            value: String(effectiveBuId),
          });
        }

        // Parallelize all 7 report fetches — independent API calls
        const [
          revenueReport,
          productivityReport,
          leadGenerationReport,
          membershipsReport,
          salesFromTechLeadsReport,
          salesFromMarketingLeadsReport,
          completedJobsReport,
        ] = await Promise.all([
          fetchWithWarning(
            warnings,
            "Technician revenue report (Report 168)",
            () =>
              client.post(
                "/tenant/{tenant}/report-category/technician-dashboard/reports/168/data",
                { parameters: revenueParams },
              ),
            null,
          ),
          fetchWithWarning(
            warnings,
            "Technician productivity report (Report 170)",
            () =>
              client.post(
                "/tenant/{tenant}/report-category/technician-dashboard/reports/170/data",
                { parameters: productivityParams },
              ),
            null,
          ),
          fetchWithWarning(
            warnings,
            "Technician lead generation report (Report 169)",
            () =>
              client.post(
                "/tenant/{tenant}/report-category/technician-dashboard/reports/169/data",
                { parameters: leadGenerationParams },
              ),
            null,
          ),
          fetchWithWarning(
            warnings,
            "Technician memberships report (Report 171)",
            () =>
              client.post(
                "/tenant/{tenant}/report-category/technician-dashboard/reports/171/data",
                { parameters: membershipsParams },
              ),
            null,
          ),
          fetchWithWarning(
            warnings,
            "Technician sales from tech leads report (Report 173)",
            () =>
              client.post(
                "/tenant/{tenant}/report-category/technician-dashboard/reports/173/data",
                { parameters: salesFromTechLeadsParams },
              ),
            null,
          ),
          fetchWithWarning(
            warnings,
            "Technician sales from marketing leads report (Report 174)",
            () =>
              client.post(
                "/tenant/{tenant}/report-category/technician-dashboard/reports/174/data",
                { parameters: salesFromMarketingLeadsParams },
              ),
            null,
          ),
          fetchWithWarning(
            warnings,
            "Completed jobs detail report (Report 165)",
            () =>
              client.post("/tenant/{tenant}/report-category/operations/reports/165/data", {
                parameters: completedJobsParams,
              }),
            null,
          ),
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
        const nameToTechIds = buildNameToTechIds(
          revenueRows,
          productivityRows,
          leadGenerationRows,
          membershipsRows,
          salesFromTechLeadRows,
          salesFromMarketingLeadRows,
        );
        const completedJobAttribution = countCompletedJobsByTech(completedJobsReport, nameToTechIds);
        warnings.push(...completedJobAttribution.warnings);

        const completedJobsByTechId = completedJobAttribution.countsByTechId;
        const completedJobNamesByTechId = completedJobAttribution.namesByTechId;

        const scorecards: TechnicianScorecard[] = [];
        const technicianIds = new Set<number>([
          ...revenueById.keys(),
          ...productivityById.keys(),
          ...leadGenerationById.keys(),
          ...membershipsById.keys(),
          ...salesFromTechLeadById.keys(),
          ...salesFromMarketingLeadById.keys(),
          ...completedJobAttribution.technicianIds,
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
          const jobsCompleted = completedJobsByTechId.get(id) ?? 0;
          const jobsPerDay = round(safeDivide(jobsCompleted, workingDays), 2);

          const scorecard: TechnicianScorecard = {
            id,
            name:
              revenue?.name ??
              productivity?.name ??
              leadGeneration?.name ??
              memberships?.name ??
              salesFromTechLeads?.name ??
              salesFromMarketingLeads?.name ??
              completedJobNamesByTechId.get(id) ??
              `Technician ${id}`,
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
          jobsCompleted: averageBy(scorecards, (tech) => tech.jobsCompleted, 2),
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
          jobsPerDay: averageBy(scorecards, (tech) => tech.jobsPerDay, 2),
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
        const limitedScorecards =
          scorecards.length > maxTechnicians ? scorecards.slice(0, maxTechnicians) : scorecards;
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
          teamAverages,
        };

        if (warnings.length > 0) {
          result._warnings = warnings;
        }

        return toolResult(result, { shape: true });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
