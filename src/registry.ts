import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodType } from "zod";
import { z } from "zod";

import { type AuditEntry, AuditLogger, sanitizeParams } from "./audit.js";
import type { ServiceTitanClient } from "./client.js";
import type { ServiceTitanConfig } from "./config.js";
import { assertWritePolicy, ExperimentalWritesDisabledError } from "./config.js";
import { isUnsupportedTool, UNSUPPORTED_TOOLS } from "./contracts/index.js";
import { withRequestContext } from "./request-context.js";
import { ResultStore } from "./result-store.js";
import type { Logger } from "./logger.js";
import type { ToolResponse } from "./types.js";
import { getResponseDeliveryFailure, toolError, toolResult } from "./utils.js";

export type ToolOperation = "read" | "write" | "delete";
export const EXPERIMENTAL_MUTATION_NOTICE = "EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. ";
export type ToolAnnotationOverrides = Omit<ToolAnnotations, "readOnlyHint">;

/**
 * MCP tool annotations derived from the tool's operation. Mutating operations
 * default to destructive because `destructiveHint: false` means additive-only
 * in the MCP specification. Every tool talks to the ServiceTitan API, so
 * openWorldHint is always true.
 */
const DEFAULT_ANNOTATIONS: Record<ToolOperation, ToolAnnotations> = {
  read: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  write: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  delete: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
};

export interface ToolDefinition {
  name: string;
  domain: string;
  operation: ToolOperation;
  schema: Record<string, ZodType>;
  handler: (params: unknown, extra?: ToolHandlerExtra) => Promise<ToolResponse>;
  description: string;
  /** Overrides for hints not fixed by `operation`; `readOnlyHint` cannot be overridden. */
  annotations?: ToolAnnotationOverrides;
  cacheTtlMs?: number;
  cacheKeyParams?: (params: unknown) => unknown;
}

export type DomainLoader = (
  client: ServiceTitanClient,
  registry: ToolRegistry,
) => void;

export interface ToolHandlerExtra {
  authInfo?: {
    clientId?: string;
    extra?: Record<string, unknown>;
  };
  signal?: AbortSignal;
  sessionId?: string;
  _meta?: Record<string, unknown>;
  requestInfo?: {
    headers?: Record<string, string | string[] | undefined>;
  };
}

export class ToolRegistry {
  private registered = 0;
  private skipped = 0;
  private domainFiltered = 0;
  private readonly byDomain: Record<string, number> = {};
  private readonly registeredTools: ToolDefinition[] = [];
  private readonly registeredToolNames = new Set<string>();
  private client: ServiceTitanClient | null = null;
  private activeCalls = 0;
  private readonly resultStore = new ResultStore();
  private readonly unavailableTools: Record<string, string> = {};
  private readonly seenToolNames = new Set<string>();

  constructor(
    private readonly server: McpServer,
    private readonly config: ServiceTitanConfig,
    private readonly logger: Logger,
    private readonly auditLogger: AuditLogger = new AuditLogger(logger),
  ) { assertWritePolicy(config); }

  attachClient(client: ServiceTitanClient): void {
    this.client = client;
  }

  /**
   * Returns the configured tenant timezone (IANA string, defaults to "UTC").
   * Intelligence tools use this to convert YYYY-MM-DD date inputs to correct UTC boundaries.
   */
  get timezone(): string {
    return this.config.timezone;
  }

  get reportBindings(): NonNullable<ServiceTitanConfig["reportBindings"]> {
    return this.config.reportBindings ?? {};
  }

  getUnavailableTools(): Record<string, string> { return { ...this.unavailableTools }; }

  clearResults(): void { this.resultStore.clear(); }
  readResult(resultId: string, offset: number): Record<string, unknown> {
    // Worst-case JSON escaping and duplicated text/structured content stay within the response budget.
    return this.resultStore.read(resultId, offset, Math.max(1, Math.floor((this.config.maxResponseChars - 180) / 16)));
  }


