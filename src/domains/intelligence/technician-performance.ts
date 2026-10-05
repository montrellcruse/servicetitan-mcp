import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { executeReport } from "./report-executor.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchWithWarning,
  isRecord,
  round,
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
  includeExtendedMetrics: z.boolean().optional().default(false).describe("Include memberships sold and sales from technician and marketing leads by running Reports 171, 173, and 174. Default: false."),
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
  revenue: number | null;
  averageTicket: number | null;
  opportunities: number | null;
  convertedJobs: number | null;
  conversionRate: number | null;
  customerSatisfaction: number | null;
}

interface ProductivityByTech {
  id: number;
  name: string;
  revenuePerHour: number | null;
  billableEfficiency: number | null;
  recallsCaused: number | null;
  upsold: number | null;
}

interface TechnicianIdentity {
  id: number;
  name: string;
}

interface LeadGenerationMetrics {
  replacementOpps: number | null;
  leadsSet: number | null;
  avgLeadSale: number | null;
  conversionRate: number | null;
  totalLeadSales: number | null;
}

interface MembershipMetrics {
  opportunities: number | null;
  sold: number | null;
  conversionRate: number | null;
}

interface LeadSalesMetrics {
  totalSales: number | null;
  avgSale: number | null;
  closeRate: number | null;
}

interface LeadGenerationByTech extends TechnicianIdentity, LeadGenerationMetrics {}

interface MembershipsByTech extends TechnicianIdentity, MembershipMetrics {}

interface LeadSalesByTech extends TechnicianIdentity, LeadSalesMetrics {}

interface TechnicianScorecard {
  id: number;
  name: string;
  jobsCompleted: number | null;
  revenue: number | null;
  averageTicket: number | null;
  opportunities: number | null;
  convertedJobs: number | null;
  conversionRate: number | null;
  customerSatisfaction: number | null;
  revenuePerHour: number | null;
  billableEfficiency: number | null;
  recallsCaused: number | null;
  upsold: number | null;
  jobsPerDay: number | null;
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
  const id = reportNumber(raw);
  return id !== null && Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function reportNumber(raw: unknown, scale = 1): number | null {
  const value = typeof raw === "number"
    ? raw
    : typeof raw === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())
      ? Number(raw.trim())
      : null;
  if (value === null || !Number.isFinite(value * scale)) return null;
  return value * scale;
}

function parseTechnicianName(raw: unknown, id: number): string {
  return toText(raw) ?? `Technician ${id}`;
}

function toLeadGenerationMetrics(
  metrics?: Partial<LeadGenerationMetrics>,
): LeadGenerationMetrics {
  return {
    replacementOpps: metrics?.replacementOpps ?? null,
    leadsSet: metrics?.leadsSet ?? null,
    avgLeadSale: metrics?.avgLeadSale ?? null,
    conversionRate: metrics?.conversionRate ?? null,
    totalLeadSales: metrics?.totalLeadSales ?? null,
  };
}

function toMembershipMetrics(metrics?: Partial<MembershipMetrics>): MembershipMetrics {
  return {
    opportunities: metrics?.opportunities ?? null,
    sold: metrics?.sold ?? null,
    conversionRate: metrics?.conversionRate ?? null,
  };
}

function toLeadSalesMetrics(metrics?: Partial<LeadSalesMetrics>): LeadSalesMetrics {
  return {
    totalSales: metrics?.totalSales ?? null,
    avgSale: metrics?.avgSale ?? null,
    closeRate: metrics?.closeRate ?? null,
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
      revenue: reportNumber(row[REVENUE_FIELD.CompletedRevenue]),
      averageTicket: reportNumber(row[REVENUE_FIELD.OpportunityJobAverage]),
      opportunities: reportNumber(row[REVENUE_FIELD.Opportunity]),
      convertedJobs: reportNumber(row[REVENUE_FIELD.ConvertedJobs]),
      conversionRate: reportNumber(row[REVENUE_FIELD.OpportunityConversionRate], 100),
      customerSatisfaction: reportNumber(row[REVENUE_FIELD.CustomerSatisfaction]),
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
      revenuePerHour: reportNumber(row[PRODUCTIVITY_FIELD.RevenuePerHour]),
      billableEfficiency: reportNumber(row[PRODUCTIVITY_FIELD.BillableEfficiency]),
      recallsCaused: reportNumber(row[PRODUCTIVITY_FIELD.RecallsCaused]),
      upsold: reportNumber(row[PRODUCTIVITY_FIELD.Upsold]),
    });
  }

  return result;
}

