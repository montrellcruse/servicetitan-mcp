import type { ServiceTitanClient } from "../../client.js";
import { fetchAllPages, fetchAllPagesWithTotal, fetchWithWarning, firstValue, isRecord, round } from "./helpers.js";

type RecordData = Record<string, unknown>;

const BOOKED = "booked";
const ABANDONED = "abandoned";
const ANSWERED = new Set([BOOKED, "unbooked", "notlead", "excused"]);

interface Call {
  id: string;
  jobId: string | null;
  direction: string;
  disposition: string;
  active: boolean;
  receivedAt: number;
  qualifyingAbandonment: boolean | null;
}

function positiveId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  return null;
}

function label(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\s_-]/g, "").toLowerCase() : "";
}

function abandonedLead(value: unknown): boolean | null {
  const duration = typeof value === "string" && /^(?:(\d+)\.)?(\d{1,2}):([0-5]\d):([0-5]\d(?:\.\d+)?)$/.exec(value);
  if (!duration) return null;
  const seconds = Number(duration[1] ?? 0) * 86_400 + Number(duration[2]) * 3_600
    + Number(duration[3]) * 60 + Number(duration[4]);
  return seconds >= 60;
}

function parseCall(row: RecordData): Call {
  const leadCall = isRecord(row.leadCall) ? row.leadCall : null;
  const source = leadCall ?? row;
  const id = positiveId(source.id);
  if (!id) throw new Error("A call has no valid call ID");
  const disposition = label(firstValue(source, ["callType.name", "callType", "type.name", "type"]));
  const status = label(firstValue(source, ["status.name", "status", "statusValue"]));
  const missed = firstValue(source, ["missed", "isMissed", "unanswered"]) === true
    || ["missed", "noanswer", "unanswered", ABANDONED].includes(status);
  const booked = firstValue(source, ["booked", "isBooked", "bookingCreated"]) === true || positiveId(source.bookingId) !== null;
  const received = firstValue(source, ["receivedOn", "createdOn", "createdAt"]);
  return {
    id,
    jobId: (leadCall && row.jobNumber ? positiveId(row.id) : null)
      ?? positiveId(firstValue(row, ["jobId", "job.id", "leadCall.jobId", "leadCall.job.id"])),
    direction: label(source.direction ?? row.direction),
    disposition: disposition || (missed ? ABANDONED : booked ? BOOKED : ""),
    active: row.active !== false && source.active !== false,
    receivedAt: typeof received === "string" ? Date.parse(received) : NaN,
    qualifyingAbandonment: abandonedLead(source.duration ?? row.duration),
  };
}

function readBookingPointer(job: RecordData, key: "leadCallId" | "partnerLeadCallId"): string | null {
  const value = job[key];
  if (value === null || value === 0 || value === "0") return null;
  const id = positiveId(value);
  if (!id) throw new Error("A job has a missing or invalid source-call pointer");
  return id;
}

async function countCreditedJobs(client: ServiceTitanClient, calls: Call[], booked: Call[]): Promise<number> {
  const jobIds = new Set<string>();
  for (const call of booked) {
    if (!call.jobId) throw new Error("A Booked inbound call has no verified job link");
    jobIds.add(call.jobId);
  }

  const callsById = new Map(calls.map(call => [call.id, call]));
  const scopedBookedIds = new Set(booked.map(call => call.id));
  const ids = [...jobIds];
  let credits = 0;
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const jobs = await fetchAllPages<RecordData>(client, "/tenant/{tenant}/jobs", { ids: batch.join(",") });
    const byId = new Map(jobs.map(job => [positiveId(job.id), job]));
    if (byId.size !== jobs.length) throw new Error("Job lookup returned duplicate job IDs");
    for (const id of batch) {
      const job = byId.get(id);
      if (!job) throw new Error("A linked job could not be read");
      const primary = readBookingPointer(job, "leadCallId");
      const partner = readBookingPointer(job, "partnerLeadCallId");
      if (primary && partner && primary !== partner) throw new Error("A job has conflicting source-call pointers");
      const pointer = primary ?? partner;
      if (pointer === null) continue;
      const canonical = callsById.get(pointer);
      if (!canonical) throw new Error("A job points to a call outside the confirmed call window");
      if (!scopedBookedIds.has(canonical.id)) continue;
      if (canonical.jobId !== id) throw new Error("A Booked inbound call and its canonical job pointer disagree");
      credits += 1;
    }
  }
  return credits;
}

export async function readDailyCallActivity(
  client: ServiceTitanClient, startIso: string, nextDayStartIso: string, warnings: string[],
) {
  const calls = await fetchWithWarning(warnings, "Call data", async () => {
    const { data, totalCount } = await fetchAllPagesWithTotal<RecordData>(client, "/v3/tenant/{tenant}/calls", {
      createdOnOrAfter: startIso,
      createdBefore: nextDayStartIso,
      active: "Any",
      sort: "Id",
    });
    const parsed = data.map(parseCall);
    if (new Set(parsed.map(call => call.id)).size !== parsed.length ||
        (totalCount !== undefined && totalCount !== parsed.length)) {
      throw new Error("Call pagination returned repeated call IDs or inconsistent totals");
    }
    return parsed;
  }, null);
  if (!calls) return { total: null, booked: null, missed: null, inbound: null };

  const all = {
    total: calls.length,
    booked: calls.filter(call => call.disposition === BOOKED).length,
    missed: calls.filter(call => [ABANDONED, "missed"].includes(call.disposition)).length,
  };
  const active = calls.filter(call => call.active);
  if (active.some(call => call.direction !== "inbound" && call.direction !== "outbound")) {
    warnings.push("Inbound call counts unavailable: one or more active calls have an unknown direction.");
    return { ...all, inbound: null };
  }

  const inbound = active.filter(call => call.direction === "inbound");
  if (inbound.some(call => !Number.isFinite(call.receivedAt))) {
    warnings.push("Inbound call counts unavailable: one or more inbound calls have no valid received or created timestamp.");
    return { ...all, inbound: null };
  }

  const start = Date.parse(startIso);
  const end = Date.parse(nextDayStartIso);
  const inWindow = inbound.filter(call => call.receivedAt >= start && call.receivedAt < end);
  const booked = inWindow.filter(call => call.disposition === BOOKED);
  const abandoned = inWindow.filter(call => call.disposition === ABANDONED);
  const answered = inWindow.filter(call => ANSWERED.has(call.disposition));
  const unclassified = answered.length + abandoned.length !== inWindow.length;
  const unknownDuration = abandoned.some(call => call.qualifyingAbandonment === null);
  if (unclassified || unknownDuration) warnings.push("Some inbound metrics are unavailable because a call disposition or abandoned-call duration is unknown.");

  const eligibleLeads = unclassified || unknownDuration
    ? null
    : booked.length + inWindow.filter(call => call.disposition === "unbooked").length
      + abandoned.filter(call => call.qualifyingAbandonment).length;
  const creditedJobs = unclassified ? null : await fetchWithWarning(
    warnings, "Inbound job booking credit", () => countCreditedJobs(client, calls, booked), null,
  );

  return {
    ...all,
    inbound: {
      total: inWindow.length,
      answered: unclassified ? null : answered.length,
      abandoned: unclassified ? null : abandoned.length,
      markedBooked: unclassified ? null : booked.length,
      eligibleLeads,
      creditedJobs,
      bookingRate: eligibleLeads && creditedJobs !== null ? round(creditedJobs / eligibleLeads * 100, 1) : null,
    },
  };
}
