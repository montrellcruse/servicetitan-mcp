import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodType } from "zod";

import type { ServiceTitanClient } from "./client.js";
import type { ServiceTitanConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type { ToolResponse } from "./types.js";

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
  private client: ServiceTitanClient | null = null;

  constructor(
    private readonly server: McpServer,
    private readonly config: ServiceTitanConfig,
    private readonly logger: Logger,
  ) {}

  attachClient(client: ServiceTitanClient): void {
    this.client = client;
  }

  register(tool: ToolDefinition): void {
    const domain = tool.domain.toLowerCase();

    if (
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

    this.server.tool(tool.name, tool.schema, tool.handler);

    this.registered += 1;
    this.byDomain[domain] = (this.byDomain[domain] ?? 0) + 1;
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
}