function hasAnyLeadGenerationMetrics(metrics: LeadGenerationMetrics): boolean {
  return Object.values(metrics).some((value) => value !== null && value !== 0);
}

function hasAnyMembershipMetrics(metrics: MembershipMetrics): boolean {
  return Object.values(metrics).some((value) => value !== null && value !== 0);
}

function hasAnyLeadSalesMetrics(metrics: LeadSalesMetrics): boolean {
  return Object.values(metrics).some((value) => value !== null && value !== 0);
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
      replacementOpps: reportNumber(row[LEAD_GENERATION_FIELD.ReplacementOpportunity]),
      leadsSet: reportNumber(row[LEAD_GENERATION_FIELD.LeadsSet]),
      avgLeadSale: reportNumber(row[LEAD_GENERATION_FIELD.AverageLeadSale]),
      conversionRate: reportNumber(row[LEAD_GENERATION_FIELD.ReplacementLeadConversionRate], 100),
      totalLeadSales: reportNumber(row[LEAD_GENERATION_FIELD.TotalLeadSales]),
    };

    result.push(tech);
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
      opportunities: reportNumber(row[MEMBERSHIPS_FIELD.MembershipOpportunities]),
      sold: reportNumber(row[MEMBERSHIPS_FIELD.MembershipsSold]),
      conversionRate: reportNumber(row[MEMBERSHIPS_FIELD.MembershipConversionRate], 100),
    };

    result.push(tech);
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
      totalSales: reportNumber(row[SALES_FROM_TECH_LEADS_FIELD.TotalSalesFromTgl]),
      avgSale: reportNumber(row[SALES_FROM_TECH_LEADS_FIELD.ClosedAverageSaleFromTgl]),
      closeRate: reportNumber(row[SALES_FROM_TECH_LEADS_FIELD.CloseRateFromTgl], 100),
    };

    result.push(tech);
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
      totalSales: reportNumber(row[SALES_FROM_MARKETING_LEADS_FIELD.TotalSalesFromMarketingLeads]),
      avgSale: reportNumber(row[SALES_FROM_MARKETING_LEADS_FIELD.ClosedAverageSaleFromMarketingLeads]),
      closeRate: reportNumber(row[SALES_FROM_MARKETING_LEADS_FIELD.CloseRateFromMarketingLeads], 100),
    };

    result.push(tech);
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
    [tech.revenue, tech.averageTicket, tech.convertedJobs, tech.opportunities,
      tech.customerSatisfaction, tech.revenuePerHour, tech.billableEfficiency,
      tech.recallsCaused, tech.upsold].some((value) => value !== null && value !== 0) ||
    hasAnyLeadGenerationMetrics(tech.leadGeneration) ||
    hasAnyMembershipMetrics(tech.memberships) ||
    hasAnyLeadSalesMetrics(tech.salesFromTechLeads) ||
    hasAnyLeadSalesMetrics(tech.salesFromMarketingLeads)
  );
}

function averageBy(
  scorecards: TechnicianScorecard[],
  mapper: (tech: TechnicianScorecard) => number | null,
  decimals = 2,
): number | null {
  if (scorecards.length === 0) return null;
  const values = scorecards.map(mapper);
  if (values.some((value) => value === null)) return null;
  const total = values.reduce<number>((sum, value) => sum + (value as number), 0);
  return Number.isFinite(total) ? round(total / values.length, decimals) : null;
}

