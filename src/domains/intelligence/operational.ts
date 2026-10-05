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
  isRecord,
  normalizeStatus,
  round,
  toText,
  toSingleDayRange,
} from "./helpers.js";
import { executeReport } from "./report-executor.js";

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

function numericValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function revenueFromInvoice(invoice: GenericRecord): number | null {
  return numericValue(firstValue(invoice, ["total", "amount", "invoiceTotal"]));
}

function amountFromPayment(payment: GenericRecord): number | null {
  return numericValue(firstValue(payment, ["amount", "total", "paymentAmount"]));
}

function amountFromEstimate(estimate: GenericRecord): number | null {
  return numericValue(firstValue(estimate, ["total", "amount", "subtotal"]));
}

function knownTotal(rows: GenericRecord[] | null, selector: (row: GenericRecord) => number | null): number | null {
  if (rows === null) return null;
  const values = rows.map(selector);
  if (values.some(value => value === null)) return null;
  const total = values.reduce<number>((sum, value) => sum + (value as number), 0);
  return Number.isFinite(total) ? total : null;
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
      "Build a one-day operational snapshot in the configured tenant timezone from all fetched appointment, job, invoice, payment, estimate, and call pages plus Report 163 for the next day. Returns appointment progress, daily invoiced revenue and collections, sold-estimate value, call outcomes, highlights, and at most 20 upcoming jobs. Unavailable metrics are null with source and metric availability reasons; partial source failures appear in _warnings. Results are cached for 60 seconds." +
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
        const sourceAvailability: Record<string, { status: "complete" | "failed" | "not_requested"; reason?: string }> = {};
        const metricAvailability: Record<string, { available: boolean; reason?: string }> = {};
        const fetchSource = async <T>(key: string, label: string, fetcher: () => Promise<T>): Promise<T | null> => {
          const result = await fetchWithWarning<T | null>(warnings, label, fetcher, null);
          sourceAvailability[key] = result === null
            ? { status: "failed", reason: warnings.find(warning => warning.startsWith(`${label} unavailable:`)) ?? `${label} returned no usable response.` }
            : { status: "complete" };
          return result;
        };
        const metric = <T>(key: string, value: T | null, reason: string): T | null => {
          metricAvailability[key] = value === null ? { available: false, reason } : { available: true };
          return value;
        };

        const appointments = await fetchSource(
          "appointments",
          "Appointment data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/appointments", {
              startsOnOrAfter: startIso,
              startsBefore: nextDayStartIso,
            }),
        );

        const jobs = await fetchSource(
          "jobs",
          "Job data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/jobs", {
              appointmentStartsOnOrAfter: startIso,
              appointmentStartsBefore: nextDayStartIso,
            }),
        );

        const invoices = await fetchSource(
          "invoices",
          "Invoice data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/invoices", {
              invoicedOnOrAfter: startIso,
              invoicedOnBefore: endIso,
            }),
        );

        const payments = await fetchSource(
          "payments",
          "Payment data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/payments", {
              paidOnAfter: startIso,
              paidOnBefore: endIso,
            }),
        );

        const soldEstimates = await fetchSource(
          "soldEstimates",
          "Estimate data",
          () =>
            fetchAllPages<GenericRecord>(client, "/tenant/{tenant}/estimates", {
              soldAfter: startIso,
              soldBefore: endIso,
              status: "Sold",
            }),
        );

        const calls = await fetchSource(
          "calls",
          "Call data",
          () =>
            fetchAllPages<GenericRecord>(client, "/v3/tenant/{tenant}/calls", {
              createdOnOrAfter: startIso,
              createdBefore: endIso,
              active: "Any",
            }),
        );

        const upcomingJobsReport = await fetchSource(
          "upcomingJobs",
          "Upcoming jobs report (Report 163)",
          () =>
            executeReport(client, "163", [
                { name: "DateType", value: 6 },
                { name: "From", value: tomorrowDate },
                { name: "To", value: tomorrowDate },
              ], registry.reportBindings),
        );

        let appointmentsCompleted = 0;
        let appointmentsInProgress = 0;
        let appointmentsCanceled = 0;
        let appointmentsPending = 0;
        let appointmentUnknownStatuses = 0;

        for (const appointment of appointments ?? []) {
          const status = normalizeStatus(appointment, ["statusValue"]);
          if (["done", "completed"].includes(status)) {
            appointmentsCompleted += 1;
          } else if (["working", "inprogress", "dispatched", "hold"].includes(status)) {
            appointmentsInProgress += 1;
          } else if (["canceled", "cancelled"].includes(status)) {
            appointmentsCanceled += 1;
          } else if (status === "scheduled") {
            appointmentsPending += 1;
          } else {
            appointmentUnknownStatuses += 1;
          }
        }

        const appointmentTotal = appointments?.length ?? null;

        let jobsCompleted = 0;
        let jobsInProgress = 0;
        let jobsCanceled = 0;

        for (const job of jobs ?? []) {
          const status = normalizeStatus(job, ["statusValue"]);
          if (statusIn(status, ["completed", "done"])) {
            jobsCompleted += 1;
          } else if (statusIn(status, ["inprogress", "working", "dispatched", "hold"])) {
            jobsInProgress += 1;
          } else if (statusIn(status, ["canceled", "cancelled"])) {
            jobsCanceled += 1;
          }
        }

        const invoicedRevenue = metric("revenue.invoiced", knownTotal(invoices, revenueFromInvoice), invoices === null ? "Invoice source unavailable." : "One or more invoice amounts are missing or invalid.");
        const collectedRevenue = metric("revenue.collected", knownTotal(payments, amountFromPayment), payments === null ? "Payment source unavailable." : "One or more payment amounts are missing or invalid.");
        const estimatesSoldValue = metric("revenue.estimatesSold", knownTotal(soldEstimates, amountFromEstimate), soldEstimates === null ? "Estimate source unavailable." : "One or more estimate amounts are missing or invalid.");

        const callsTotal = metric("calls.total", calls?.length ?? null, "Call source unavailable.");
        const callsBooked = metric("calls.booked", calls === null ? null : calls.filter(isBookedCall).length, "Call source unavailable.");
        const callsMissed = metric("calls.missed", calls === null ? null : calls.filter(isMissedCall).length, "Call source unavailable.");
        const allUpcomingJobs = upcomingJobsReport ? parseUpcomingJobsReport(upcomingJobsReport) : [];
        const upcomingJobs = allUpcomingJobs.slice(0, MAX_UPCOMING_JOBS);
        const upcomingJobsByType = summarizeUpcomingJobsByType(allUpcomingJobs);

        const completionRate = metric("appointments.completionRate", appointmentTotal !== null && appointmentTotal > 0 && appointmentUnknownStatuses === 0 ? Math.round(appointmentsCompleted / appointmentTotal * 100) : null,
          appointments === null ? "Appointment source unavailable." : appointmentUnknownStatuses > 0 ? "One or more appointment statuses are unknown." : "No appointments provide a completion-rate denominator.");

        if (allUpcomingJobs.length > MAX_UPCOMING_JOBS) {
          warnings.push(
            `Upcoming jobs list truncated to ${MAX_UPCOMING_JOBS} of ${allUpcomingJobs.length} jobs.`,
          );
        }

        const highlights = [
          appointments === null ? "Appointment progress unavailable."
            : completionRate === null ? `${appointmentsCompleted} confirmed completed appointments; completion rate unavailable.`
            : `${appointmentsCompleted} of ${appointmentTotal} appointments completed (${completionRate}%)`,
          callsMissed === null ? "Missed-call data unavailable."
            : callsMissed > 0
            ? `${callsMissed} missed calls today may need follow-up`
            : "No missed calls recorded today",
          upcomingJobsReport === null ? "Upcoming-job data unavailable." : `${allUpcomingJobs.length} ${allUpcomingJobs.length === 1 ? "job" : "jobs"} scheduled for tomorrow`,
          estimatesSoldValue === null ? "Sold-estimate value unavailable." : `$${formatCurrency(estimatesSoldValue)} in estimates sold`,
        ];

        const result: Record<string, unknown> = {
          date,
          appointments: {
            total: metric("appointments.total", appointmentTotal, "Appointment source unavailable."),
            completed: metric("appointments.completed", appointments === null ? null : appointmentsCompleted, "Appointment source unavailable."),
            inProgress: metric("appointments.inProgress", appointments === null ? null : appointmentsInProgress, "Appointment source unavailable."),
            pending: metric("appointments.pending", appointments === null ? null : appointmentsPending, "Appointment source unavailable."),
            canceled: metric("appointments.canceled", appointments === null ? null : appointmentsCanceled, "Appointment source unavailable."),
            unknownStatus: appointments === null ? null : appointmentUnknownStatuses,
          },
          jobs: {
            total: metric("jobs.total", jobs?.length ?? null, "Job source unavailable."),
            completed: metric("jobs.completed", jobs === null ? null : jobsCompleted, "Job source unavailable."),
            inProgress: metric("jobs.inProgress", jobs === null ? null : jobsInProgress, "Job source unavailable."),
            canceled: metric("jobs.canceled", jobs === null ? null : jobsCanceled, "Job source unavailable."),
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
            total: metric("upcomingJobs.total", upcomingJobsReport === null ? null : allUpcomingJobs.length, "Upcoming-jobs report unavailable."),
            breakdownByJobType: upcomingJobsReport === null ? null : upcomingJobsByType,
            jobs: upcomingJobsReport === null ? null : upcomingJobs,
          },
          highlights,
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
