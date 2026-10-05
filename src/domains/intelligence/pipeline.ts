import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { executeReport } from "./report-executor.js";
import { toolError, toolResult } from "../../utils.js";
import {
  dayDiff,
  fetchAllPagesBlind,
  fetchWithWarning,
  firstValue,
  isRecord,
  normalizeStatus,
  round,
  safeDivide,
  toBoundaryIso,
  toDate,
  toText,
} from "./helpers.js";

const estimatePipelineSchema = z.object({
  startDate: z.string().optional().describe("Filter estimates created after this date"),
  endDate: z.string().optional().describe("Filter estimates created before this date"),
  soldById: z.number().int().optional().describe("Filter by salesperson/technician"),
});

type GenericRecord = Record<string, unknown>;

type PipelineGroup = "open" | "sold" | "dismissed" | "unknown";

const SALES_FIELD = {
  Name: 0,
  TotalSales: 1,
  ClosedAverageSale: 2,
  CloseRate: 3,
  SalesOpportunity: 4,
  OptionsPerOpportunity: 5,
  TechnicianId: 6,
  AdjustmentRevenue: 7,
  CompletedRevenueWithAdjustments: 8,
} as const;

interface SalesByTechnician {
  id: number | null;
  name: string;
  totalSales: number | null;
  closedAverageSale: number | null;
  closeRate: number | null;
  salesOpportunity: number | null;
  optionsPerOpportunity: number | null;
}

