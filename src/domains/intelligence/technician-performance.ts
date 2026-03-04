import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  countWeekdaysInclusive,
  fetchAllPages,
  fetchWithWarning,
  firstValue,
  getErrorMessage,
  normalizeStatus,
  round,
  safeDivide,
  sumBy,
  toDateRange,
  toNumber,
  toText,
} from "./helpers.js";

const technicianScorecardSchema = z.object({
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  technicianId: z.number().int().optional().describe("Single technician (omit for all)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit"),
});

type GenericRecord = Record<string, unknown>;

function technicianId(technician: GenericRecord): number {
  return toNumber(firstValue(technician, ["id", "technicianId", "userId"]));
}

function technicianName(technician: GenericRecord, id: number): string {
  const direct = toText(firstValue(technician, ["name", "displayName"]));
  if (direct) {
    return direct;
  }

  const first = toText(firstValue(technician, ["firstName"]));
  const last = toText(firstValue(technician, ["lastName"]));
  const combined = `${first ?? ""} ${last ?? ""}`.trim();

  return combined.length > 0 ? combined : `Technician ${id}`;
}

function jobIsCompleted(job: GenericRecord): boolean {
  const status = normalizeStatus(job, ["statusValue"]);
  return status.includes("completed") || status.includes("done");
}

function estimateIsSold(estimate: GenericRecord): boolean {
  const status = normalizeStatus(estimate, ["statusValue"]);
  if (status.includes("sold") || status.includes("accepted")) {
    return true;
  }

  return firstValue(estimate, ["soldOn", "soldDate"]) !== undefined;
}

function invoiceRevenue(invoice: GenericRecord): number {
  return toNumber(firstValue(invoice, ["total", "amount", "invoiceTotal"]));
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
      "Technician performance scorecard with jobs completed, revenue, average ticket, estimate close rate, and team averages",
    schema: technicianScorecardSchema.shape,
    handler: async (params) => {
      try {
        const input = technicianScorecardSchema.parse(params);
        const { start, end, startIso, endIso } = toDateRange(input.startDate, input.endDate);
        const workingDays = countWeekdaysInclusive(start, end);
        const warnings: string[] = [];

        const fetchedTechnicians = await fetchWithWarning(
          warnings,
          "Technician data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/technicians", {
              ids: input.technicianId === undefined ? undefined : String(input.technicianId),
              active: "Any",
            }),
          [],
        );

        const technicians =
          fetchedTechnicians.length > 0
            ? fetchedTechnicians
            : input.technicianId === undefined
              ? []
              : [{ id: input.technicianId, name: `Technician ${input.technicianId}` }];

        const scorecards: Array<{
          id: number;
          name: string;
          jobsCompleted: number;
          revenue: number;
          averageTicket: number;
          estimatesPresented: number;
          estimatesSold: number;
          closeRate: number;
          jobsPerDay: number;
        }> = [];

        for (const technician of technicians) {
          const id = technicianId(technician);
          if (id <= 0) {
            continue;
          }

          const name = technicianName(technician, id);

          const jobs = await fetchWithWarning(
            warnings,
            `Jobs for ${name}`,
            () =>
              fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/jobs", {
                technicianId: id,
                completedOnOrAfter: startIso,
                completedBefore: endIso,
                businessUnitId: input.businessUnitId,
              }),
            [],
          );

          const invoices = await fetchWithWarning(
            warnings,
            `Invoices for ${name}`,
            () =>
              fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/invoices", {
                technicianId: id,
                invoicedOnOrAfter: startIso,
                invoicedOnBefore: endIso,
                businessUnitId: input.businessUnitId,
              }),
            [],
          );

          const estimates = await fetchWithWarning(
            warnings,
            `Estimates for ${name}`,
            () =>
              fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/estimates", {
                soldById: id,
                createdOnOrAfter: startIso,
                createdBefore: endIso,
                businessUnitId: input.businessUnitId,
              }),
            [],
          );

          const jobsCompleted = jobs.filter(jobIsCompleted).length;
          const revenue = round(sumBy(invoices, invoiceRevenue), 2);
          const invoiceCount = invoices.length;
          const averageTicket = round(safeDivide(revenue, invoiceCount), 2);
          const estimatesPresented = estimates.length;
          const estimatesSold = estimates.filter(estimateIsSold).length;
          const closeRate = round(safeDivide(estimatesSold, estimatesPresented), 3);
          const jobsPerDay = round(safeDivide(jobsCompleted, workingDays), 2);

          scorecards.push({
            id,
            name,
            jobsCompleted,
            revenue,
            averageTicket,
            estimatesPresented,
            estimatesSold,
            closeRate,
            jobsPerDay,
          });
        }

        const teamAverages = {
          averageTicket: round(
            safeDivide(
              scorecards.reduce((total, tech) => total + tech.averageTicket, 0),
              scorecards.length,
            ),
            2,
          ),
          closeRate: round(
            safeDivide(
              scorecards.reduce((total, tech) => total + tech.closeRate, 0),
              scorecards.length,
            ),
            3,
          ),
          jobsPerDay: round(
            safeDivide(
              scorecards.reduce((total, tech) => total + tech.jobsPerDay, 0),
              scorecards.length,
            ),
            2,
          ),
        };

        const result: Record<string, unknown> = {
          period: {
            start: input.startDate,
            end: input.endDate,
          },
          technicians: scorecards,
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
