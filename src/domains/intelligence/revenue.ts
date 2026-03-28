import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPages,
  fetchAllPagesParallel,
  fetchWithWarning,
  getErrorMessage,
  round,
  safeDivide,
  sumBy,
  toDateRange,
  toNumber,
} from "./helpers.js";
import { resolveBusinessUnitId } from "./resolvers.js";

const revenueSummarySchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
  businessUnitName: z.string().optional().describe("Filter by business unit name (resolved via cache, e.g. 'HVAC'). Alternative to businessUnitId."),
  includeCollections: z.boolean().optional().default(false).describe("Include payment/collections data (totalCollected, outstanding). Adds ~20s latency due to payment pagination. Default: false."),
});

type GenericRecord = Record<string, unknown>;

/**
 * Revenue report field indices (Report 175: "Revenue" under business-unit-dashboard).
 * This is ServiceTitan's native revenue calculation — matches the dashboard exactly.
 *
 * TotalRevenue = CompletedRevenue + NonJobRevenue + AdjustmentRevenue
 */
const FIELD = {
  Name: 0,
  CompletedRevenue: 1,
  OpportunityJobAverage: 2,
  OpportunityConversionRate: 3,
  Opportunity: 4,
  ConvertedJobs: 5,
  CustomerSatisfaction: 6,
  AdjustmentRevenue: 7,
  TotalRevenue: 8,
  NonJobRevenue: 9,
} as const;

const PRODUCTIVITY_FIELD = {
  Name: 0,
  RevenuePerHour: 1,
  BillableEfficiency: 2,
  Upsold: 3,
  TasksPerOpportunity: 4,
  OptionsPerOpportunity: 5,
  RecallsCaused: 6,
  AdjustmentRevenue: 7,
  TotalRevenue: 8,
  NonJobRevenue: 9,
} as const;

const SALES_FIELD = {
  Name: 0,
  TotalSales: 1,
  ClosedAverageSale: 2,
  CloseRate: 3,
  SalesOpportunity: 4,
  OptionsPerOpportunity: 5,
  AdjustmentRevenue: 6,
  TotalRevenue: 7,
  NonJobRevenue: 8,
} as const;

interface BUProductivity {
  revenuePerHour: number;
  billableEfficiency: number;
  upsold: number;
  tasksPerOpportunity: number;
  optionsPerOpportunity: number;
  recallsCaused: number;
}

interface BUSales {
  totalSales: number;
  closedAvgSale: number;
  closeRate: number;
  salesOpportunity: number;
  optionsPerOpportunity: number;
}

interface BURevenue {
  name: string;
  totalRevenue: number;
  completedRevenue: number;
  nonJobRevenue: number;
  adjustmentRevenue: number;
  opportunities: number;
  convertedJobs: number;
  conversionRate: number;
  productivity?: BUProductivity;
  sales?: BUSales;
}

interface BUProductivityRow {
  name: string;
  productivity: BUProductivity;
}

interface BUSalesRow {
  name: string;
  sales: BUSales;
}

interface RequiredReportField {
  index: number;
  name: string;
  schema: z.ZodType<unknown>;
}

interface ReportRowsResult {
  data: unknown[][];
  count: number;
}

interface ReportResponse {
  fields: Array<{ name: string }>;
  data: unknown[][];
  count?: number;
  [key: string]: unknown;
}

const NAME_CELL_SCHEMA = z.string().trim().min(1);
const NUMERIC_CELL_SCHEMA = z.union([
  z.number().finite(),
  z.string().trim().refine(
    (value) => Number.isFinite(Number.parseFloat(value)),
    "Expected a numeric string",
  ),
]);

const REPORT_175_REQUIRED_FIELDS: readonly RequiredReportField[] = [
  { index: FIELD.Name, name: "Name", schema: NAME_CELL_SCHEMA },
  { index: FIELD.CompletedRevenue, name: "CompletedRevenue", schema: NUMERIC_CELL_SCHEMA },
  {
    index: FIELD.OpportunityConversionRate,
    name: "OpportunityConversionRate",
    schema: NUMERIC_CELL_SCHEMA,
  },
  { index: FIELD.Opportunity, name: "Opportunity", schema: NUMERIC_CELL_SCHEMA },
  { index: FIELD.ConvertedJobs, name: "ConvertedJobs", schema: NUMERIC_CELL_SCHEMA },
  { index: FIELD.AdjustmentRevenue, name: "AdjustmentRevenue", schema: NUMERIC_CELL_SCHEMA },
  { index: FIELD.TotalRevenue, name: "TotalRevenue", schema: NUMERIC_CELL_SCHEMA },
  { index: FIELD.NonJobRevenue, name: "NonJobRevenue", schema: NUMERIC_CELL_SCHEMA },
] as const;

