import type { Logger } from "./logger.js";

export interface AuditEntry {
  timestamp: string;
  tool: string;
  operation: "write" | "delete";
  domain: string;
  resource: string;
  resourceId?: number | string;
  params: Record<string, unknown>;
  success: boolean;
  error?: string;
  /** The operation completed, but its result could not be delivered inline. */
  deliveryError?: string;
  /** A dispatched mutation failed without proving whether it committed. */
  outcomeUnknown?: boolean;
}

const SENSITIVE_SUBSTRINGS = [
  "secret",
  "password",
  "token",
  "key",
  "auth",
  "credential",
  "apikey",
  "accesstoken",
] as const;

// PII fields that should be redacted from audit logs.
// Uses substring matching (lowercased) to catch compound variants like
// contactNumbers, campaignPhoneNumbers, callerPhoneNumber, etc.
const PII_SUBSTRINGS = [
  "phone",
  "email",
  "firstname",
  "lastname",
  "address",
  "street",
  "zipcode",
  "ssn",
  "socialsecurity",
  "dateofbirth",
  "bankaccount",
  "routingnumber",
  "creditcard",
  "cardnumber",
  "contactnumber",
] as const;

// Exact-match PII fields (common short names)
const PII_EXACT = new Set<string>([
  "name",
  "city",
  "zip",
  "dob",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Redact common credential forms and contact PII before diagnostics leave the process. */
export function redactSensitiveText(text: string, secrets: readonly string[] = []): string {
  let result = text;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join("[REDACTED]");
  }
  return result
    .replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, "[REDACTED]")
    .replace(/\bak1\.[A-Za-z0-9._-]+/gi, "[REDACTED]")
    .replace(/((?:client[_-]?secret|password|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization)\s*["']?\s*[:=]\s*["']?)[^\s,;"'}]+/gi, "$1[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED]")
    .replace(/\+?\d[\d ()-]{6,}\d/g, (match) => {
      const digits = match.replace(/\D/g, "").length;
      return digits >= 10 && digits <= 15 ? "[REDACTED]" : match;
    });
}

const FREE_TEXT_KEYS = /^(?:value|memo|notes?|text|comments?|description|summary|summaryofwork|message|body)$/i;

function sanitizeValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 32) return "[OMITTED: depth]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[OMITTED: circular]";
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, seen, depth + 1));
    return sanitizeObject(value as Record<string, unknown>, seen, depth + 1);
  } finally {
    seen.delete(value);
  }
}

function sanitizeObject(value: Record<string, unknown>, seen: WeakSet<object>, depth: number): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const contactType = typeof value.type === "string" && /email|phone|mobile|fax/i.test(value.type);
  for (const [key, val] of Object.entries(value)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_SUBSTRINGS.some((substring) => lowerKey.includes(substring))) continue;
    if (PII_EXACT.has(lowerKey) || PII_SUBSTRINGS.some((sub) => lowerKey.includes(sub)) ||
        (key === "value" && contactType) || (typeof val === "string" && FREE_TEXT_KEYS.test(key))) {
      sanitized[key] = "[REDACTED]";
    } else {
      // Define rather than assign so a JSON __proto__ key cannot change the result prototype.
      Object.defineProperty(sanitized, key, { value: sanitizeValue(val, seen, depth), enumerable: true });
    }
  }
  return sanitized;
}

export function sanitizeParams(params: unknown): Record<string, unknown> {
  if (!isRecord(params)) return {};
  return sanitizeValue(params, new WeakSet<object>(), 0) as Record<string, unknown>;
}

export function sanitizeAuditError(error: string | undefined): string | undefined {
  return error === undefined ? undefined : redactSensitiveText(error).slice(0, 512);
}

export class AuditLogger {
  constructor(private readonly logger: Logger) {}

  log(entry: AuditEntry): void | Promise<void> {
    // Truncate params to prevent multi-KB payloads in logs
    const MAX_PARAMS_SIZE = 2048;
    let auditParams = sanitizeParams(entry.params);
    const paramsJson = JSON.stringify(auditParams);
    if (paramsJson.length > MAX_PARAMS_SIZE) {
      auditParams = {
        _truncated: true,
        _originalSize: paramsJson.length,
        // Keep only bounded scalar identifiers. An unbounded ids array would
        // recreate the oversized payload this summary is supposed to avoid.
        ...Object.fromEntries(Object.entries(auditParams).filter(([key, value]) =>
          ["id", "page", "pageSize"].includes(key) &&
          (typeof value === "number" || (typeof value === "string" && value.length <= 128)))),
        ...(Array.isArray(auditParams.ids) ? { _idsCount: auditParams.ids.length } : {}),
      };
    }

    // Real Logger.audit bypasses the diagnostic threshold. The fallback keeps
    // custom logger adapters compatible; adapters should provide an audit sink.
    const emit = this.logger.audit?.bind(this.logger) ?? this.logger.info.bind(this.logger);
    // Preserve an asynchronous adapter's return value so the registry can
    // observe rejection without waiting on audit delivery or losing the result.
    return emit(`[AUDIT] ${entry.operation.toUpperCase()} ${entry.tool}`, {
      timestamp: entry.timestamp,
      tool: entry.tool,
      operation: entry.operation,
      domain: entry.domain,
      resource: entry.resource,
      resourceId: entry.resourceId,
      params: auditParams,
      success: entry.success,
      error: sanitizeAuditError(entry.error),
      deliveryError: entry.deliveryError === "RESPONSE_TOO_LARGE" || entry.deliveryError === "INVALID_RESPONSE" ? entry.deliveryError : undefined,
      outcomeUnknown: typeof entry.outcomeUnknown === "boolean" ? entry.outcomeUnknown : undefined,
    });
  }
}
