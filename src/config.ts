export interface ServiceTitanConfig {
  clientId: string;
  clientSecret: string;
  appKey: string;
  tenantId: string;
  environment: "integration" | "production";
  readonlyMode: boolean;
  /** Mutations require an explicit opt-in; readonlyMode always takes priority. */
  experimentalWrites?: boolean;
  confirmWrites: boolean;
  maxResponseChars: number;
  enabledDomains: string[] | null;
  logLevel: "debug" | "info" | "warn" | "error";
  timezone: string;
  corsOrigin: string;
  allowedCallers: string[] | null;
  toolProfile?: "full" | "crm" | "dispatch" | "analytics";
  enabledTools?: string[] | null;
  reportBindings?: Record<string, { category: string; reportId: number }>;
  maxSessions?: number;
  maxConcurrentToolCalls?: number;
  toolTimeoutMs?: number;
  mcpClientId?: string;
}

export class ExperimentalWritesDisabledError extends Error {
  constructor() {
    super("Mutating tools are experimental and have not been verified against a live ServiceTitan Integration environment. Set ST_READONLY=true for supported readonly use, or explicitly opt in with ST_EXPERIMENTAL_WRITES=true when ST_READONLY=false.");
    this.name = "ExperimentalWritesDisabledError";
  }
}

/** Also validate embedded configurations that did not pass through loadConfig. */
export function assertWritePolicy(config: Pick<ServiceTitanConfig, "readonlyMode" | "experimentalWrites">): void {
  if (config.readonlyMode !== true && config.experimentalWrites !== true) throw new ExperimentalWritesDisabledError();
}

const TOOL_PROFILES = ["full", "crm", "dispatch", "analytics"] as const;

function parseToolProfile(value: string | undefined): NonNullable<ServiceTitanConfig["toolProfile"]> {
  const profile = (value ?? "full").trim().toLowerCase();
  if (TOOL_PROFILES.includes(profile as typeof TOOL_PROFILES[number])) return profile as typeof TOOL_PROFILES[number];
  throw new Error(`ST_TOOL_PROFILE must be one of: ${TOOL_PROFILES.join(", ")}`);
}

function parseReportBindings(value: string | undefined): NonNullable<ServiceTitanConfig["reportBindings"]> {
  if (!value?.trim()) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("ST_REPORT_BINDINGS must be a JSON object"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("ST_REPORT_BINDINGS must be a JSON object");
  const result: NonNullable<ServiceTitanConfig["reportBindings"]> = {};
  for (const [key, binding] of Object.entries(parsed)) {
    if (!/^\d+$/.test(key) || !binding || typeof binding !== "object" || Array.isArray(binding)
      || typeof binding.category !== "string" || !/^[a-z][a-z0-9-]*$/.test(binding.category)
      || !Number.isSafeInteger(binding.reportId) || binding.reportId <= 0) {
      throw new Error("ST_REPORT_BINDINGS entries need a numeric logical report key, category slug, and positive reportId");
    }
    result[key] = { category: binding.category, reportId: binding.reportId };
  }
  return result;
}

function parseCorsOrigin(value: string | undefined): string {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== value.trim()) throw new Error();
    return url.origin;
  } catch { throw new Error("ST_CORS_ORIGIN must be an exact http(s) origin without path, credentials, or wildcard"); }
}

const REQUIRED_ENV_VARS = [
  "ST_CLIENT_ID",
  "ST_CLIENT_SECRET",
  "ST_APP_KEY",
  "ST_TENANT_ID",
] as const;

const VALID_ENVIRONMENTS = ["integration", "production"] as const;
const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

type Environment = (typeof VALID_ENVIRONMENTS)[number];
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

function parseBoolean(
  value: string | undefined,
  variableName: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1"].includes(normalized)) {
    return true;
  }

  if (["false", "0"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `${variableName} must be one of: true, false, 1, 0 (case-insensitive)`,
  );
}

function parsePositiveInteger(
  value: string | undefined,
  variableName: string,
  defaultValue: number,
): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const parsed = Number(value.trim());

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new Error(`${variableName} must be a positive integer. Received: ${value}`);
}

function parseEnvironment(value: string | undefined): Environment {
  const environment = (value ?? "integration").trim().toLowerCase();

  if (VALID_ENVIRONMENTS.includes(environment as Environment)) {
    return environment as Environment;
  }

  throw new Error(
    `ST_ENVIRONMENT must be one of: ${VALID_ENVIRONMENTS.join(", ")}. Received: ${value}`,
  );
}