  validateSelection(): void {
    const missing = (this.config.enabledTools ?? []).filter(name => !this.seenToolNames.has(name));
    if (missing.length) throw new Error(`ST_TOOLS includes unknown tools: ${missing.join(", ")}`);
    const unavailable = (this.config.enabledTools ?? []).filter(name => this.unavailableTools[name]);
    if (unavailable.length) throw new Error(`ST_TOOLS includes unavailable tools: ${unavailable.map(name => `${name} (${this.unavailableTools[name]})`).join(", ")}`);
  }

  register(tool: ToolDefinition): void {
    assertWritePolicy(this.config);
    const domain = tool.domain.toLowerCase();
    this.seenToolNames.add(tool.name);
    const profiles: Record<string, readonly string[]> = {
      crm: ["crm"], dispatch: ["dispatch", "scheduling", "people", "settings"],
      analytics: ["intelligence", "reporting", "settings"],
    };
    const profileDomains = profiles[this.config.toolProfile ?? "full"];
    const reason = isUnsupportedTool(tool.name) ? UNSUPPORTED_TOOLS[tool.name].reason
      : this.config.readonlyMode && tool.operation !== "read" ? "Readonly mode: mutation not available"
      : domain !== "_system" && profileDomains && !profileDomains.includes(domain) ? "Excluded by tool profile"
      : domain !== "_system" && this.config.enabledTools && !this.config.enabledTools.includes(tool.name) ? "Excluded by tool allowlist"
      : null;
    if (reason) {
      this.unavailableTools[tool.name] = reason;
      this.skipped += 1;
      return;
    }

    if (
      domain !== "_system" &&
      this.config.enabledDomains !== null &&
      !this.config.enabledDomains.includes(domain)
    ) {
      this.skipped += 1;
      this.domainFiltered += 1;
      this.logger.debug("Skipped tool due to domain filter", {
        tool: tool.name,
        domain,
      });
      return;
    }

    const wrappedTool = this.wrapTool({
      ...tool,
      domain,
      description: tool.operation === "read" ? tool.description : EXPERIMENTAL_MUTATION_NOTICE + tool.description,
    });

    if (this.registeredToolNames.has(wrappedTool.name)) {
      throw new Error(`Tool "${wrappedTool.name}" is already registered`);
    }

    const defaultAnnotations = DEFAULT_ANNOTATIONS[wrappedTool.operation];

    this.server.registerTool(
      wrappedTool.name,
      {
        description: wrappedTool.description,
        inputSchema: wrappedTool.schema,
        outputSchema: z.object({}).passthrough(),
        annotations: {
          ...defaultAnnotations,
          ...wrappedTool.annotations,
          readOnlyHint: defaultAnnotations.readOnlyHint,
        },
      },
      wrappedTool.handler,
    );

    this.registered += 1;
    this.byDomain[domain] = (this.byDomain[domain] ?? 0) + 1;
    this.registeredToolNames.add(wrappedTool.name);
    this.registeredTools.push(wrappedTool);
  }

