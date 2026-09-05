import { createHash } from "node:crypto";

import type { ServiceTitanClient } from "../../client.js";
import { getRequestContext, throwIfAborted } from "../../request-context.js";
import { buildParams } from "../../utils.js";

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = Number(process.env.ST_INTEL_MAX_PAGES) || 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_INTELLIGENCE_TIMEZONE = process.env.ST_TIMEZONE || "UTC";

// ── Intelligence Result Cache ────────────────────────────────────────────────
// Caches complete tool responses by tool name + args hash.
// TTL is configurable via ST_INTEL_CACHE_TTL_MS env var (default 5 minutes).
// In-flight dedup prevents concurrent identical calls from hitting the API twice.

const INTEL_CACHE_TTL_MS = Number(process.env.ST_INTEL_CACHE_TTL_MS) || 5 * 60 * 1000;
const MAX_INTEL_CACHE_ENTRIES = 256;

interface IntelCacheEntry {
  value: unknown;
  expiresAt: number;
}

const intelCache = new Map<string, IntelCacheEntry>();
const intelInflight = new Map<string, Promise<unknown>>();

function intelCacheKey(toolName: string, args: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  };
  const context = getRequestContext();
  const argsStr = JSON.stringify(canonical({
    args,
    timezone: context.timezone ?? "UTC",
    maxResponseChars: context.maxResponseChars ?? null,
  }));
  return `${toolName}:${createHash("sha256").update(argsStr).digest("hex").slice(0, 16)}`;
}

/**
 * Wrap an async function with the intelligence result cache.
 * If a cached result exists and hasn't expired, returns it immediately.
 * If another call with the same key is already in flight, deduplicates.
 */
export async function withIntelCache<T>(
  toolName: string,
  args: unknown,
  fn: () => Promise<T>,
  ttlMs: number = INTEL_CACHE_TTL_MS,
): Promise<T> {
  throwIfAborted(getRequestContext().signal);
  const key = intelCacheKey(toolName, args);
  // A loader inherits its caller's AbortSignal. Sharing that promise would let
  // one cancelled MCP call cancel an unrelated waiter.
  const deduplicateInflight = getRequestContext().signal === undefined && getRequestContext().storeOversized === undefined;

  const now = Date.now();
  for (const [cacheKey, entry] of intelCache) {
    if (entry.expiresAt <= now) intelCache.delete(cacheKey);
  }

  // Check cache
  const cached = intelCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  // Check in-flight dedup
  const inflight = deduplicateInflight ? intelInflight.get(key) : undefined;
  if (inflight) {
    return inflight as Promise<T>;
  }

  // Execute and cache
  const promise = fn().then((result) => {
    throwIfAborted(getRequestContext().signal);
    if (isCompleteSuccessfulResult(result)) {
      while (intelCache.size >= MAX_INTEL_CACHE_ENTRIES) {
        const oldest = intelCache.keys().next().value as string | undefined;
        if (!oldest) break;
        intelCache.delete(oldest);
      }
      intelCache.set(key, { value: result, expiresAt: Date.now() + ttlMs });
    }
    if (intelInflight.get(key) === promise) intelInflight.delete(key);
    return result;
  }).catch((err) => {
    if (intelInflight.get(key) === promise) intelInflight.delete(key);
    throw err;
  });

  if (deduplicateInflight && intelInflight.size < MAX_INTEL_CACHE_ENTRIES) intelInflight.set(key, promise);
  return promise;
}

function isCompleteSuccessfulResult(result: unknown): boolean {
  if (!isRecord(result)) return true;
  if (result.isError === true) return false;
  if (isRecord(result.structuredContent)) {
    const structured = result.structuredContent;
    if (Array.isArray(structured._warnings) || structured.complete === false || structured.retrievalTool === "st_result_read") return false;
  }
  const content = result.content;
  if (!Array.isArray(content)) return true;
  for (const block of content) {
    if (!isRecord(block) || typeof block.text !== "string") continue;
    try {
      const payload: unknown = JSON.parse(block.text);
      if (isRecord(payload) && (Array.isArray(payload._warnings) || payload.complete === false || payload.retrievalTool === "st_result_read")) {
        return false;
      }
    } catch {
      // Non-JSON successful tool content has no intelligence completeness marker.
    }
  }
  return true;
}

/** Clear the intelligence cache (useful for testing). */
export function clearIntelCache(): void {
  intelCache.clear();
  intelInflight.clear();
}

type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatDateInTimezone(
  date: Date,
  timezone: string = DEFAULT_INTELLIGENCE_TIMEZONE,
): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function currentDateInTimezone(timezone: string = DEFAULT_INTELLIGENCE_TIMEZONE): string {
  return formatDateInTimezone(new Date(), timezone);
}

