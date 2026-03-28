export interface ServiceTitanConfig {
  clientId: string;
  clientSecret: string;
  appKey: string;
  tenantId: string;
  environment: "integration" | "production";
  readonlyMode: boolean;
  confirmWrites: boolean;
  maxResponseChars: number;
  enabledDomains: string[] | null;
  logLevel: "debug" | "info" | "warn" | "error";
  timezone: string;
  corsOrigin: string;
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
 * ServiceTitan stores timestamps in the tenant's local timezone.
 * Setting ST_TIMEZONE ensures intelligence tools convert YYYY-MM-DD date inputs
 * to the correct UTC boundaries for API queries (e.g. Feb 1 midnight EST = Feb 1 05:00 UTC).
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

  return {
    clientId: requiredValue(env, "ST_CLIENT_ID"),
    clientSecret: requiredValue(env, "ST_CLIENT_SECRET"),
    appKey: requiredValue(env, "ST_APP_KEY"),
    tenantId: requiredValue(env, "ST_TENANT_ID"),
    environment: parseEnvironment(env.ST_ENVIRONMENT),
    readonlyMode: parseBoolean(env.ST_READONLY, "ST_READONLY", true),
    confirmWrites: parseBoolean(env.ST_CONFIRM_WRITES, "ST_CONFIRM_WRITES", false),
    maxResponseChars: parsePositiveInteger(
      env.ST_MAX_RESPONSE_CHARS,
      "ST_MAX_RESPONSE_CHARS",
      100_000,
    ),
    enabledDomains: parseDomains(env.ST_DOMAINS),
    logLevel: parseLogLevel(env.ST_LOG_LEVEL),
    timezone: parseTimezone(env.ST_TIMEZONE),
    corsOrigin: env.ST_CORS_ORIGIN ?? "",
  };
}
