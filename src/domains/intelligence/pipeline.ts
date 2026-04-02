import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  dayDiff,
  fetchAllPages,
  fetchAllPagesParallel,
  fetchWithWarning,
  firstValue,
  getErrorMessage,
  isRecord,
  normalizeStatus,
  round,
  safeDivide,
  toBoundaryIso,
  toDate,
  toNumber,
  toText,
} from "./helpers.js";

const estimatePipelineSchema = z.object({
  startDate: z.string().optional().describe("Filter estimates created after this date"),
  endDate: z.string().optional().describe("Filter estimates created before this date"),
  soldById: z.number().int().optional().describe("Filter by salesperson/technician"),
});

type GenericRecord = Record<string, unknown>;

type PipelineGroup = "open" | "sold" | "dismissed";

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
  id: number;
  name: string;
  totalSales: number;
  closedAverageSale: number;
  closeRate: number;
  salesOpportunity: number;
  optionsPerOpportunity: number;
}

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function hasAnySalesActivity(tech: SalesByTechnician): boolean {
  return (
    tech.totalSales !== 0 ||
    tech.salesOpportunity !== 0 ||
    tech.closeRate !== 0
  );
}

function parseSalesReport(response: unknown): SalesByTechnician[] {
  const rows = extractReportRows(response);
  const result: SalesByTechnician[] = [];

  for (const row of rows) {
    const id = Math.round(toNumber(row[SALES_FIELD.TechnicianId]));
    if (id <= 0) {
      continue;
    }

    const tech: SalesByTechnician = {
      id,
      name: toText(row[SALES_FIELD.Name]) ?? `Technician ${id}`,
      totalSales: round(toNumber(row[SALES_FIELD.TotalSales]), 2),
      closedAverageSale: round(toNumber(row[SALES_FIELD.ClosedAverageSale]), 2),
      closeRate: round(toNumber(row[SALES_FIELD.CloseRate]) * 100, 1),
      salesOpportunity: Math.round(toNumber(row[SALES_FIELD.SalesOpportunity])),
      optionsPerOpportunity: round(toNumber(row[SALES_FIELD.OptionsPerOpportunity]), 2),
    };

    if (hasAnySalesActivity(tech)) {
      result.push(tech);
    }
  }

  return result;
}

function estimateValue(estimate: GenericRecord): number {
  return toNumber(firstValue(estimate, ["total", "amount", "subtotal"]));
}

function estimateGroup(estimate: GenericRecord): PipelineGroup {
  const status = normalizeStatus(estimate, ["statusValue"]);

  if (
    status.includes("sold") ||
    status.includes("accepted") ||
    firstValue(estimate, ["soldOn", "soldDate"]) !== undefined
  ) {
    return "sold";
  }

  if (status.includes("dismiss") || status.includes("reject") || status.includes("cancel")) {
    return "dismissed";
  }

  return "open";
}

function estimateCreatedOn(estimate: GenericRecord): Date | null {
  return toDate(firstValue(estimate, ["createdOn", "createdAt", "createdDate"]));
}

function estimateSoldOn(estimate: GenericRecord): Date | null {
  return toDate(firstValue(estimate, ["soldOn", "soldDate"]));
}