function numeric(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumKnown(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  const sum = values.reduce<number>((total, value) => total + value!, 0);
  return Number.isFinite(sum) ? sum : null;
}

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function hasAnySalesActivity(tech: SalesByTechnician): boolean {
  return (
    [tech.totalSales, tech.salesOpportunity, tech.closeRate, tech.closedAverageSale, tech.optionsPerOpportunity].some((value) => value !== 0)
  );
}

function parseSalesReport(response: unknown): SalesByTechnician[] {
  const rows = extractReportRows(response);
  const result: SalesByTechnician[] = [];

  for (const row of rows) {
    const rawId = numeric(row[SALES_FIELD.TechnicianId]);
    const id = rawId !== null && Number.isSafeInteger(rawId) && rawId > 0 ? rawId : null;
    const closeRate = numeric(row[SALES_FIELD.CloseRate]);

    const tech: SalesByTechnician = {
      id,
      name: toText(row[SALES_FIELD.Name]) ?? (id === null ? "Unknown technician" : `Technician ${id}`),
      totalSales: numeric(row[SALES_FIELD.TotalSales]),
      closedAverageSale: numeric(row[SALES_FIELD.ClosedAverageSale]),
      closeRate: closeRate === null ? null : closeRate * 100,
      salesOpportunity: numeric(row[SALES_FIELD.SalesOpportunity]),
      optionsPerOpportunity: numeric(row[SALES_FIELD.OptionsPerOpportunity]),
    };

    if (hasAnySalesActivity(tech)) {
      result.push(tech);
    }
  }

  return result;
}

function estimateValue(estimate: GenericRecord): number | null {
  // EstimateResponse declares subtotal, not an invoice total or amount.
  return numeric(estimate.subtotal);
}

function estimateGroup(estimate: GenericRecord): PipelineGroup {
  const status = normalizeStatus(estimate, ["statusValue"]);

  if (status === "sold") return "sold";
  if (status === "dismissed") return "dismissed";
  if (status === "open") return "open";
  return "unknown";
}

function estimateCreatedOn(estimate: GenericRecord): Date | null {
  return toDate(firstValue(estimate, ["createdOn", "createdAt", "createdDate"]));
}

function estimateSoldOn(estimate: GenericRecord): Date | null {
  return toDate(firstValue(estimate, ["soldOn", "soldDate"]));
}

function estimateCustomerName(estimate: GenericRecord): string | null {
  const direct = toText(estimate.customerName);
  if (direct) {
    return direct;
  }

  const nested = toText(firstValue(estimate, ["customer.name", "customer.displayName"]));
  return nested;
}

export function registerIntelligenceEstimatePipelineTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_estimate_pipeline",
    domain: "intelligence",
    operation: "read",
    description:
      "Summarize fetched estimates by provider Open, Sold, Dismissed, or unknown status. Values are estimate subtotals, excluding tax; age and close timing require valid source dates. startDate and endDate bound estimate creation timestamps; both dates add Report 172 technician sales money, opportunities, and provider rates. Pooled technician close rate and average closed sale remain unavailable without a verified same-cohort closed count. soldById filters both sources. Source failures and missing cells return null with availability details." +
      '\n\nExamples:\n- "What\'s our close rate on estimates?" -> startDate="2026-01-01", endDate="2026-03-10"\n- "Show me stale estimates over 30 days" -> returns staleEstimates automatically\n- "How is Andrew doing on sales?" -> soldById=<Andrew\'s ID>',
    schema: estimatePipelineSchema.shape,
    handler: async (params) => {
      try {
        const input = estimatePipelineSchema.parse(params);
        const warnings: string[] = [];

        const tz = registry.timezone;
        const createdOnOrAfter =
          input.startDate === undefined ? undefined : toBoundaryIso(input.startDate, false, tz);
        const createdBefore =
          input.endDate === undefined ? undefined : toBoundaryIso(input.endDate, true, tz);

        // Parallelize estimate fetch and sales report — independent calls
        const [estimates, salesReport] = await Promise.all([
          fetchWithWarning(
            warnings,
            "Estimate data",
            () =>
              fetchAllPagesBlind<GenericRecord>(client, "/tenant/{tenant}/estimates", {
                createdOnOrAfter,
                createdBefore,
                soldById: input.soldById,
              }),
            null,
          ),
          input.startDate !== undefined && input.endDate !== undefined
            ? fetchWithWarning(
                warnings,
                "Technician sales report (Report 172)",
                () => executeReport(client, "172", [
                  { name: "From", value: input.startDate },
                  { name: "To", value: input.endDate },
                ], registry.reportBindings),
                null,
              )
            : Promise.resolve(null),
        ]);

        const allSalesByTechnician = parseSalesReport(salesReport);
        const salesByTechnician =
          input.soldById === undefined
            ? allSalesByTechnician
            : allSalesByTechnician.filter((tech) => tech.id === input.soldById);

        const referenceDate =
          input.endDate === undefined
            ? new Date()
            : new Date(toBoundaryIso(input.endDate, true, tz));

        const pipeline = {
          open: { count: 0, value: 0 as number | null },
          sold: { count: 0, value: 0 as number | null },
          dismissed: { count: 0, value: 0 as number | null },
          unknown: { count: 0, value: 0 as number | null },
        };

        const openBuckets: Record<string, { bucket: string; count: number; value: number | null }> = {
          "0-7": { bucket: "0-7 days", count: 0, value: 0 },
          "8-14": { bucket: "8-14 days", count: 0, value: 0 },
          "15-30": { bucket: "15-30 days", count: 0, value: 0 },
          "30+": { bucket: "30+ days", count: 0, value: 0 },
          unknown: { bucket: "Unknown age", count: 0, value: 0 },
        };

        const staleEstimates: Array<{
          id: number | null;
          customer: string | null;
          estimateName?: string;
          value: number | null;
          daysOld: number;
        }> = [];

        const daysToClose: number[] = [];

        for (const estimate of estimates ?? []) {
          const group = estimateGroup(estimate);
          const value = estimateValue(estimate);
          pipeline[group].count += 1;
          pipeline[group].value = sumKnown([pipeline[group].value, value]);

          if (group === "sold") {
            const created = estimateCreatedOn(estimate);
            const sold = estimateSoldOn(estimate);
            if (created && sold && sold.getTime() >= created.getTime()) {
              daysToClose.push(dayDiff(created, sold, tz));
            }
            continue;
          }

          if (group !== "open") {
            continue;
          }

          const created = estimateCreatedOn(estimate);
          const daysOld = created ? dayDiff(created, referenceDate, tz) : null;

          let bucketKey: "0-7" | "8-14" | "15-30" | "30+" | "unknown" = "unknown";
          if (daysOld !== null && daysOld <= 7) {
            bucketKey = "0-7";
          } else if (daysOld !== null && daysOld <= 14) {
            bucketKey = "8-14";
          } else if (daysOld !== null && daysOld <= 30) {
            bucketKey = "15-30";
          } else if (daysOld !== null) {
            bucketKey = "30+";
          }

          const bucket = openBuckets[bucketKey];
          bucket.count += 1;
          bucket.value = sumKnown([bucket.value, value]);

          if (daysOld !== null && daysOld > 30) {
            const id = numeric(estimate.id);
            const name = toText(estimate.name);
            staleEstimates.push({
              id: id !== null && Number.isSafeInteger(id) && id > 0 ? id : null,
              customer: estimateCustomerName(estimate),
              ...(name ? { estimateName: name } : {}),
              value,
              daysOld,
            });
          }
        }

        const averageDaysToClose =
          daysToClose.length === 0 || daysToClose.length !== pipeline.sold.count
            ? null
            : round(
                safeDivide(
                  daysToClose.reduce((total, dayCount) => total + dayCount, 0),
                  daysToClose.length,
                ),
                1,
              );

        const totalSales = salesReport === null ? null : sumKnown(salesByTechnician.map((tech) => tech.totalSales));
        const totalOpportunities = salesReport === null ? null : sumKnown(salesByTechnician.map((tech) => tech.salesOpportunity));
        const salesRequested = input.startDate !== undefined && input.endDate !== undefined;
        const metricAvailability: Record<string, { available: false; reason: string }> = {
          "salesFunnel.averageCloseRate": { available: false, reason: "No verified same-cohort closed count; TotalSales is money, not a conversion numerator." },
          "salesFunnel.averageClosedSale": { available: false, reason: "No verified same-cohort closed count for pooling provider closed-average sale values." },
        };
        if (totalSales === null) metricAvailability["salesFunnel.totalSales"] = { available: false, reason: "Technician sales source or source cells unavailable." };
        if (totalOpportunities === null) metricAvailability["salesFunnel.totalOpportunities"] = { available: false, reason: "Technician sales source or opportunity cells unavailable." };
        if (averageDaysToClose === null) metricAvailability.averageDaysToClose = { available: false, reason: "Requires at least one sold estimate and valid creation/sold dates for every sold estimate." };
        const conversionRate = estimates === null || estimates.length === 0 || pipeline.unknown.count > 0 ? null : round(pipeline.sold.count / estimates.length, 3);
        if (conversionRate === null) metricAvailability.conversionRate = { available: false, reason: "Estimate source, status coverage, or a nonzero estimate denominator is unavailable." };

        const result: Record<string, unknown> = {
          totalEstimates: estimates?.length ?? null,
          pipeline: Object.fromEntries(Object.entries(pipeline).map(([key, value]) => [key, estimates === null ? { count: null, value: null } : value])),
          conversionRate,
          averageDaysToClose,
          salesFunnel: {
            totalSales,
            averageCloseRate: null,
            totalOpportunities,
            averageClosedSale: null,
            byTechnician: salesReport === null ? null : salesByTechnician,
          },
          openByAge: estimates === null ? null : [
            {
              bucket: openBuckets["0-7"].bucket,
              count: openBuckets["0-7"].count,
              value: openBuckets["0-7"].value,
            },
            {
              bucket: openBuckets["8-14"].bucket,
              count: openBuckets["8-14"].count,
              value: openBuckets["8-14"].value,
            },
            {
              bucket: openBuckets["15-30"].bucket,
              count: openBuckets["15-30"].count,
              value: openBuckets["15-30"].value,
            },
            {
              bucket: openBuckets["30+"].bucket,
              count: openBuckets["30+"].count,
              value: openBuckets["30+"].value,
            },
            ...(openBuckets.unknown.count > 0 ? [openBuckets.unknown] : []),
          ],
          staleEstimates: estimates === null ? null : staleEstimates
            .sort((a, b) => {
              if (b.daysOld !== a.daysOld) {
                return b.daysOld - a.daysOld;
              }
              return (b.value ?? 0) - (a.value ?? 0);
            })
            .slice(0, 25),
          metricDefinitions: { value: "Provider estimate subtotal, excluding tax and vendor tax cost.", conversionRate: "Sold estimate count divided by all fetched estimates; unavailable with unknown statuses. This creation-date cohort is distinct from Report 172 sales." },
          _sourceAvailability: {
            estimates: { status: estimates === null ? "failed" : "complete" },
            technicianSales: { status: !salesRequested ? "not_requested" : salesReport === null ? "failed" : "complete" },
          },
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
