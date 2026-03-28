import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodType } from "zod";
import { z } from "zod";

import { type AuditEntry, AuditLogger, sanitizeParams } from "./audit.js";
import type { ServiceTitanClient } from "./client.js";
import type { ServiceTitanConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type { ToolResponse } from "./types.js";
import { toolError, toolResult } from "./utils.js";

export type ToolOperation = "read" | "write" | "delete";

export interface ToolDefinition {
  name: string;
  domain: string;
  operation: ToolOperation;
  schema: Record<string, ZodType>;
  handler: (params: unknown, extra?: ToolHandlerExtra) => Promise<ToolResponse>;
  description?: string;
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
  sessionId?: string;
  _meta?: Record<string, unknown>;
  requestInfo?: {
    headers?: Record<string, string | string[] | undefined>;
  };
}

export class ToolRegistry {
  private registered = 0;
  private skipped = 0;
  private readonlyFiltered = 0;
  private domainFiltered = 0;
  private readonly byDomain: Record<string, number> = {};
  private readonly registeredTools: ToolDefinition[] = [];
  private readonly registeredToolNames = new Set<string>();
  private client: ServiceTitanClient | null = null;

  constructor(
    private readonly server: McpServer,
    private readonly config: ServiceTitanConfig,
    private readonly logger: Logger,
    private readonly auditLogger: AuditLogger = new AuditLogger(logger),
  ) {}

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

  register(tool: ToolDefinition): void {
    const domain = tool.domain.toLowerCase();

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
    });

    if (this.registeredToolNames.has(wrappedTool.name)) {
      throw new Error(`Tool "${wrappedTool.name}" is already registered`);
    }

    this.server.tool(wrappedTool.name, wrappedTool.schema, wrappedTool.handler);

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
      `Registered ${this.registered} tools (${this.skipped} skipped: ${this.readonlyFiltered} readonly-filtered, ${this.domainFiltered} domain-filtered)`,
      {
        registered: this.registered,
        skipped: this.skipped,
        readonlyFiltered: this.readonlyFiltered,
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
    const wrappedHandler = async (
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

      if (isWrite && this.config.confirmWrites && paramRecord._confirmed !== true) {
        return toolError(
          "Write confirmation required. Re-call with _confirmed: true to proceed.",
        );
      }

      if (!shouldExecuteDelete) {
        return toolResult(this.buildConfirmationPreview(tool, paramRecord));
      }

      try {
        const result = await originalHandler(executionParams, extra);

        if (shouldAudit) {
          this.auditLogger.log(
            this.buildAuditEntry(tool, executionParams, !result.isError, result),
          );
        }

        return result;
      } catch (error: unknown) {
        if (shouldAudit) {
          this.auditLogger.log(
            this.buildAuditEntry(
              tool,
              executionParams,
              false,
              undefined,
              error instanceof Error ? error.message : String(error),
            ),
          );
        }

        throw error;
      }
    };

    return {
      ...tool,
      schema,
      handler: wrappedHandler,
    };
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
    const requestMeta = this.toRecord(extra?._meta);
    const headers = this.normalizeHeaders(extra?.requestInfo?.headers);

    const candidates = [
      extra?.authInfo?.clientId,
      this.readString(authExtra, "caller"),
      this.readString(authExtra, "user"),
      this.readString(authExtra, "username"),
      this.readString(authExtra, "email"),
      this.readString(authExtra, "sub"),
      this.readString(requestMeta, "caller"),
      this.readString(requestMeta, "user"),
      this.readString(requestMeta, "username"),
      this.readString(requestMeta, "email"),
      headers["x-caller-id"],
      headers["x-user-id"],
      headers["x-user-email"],
      headers["x-forwarded-user"],
      headers["x-auth-request-email"],
      headers["x-ms-client-principal-name"],
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizeCaller(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private normalizeHeaders(
    headers: Record<string, string | string[] | undefined> | undefined,
  ): Record<string, string | undefined> {
    if (!headers) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        key.toLowerCase(),
        Array.isArray(value) ? value[0] : value,
      ]),
    );
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
    return {
      timestamp: new Date().toISOString(),
      tool: tool.name,
      operation: tool.operation as "write" | "delete",
      domain: tool.domain,
      resource: this.extractResource(tool.name),
      resourceId: this.extractResourceId(params),
      params: sanitizeParams(params),
      success,
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