function estimateCustomerName(estimate: GenericRecord): string {
  const direct = toText(firstValue(estimate, ["customerName", "name", "locationName"]));
  if (direct) {
    return direct;
  }

  const nested = toText(firstValue(estimate, ["customer.name", "customer.displayName"]));
  return nested ?? "Unknown";
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
      "Estimate pipeline summary with open/sold/dismissed funnel, conversion rate, close speed, age buckets, and stale opportunities" +
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
              fetchAllPagesParallel<GenericRecord>(client, "/tenant/{tenant}/estimates", {
                createdOnOrAfter,
                createdBefore,
                soldById: input.soldById,
              }),
            [],
          ),
          fetchWithWarning(
            warnings,
            "Technician sales report (Report 172)",
            () =>
              client.post("/tenant/{tenant}/report-category/technician-dashboard/reports/172/data", {
                parameters: [
                  { name: "From", value: input.startDate ?? "" },
                  { name: "To", value: input.endDate ?? "" },
                ],
              }),
            null,
          ),
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
          open: { count: 0, value: 0 },
          sold: { count: 0, value: 0 },
          dismissed: { count: 0, value: 0 },
        };

        const openBuckets: Record<string, { bucket: string; count: number; value: number }> = {
          "0-7": { bucket: "0-7 days", count: 0, value: 0 },
          "8-14": { bucket: "8-14 days", count: 0, value: 0 },
          "15-30": { bucket: "15-30 days", count: 0, value: 0 },
          "30+": { bucket: "30+ days", count: 0, value: 0 },
        };

        const staleEstimates: Array<{
          id: number;
          customer: string;
          value: number;
          daysOld: number;
        }> = [];

        const daysToClose: number[] = [];

        for (const estimate of estimates) {
          const group = estimateGroup(estimate);
          const value = estimateValue(estimate);
          pipeline[group].count += 1;
          pipeline[group].value += value;

          if (group === "sold") {
            const created = estimateCreatedOn(estimate);
            const sold = estimateSoldOn(estimate);
            if (created && sold) {
              daysToClose.push(dayDiff(created, sold, tz));
            }
            continue;
          }

          if (group !== "open") {
            continue;
          }

          const created = estimateCreatedOn(estimate);
          const daysOld = created ? dayDiff(created, referenceDate, tz) : 0;

          let bucketKey: "0-7" | "8-14" | "15-30" | "30+" = "30+";
          if (daysOld <= 7) {
            bucketKey = "0-7";
          } else if (daysOld <= 14) {
            bucketKey = "8-14";
          } else if (daysOld <= 30) {
            bucketKey = "15-30";
          }

          const bucket = openBuckets[bucketKey];
          bucket.count += 1;
          bucket.value += value;

          if (daysOld > 30) {
            staleEstimates.push({
              id: toNumber(firstValue(estimate, ["id", "estimateId"])),
              customer: estimateCustomerName(estimate),
              value: round(value, 2),
              daysOld,
            });
          }
        }

        const averageDaysToClose =
          daysToClose.length === 0
            ? 0
            : round(
                safeDivide(
                  daysToClose.reduce((total, dayCount) => total + dayCount, 0),
                  daysToClose.length,
                ),
                1,
              );

        const totalSales = round(
          salesByTechnician.reduce((total, tech) => total + tech.totalSales, 0),
          2,
        );
        const totalOpportunities = salesByTechnician.reduce(
          (total, tech) => total + tech.salesOpportunity,
          0,
        );
        const totalRevenue = round(
          salesByTechnician.reduce(
            (total, tech) => total + (tech.totalSales * tech.closedAverageSale),
            0,
          ),
          2,
        );
        const averageCloseRate = round(
          safeDivide(totalSales, totalOpportunities) * 100,
          1,
        );
        const averageClosedSale = round(
          safeDivide(totalRevenue, totalSales),
          2,
        );

        const result: Record<string, unknown> = {
          totalEstimates: estimates.length,
          pipeline: {
            open: {
              count: pipeline.open.count,
              value: round(pipeline.open.value, 2),
            },
            sold: {
              count: pipeline.sold.count,
              value: round(pipeline.sold.value, 2),
            },
            dismissed: {
              count: pipeline.dismissed.count,
              value: round(pipeline.dismissed.value, 2),
            },
          },
          conversionRate: round(safeDivide(pipeline.sold.count, estimates.length), 3),
          averageDaysToClose,
          salesFunnel: {
            totalSales,
            averageCloseRate,
            totalOpportunities,
            averageClosedSale,
            byTechnician: salesByTechnician,
          },
          openByAge: [
            {
              bucket: openBuckets["0-7"].bucket,
              count: openBuckets["0-7"].count,
              value: round(openBuckets["0-7"].value, 2),
            },
            {
              bucket: openBuckets["8-14"].bucket,
              count: openBuckets["8-14"].count,
              value: round(openBuckets["8-14"].value, 2),
            },
            {
              bucket: openBuckets["15-30"].bucket,
              count: openBuckets["15-30"].count,
              value: round(openBuckets["15-30"].value, 2),
            },
            {
              bucket: openBuckets["30+"].bucket,
              count: openBuckets["30+"].count,
              value: round(openBuckets["30+"].value, 2),
            },
          ],
          staleEstimates: staleEstimates
            .sort((a, b) => {
              if (b.daysOld !== a.daysOld) {
                return b.daysOld - a.daysOld;
              }
              return b.value - a.value;
            })
            .slice(0, 25),
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