const REPORT_177_REQUIRED_FIELDS: readonly RequiredReportField[] = [
  { index: PRODUCTIVITY_FIELD.Name, name: "Name", schema: NAME_CELL_SCHEMA },
  { index: PRODUCTIVITY_FIELD.RevenuePerHour, name: "RevenuePerHour", schema: NUMERIC_CELL_SCHEMA },
  {
    index: PRODUCTIVITY_FIELD.BillableEfficiency,
    name: "BillableEfficiency",
    schema: NUMERIC_CELL_SCHEMA,
  },
  { index: PRODUCTIVITY_FIELD.Upsold, name: "Upsold", schema: NUMERIC_CELL_SCHEMA },
  {
    index: PRODUCTIVITY_FIELD.TasksPerOpportunity,
    name: "TasksPerOpportunity",
    schema: NUMERIC_CELL_SCHEMA,
  },
  {
    index: PRODUCTIVITY_FIELD.OptionsPerOpportunity,
    name: "OptionsPerOpportunity",
    schema: NUMERIC_CELL_SCHEMA,
  },
  { index: PRODUCTIVITY_FIELD.RecallsCaused, name: "RecallsCaused", schema: NUMERIC_CELL_SCHEMA },
  {
    index: PRODUCTIVITY_FIELD.AdjustmentRevenue,
    name: "AdjustmentRevenue",
    schema: NUMERIC_CELL_SCHEMA,
  },
  { index: PRODUCTIVITY_FIELD.TotalRevenue, name: "TotalRevenue", schema: NUMERIC_CELL_SCHEMA },
  { index: PRODUCTIVITY_FIELD.NonJobRevenue, name: "NonJobRevenue", schema: NUMERIC_CELL_SCHEMA },
] as const;

const REPORT_179_REQUIRED_FIELDS: readonly RequiredReportField[] = [
  { index: SALES_FIELD.Name, name: "Name", schema: NAME_CELL_SCHEMA },
  { index: SALES_FIELD.TotalSales, name: "TotalSales", schema: NUMERIC_CELL_SCHEMA },
  { index: SALES_FIELD.ClosedAverageSale, name: "ClosedAverageSale", schema: NUMERIC_CELL_SCHEMA },
  { index: SALES_FIELD.CloseRate, name: "CloseRate", schema: NUMERIC_CELL_SCHEMA },
  { index: SALES_FIELD.SalesOpportunity, name: "SalesOpportunity", schema: NUMERIC_CELL_SCHEMA },
  {
    index: SALES_FIELD.OptionsPerOpportunity,
    name: "OptionsPerOpportunity",
    schema: NUMERIC_CELL_SCHEMA,
  },
  { index: SALES_FIELD.AdjustmentRevenue, name: "AdjustmentRevenue", schema: NUMERIC_CELL_SCHEMA },
  { index: SALES_FIELD.TotalRevenue, name: "TotalRevenue", schema: NUMERIC_CELL_SCHEMA },
  { index: SALES_FIELD.NonJobRevenue, name: "NonJobRevenue", schema: NUMERIC_CELL_SCHEMA },
] as const;

const reportFieldSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
  })
  .passthrough()
  .required({ name: true });

function emptyListResult<T>(): { data: T[]; count: 0 } {
  return { data: [], count: 0 };
}

function createEmptyReportResponse(): ReportResponse {
  return {
    fields: [],
    ...emptyListResult<unknown[]>(),
  };
}

