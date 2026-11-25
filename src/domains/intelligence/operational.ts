import { z } from "../../schema.js";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";
import {
  currentDateInTimezone,
  fetchAllPages,
  fetchWithWarning,
  firstValue,
  formatCurrency,
  normalizeStatus,
  round,
  safeDivide,
  sumBy,
  toNumber,
  toText,
  toSingleDayRange,
} from "./helpers.js";
import { readDailyCallActivity } from "./call-activity.js";
import { executeReport, type ReportExecution } from "./report-executor.js";

const dailySnapshotSchema = z.object({
  date: z.string().optional().describe("Date to snapshot (YYYY-MM-DD, defaults to today)"),
});

const MAX_UPCOMING_JOBS = 20;

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

function parseUpcomingJobsReport(report: ReportExecution | null): UpcomingJob[] {
  const rows = report?.data ?? [];
  const jobs: UpcomingJob[] = [];

  for (const row of rows) {
    jobs.push({
      jobNumber: toText(row.JobNumber) ?? "Unknown",
      scheduledDate: toText(row.ScheduledDate) ?? "",
      customerName: toText(row.CustomerName) ?? "Unknown",
      locationAddress: toText(row.LocationAddress) ?? "Unknown",
      jobType: toText(row.JobType) ?? "Unknown",
      assignedTechnicians:
        toText(row.AssignedTechnicians) ?? "Unassigned",
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
    reports: { required: ["163"] },
    cacheTtlMs: 60_000,
    cacheKeyParams: (params) => {
      const input = dailySnapshotSchema.parse(params);
      return {
        ...input,
        date: input.date ?? currentDateInTimezone(registry.timezone),
      };
    },
    description:
      "Build a one-day operational snapshot in the configured tenant timezone from all fetched appointment, job, invoice, payment, estimate, and call pages plus Report 163 for the next day. Returns appointment progress, daily invoiced revenue and collections, sold-estimate value, all-call activity, active inbound leads, distinct canonically credited inbound jobs, highlights, and at most 20 upcoming jobs; truncation and partial source failures appear in _warnings. Results are cached for 60 seconds." +
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
              invoicedOnOrAfter: date + "T00:00:00.000Z",
              invoicedOnBefore: date + "T23:59:59.999Z",
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

        const calls = await readDailyCallActivity(client, startIso, nextDayStartIso, warnings);

        const upcomingJobsReport = await fetchWithWarning(
          warnings,
          "Upcoming jobs report (Report 163)",
          () =>
            executeReport(client, "163", [
                { name: "DateType", value: 6 },
                { name: "From", value: tomorrowDate },
                { name: "To", value: tomorrowDate },
              ], registry.reportBindings),
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

        const allUpcomingJobs = parseUpcomingJobsReport(upcomingJobsReport);
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
          calls.missed === null
            ? "Call activity is unavailable"
            : calls.missed > 0
              ? `${calls.missed} missed calls today may need follow-up`
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
          calls,
          metricDefinitions: {
            "calls.total": "All-directions call records in the creation window, identified by canonical call ID.",
            "calls.booked": "Call records marked Booked, including repeated bookings and all directions.",
            "calls.missed": "Call records marked missed or abandoned, across all directions.",
            "calls.inbound": "Active inbound calls received that day within the fetched creation window; uses created time when received time is absent.",
            "calls.inbound.eligibleLeads": "Booked or Unbooked inbound calls, plus abandoned inbound calls of at least 60 seconds.",
            "calls.inbound.creditedJobs": "Distinct jobs matched to a Booked inbound call by the job's canonical source-call pointer. Null when links cannot be verified.",
            "calls.inbound.bookingRate": "Credited jobs divided by eligible inbound leads, as a percentage. Null if unavailable or there are no leads.",
            "revenue.invoiced": "Invoice header totals by provider invoice calendar day.",
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

        return toolResult(result, { shape: true });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