export async function fetchWithWarning<T>(
  warnings: string[],
  label: string,
  fetcher: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fetcher();
  } catch (error: unknown) {
    warnings.push(`${label} unavailable: ${getErrorMessage(error)}`);
    return fallback;
  }
}

export interface PagedResult<T> {
  data: T[];
  totalCount?: number;
  _truncated?: boolean;
}

export async function fetchAllPages<T>(
  client: ServiceTitanClient,
  path: string,
  params: Record<string, unknown>,
  maxPages: number = DEFAULT_MAX_PAGES,
  warnings?: string[],
): Promise<T[]> {
  const result = await fetchAllPagesWithTotal<T>(client, path, params, maxPages);
  if (result._truncated && warnings) {
    warnings.push(`Pagination truncated: fetched ${result.data.length} items from ${path} (max ${maxPages} pages). Results may be incomplete.`);
  }
  return result.data;
}

export async function fetchAllPagesWithTotal<T>(
  client: ServiceTitanClient,
  path: string,
  params: Record<string, unknown>,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<PagedResult<T>> {
  const allData: T[] = [];
  let page = 1;
  let totalCount: number | undefined;
  let truncated = false;

  while (page <= maxPages) {
    throwIfAborted(getRequestContext().signal);
    const response = await client.get(
      path,
      buildParams({
        ...params,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        includeTotal: true,
      }),
    );
    throwIfAborted(getRequestContext().signal);

    if (!Array.isArray(response) && !(isRecord(response) && Array.isArray(response.data))) {
      throw new Error(`Malformed paginated response from ${path}; expected an array or an object with a data array`);
    }

    // Capture totalCount from the first page response
    if (page === 1 && isRecord(response) && typeof response.totalCount === "number") {
      totalCount = response.totalCount as number;
    }

    const items = extractItems<T>(response);
    allData.push(...items);

    const hasMore = isRecord(response) && response.hasMore === true;
    if (hasMore && items.length === 0) {
      throw new Error(`Pagination returned an empty page with hasMore=true for ${path}; refusing to return incomplete analytics`);
    }
    if (!hasMore) {
      break;
    }

    if (page === maxPages) {
      throw new Error(`Pagination exceeded ${maxPages} pages for ${path}; refusing to return incomplete analytics`);
    }

    page += 1;
  }

  return { data: allData, totalCount, _truncated: truncated || undefined };
}

/** Compatibility name for bounded sequential pagination with visible failures. */
export async function fetchAllPagesParallel<T>(
  client: ServiceTitanClient,
  path: string,
  params: Record<string, unknown>,
  maxPages: number = DEFAULT_MAX_PAGES,
  warnings?: string[],
): Promise<T[]> {
  // Preserve the compatibility export. Sequential pagination is deliberate:
  // it stops at hasMore=false and never turns failed pages into missing rows.
  return fetchAllPages<T>(client, path, params, maxPages, warnings);
}

/** Compatibility name; v3 follows hasMore and never performs blind fan-out. */
export async function fetchAllPagesBlind<T>(
  client: ServiceTitanClient,
  path: string,
  params: Record<string, unknown>,
  maxPages: number = DEFAULT_MAX_PAGES,
  warnings?: string[],
): Promise<T[]> {
  // Preserve the public helper while using the bounded, page-aware implementation.
  // Blind fan-out hid page failures and made every request consume maxPages calls.
  return fetchAllPages<T>(client, path, params, maxPages, warnings);
}

function extractItems<T>(response: unknown): T[] {
  if (Array.isArray(response)) {
    return response as T[];
  }

  if (isRecord(response) && Array.isArray(response.data)) {
    return response.data as T[];
  }

  return [];
}

function parseNumberish(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function safeDivide(
  numerator: number,
  denominator: number,
  defaultValue = 0,
): number {
  if (denominator === 0 || !Number.isFinite(denominator)) return defaultValue;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : defaultValue;
}

export function sumBy<T>(items: T[], mapper: (item: T) => number): number {
  return items.reduce((total, item) => total + parseNumberish(mapper(item)), 0);
}

/**
 * Compute the UTC offset in milliseconds for a given IANA timezone at a specific date.
 * Uses Intl.DateTimeFormat to determine local time parts, then calculates the difference
 * between the UTC timestamp and what that timestamp represents in the target timezone.
 */
function getTimezoneOffsetMs(timezone: string, refDate: Date): number {
  if (timezone === "UTC") return 0;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(refDate);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number.parseInt(part.value, 10) : 0;
  };

  // Reconstruct the local time as if it were UTC to find the offset
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );

  return localAsUtc - refDate.getTime();
}

