/**
 * EXCLUDED_FIELDS: Metadata and infrastructure fields stripped from all responses.
 * These are framework/pagination fields that add no semantic value to tool output.
 * 
 * CRITICAL: Never add semantic fields (id, type, description, active, count, date, etc).
 * Those are essential for follow-up mutations. If you need to save tokens, use ARRAY_LIMITS
 * instead (capping list size is safer than stripping fields).
 */
const EXCLUDED_FIELDS = new Set<string>([
  // Framework / pagination metadata (safe to strip)
  "requestId",
  "paginationToken",
  "nextPageToken",
  "requestedAt",
  "generatedAt",
  "apiVersion",
  "tool",
  "_warnings",
  "_cache",
  "_meta",

  // Detail blocks (summaries at top level suffice)
  "productivity",
  "sales",
  "byBusinessUnit",
  "membershipTypes",
  "conversionTotals",
  "conversionByBusinessUnit",
  "leadGeneration",
  "memberships",
  "salesFromTechLeads",
  "salesFromMarketingLeads",
  "upcomingJobs",
  "notSentBreakdown",
  "revenueBreakdown",
  "activityBreakdown",

  // Hour breakdowns (totalHours + overtimePercent suffice)
  "regularHours",
  "overtimeHours",
  "doubleOvertimeHours",

  // Field detail (aggregate metric suffices)
  "invoices",
  "openByAge",
  "breakdownByJobType",
]);

const ARRAY_LIMITS = new Map<string, number>([
  ["staleEstimates", 3],
  ["byTechnician", 4],
  ["campaigns", 3],
  ["items", 10],
  ["technicians", 3],  // autoresearch round 3: cap to 3 (teamAverages provides full aggregate)
]);

const FIELD_ABBREVIATIONS = new Map<string, string>([
  ["leadGenerationOpportunity", "leadOpp"],
  ["replacementOpportunity", "replOpp"],
  ["membershipSales", "memSales"],
  ["billableHours", "billHrs"],
  ["totalOpportunities", "totOpps"],
  ["averageTicket", "avgTicket"],
  ["estimateValue", "estVal"],
  ["customerName", "customer"],
  ["technician", "tech"],
  ["businessUnit", "bu"],
  ["opportunity", "opp"],
  ["membership", "mem"],
  ["campaign", "camp"],
  ["conversionOpportunities", "convOpps"],
  ["replacementRevenue", "replRev"],
  ["serviceAgreements", "svcAgree"],
]);

const CURRENCY_TOKENS = new Set<string>([
  "amount",
  "balance",
  "cost",
  "credit",
  "debit",
  "estimate",
  "fee",
  "fees",
  "income",
  "invoice",
  "payment",
  "pay",
  "price",
  "profit",
  "revenue",
  "sale",
  "sales",
  "tax",
  "ticket",
  "value",
  "wage",
]);

const RATIO_TOKENS = new Set<string>([
  "efficiency",
  "margin",
  "pct",
  "percent",
  "percentage",
  "rate",
  "ratio",
  "share",
  "utilization",
]);

const ISO_DATE_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

interface ShapeContext {
  parentKey?: string;
  currentKey?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isResponseShapingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ST_RESPONSE_SHAPING?.trim().toLowerCase() !== "false";
}

function tokenizeKey(key: string | undefined): string[] {
  if (!key) {
    return [];
  }

  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+|\s+/)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
}

function getNumberPrecision(key: string | undefined): number | null {
  const tokens = tokenizeKey(key);

  if (tokens.some((token) => RATIO_TOKENS.has(token))) {
    return 1;
  }

  if (tokens.some((token) => CURRENCY_TOKENS.has(token))) {
    return 0;
  }

  return null;
}

function roundNumber(value: number, key: string | undefined): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const precision = getNumberPrecision(key);

  if (precision === null) {
    return value;
  }

  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function compactIsoDate(value: string): string {
  const match = ISO_DATE_PATTERN.exec(value);
  return match ? match[1] : value;
}

function isSuppressedZero(value: unknown): boolean {
  return value === 0 || value === "0";
}

function shapeValue(value: unknown, context: ShapeContext = {}): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      shapeValue(item, {
        parentKey: context.parentKey,
        currentKey: context.currentKey,
      }),
    );
    const limit = context.parentKey ? ARRAY_LIMITS.get(context.parentKey) : undefined;

    return limit === undefined ? items : items.slice(0, limit);
  }

  if (isPlainObject(value)) {
    const shapedObject: Record<string, unknown> = {};

    for (const [key, rawValue] of Object.entries(value)) {
      if (EXCLUDED_FIELDS.has(key)) {
        continue;
      }

      const shapedValue = shapeValue(rawValue, {
        parentKey: key,
        currentKey: key,
      });

      if (isSuppressedZero(shapedValue)) {
        continue;
      }

      const outputKey = FIELD_ABBREVIATIONS.get(key) ?? key;
      shapedObject[outputKey] = shapedValue;
    }

    return shapedObject;
  }

  if (typeof value === "number") {
    return roundNumber(value, context.currentKey);
  }

  if (typeof value === "string") {
    return compactIsoDate(value);
  }

  return value;
}

export function shapeResponse(data: unknown): unknown {
  if (!isResponseShapingEnabled()) {
    return data;
  }

  return shapeValue(data);
}
