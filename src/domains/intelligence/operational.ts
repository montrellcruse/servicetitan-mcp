import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  currentDateInTimezone,
  fetchAllPages,
  fetchWithWarning,
  firstValue,
  formatCurrency,
  getErrorMessage,
  isRecord,
  normalizeStatus,
  round,
  safeDivide,
  sumBy,
  toNumber,
  toText,
  toSingleDayRange,
} from "./helpers.js";

const dailySnapshotSchema = z.object({
  date: z.string().optional().describe("Date to snapshot (YYYY-MM-DD, defaults to today)"),
});

const MAX_UPCOMING_JOBS = 20;

const UPCOMING_JOBS_FIELD = {
  JobNumber: 0,
  ScheduledDate: 1,
  CustomerName: 2,
  LocationAddress: 7,
  JobType: 10,
  AssignedTechnicians: 11,
} as const;

type GenericRecord = Record<string, unknown>;

interface UpcomingJob {
  jobNumber: string;
  scheduledDate: string;
  customerName: string;
  locationAddress: string;
  jobType: string;
  assignedTechnicians: string;
}

function revenueFromInvoice(invoice: GenericRecord): number {
  return toNumber(firstValue(invoice, ["total", "amount", "invoiceTotal"]));
}

function amountFromPayment(payment: GenericRecord): number {
  return toNumber(firstValue(payment, ["amount", "total", "paymentAmount"]));
}

function amountFromEstimate(estimate: GenericRecord): number {
  return toNumber(firstValue(estimate, ["total", "amount", "subtotal"]));
}

function statusIn(status: string, values: string[]): boolean {
  return values.some((value) => status.includes(value));
}

function normalizedLeadCallType(call: GenericRecord): string {
  const callType = firstValue(call, ["leadCall.callType"]);
  return typeof callType === "string" ? callType.trim().toLowerCase() : "";
}

function isBookedCall(call: GenericRecord): boolean {
  if (normalizedLeadCallType(call) === "booked") {
    return true;
  }

  if (firstValue(call, ["booked", "isBooked", "bookingCreated"]) === true) {
    return true;
  }

  return firstValue(call, ["bookingId", "jobId"]) !== undefined;
}

function isMissedCall(call: GenericRecord): boolean {
  const callType = normalizedLeadCallType(call);
  if (callType === "missed" || callType === "abandoned") {
    return true;
  }

  if (firstValue(call, ["missed", "isMissed", "unanswered"]) === true) {
    return true;
  }

  const status = normalizeStatus(call, ["statusValue"]);
  return (
    status.includes("missed") ||
    status.includes("noanswer") ||
    status.includes("unanswered") ||
    status.includes("abandoned")
  );
}

function extractReportRows(response: unknown): unknown[][] {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return [];
  }

  return response.data.filter(Array.isArray);
}

function parseUpcomingJobsReport(response: unknown): UpcomingJob[] {
  const rows = extractReportRows(response);
  const jobs: UpcomingJob[] = [];

  for (const row of rows) {
    jobs.push({
      jobNumber: toText(row[UPCOMING_JOBS_FIELD.JobNumber]) ?? "Unknown",
      scheduledDate: toText(row[UPCOMING_JOBS_FIELD.ScheduledDate]) ?? "",
      customerName: toText(row[UPCOMING_JOBS_FIELD.CustomerName]) ?? "Unknown",
      locationAddress: toText(row[UPCOMING_JOBS_FIELD.LocationAddress]) ?? "Unknown",
      jobType: toText(row[UPCOMING_JOBS_FIELD.JobType]) ?? "Unknown",
      assignedTechnicians:
        toText(row[UPCOMING_JOBS_FIELD.AssignedTechnicians]) ?? "Unassigned",
    });
  }

  return jobs;
}