export function toDateRange(
  startDate: string,
  endDate: string,
  timezone = "UTC",
): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
} {
  const start = parseDateInput(startDate, false, timezone);
  const end = parseDateInput(endDate, true, timezone);

  if (end.getTime() < start.getTime()) {
    throw new Error("endDate must be on or after startDate");
  }

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function toSingleDayRange(
  date: string,
  timezone = "UTC",
): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  nextDate: string;
  nextDayStartIso: string;
} {
  const start = parseDateInput(date, false, timezone);
  const end = parseDateInput(date, true, timezone);
  const nextDate = incrementDateString(date);
  const nextDayStart = parseDateInput(nextDate, false, timezone);

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    nextDate,
    nextDayStartIso: nextDayStart.toISOString(),
  };
}

/**
 * Convert a date string to an ISO boundary timestamp, respecting the tenant timezone.
 * Exported for tools that build their own date filters (e.g. pipeline).
 */
export function toBoundaryIso(value: string, endOfDay: boolean, timezone = "UTC"): string {
  return parseDateInput(value, endOfDay, timezone).toISOString();
}

function parseDateInput(value: string, endOfDay: boolean, timezone = "UTC"): Date {
  // If the value already has timezone info (ISO with Z or offset), parse directly
  if (!DATE_ONLY_PATTERN.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid date: ${value}`);
    }
    return parsed;
  }

  // For date-only values (YYYY-MM-DD), interpret as local midnight in the configured timezone.
  const utcMidnight = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(utcMidnight.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  if (timezone === "UTC") {
    return endOfDay ? new Date(utcMidnight.getTime() + DAY_MS - 1) : utcMidnight;
  }

  const boundaryDate = endOfDay ? incrementDateString(value) : value;
  const wallClockUtc = new Date(`${boundaryDate}T00:00:00.000Z`);
  // Resolve the offset at the resulting instant, then repeat once because the
  // first estimate can cross a DST boundary.
  let instant = new Date(wallClockUtc.getTime() - getTimezoneOffsetMs(timezone, wallClockUtc));
  instant = new Date(wallClockUtc.getTime() - getTimezoneOffsetMs(timezone, instant));
  return endOfDay ? new Date(instant.getTime() - 1) : instant;
}

function incrementDateString(value: string): string {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new Error(`Invalid date: ${value}`);
  }

  const [yearText, monthText, dayText] = value.split("-");
  const nextDate = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText) + 1),
  );

  const year = String(nextDate.getUTCFullYear());
  const month = String(nextDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(nextDate.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function toNumber(value: unknown): number {
  return parseNumberish(value);
}

export function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

export function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function readPath(source: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = source;

  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

export function firstValue(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

export function normalizeStatus(source: unknown, extraPaths: string[] = []): string {
  const status = firstValue(source, [
    "status.name",
    "status.value",
    "status",
    "jobStatus",
    "appointmentStatus",
    "callStatus",
    ...extraPaths,
  ]);

  const statusText = toText(status);
  return statusText ? statusText.toLowerCase() : "";
}

/**
 * Extract the local calendar date (YYYY-MM-DD) for a given instant in a timezone.
 * Falls back to UTC if timezone is not provided or invalid.
 */
function toLocalDateParts(date: Date, timezone?: string): { year: number; month: number; day: number } {
  if (timezone && timezone !== "UTC") {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const year = Number(parts.find((p) => p.type === "year")?.value ?? date.getUTCFullYear());
      const month = Number(parts.find((p) => p.type === "month")?.value ?? date.getUTCMonth() + 1) - 1;
      const day = Number(parts.find((p) => p.type === "day")?.value ?? date.getUTCDate());
      return { year, month, day };
    } catch {
      // Invalid timezone — fall through to UTC
    }
  }
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
}

export function countWeekdaysInclusive(start: Date, end: Date, timezone?: string): number {
  if (end.getTime() < start.getTime()) {
    return 0;
  }

  const startParts = toLocalDateParts(start, timezone);
  const endParts = toLocalDateParts(end, timezone);
  let cursor = Date.UTC(startParts.year, startParts.month, startParts.day);
  const endMs = Date.UTC(endParts.year, endParts.month, endParts.day);
  let weekdays = 0;

  while (cursor <= endMs) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) {
      weekdays += 1;
    }
    cursor += DAY_MS;
  }

  return weekdays;
}

export function dayDiff(from: Date, to: Date, timezone?: string): number {
  const fromParts = toLocalDateParts(from, timezone);
  const toParts = toLocalDateParts(to, timezone);
  const fromMs = Date.UTC(fromParts.year, fromParts.month, fromParts.day);
  const toMs = Date.UTC(toParts.year, toParts.month, toParts.day);
  return Math.max(0, Math.floor((toMs - fromMs) / DAY_MS));
}

export function formatCurrency(value: number): string {
  return round(value, 2).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