function buildReportResponseSchema(
  requiredFields: readonly RequiredReportField[],
  options?: { requireFieldMetadata?: boolean },
) {
  const rowSchema = z.array(z.unknown()).superRefine((row, ctx) => {
    for (const field of requiredFields) {
      if (field.index >= row.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing required row index ${field.index} (${field.name})`,
        });
        continue;
      }

      const parsedValue = field.schema.safeParse(row[field.index]);
      if (!parsedValue.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid value for ${field.name}`,
        });
      }
    }
  });

  return z
    .object({
      fields: z.array(reportFieldSchema).optional(),
      data: z.array(rowSchema).optional(),
      count: z.number().int().nonnegative().optional(),
    })
    .passthrough()
    .required({ fields: true, data: true })
    .superRefine((response, ctx) => {
      if (response.data.length === 0) {
        return;
      }

      if (options?.requireFieldMetadata === false) {
        return;
      }

      for (const field of requiredFields) {
        const actualFieldName = response.fields[field.index]?.name;
        if (actualFieldName !== field.name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Expected field ${field.name} at index ${field.index}`,
          });
        }
      }
    });
}

const report175ResponseSchema = buildReportResponseSchema(REPORT_175_REQUIRED_FIELDS, {
  requireFieldMetadata: true,
});
const report177ResponseSchema = buildReportResponseSchema(REPORT_177_REQUIRED_FIELDS, {
  requireFieldMetadata: true,
});
const report179ResponseSchema = buildReportResponseSchema(REPORT_179_REQUIRED_FIELDS, {
  requireFieldMetadata: true,
});

function requiredFieldList(requiredFields: readonly RequiredReportField[]): string {
  return requiredFields.map((field) => field.name).join(", ");
}

function buildReportStructureError(
  reportId: number,
  requiredFields: readonly RequiredReportField[],
): Error {
  return new Error(
    `Report ${reportId} response structure changed — expected fields: ${requiredFieldList(requiredFields)}`,
  );
}

export function validateReport175Response(response: unknown): ReportResponse {
  const parsed = report175ResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw buildReportStructureError(175, REPORT_175_REQUIRED_FIELDS);
  }

  return parsed.data;
}

function validateProductivityReportResponse(response: unknown): ReportResponse {
  const parsed = report177ResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw buildReportStructureError(177, REPORT_177_REQUIRED_FIELDS);
  }

  return parsed.data;
}

function validateSalesReportResponse(response: unknown): ReportResponse {
  const parsed = report179ResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw buildReportStructureError(179, REPORT_179_REQUIRED_FIELDS);
  }

  return parsed.data;
}

export function extractReportRows(response: unknown): ReportRowsResult {
  const parsed = validateReport175Response(response);
  return {
    data: parsed.data,
    count: parsed.data.length,
  };
}

export function sumReport175TotalRevenue(response: unknown): number {
  return round(
    sumBy(extractReportRows(response).data, (row) => toNumber(row[FIELD.TotalRevenue])),
    2,
  );
}

function extractProductivityRows(response: unknown): ReportRowsResult {
  const parsed = validateProductivityReportResponse(response);
  return {
    data: parsed.data,
    count: parsed.data.length,
  };
}

function extractSalesRows(response: unknown): ReportRowsResult {
  const parsed = validateSalesReportResponse(response);
  return {
    data: parsed.data,
    count: parsed.data.length,
  };
}

function parseReportRows(response: unknown): BURevenue[] {
  const rows = extractReportRows(response).data;
  const results: BURevenue[] = [];

  for (const row of rows) {
    const totalRevenue = toNumber(row[FIELD.TotalRevenue]);
    const completedRevenue = toNumber(row[FIELD.CompletedRevenue]);

    // Skip BUs with zero activity
    if (totalRevenue === 0 && completedRevenue === 0) continue;

    results.push({
      name: String(row[FIELD.Name] ?? "Unknown"),
      totalRevenue: round(totalRevenue, 2),
      completedRevenue: round(completedRevenue, 2),
      nonJobRevenue: round(toNumber(row[FIELD.NonJobRevenue]), 2),
      adjustmentRevenue: round(toNumber(row[FIELD.AdjustmentRevenue]), 2),
      opportunities: Math.round(toNumber(row[FIELD.Opportunity])),
      convertedJobs: Math.round(toNumber(row[FIELD.ConvertedJobs])),
      conversionRate: round(toNumber(row[FIELD.OpportunityConversionRate]) * 100, 1),
    });
  }

  return results.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function hasAnyProductivityActivity(row: unknown[]): boolean {
  return (
    toNumber(row[PRODUCTIVITY_FIELD.RevenuePerHour]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.BillableEfficiency]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.Upsold]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.TasksPerOpportunity]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.OptionsPerOpportunity]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.RecallsCaused]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.AdjustmentRevenue]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.TotalRevenue]) !== 0 ||
    toNumber(row[PRODUCTIVITY_FIELD.NonJobRevenue]) !== 0
  );
}

function parseProductivityRows(response: unknown): BUProductivityRow[] {
  const rows = extractProductivityRows(response).data;
  const results: BUProductivityRow[] = [];

  for (const row of rows) {
    if (!hasAnyProductivityActivity(row)) {
      continue;
    }

    results.push({
      name: String(row[PRODUCTIVITY_FIELD.Name] ?? "Unknown"),
      productivity: {
        revenuePerHour: round(toNumber(row[PRODUCTIVITY_FIELD.RevenuePerHour]), 2),
        billableEfficiency: round(toNumber(row[PRODUCTIVITY_FIELD.BillableEfficiency]), 3),
        upsold: round(toNumber(row[PRODUCTIVITY_FIELD.Upsold]), 2),
        tasksPerOpportunity: round(toNumber(row[PRODUCTIVITY_FIELD.TasksPerOpportunity]), 2),
        optionsPerOpportunity: round(
          toNumber(row[PRODUCTIVITY_FIELD.OptionsPerOpportunity]),
          2,
        ),
        recallsCaused: Math.round(toNumber(row[PRODUCTIVITY_FIELD.RecallsCaused])),
      },
    });
  }

  return results;
}

function hasAnySalesActivity(row: unknown[]): boolean {
  return (
    toNumber(row[SALES_FIELD.TotalSales]) !== 0 ||
    toNumber(row[SALES_FIELD.ClosedAverageSale]) !== 0 ||
    toNumber(row[SALES_FIELD.CloseRate]) !== 0 ||
    toNumber(row[SALES_FIELD.SalesOpportunity]) !== 0 ||
    toNumber(row[SALES_FIELD.OptionsPerOpportunity]) !== 0 ||
    toNumber(row[SALES_FIELD.AdjustmentRevenue]) !== 0 ||
    toNumber(row[SALES_FIELD.TotalRevenue]) !== 0 ||
    toNumber(row[SALES_FIELD.NonJobRevenue]) !== 0
  );
}

function parseSalesRows(response: unknown): BUSalesRow[] {
  const rows = extractSalesRows(response).data;
  const results: BUSalesRow[] = [];

  for (const row of rows) {
    if (!hasAnySalesActivity(row)) {
      continue;
    }

    results.push({
      name: String(row[SALES_FIELD.Name] ?? "Unknown"),
      sales: {
        totalSales: round(toNumber(row[SALES_FIELD.TotalSales]), 2),
        closedAvgSale: round(toNumber(row[SALES_FIELD.ClosedAverageSale]), 2),
        closeRate: round(toNumber(row[SALES_FIELD.CloseRate]) * 100, 1),
        salesOpportunity: Math.round(toNumber(row[SALES_FIELD.SalesOpportunity])),
        optionsPerOpportunity: round(toNumber(row[SALES_FIELD.OptionsPerOpportunity]), 2),
      },
    });
  }

  return results;
}

function normalizeBusinessUnitName(name: string): string {
  return name.trim().toLowerCase();
}

function buildBusinessUnitMap<T extends { name: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [normalizeBusinessUnitName(row.name), row]));
}

function mergeBusinessUnitReports(
  revenueRows: BURevenue[],
  productivityRows: BUProductivityRow[],
  salesRows: BUSalesRow[],
): BURevenue[] {
  const revenueByName = buildBusinessUnitMap(revenueRows);
  const productivityByName = buildBusinessUnitMap(productivityRows);
  const salesByName = buildBusinessUnitMap(salesRows);
  const businessUnitNames = new Set<string>([
    ...revenueRows.map((row) => row.name),
    ...productivityRows.map((row) => row.name),
    ...salesRows.map((row) => row.name),
  ]);

  return Array.from(businessUnitNames)
    .map((name) => {
      const key = normalizeBusinessUnitName(name);
      const revenueRow = revenueByName.get(key);
      const merged: BURevenue = revenueRow
        ? { ...revenueRow }
        : {
            name,
            totalRevenue: 0,
            completedRevenue: 0,
            nonJobRevenue: 0,
            adjustmentRevenue: 0,
            opportunities: 0,
            convertedJobs: 0,
            conversionRate: 0,
          };

      const productivity = productivityByName.get(key);
      if (productivity) {
        merged.productivity = productivity.productivity;
      }

      const sales = salesByName.get(key);
      if (sales) {
        merged.sales = sales.sales;
      }

      return merged;
    })
    .sort((left, right) => right.totalRevenue - left.totalRevenue || left.name.localeCompare(right.name));
}

function hasProductivity(
  businessUnit: BURevenue,
): businessUnit is BURevenue & { productivity: BUProductivity } {
  return businessUnit.productivity !== undefined;
}

function hasSales(businessUnit: BURevenue): businessUnit is BURevenue & { sales: BUSales } {
  return businessUnit.sales !== undefined;
}

function averageBy<T>(items: T[], mapper: (item: T) => number, decimals = 2): number {
  return round(safeDivide(sumBy(items, mapper), items.length), decimals);
}

function paymentAmount(payment: GenericRecord): number {
  const amt = payment.amount ?? payment.total ?? payment.paymentAmount;
  return toNumber(amt);
}

export function registerIntelligenceRevenueTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_revenue_summary",
    domain: "intelligence",
    operation: "read",
    description:
      "Revenue summary using ServiceTitan's native reporting engine (matches the ST dashboard). Returns total revenue, breakdown by business unit (completed, non-job, adjustment), opportunities, conversion rates, plus BU-level productivity and sales metrics. Set includeCollections=true for payment/collections data (adds ~20s latency)." +
      '\n\nExamples:\n- "What was our total revenue last month?" -> startDate="2026-02-01", endDate="2026-03-01"\n- "How much did HVAC bring in this quarter?" -> startDate="2026-01-01", endDate="2026-04-01", businessUnitName="HVAC"\n- "Revenue year to date" -> startDate="2026-01-01", endDate="2026-03-10"',
    schema: revenueSummarySchema.shape,
    handler: async (params) => {
      try {
        const input = revenueSummarySchema.parse(params);
        const warnings: string[] = [];

        // Resolve businessUnitName → ID via cache if provided
        const buResolved = await resolveBusinessUnitId(client, input.businessUnitId, input.businessUnitName);
        const effectiveBuId = buResolved.id;
        if (input.businessUnitName && !effectiveBuId) {
          warnings.push(`Business unit "${input.businessUnitName}" not found. Showing all business units.`);
        }
        if (buResolved.resolvedName) {
          warnings.push(`Resolved "${input.businessUnitName}" → ${buResolved.resolvedName} (ID: ${effectiveBuId})`);
        }

        // ── Revenue from ST's native reporting engine (Report 175) ──
        // This uses the same calculation as the ST dashboard.
        // TotalRevenue = CompletedRevenue + NonJobRevenue + AdjustmentRevenue
        const reportParams: { name: string; value: string }[] = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];

        if (effectiveBuId !== undefined) {
          reportParams.push({
            name: "BusinessUnitIds",
            value: String(effectiveBuId),
          });
        }

        // Compute date range (needed for payments if requested)
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate, registry.timezone);

        // Core fetches: 3 reports (always). Payments only when includeCollections=true.
        const reportFetches: [
          Promise<unknown>,
          Promise<unknown>,
          Promise<unknown>,
          Promise<GenericRecord[]>,
        ] = [
          fetchWithWarning(
            warnings,
            "Revenue report (Report 175)",
            () =>
              client.post(
                "/tenant/{tenant}/report-category/business-unit-dashboard/reports/175/data",
                { parameters: reportParams },
              ),
            createEmptyReportResponse(),
          ),
          fetchWithWarning(
            warnings,
            "Productivity report (Report 177)",
            () =>
              client.post(
                "/tenant/{tenant}/report-category/business-unit-dashboard/reports/177/data",
                { parameters: reportParams },
              ),
            createEmptyReportResponse(),
          ),
          fetchWithWarning(
            warnings,
            "Sales report (Report 179)",
            () =>
              client.post(
                "/tenant/{tenant}/report-category/business-unit-dashboard/reports/179/data",
                { parameters: reportParams },
              ),
            createEmptyReportResponse(),
          ),
          input.includeCollections
            ? fetchWithWarning(
                warnings,
                "Payment data",
                () =>
                  fetchAllPagesParallel<GenericRecord>(client, "/tenant/{tenant}/payments", {
                    paidOnAfter: startIso,
                    paidOnBefore: endIso,
                    businessUnitIds:
                      effectiveBuId === undefined
                        ? undefined
                        : String(effectiveBuId),
                  }),
                [],
              )
            : Promise.resolve([]),
        ];

        const [reportResponse, productivityReportResponse, salesReportResponse, payments] =
          await Promise.all(reportFetches);

        const revenueRows = parseReportRows(reportResponse);
        const productivityRows = parseProductivityRows(productivityReportResponse);
        const salesRows = parseSalesRows(salesReportResponse);
        const byBU = mergeBusinessUnitReports(revenueRows, productivityRows, salesRows);

        const totalRevenue = round(sumBy(byBU, (bu) => bu.totalRevenue), 2);
        const completedRevenue = round(sumBy(byBU, (bu) => bu.completedRevenue), 2);
        const nonJobRevenue = round(sumBy(byBU, (bu) => bu.nonJobRevenue), 2);
        const adjustmentRevenue = round(sumBy(byBU, (bu) => bu.adjustmentRevenue), 2);
        const totalOpportunities = byBU.reduce((s, bu) => s + bu.opportunities, 0);
        const totalConvertedJobs = byBU.reduce((s, bu) => s + bu.convertedJobs, 0);
        const avgTicket = round(safeDivide(completedRevenue, totalConvertedJobs), 2);
        const overallConversionRate = round(
          safeDivide(totalConvertedJobs, totalOpportunities) * 100,
          1,
        );
        const productivityByBU = byBU.filter(hasProductivity);
        const salesByBU = byBU.filter(hasSales);

        // Collections only computed when explicitly requested
        const totalCollected = input.includeCollections
          ? round(sumBy(payments, paymentAmount), 2)
          : undefined;
        const outstanding = totalCollected !== undefined
          ? round(totalRevenue - totalCollected, 2)
          : undefined;

        const result: Record<string, unknown> = {
          period: { start: input.startDate, end: input.endDate },
          totalRevenue,
          revenueBreakdown: {
            completedRevenue,
            nonJobRevenue,
            adjustmentRevenue,
          },
          productivity: {
            averageRevenuePerHour: averageBy(
              productivityByBU,
              (bu) => bu.productivity.revenuePerHour,
              2,
            ),
            averageBillableEfficiency: averageBy(
              productivityByBU,
              (bu) => bu.productivity.billableEfficiency,
              3,
            ),
            totalUpsold: round(sumBy(productivityByBU, (bu) => bu.productivity.upsold), 2),
            averageTasksPerOpportunity: averageBy(
              productivityByBU,
              (bu) => bu.productivity.tasksPerOpportunity,
              2,
            ),
            averageOptionsPerOpportunity: averageBy(
              productivityByBU,
              (bu) => bu.productivity.optionsPerOpportunity,
              2,
            ),
            totalRecallsCaused: productivityByBU.reduce(
              (sum, bu) => sum + bu.productivity.recallsCaused,
              0,
            ),
          },
          sales: {
            totalSales: round(sumBy(salesByBU, (bu) => bu.sales.totalSales), 2),
            averageClosedAvgSale: averageBy(salesByBU, (bu) => bu.sales.closedAvgSale, 2),
            averageCloseRate: averageBy(salesByBU, (bu) => bu.sales.closeRate, 1),
            totalSalesOpportunity: salesByBU.reduce(
              (sum, bu) => sum + bu.sales.salesOpportunity,
              0,
            ),
            averageOptionsPerOpportunity: averageBy(
              salesByBU,
              (bu) => bu.sales.optionsPerOpportunity,
              2,
            ),
          },
          totalCollected,
          outstanding,
          avgTicket,
          totalOpportunities,
          totalConvertedJobs,
          overallConversionRate,
          byBusinessUnit: byBU,
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