  registerDomain(name: string, loader: DomainLoader): void {
    if (!this.client) {
      this.logger.warn("Skipped domain registration because client is unavailable", {
        domain: name,
      });
      return;
    }

    try {
      loader(this.client, this);
      this.logger.debug("Loaded domain module", { domain: name });
    } catch (error) {
      this.logger.error("Failed to load domain module", {
        domain: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  getStats(): { registered: number; skipped: number; byDomain: Record<string, number> } {
    return {
      registered: this.registered,
      skipped: this.skipped,
      byDomain: { ...this.byDomain },
    };
  }

  getRegisteredTools(): ToolDefinition[] {
    return [...this.registeredTools];
  }

  logSummary(): void {
    this.logger.info(
      `Registered ${this.registered} tools (${this.skipped} skipped, ${this.domainFiltered} domain-filtered)`,
      {
        registered: this.registered,
        skipped: this.skipped,
        
        domainFiltered: this.domainFiltered,
      },
    );
  }

  private wrapTool(tool: ToolDefinition): ToolDefinition {
    const isWrite = tool.operation === "write";
    const requiresDeleteConfirmation = tool.operation === "delete";
    const isMutating = tool.operation === "write" || tool.operation === "delete";
    const shouldAudit = isMutating;

    const schema: Record<string, ZodType> = requiresDeleteConfirmation
      ? {
          ...tool.schema,
          confirm:
            tool.schema.confirm ??
            z
              .boolean()
              .optional()
              .default(false)
              .describe("Set to true to confirm this potentially destructive action"),
        }
      : isWrite
        ? {
            ...tool.schema,
            _confirmed:
              tool.schema._confirmed ??
              z
                .boolean()
                .optional()
                .describe("Set to true to confirm this write operation"),
          }
        : tool.schema;

    const originalHandler = tool.handler;

    /*
     * Authorization model:
     * This server is intended for a single trusted operator. Confirmation prompts
     * for writes and deletes are safety UX to prevent accidental changes, not
     * access control. Multi-tenant deployments should enforce authorization at the
     * transport or proxy layer. ST_ALLOWED_CALLERS adds a narrow allowlist check
     * against caller identity only when the MCP transport exposes one.
     */
    const executeHandler = async (
      params: unknown,
      extra?: ToolHandlerExtra,
    ): Promise<ToolResponse> => {
      const paramRecord = this.toRecord(params);
      const shouldExecuteDelete = !requiresDeleteConfirmation || paramRecord.confirm === true;
      const executionParams = isWrite
        ? this.withoutWriteConfirmation(paramRecord)
        : requiresDeleteConfirmation
          ? this.withoutConfirm(paramRecord)
          : paramRecord;

      const authorizationError = this.authorizeCaller(extra);
      if (authorizationError) {
        return authorizationError;
      }

      if (isMutating && this.config.readonlyMode) {
        return toolError("Readonly mode: operation not permitted");
      }

      if (isMutating && this.config.experimentalWrites !== true) {
        return toolError(new ExperimentalWritesDisabledError());
      }

      if (isWrite && this.config.confirmWrites && paramRecord._confirmed !== true) {
        return toolError(
          "Write confirmation required. Re-call with _confirmed: true to proceed.",
        );
      }

      if (!shouldExecuteDelete) {
        return toolResult(this.buildConfirmationPreview(tool, paramRecord));
      }

      try {
        const result = isMutating
          ? await withRequestContext({ mutatingOperation: true }, () => originalHandler(executionParams, extra))
          : await originalHandler(executionParams, extra);

        if (shouldAudit) {
          this.auditLogger.log(
            this.buildAuditEntry(tool, executionParams, !result.isError, result),
          );
        }

        return result;
      } catch (error: unknown) {
        const failure = toolError(error);
        if (shouldAudit) this.auditLogger.log(this.buildAuditEntry(tool, executionParams, false, failure));
        return failure;
      }
    };

    const wrappedHandler = async (params: unknown, extra?: ToolHandlerExtra): Promise<ToolResponse> => {
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new Error("Tool execution deadline exceeded")), this.config.toolTimeoutMs ?? 900_000);
      timer.unref();
      const signal = extra?.signal ? AbortSignal.any([extra.signal, deadline.signal]) : deadline.signal;
      try {
        return await withRequestContext({ signal, timezone: this.config.timezone, maxResponseChars: this.config.maxResponseChars, mutatingOperation: false, storeOversized: payload => this.resultStore.put(payload) }, async () => {
          if (signal.aborted) return toolError("Tool execution cancelled");
          if (this.activeCalls >= (this.config.maxConcurrentToolCalls ?? 16)) return toolError("Server is busy; retry after active tool calls complete");
          this.activeCalls += 1;
          try { return await executeHandler(params, { ...extra, signal }); }
          finally { this.activeCalls -= 1; }
        });
      } finally { clearTimeout(timer); }
    };

    return { ...tool, schema, handler: wrappedHandler };
  }

  private toRecord(params: unknown): Record<string, unknown> {
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
      return {};
    }

    return { ...(params as Record<string, unknown>) };
  }

  private withoutConfirm(params: Record<string, unknown>): Record<string, unknown> {
    const { confirm: _confirm, ...rest } = params;
    return rest;
  }

  private withoutWriteConfirmation(params: Record<string, unknown>): Record<string, unknown> {
    const { _confirmed: __confirmed, confirm: _confirm, ...rest } = params;
    return rest;
  }

  private authorizeCaller(extra?: ToolHandlerExtra): ToolResponse | null {
    if (this.config.allowedCallers == null) {
      return null;
    }

    const caller = this.extractCallerIdentity(extra);
    if (!caller) {
      return toolError("Authorization failed: caller identity unavailable");
    }

    if (!this.config.allowedCallers.includes(caller)) {
      return toolError("Authorization failed: caller not permitted");
    }

    return null;
  }

  private extractCallerIdentity(extra?: ToolHandlerExtra): string | null {
    const authExtra = this.toRecord(extra?.authInfo?.extra);

    const candidates = [
      extra?.authInfo?.clientId,
      this.readString(authExtra, "caller"),
      this.readString(authExtra, "user"),
      this.readString(authExtra, "username"),
      this.readString(authExtra, "email"),
      this.readString(authExtra, "sub"),
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizeCaller(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private readString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    return typeof value === "string" ? value : undefined;
  }

  private normalizeCaller(value: string | undefined): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private buildConfirmationPreview(
    tool: ToolDefinition,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const resource = this.extractResource(tool.name);
    const resourceId = this.extractResourceId(params);

    return {
      action: tool.operation.toUpperCase(),
      resource,
      id: resourceId,
      warning:
        tool.operation === "delete"
          ? `This will permanently delete the ${resource}.`
          : `This will modify ${resource} data in ServiceTitan.`,
      confirm: `Call ${tool.name} again with confirm=true to proceed.`,
    };
  }

  private buildAuditEntry(
    tool: ToolDefinition,
    params: Record<string, unknown>,
    success: boolean,
    result?: ToolResponse,
    thrownError?: string,
  ): AuditEntry {
    const deliveryFailure = result ? getResponseDeliveryFailure(result) : undefined;
    const outcomeUnknown = (result?.structuredContent as { error?: { outcomeUnknown?: boolean } } | undefined)?.error?.outcomeUnknown === true;
    return {
      timestamp: new Date().toISOString(),
      tool: tool.name,
      operation: tool.operation as "write" | "delete",
      domain: tool.domain,
      resource: this.extractResource(tool.name),
      resourceId: this.extractResourceId(params),
      params: sanitizeParams(params),
      success: deliveryFailure?.mutationCompleted === true ? true : success,
      ...(deliveryFailure ? { deliveryError: deliveryFailure.code } : {}),
      ...(outcomeUnknown ? { outcomeUnknown: true } : {}),
      error: thrownError ?? this.extractResultError(result),
    };
  }

  private extractResultError(result?: ToolResponse): string | undefined {
    if (!result?.isError) {
      return undefined;
    }

    const firstContent = result.content?.[0];
    return typeof firstContent?.text === "string" ? firstContent.text : "Tool execution failed";
  }

  private extractResource(toolName: string): string {
    const segments = toolName.split("_");

    if (segments.length < 3) {
      return toolName;
    }

    return segments.slice(1, -1).join("_");
  }

  private extractResourceId(params: Record<string, unknown>): number | string | undefined {
    if (typeof params.id === "number" || typeof params.id === "string") {
      return params.id;
    }

    for (const [key, value] of Object.entries(params)) {
      if (/id$/i.test(key) && (typeof value === "number" || typeof value === "string")) {
        return value;
      }
    }

    return undefined;
  }
}
