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

// PII fields that should be redacted from audit logs
const PII_FIELDS = new Set<string>([
  "name",
  "firstname",
  "lastname",
  "email",
  "phone",
  "phonenumber",
  "address",
  "street",
  "city",
  "zip",
  "zipcode",
  "ssn",
  "socialsecurity",
  "dob",
  "dateofbirth",
  "bankaccount",
  "routingnumber",
  "creditcard",
  "cardnumber",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (isRecord(value)) {
    return sanitizeObject(value);
  }

  return value;
}

function sanitizeObject(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(value)) {
    const lowerKey = key.toLowerCase();

    // Strip credential/secret fields entirely
    if (
      SENSITIVE_SUBSTRINGS.some((substring) =>
        lowerKey.includes(substring),
      )
    ) {
      continue;
    }

    // Redact PII fields — keep the key but mask the value
    if (PII_FIELDS.has(lowerKey)) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    sanitized[key] = sanitizeValue(val);
  }

  return sanitized;
}

export function sanitizeParams(params: unknown): Record<string, unknown> {
  if (!isRecord(params)) {
    return {};
  }

  return sanitizeObject(params);
}

export class AuditLogger {
  constructor(private readonly logger: Logger) {}

  log(entry: AuditEntry): void {
    // Truncate params to prevent multi-KB payloads in logs
    const MAX_PARAMS_SIZE = 2048;
    let auditParams = entry.params;
    const paramsJson = JSON.stringify(entry.params);
    if (paramsJson.length > MAX_PARAMS_SIZE) {
      auditParams = {
        _truncated: true,
        _originalSize: paramsJson.length,
        ...Object.fromEntries(
          Object.entries(entry.params)
            .filter(([k]) => k === "id" || k === "ids" || k === "page" || k === "pageSize")
        ),
      };
    }

    this.logger.info(`[AUDIT] ${entry.operation.toUpperCase()} ${entry.tool}`, {
      timestamp: entry.timestamp,
      tool: entry.tool,
      operation: entry.operation,
      domain: entry.domain,
      resource: entry.resource,
      resourceId: entry.resourceId,
      params: auditParams,
      success: entry.success,
      error: entry.error,
    });
  }
}
