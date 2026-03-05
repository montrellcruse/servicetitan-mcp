import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodType } from "zod";
import { z } from "zod";

import { type AuditEntry, AuditLogger, sanitizeParams } from "./audit.js";
import type { ServiceTitanClient } from "./client.js";
import type { ServiceTitanConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type { ToolResponse } from "./types.js";
import { toolResult } from "./utils.js";

export type ToolOperation = "read" | "write" | "delete";

export interface ToolDefinition {
  name: string;
  domain: string;
  operation: ToolOperation;
  schema: Record<string, ZodType>;
  handler: (params: unknown) => Promise<ToolResponse>;
  description?: string;
}

export type DomainLoader = (
  client: ServiceTitanClient,
  registry: ToolRegistry,
) => void;

export class ToolRegistry {
  private registered = 0;
  private skipped = 0;
  private readonlyFiltered = 0;
  private domainFiltered = 0;
  private readonly byDomain: Record<string, number> = {};
  private readonly registeredTools: ToolDefinition[] = [];
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

    if (this.config.readonlyMode && tool.operation !== "read") {
      this.skipped += 1;
      this.readonlyFiltered += 1;
      this.logger.info("Skipped tool in readonly mode", {
        tool: tool.name,
        domain,
        operation: tool.operation,
      });
      return;
    }

    const wrappedTool = this.wrapTool({
      ...tool,
      domain,
    });

    this.server.tool(wrappedTool.name, wrappedTool.schema, wrappedTool.handler);

    this.registered += 1;
    this.byDomain[domain] = (this.byDomain[domain] ?? 0) + 1;
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
    const requiresConfirmation =
      tool.operation === "delete" ||
      (tool.operation === "write" && this.config.confirmWrites);
    const shouldAudit = tool.operation === "write" || tool.operation === "delete";

    const schema: Record<string, ZodType> = requiresConfirmation
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
      : tool.schema;

    const originalHandler = tool.handler;

    const wrappedHandler = async (params: unknown): Promise<ToolResponse> => {
      const paramRecord = this.toRecord(params);
      const shouldExecute = !requiresConfirmation || paramRecord.confirm === true;
      const executionParams = requiresConfirmation
        ? this.withoutConfirm(paramRecord)
        : paramRecord;

      if (!shouldExecute) {
        return toolResult(this.buildConfirmationPreview(tool, paramRecord));
      }

      try {
        const result = await originalHandler(executionParams);

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