function uniqueTechnicianRows<T extends TechnicianIdentity>(
  rows: T[], label: string, warnings: string[], metricAvailability: Record<string, { available: boolean; reason: string }>,
): Map<number, T> {
  const result = new Map<number, T>();
  const duplicates = new Set<number>();
  for (const row of rows) {
    const previous = result.get(row.id);
    if (!previous) result.set(row.id, row);
    else {
      duplicates.add(row.id);
      result.set(row.id, Object.fromEntries(Object.entries(previous).map(([key, value]) => [
        key, key === "id" ? value : key === "name" ? `Technician ${row.id}` : null,
      ])) as unknown as T);
    }
  }
  if (duplicates.size) {
    const reason = `Duplicate technician rows in ${label}; metrics for ${duplicates.size} technician(s) are unavailable because the source grain is ambiguous.`;
    warnings.push(reason);
    metricAvailability[label] = { available: false, reason };
  }
  return result;
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
      "Build a technician scorecard from provider revenue, converted-job, opportunity, productivity, recall, upsell, and lead-generation report values. includeExtendedMetrics requests membership and tech/marketing-lead sales reports. Missing, failed, ambiguous and unrequested metrics are null with source status; completed-job counts and jobsPerDay require an independent completed-job source and remain unavailable. Team averages are unweighted means of included technicians before limit, with null when any included value is unavailable; provider rates are retained without reconstructing hours or pooled team rates. Filter by technician or business unit and use limit to bound returned rows. Report calls may wait for per-report/client spacing; source failures and duplicate technician grain are returned in _warnings." +
      '\n\nExamples:\n- "How are our techs performing this month?" -> startDate="2026-03-01", endDate="2026-04-01"\n- "Show me Andrew\'s numbers for Q1" -> startDate="2026-01-01", endDate="2026-04-01", technicianName="Andrew"\n- "Who is our top performer this year?" -> startDate="2026-01-01", endDate="2026-03-10"',
    schema: technicianScorecardSchema.shape,
    handler: async (params) => {
      try {
        const input = technicianScorecardSchema.parse(params);
        toDateRange(input.startDate, input.endDate, registry.timezone);
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

        // The six report sources are independent; disabled optional sources are not measured.
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

        const sourceStatus = (response: unknown, requested = true) => response !== null
          ? { status: "complete" as const }
          : { status: requested ? "failed" as const : "not_requested" as const,
              reason: requested ? "Report unavailable; see _warnings." : "includeExtendedMetrics is false." };
        const sourceAvailability = {
          revenue: sourceStatus(revenueReport),
          productivity: sourceStatus(productivityReport),
          leadGeneration: sourceStatus(leadGenerationReport),
          memberships: sourceStatus(membershipsReport, input.includeExtendedMetrics),
          salesFromTechLeads: sourceStatus(salesFromTechLeadsReport, input.includeExtendedMetrics),
          salesFromMarketingLeads: sourceStatus(salesFromMarketingLeadsReport, input.includeExtendedMetrics),
        };
        const metricAvailability: Record<string, { available: boolean; reason: string }> = {
          jobsCompleted: { available: false, reason: "Independent completed-job counts are unavailable from these report sources; ConvertedJobs retains its provider meaning." },
          jobsPerDay: { available: false, reason: "Unavailable because an independent completed-job numerator is not provided." },
        };

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

        const revenueById = uniqueTechnicianRows(revenueRows, "revenue", warnings, metricAvailability);
        const productivityById = uniqueTechnicianRows(productivityRows, "productivity", warnings, metricAvailability);
        const leadGenerationById = uniqueTechnicianRows(leadGenerationRows, "leadGeneration", warnings, metricAvailability);
        const membershipsById = uniqueTechnicianRows(membershipsRows, "memberships", warnings, metricAvailability);
        const salesFromTechLeadById = uniqueTechnicianRows(salesFromTechLeadRows, "salesFromTechLeads", warnings, metricAvailability);
        const salesFromMarketingLeadById = uniqueTechnicianRows(salesFromMarketingLeadRows, "salesFromMarketingLeads", warnings, metricAvailability);

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
          // ConvertedJobs is not an independent count of completed jobs.
          const jobsCompleted = null;
          const jobsPerDay = null;

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
            jobsCompleted,
            revenue: revenue?.revenue ?? null,
            averageTicket: revenue?.averageTicket ?? null,
            opportunities: revenue?.opportunities ?? null,
            convertedJobs: revenue?.convertedJobs ?? null,
            conversionRate: revenue?.conversionRate ?? null,
            customerSatisfaction: revenue?.customerSatisfaction ?? null,
            revenuePerHour: productivity?.revenuePerHour ?? null,
            billableEfficiency: productivity?.billableEfficiency ?? null,
            recallsCaused: productivity?.recallsCaused ?? null,
            upsold: productivity?.upsold ?? null,
            jobsPerDay,
            leadGeneration: toLeadGenerationMetrics(leadGeneration),
            memberships: toMembershipMetrics(memberships),
            salesFromTechLeads: toLeadSalesMetrics(salesFromTechLeads),
            salesFromMarketingLeads: toLeadSalesMetrics(salesFromMarketingLeads),
          };

          const hasReportedUnknown = [revenue, productivity, leadGeneration, memberships,
            salesFromTechLeads, salesFromMarketingLeads]
            .some((source) => source && Object.values(source).some((value) => value === null));
          if (hasAnyActivity(scorecard) || hasReportedUnknown) {
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
          teamAverageBasis: "Unweighted arithmetic means across included technicians before limit; any unavailable member value makes that field null. With no included technicians, every team mean remains null because its denominator is zero. Reported rates are averaged as provider values without pooled denominators.",
          _sourceAvailability: sourceAvailability,
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
