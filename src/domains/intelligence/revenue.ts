import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { executeReport } from "./report-executor.js";
import { toolError, toolResult } from "../../utils.js";
import {
  fetchAllPagesBlind,
  getErrorMessage,
  toDateRange,
} from "./helpers.js";
import { resolveBusinessUnitId } from "./resolvers.js";

const revenueSummarySchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit ID"),
  businessUnitName: z.string().optional().describe("Filter by business unit name (resolved via cache, e.g. 'HVAC'). Alternative to businessUnitId."),
  includeCollections: z.boolean().optional().default(false).describe("Include payments received during the selected period. Default: false."),
  includeProductivityMetrics: z.boolean().optional().default(false).describe("Include business-unit productivity metrics from Report 177: revenue per hour, billable efficiency, upsold work, tasks per opportunity, and recalls. Default: false."),
});

type GenericRecord = Record<string, unknown>;

/**
 * Revenue report field indices (Report 175: "Revenue" under business-unit-dashboard).
 * Provider-calculated BU fields. Their attribution and eligibility depend on the
 * selected report binding; returning them does not certify dashboard parity.
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

type Metric = number | null;

interface BUProductivity {
  revenuePerHour: Metric;
  billableEfficiency: Metric;
  upsold: Metric;
  tasksPerOpportunity: Metric;
  optionsPerOpportunity: Metric;
  recallsCaused: Metric;
}

interface BUSales {
  totalSales: Metric;
  closedAvgSale: Metric;
  closeRate: Metric;
  salesOpportunity: Metric;
  optionsPerOpportunity: Metric;
}

interface BURevenue {
  name: string;
  totalRevenue: Metric;
  completedRevenue: Metric;
  nonJobRevenue: Metric;
  adjustmentRevenue: Metric;
  opportunityJobAverage: Metric;
  customerSatisfaction: Metric;
  opportunities: Metric;
  convertedJobs: Metric;
  conversionRate: Metric;
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
  z.string().trim().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/)
    .refine((value) => Number.isFinite(Number(value)), "Expected a finite numeric string"),
]).nullish();
const COUNT_CELL_SCHEMA = NUMERIC_CELL_SCHEMA.refine(
  (value) => value == null || (Number.isSafeInteger(Number(value)) && Number(value) >= 0),
  "Expected a nonnegative integer count",
);

const REPORT_175_REQUIRED_FIELDS: readonly RequiredReportField[] = [
  { index: FIELD.Name, name: "Name", schema: NAME_CELL_SCHEMA },
  { index: FIELD.CompletedRevenue, name: "CompletedRevenue", schema: NUMERIC_CELL_SCHEMA },
  { index: FIELD.OpportunityJobAverage, name: "OpportunityJobAverage", schema: NUMERIC_CELL_SCHEMA },
  {
    index: FIELD.OpportunityConversionRate,
    name: "OpportunityConversionRate",
    schema: NUMERIC_CELL_SCHEMA,
  },
  { index: FIELD.Opportunity, name: "Opportunity", schema: COUNT_CELL_SCHEMA },
  { index: FIELD.ConvertedJobs, name: "ConvertedJobs", schema: COUNT_CELL_SCHEMA },
  { index: FIELD.CustomerSatisfaction, name: "CustomerSatisfaction", schema: NUMERIC_CELL_SCHEMA },
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
  { index: PRODUCTIVITY_FIELD.RecallsCaused, name: "RecallsCaused", schema: COUNT_CELL_SCHEMA },
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
  { index: SALES_FIELD.SalesOpportunity, name: "SalesOpportunity", schema: COUNT_CELL_SCHEMA },
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

function numericCell(value: unknown): Metric {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumAvailable(values: Metric[]): Metric {
  if (values.some((value) => value === null)) return null;
  const total = values.reduce<number>((sum, value) => sum + (value as number), 0);
  return Number.isFinite(total) ? total : null;
}

function percent(value: Metric): Metric {
  if (value === null) return null;
  const result = value * 100;
  return Number.isFinite(result) ? result : null;
}

export function sumReport175TotalRevenue(response: unknown): Metric {
  return sumAvailable(extractReportRows(response).data.map((row) => numericCell(row[FIELD.TotalRevenue])));
}

function extractProductivityRows(response: unknown): ReportRowsResult {
  const parsed = validateProductivityReportResponse(response);
  return { data: parsed.data, count: parsed.data.length };
}

function extractSalesRows(response: unknown): ReportRowsResult {
  const parsed = validateSalesReportResponse(response);
  return { data: parsed.data, count: parsed.data.length };
}

function normalizeBusinessUnitName(name: string): string {
  return name.trim().toLowerCase();
}

function buildBusinessUnitMap<T extends { name: string }>(rows: T[], reportId: number): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const key = normalizeBusinessUnitName(row.name);
    if (result.has(key)) throw new Error(`Report ${reportId} contains ambiguous business-unit names`);
    result.set(key, row);
  }
  return result;
}

function parseReportRows(response: unknown): BURevenue[] {
  const rows = extractReportRows(response).data.map((row): BURevenue => ({
    name: String(row[FIELD.Name]),
    totalRevenue: numericCell(row[FIELD.TotalRevenue]),
    completedRevenue: numericCell(row[FIELD.CompletedRevenue]),
    nonJobRevenue: numericCell(row[FIELD.NonJobRevenue]),
    adjustmentRevenue: numericCell(row[FIELD.AdjustmentRevenue]),
    opportunityJobAverage: numericCell(row[FIELD.OpportunityJobAverage]),
    customerSatisfaction: numericCell(row[FIELD.CustomerSatisfaction]),
    opportunities: numericCell(row[FIELD.Opportunity]),
    convertedJobs: numericCell(row[FIELD.ConvertedJobs]),
    conversionRate: percent(numericCell(row[FIELD.OpportunityConversionRate])),
  }));
  buildBusinessUnitMap(rows, 175);
  return rows;
}

function parseProductivityRows(response: unknown): BUProductivityRow[] {
  const rows = extractProductivityRows(response).data.map((row): BUProductivityRow => ({
    name: String(row[PRODUCTIVITY_FIELD.Name]),
    productivity: {
      revenuePerHour: numericCell(row[PRODUCTIVITY_FIELD.RevenuePerHour]),
      billableEfficiency: numericCell(row[PRODUCTIVITY_FIELD.BillableEfficiency]),
      upsold: numericCell(row[PRODUCTIVITY_FIELD.Upsold]),
      tasksPerOpportunity: numericCell(row[PRODUCTIVITY_FIELD.TasksPerOpportunity]),
      optionsPerOpportunity: numericCell(row[PRODUCTIVITY_FIELD.OptionsPerOpportunity]),
      recallsCaused: numericCell(row[PRODUCTIVITY_FIELD.RecallsCaused]),
    },
  }));
  buildBusinessUnitMap(rows, 177);
  return rows;
}

function parseSalesRows(response: unknown): BUSalesRow[] {
  const rows = extractSalesRows(response).data.map((row): BUSalesRow => ({
    name: String(row[SALES_FIELD.Name]),
    sales: {
      totalSales: numericCell(row[SALES_FIELD.TotalSales]),
      closedAvgSale: numericCell(row[SALES_FIELD.ClosedAverageSale]),
      closeRate: percent(numericCell(row[SALES_FIELD.CloseRate])),
      salesOpportunity: numericCell(row[SALES_FIELD.SalesOpportunity]),
      optionsPerOpportunity: numericCell(row[SALES_FIELD.OptionsPerOpportunity]),
    },
  }));
  buildBusinessUnitMap(rows, 179);
  return rows;
}

function mergeBusinessUnitReports(
  revenueRows: BURevenue[],
  productivityRows: BUProductivityRow[],
  salesRows: BUSalesRow[],
): BURevenue[] {
  const revenueByName = buildBusinessUnitMap(revenueRows, 175);
  const productivityByName = buildBusinessUnitMap(productivityRows, 177);
  const salesByName = buildBusinessUnitMap(salesRows, 179);
  const keys = new Set([...revenueByName.keys(), ...productivityByName.keys(), ...salesByName.keys()]);
  return Array.from(keys).map((key) => {
    const revenueRow = revenueByName.get(key);
    const productivityRow = productivityByName.get(key);
    const salesRow = salesByName.get(key);
    const merged: BURevenue = revenueRow ? { ...revenueRow } : {
      name: productivityRow?.name ?? salesRow!.name,
      totalRevenue: null,
      completedRevenue: null,
      nonJobRevenue: null,
      adjustmentRevenue: null,
      opportunityJobAverage: null,
      customerSatisfaction: null,
      opportunities: null,
      convertedJobs: null,
      conversionRate: null,
    };
    if (productivityRow) merged.productivity = productivityRow.productivity;
    if (salesRow) merged.sales = salesRow.sales;
    return merged;
  }).sort((left, right) => {
    if (left.totalRevenue === null) return right.totalRevenue === null ? left.name.localeCompare(right.name) : 1;
    if (right.totalRevenue === null) return -1;
    return right.totalRevenue - left.totalRevenue || left.name.localeCompare(right.name);
  });
}

interface SourceAvailability {
  status: "complete" | "failed" | "not_requested";
  reason?: string;
}

interface SourceResult<T> {
  availability: SourceAvailability;
  value: T | null;
}

async function fetchSource<T>(
  warnings: string[],
  label: string,
  requested: boolean,
  fetcher: () => Promise<T>,
): Promise<SourceResult<T>> {
  if (!requested) return { availability: { status: "not_requested" }, value: null };
  try {
    return { availability: { status: "complete" }, value: await fetcher() };
  } catch (error: unknown) {
    const reason = getErrorMessage(error);
    warnings.push(`${label} unavailable: ${reason}`);
    return { availability: { status: "failed", reason }, value: null };
  }
}

function paymentAmount(payment: GenericRecord): Metric {
  for (const key of ["amount", "total", "paymentAmount"]) {
    if (key in payment) {
      const parsed = NUMERIC_CELL_SCHEMA.safeParse(payment[key]);
      return parsed.success ? numericCell(parsed.data) : null;
    }
  }
  return null;
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
      "Summarize Report 175 revenue and Report 179 sales for the inclusive report date range, optionally filtered to one business unit. Preserves provider BU values, including zero-activity rows, and sums available additive fields. avgTicket is a custom CompletedRevenue / ConvertedJobs calculation; native OpportunityJobAverage is returned separately per BU. Company sales and productivity averages are null because these reports do not supply their eligible numerators and denominators. includeProductivityMetrics adds Report 177 BU metrics; includeCollections fetches all payment pages. Missing metrics and failed or unrequested sources are qualified explicitly. Totals cover returned report rows; dashboard parity and an all-company cohort are not certified. Report calls are cached briefly and serialized per report/client with at least 65 seconds between starts." +
      '\n\nExamples:\n- "What was our total revenue last month?" -> startDate="2026-02-01", endDate="2026-02-28"\n- "How much did HVAC bring in this quarter?" -> startDate="2026-01-01", endDate="2026-03-31", businessUnitName="HVAC"\n- "Revenue year to date" -> startDate="2026-01-01", endDate="2026-03-10"',
    schema: revenueSummarySchema.shape,
    handler: async (params) => {
      try {
        const input = revenueSummarySchema.parse(params);
        const warnings: string[] = [];
        const metricAvailability: Record<string, { available: boolean; reason?: string }> = {};
        const unavailable = (metric: string, reason: string): null => {
          metricAvailability[metric] = { available: false, reason };
          return null;
        };

        const buResolved = await resolveBusinessUnitId(client, input.businessUnitId, input.businessUnitName);
        const effectiveBuId = buResolved.id;
        if (input.businessUnitName && effectiveBuId === undefined) {
          throw new Error(`Business unit "${input.businessUnitName}" not found; the requested filter cannot be applied.`);
        }
        if (buResolved.resolvedName) {
          warnings.push(`Resolved "${input.businessUnitName}" → ${buResolved.resolvedName} (ID: ${effectiveBuId})`);
        }

        const reportParams: { name: string; value: unknown }[] = [
          { name: "From", value: input.startDate },
          { name: "To", value: input.endDate },
        ];
        if (effectiveBuId !== undefined) {
          reportParams.push({ name: "BusinessUnitIds", value: [effectiveBuId] });
        }
        const { startIso, endIso } = toDateRange(input.startDate, input.endDate, registry.timezone);
        const [revenue, productivity, sales, payments] = await Promise.all([
          fetchSource(warnings, "Revenue report (Report 175)", true, async () =>
            parseReportRows(await executeReport(client, "175", reportParams, registry.reportBindings))),
          fetchSource(warnings, "Productivity report (Report 177)", input.includeProductivityMetrics, async () =>
            parseProductivityRows(await executeReport(client, "177", reportParams, registry.reportBindings))),
          fetchSource(warnings, "Sales report (Report 179)", true, async () =>
            parseSalesRows(await executeReport(client, "179", reportParams, registry.reportBindings))),
          fetchSource(warnings, "Payment data", input.includeCollections, () =>
            fetchAllPagesBlind<GenericRecord>(client, "/tenant/{tenant}/payments", {
              paidOnAfter: startIso,
              paidOnBefore: endIso,
              businessUnitIds: effectiveBuId === undefined ? undefined : String(effectiveBuId),
            })),
        ]);
        const byBU = mergeBusinessUnitReports(revenue.value ?? [], productivity.value ?? [], sales.value ?? []);

        const additive = <T>(
          source: SourceResult<T[]>,
          select: (value: T) => Metric,
          metric: string,
          sourceName: string,
          count = false,
        ): Metric => {
          if (source.value === null) {
            return unavailable(metric, `${sourceName} ${source.availability.status.replace("_", " ")}; no measured total is available.`);
          }
          const total = sumAvailable(source.value.map(select));
          if (total === null || (count && !Number.isSafeInteger(total))) {
            return unavailable(metric, `${sourceName} contains a missing metric or its total is outside the supported numeric range.`);
          }
          return total;
        };
        const derivedRatio = (numerator: Metric, denominator: Metric, metric: string, multiplier = 1): Metric => {
          if (numerator === null || denominator === null) {
            return unavailable(metric, "Required source numerator or denominator is unavailable.");
          }
          if (denominator <= 0) return unavailable(metric, "The measured denominator is zero; the ratio is undefined.");
          const value = numerator / denominator * multiplier;
          return Number.isFinite(value) ? value : unavailable(metric, "The ratio is outside the supported numeric range.");
        };

        // Aggregate each additive field from its own source, without synthesizing
        // missing revenue values for BUs returned only by another report.
        const totalRevenue = additive(revenue, (bu) => bu.totalRevenue, "totalRevenue", "Report 175");
        const completedRevenue = additive(revenue, (bu) => bu.completedRevenue, "revenueBreakdown.completedRevenue", "Report 175");
        const nonJobRevenue = additive(revenue, (bu) => bu.nonJobRevenue, "revenueBreakdown.nonJobRevenue", "Report 175");
        const adjustmentRevenue = additive(revenue, (bu) => bu.adjustmentRevenue, "revenueBreakdown.adjustmentRevenue", "Report 175");
        const totalOpportunities = additive(revenue, (bu) => bu.opportunities, "totalOpportunities", "Report 175", true);
        const totalConvertedJobs = additive(revenue, (bu) => bu.convertedJobs, "totalConvertedJobs", "Report 175", true);
        const avgTicket = derivedRatio(completedRevenue, totalConvertedJobs, "avgTicket");
        const overallConversionRate = derivedRatio(totalConvertedJobs, totalOpportunities, "overallConversionRate", 100);

        const pooledUnavailable = (metric: string, reason: string, source: SourceResult<unknown>): null =>
          unavailable(metric, source.availability.status === "complete"
            ? reason
            : `Source ${source.availability.status.replace("_", " ")}. ${reason}`);
        const result: Record<string, unknown> = {
          period: { start: input.startDate, end: input.endDate },
          totalRevenue,
          revenueBreakdown: { completedRevenue, nonJobRevenue, adjustmentRevenue },
          productivity: {
            averageRevenuePerHour: pooledUnavailable("productivity.averageRevenuePerHour", "Report 177 does not provide matching revenue and job hours for a pooled company ratio.", productivity),
            averageBillableEfficiency: pooledUnavailable("productivity.averageBillableEfficiency", "Report 177 does not provide eligible billable hours and job hours for a pooled company ratio.", productivity),
            totalUpsold: additive(productivity, (bu) => bu.productivity.upsold, "productivity.totalUpsold", "Report 177"),
            averageTasksPerOpportunity: pooledUnavailable("productivity.averageTasksPerOpportunity", "Report 177 does not provide eligible task counts and credited opportunity denominators; BU credits can overlap.", productivity),
            averageOptionsPerOpportunity: pooledUnavailable("productivity.averageOptionsPerOpportunity", "Report 177 does not provide eligible estimate counts and matching opportunity denominators.", productivity),
            totalRecallsCaused: additive(productivity, (bu) => bu.productivity.recallsCaused, "productivity.totalRecallsCaused", "Report 177", true),
          },
          sales: {
            totalSales: additive(sales, (bu) => bu.sales.totalSales, "sales.totalSales", "Report 179"),
            averageClosedAvgSale: pooledUnavailable("sales.averageClosedAvgSale", "Report 179 does not provide sales from eligible closed opportunities and the closed-opportunity count.", sales),
            averageCloseRate: pooledUnavailable("sales.averageCloseRate", "Report 179 does not provide the eligible closed-opportunity count for a pooled close rate.", sales),
            totalSalesOpportunity: additive(sales, (bu) => bu.sales.salesOpportunity, "sales.totalSalesOpportunity", "Report 179", true),
            averageOptionsPerOpportunity: pooledUnavailable("sales.averageOptionsPerOpportunity", "Report 179 does not provide eligible estimate counts and their matching sales-opportunity cohort.", sales),
          },
          paymentsReceivedInPeriod: additive(payments, paymentAmount, "paymentsReceivedInPeriod", "Payment data"),
          metricDefinitions: {
            avgTicket: "Custom derived Report 175 CompletedRevenue / ConvertedJobs across returned BU rows. ConvertedJobs is not a completed-job count. This is not native OpportunityJobAverage, which is returned separately per BU.",
            overallConversionRate: "100 × summed Report 175 ConvertedJobs / summed Opportunity across returned BU rows; not certified as a distinct-company count or every dashboard cohort.",
            paymentsReceivedInPeriod: "Sum of payment amounts whose paidOn timestamp falls in the selected timezone-adjusted period; not accounts-receivable outstanding balance.",
            byBusinessUnit: "Provider BU values are retained at decoded numeric precision. conversionRate and sales.closeRate use percentage units; billableEfficiency retains the native fraction. Shared totals use their source report rather than missing cross-report BU placeholders.",
            pooledAverages: "Company sales and productivity averages are unavailable without independent eligible numerators and denominators; BU ratios are not averaged or reverse-engineered into counts or hours.",
          },
          avgTicket,
          totalOpportunities,
          totalConvertedJobs,
          overallConversionRate,
          byBusinessUnit: byBU,
          _sourceAvailability: {
            report175: revenue.availability,
            report177: productivity.availability,
            report179: sales.availability,
            payments: payments.availability,
          },
          _metricAvailability: metricAvailability,
        };
        if (warnings.length > 0) result._warnings = warnings;
        return toolResult(result, { shape: true });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