function summarizeUpcomingJobsByType(
  jobs: UpcomingJob[],
): Array<{ jobType: string; count: number }> {
  const counts = new Map<string, number>();

  for (const job of jobs) {
    counts.set(job.jobType, (counts.get(job.jobType) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([jobType, count]) => ({ jobType, count }))
    .sort((left, right) => right.count - left.count || left.jobType.localeCompare(right.jobType));
}

export function registerIntelligenceDailySnapshotTool(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "intel_daily_snapshot",
    domain: "intelligence",
    operation: "read",
    cacheTtlMs: 60_000,
    cacheKeyParams: (params) => {
      const input = dailySnapshotSchema.parse(params);
      return {
        ...input,
        date: input.date ?? currentDateInTimezone(registry.timezone),
      };
    },
    description:
      "Daily operational snapshot with appointments, job progress, revenue to-date, call outcomes, next-day upcoming jobs, and plain-English highlights" +
      '\n\nExamples:\n- "How did today go?" -> date="2026-03-10"\n- "Give me yesterday\'s numbers" -> date="2026-03-09"\n- "What happened on Monday?" -> date="2026-03-09"',
    schema: dailySnapshotSchema.shape,
    handler: async (params) => {
      try {
        const input = dailySnapshotSchema.parse(params);
        const date = input.date ?? currentDateInTimezone(registry.timezone);
        const { startIso, endIso, nextDate, nextDayStartIso } = toSingleDayRange(
          date,
          registry.timezone,
        );
        const tomorrowDate = nextDate;
        const warnings: string[] = [];

        const appointments = await fetchWithWarning(
          warnings,
          "Appointment data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/appointments", {
              startsOnOrAfter: startIso,
              startsBefore: nextDayStartIso,
            }),
          [],
        );

        const jobs = await fetchWithWarning(
          warnings,
          "Job data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/jobs", {
              appointmentStartsOnOrAfter: startIso,
              appointmentStartsBefore: nextDayStartIso,
            }),
          [],
        );

        const invoices = await fetchWithWarning(
          warnings,
          "Invoice data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/invoices", {
              invoicedOnOrAfter: startIso,
              invoicedOnBefore: endIso,
            }),
          [],
        );

        const payments = await fetchWithWarning(
          warnings,
          "Payment data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/payments", {
              paidOnAfter: startIso,
              paidOnBefore: endIso,
            }),
          [],
        );

        const soldEstimates = await fetchWithWarning(
          warnings,
          "Estimate data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/estimates", {
              soldAfter: startIso,
              soldBefore: endIso,
              status: "Sold",
            }),
          [],
        );

        const calls = await fetchWithWarning(
          warnings,
          "Call data",
          () =>
            fetchAllPages<GenericRecord>(client, "/v3/tenant/{tenant}/calls", {
              createdOnOrAfter: startIso,
              createdBefore: endIso,
              active: "Any",
            }),
          [],
        );

        const upcomingJobsReport = await fetchWithWarning(
          warnings,
          "Upcoming jobs report (Report 163)",
          () =>
            client.post("/tenant/{tenant}/report-category/operations/reports/163/data", {
              parameters: [
                { name: "DateType", value: "Appointment Date" },
                { name: "From", value: tomorrowDate },
                { name: "To", value: tomorrowDate },
              ],
            }),
          null,
        );

        let appointmentsCompleted = 0;
        let appointmentsInProgress = 0;

        for (const appointment of appointments) {
          const status = normalizeStatus(appointment, ["statusValue"]);
          if (statusIn(status, ["done", "completed"])) {
            appointmentsCompleted += 1;
          } else if (statusIn(status, ["working", "inprogress", "dispatched", "hold"])) {
            appointmentsInProgress += 1;
          }
        }

        const appointmentTotal = appointments.length;
        const appointmentPending = Math.max(
          appointmentTotal - appointmentsCompleted - appointmentsInProgress,
          0,
        );

        let jobsCompleted = 0;
        let jobsInProgress = 0;
        let jobsCanceled = 0;

        for (const job of jobs) {
          const status = normalizeStatus(job, ["statusValue"]);
          if (statusIn(status, ["completed", "done"])) {
            jobsCompleted += 1;
          } else if (statusIn(status, ["inprogress", "working", "dispatched", "hold"])) {
            jobsInProgress += 1;
          } else if (statusIn(status, ["canceled", "cancelled"])) {
            jobsCanceled += 1;
          }
        }

        const invoicedRevenue = round(sumBy(invoices, revenueFromInvoice), 2);
        const collectedRevenue = round(sumBy(payments, amountFromPayment), 2);
        const estimatesSoldValue = round(sumBy(soldEstimates, amountFromEstimate), 2);

        const callsTotal = calls.length;
        const callsBooked = calls.filter(isBookedCall).length;
        const callsMissed = calls.filter(isMissedCall).length;
        const allUpcomingJobs = upcomingJobsReport ? parseUpcomingJobsReport(upcomingJobsReport) : [];
        const upcomingJobs = allUpcomingJobs.slice(0, MAX_UPCOMING_JOBS);
        const upcomingJobsByType = summarizeUpcomingJobsByType(allUpcomingJobs);

        const completionRate = Math.round(safeDivide(appointmentsCompleted, appointmentTotal) * 100);

        if (allUpcomingJobs.length > MAX_UPCOMING_JOBS) {
          warnings.push(
            `Upcoming jobs list truncated to ${MAX_UPCOMING_JOBS} of ${allUpcomingJobs.length} jobs.`,
          );
        }

        const highlights = [
          `${appointmentsCompleted} of ${appointmentTotal} appointments completed (${completionRate}%)`,
          callsMissed > 0
            ? `${callsMissed} missed calls today may need follow-up`
            : "No missed calls recorded today",
          `${allUpcomingJobs.length} ${allUpcomingJobs.length === 1 ? "job" : "jobs"} scheduled for tomorrow`,
          `$${formatCurrency(estimatesSoldValue)} in estimates sold`,
        ];

        const result: Record<string, unknown> = {
          date,
          appointments: {
            total: appointmentTotal,
            completed: appointmentsCompleted,
            inProgress: appointmentsInProgress,
            pending: appointmentPending,
          },
          jobs: {
            total: jobs.length,
            completed: jobsCompleted,
            inProgress: jobsInProgress,
            canceled: jobsCanceled,
          },
          revenue: {
            invoiced: invoicedRevenue,
            collected: collectedRevenue,
            estimatesSold: estimatesSoldValue,
          },
          calls: {
            total: callsTotal,
            booked: callsBooked,
            missed: callsMissed,
          },
          upcomingJobs: {
            total: allUpcomingJobs.length,
            breakdownByJobType: upcomingJobsByType,
            jobs: upcomingJobs,
          },
          highlights,
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
