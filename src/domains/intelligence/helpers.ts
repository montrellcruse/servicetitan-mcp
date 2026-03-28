import { createHash } from "node:crypto";

import type { ServiceTitanClient } from "../../client.js";
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

interface IntelCacheEntry {
  value: unknown;
  expiresAt: number;
}

const intelCache = new Map<string, IntelCacheEntry>();
const intelInflight = new Map<string, Promise<unknown>>();

function intelCacheKey(toolName: string, args: unknown): string {
  const argsStr = JSON.stringify(args, Object.keys(args as Record<string, unknown>).sort());
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
  const key = intelCacheKey(toolName, args);

  // Check cache
  const cached = intelCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  // Check in-flight dedup
  const inflight = intelInflight.get(key);
  if (inflight) {
    return inflight as Promise<T>;
  }

  // Execute and cache
  const promise = fn().then((result) => {
    intelCache.set(key, { value: result, expiresAt: Date.now() + ttlMs });
    intelInflight.delete(key);
    return result;
  }).catch((err) => {
    intelInflight.delete(key);
    throw err;
  });

  intelInflight.set(key, promise);
  return promise;
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
}

export async function fetchAllPages<T>(
  client: ServiceTitanClient,
  path: string,
  params: Record<string, unknown>,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<T[]> {
  const result = await fetchAllPagesWithTotal<T>(client, path, params, maxPages);
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
    const response = await client.get(
      path,
      buildParams({
        ...params,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        includeTotal: true,
      }),
    );

    // Capture totalCount from the first page response
    if (page === 1 && isRecord(response) && typeof response.totalCount === "number") {
      totalCount = response.totalCount as number;
    }

    const items = extractItems<T>(response);
    allData.push(...items);

    const hasMore = isRecord(response) && response.hasMore === true;
    if (!hasMore || items.length === 0) {
      break;
    }

    if (page === maxPages) {
      // We're at the last allowed page and there are more results
      console.warn(`Pagination truncated at ${maxPages} pages (${allData.length} items fetched). Increase ST_INTEL_MAX_PAGES for full coverage.`);
      truncated = true;
      break;
    }

    page += 1;
  }

  return { data: allData, totalCount, ...(truncated && { _truncated: true }) };
}

/**
 * Fetch all pages in parallel by first probing page 1 for totalCount,
 * then fetching remaining pages concurrently.
 * Falls back to sequential if totalCount isn't available.
 */
export async function fetchAllPagesParallel<T>(
  client: ServiceTitanClient,
  path: string,
  params: Record<string, unknown>,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<T[]> {
  // Fetch page 1 to get totalCount
  const firstResponse = await client.get(
    path,
    buildParams({
      ...params,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      includeTotal: true,
    }),
  );

  const firstItems = extractItems<T>(firstResponse);
  if (firstItems.length === 0) return [];

  const hasMore = isRecord(firstResponse) && firstResponse.hasMore === true;
  if (!hasMore) return firstItems;

  // Calculate remaining pages
  const totalCount = isRecord(firstResponse) && typeof firstResponse.totalCount === "number"
    ? (firstResponse.totalCount as number)
    : undefined;

  let totalPages: number;
  if (totalCount !== undefined) {
    totalPages = Math.min(Math.ceil(totalCount / DEFAULT_PAGE_SIZE), maxPages);
  } else {
    // Fallback to sequential
    return fetchAllPages<T>(client, path, params, maxPages);
  }

  if (totalPages <= 1) return firstItems;

  // Fetch pages 2..N in parallel, tracking failures
  const pagePromises: Promise<{ items: T[]; error?: Error }>[] = [];
  for (let page = 2; page <= totalPages; page++) {
    pagePromises.push(
      client
        .get(
          path,
          buildParams({
            ...params,
            page,
            pageSize: DEFAULT_PAGE_SIZE,
          }),
        )
        .then((response) => ({ items: extractItems<T>(response) }))
        .catch((error) => ({ items: [] as T[], error: error as Error })),
    );
  }

  const remainingPages = await Promise.all(pagePromises);
  
  // Log any page fetch failures
  const failedPages = remainingPages.filter((r) => r.error);
  if (failedPages.length > 0) {
    console.warn(`Failed to fetch ${failedPages.length}/${remainingPages.length} pages. Results may be incomplete.`);
  }

  // Warn if pagination was truncated at max page limit
  if (totalCount !== undefined && totalPages === maxPages && totalCount > maxPages * DEFAULT_PAGE_SIZE) {
    console.warn(`Parallel pagination truncated at ${maxPages} pages (${maxPages * DEFAULT_PAGE_SIZE} of ${totalCount} items). Increase ST_INTEL_MAX_PAGES for full coverage.`);
  }

  return [firstItems, ...remainingPages.map((r) => r.items)].flat();
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
  const utcMidnight = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`,
  );

  if (Number.isNaN(utcMidnight.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  if (timezone === "UTC") {
    return utcMidnight;
  }

  // Use start-of-day for offset calculation to avoid millisecond precision loss.
  // getTimezoneOffsetMs reconstructs local time with second precision only,
  // so computing the offset from the start-of-day instant avoids the 999ms drift
  // that occurs when reconstructing from 23:59:59.999.
  const startOfDay = new Date(`${value}T00:00:00.000Z`);
  const offsetMs = getTimezoneOffsetMs(timezone, startOfDay);

  // For end-of-day: compute start-of-next-day and subtract 1ms.
  // This guarantees the boundary is exactly 23:59:59.999 in local time.
  if (endOfDay) {
    const nextDayUtc = new Date(startOfDay.getTime() + DAY_MS);
    return new Date(nextDayUtc.getTime() - offsetMs - 1);
  }

  return new Date(startOfDay.getTime() - offsetMs);
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