function parseDomains(value: string | undefined): string[] | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const domains = value
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  return domains.length === 0 ? null : domains;
}

function parseAllowedCallers(value: string | undefined): string[] | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }

  const callers = value
    .split(",")
    .map((caller) => caller.trim().toLowerCase())
    .filter(Boolean);

  return callers.length === 0 ? null : callers;
}

function parseLogLevel(value: string | undefined): LogLevel {
  const logLevel = (value ?? "info").trim().toLowerCase();

  if (VALID_LOG_LEVELS.includes(logLevel as LogLevel)) {
    return logLevel as LogLevel;
  }

  throw new Error(
    `ST_LOG_LEVEL must be one of: ${VALID_LOG_LEVELS.join(", ")}. Received: ${value}`,
  );
}

/**
 * Parse and validate an IANA timezone string (e.g. "America/New_York", "US/Eastern").
 * Defaults to "UTC" if not set.
 *
 * ServiceTitan stores timestamps in UTC while the business operates in the tenant's local timezone.
 * Setting ST_TIMEZONE ensures intelligence tools convert YYYY-MM-DD date inputs
 * to the correct UTC boundaries for API queries (e.g. Feb 1 midnight EST = Feb 1 05:00 UTC),
 * and lets tool responses render timestamps in the tenant's display timezone.
 */
function parseTimezone(value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    return "UTC";
  }

  const tz = value.trim();

  // Validate by attempting to use it with Intl.DateTimeFormat
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    throw new Error(
      `ST_TIMEZONE must be a valid IANA timezone (e.g. "America/New_York", "US/Eastern"). Received: ${value}`,
    );
  }
}

function requiredValue(
  env: NodeJS.ProcessEnv,
  key: (typeof REQUIRED_ENV_VARS)[number],
): string {
  return (env[key] ?? "").trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceTitanConfig {
  const missingVars = REQUIRED_ENV_VARS.filter((key) => requiredValue(env, key) === "");

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`,
    );
  }

  const maxResponseChars = parsePositiveInteger(env.ST_MAX_RESPONSE_CHARS, "ST_MAX_RESPONSE_CHARS", 100_000);
  if (maxResponseChars < 256) throw new Error("ST_MAX_RESPONSE_CHARS must be at least 256");
  const readonlyMode = parseBoolean(env.ST_READONLY, "ST_READONLY", true);
  const experimentalWrites = parseBoolean(env.ST_EXPERIMENTAL_WRITES, "ST_EXPERIMENTAL_WRITES", false);
  assertWritePolicy({ readonlyMode, experimentalWrites });

  return {
    clientId: requiredValue(env, "ST_CLIENT_ID"),
    clientSecret: requiredValue(env, "ST_CLIENT_SECRET"),
    appKey: requiredValue(env, "ST_APP_KEY"),
    tenantId: requiredValue(env, "ST_TENANT_ID"),
    environment: parseEnvironment(env.ST_ENVIRONMENT),
    readonlyMode,
    experimentalWrites,
    confirmWrites: parseBoolean(env.ST_CONFIRM_WRITES, "ST_CONFIRM_WRITES", false),
    maxResponseChars,
    enabledDomains: parseDomains(env.ST_DOMAINS),
    logLevel: parseLogLevel(env.ST_LOG_LEVEL),
    timezone: parseTimezone(env.ST_TIMEZONE),
    corsOrigin: parseCorsOrigin(env.ST_CORS_ORIGIN),
    allowedCallers: parseAllowedCallers(env.ST_ALLOWED_CALLERS),
    toolProfile: parseToolProfile(env.ST_TOOL_PROFILE),
    enabledTools: parseDomains(env.ST_TOOLS),
    reportBindings: parseReportBindings(env.ST_REPORT_BINDINGS),
    maxSessions: parsePositiveInteger(env.ST_MAX_SESSIONS, "ST_MAX_SESSIONS", 32),
    maxConcurrentToolCalls: parsePositiveInteger(env.ST_MAX_CONCURRENT_TOOLS, "ST_MAX_CONCURRENT_TOOLS", 16),
    toolTimeoutMs: parsePositiveInteger(env.ST_TOOL_TIMEOUT_MS, "ST_TOOL_TIMEOUT_MS", 900_000),
    mcpClientId: env.ST_MCP_CLIENT_ID?.trim() || "api-key",
  };
}
