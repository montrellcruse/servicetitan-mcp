import type { ServiceTitanConfig } from "./config.js";
import { assertWritePolicy } from "./config.js";
import { isUnsupportedTool, UNSUPPORTED_TOOLS } from "./contracts/index.js";
import type { ToolDefinition } from "./registry.js";

const PROFILE_DOMAINS: Record<string, readonly string[]> = {
  crm: ["crm"],
  dispatch: ["dispatch", "scheduling", "people", "settings"],
  analytics: ["intelligence", "reporting", "settings"],
};

export const DOMAIN_FILTER_REASON = "Excluded by domain filter";

export class ToolSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolSelectionError";
  }
}

export type ToolDeclaration = Omit<ToolDefinition, "handler"> & {
  // System tools bind their handlers when a session is created.
  handler?: ToolDefinition["handler"];
};

export interface ToolCatalogEntry {
  readonly tool: Readonly<ToolDeclaration>;
  readonly exclusionReason?: string;
}

export class ToolCatalog {
  private readonly entries: Map<string, ToolCatalogEntry>;

  constructor(private readonly config: ServiceTitanConfig, source?: ToolCatalog) {
    assertWritePolicy(config);
    this.entries = new Map(source?.entries);
  }

  add(tool: ToolDeclaration): ToolCatalogEntry {
    assertWritePolicy(this.config);
    if (this.entries.has(tool.name)) throw new Error(`Tool "${tool.name}" is already registered`);

    const declaration = { ...tool, domain: tool.domain.toLowerCase() };
    const entry = { tool: declaration, exclusionReason: this.exclusionReason(declaration) };
    this.entries.set(tool.name, entry);
    return entry;
  }

  validateSelection(): void {
    const requested = this.config.enabledTools ?? [];
    const unknown = requested.some(name => !this.entries.has(name));
    const unavailable = requested.flatMap(name => {
      const entry = this.entries.get(name);
      return entry?.exclusionReason ? [`${entry.tool.name} (${entry.exclusionReason})`] : [];
    });
    const failures = [];
    // An unknown value may be a credential accidentally placed in ST_TOOLS.
    if (unknown) failures.push("ST_TOOLS includes unknown tools");
    if (unavailable.length) failures.push(`ST_TOOLS includes unavailable tools: ${unavailable.join(", ")}`);
    if (failures.length) throw new ToolSelectionError(failures.join(". "));
  }

  getInventory(): readonly ToolCatalogEntry[] {
    return [...this.entries.values()];
  }

  getSelectedTools(): readonly Readonly<ToolDeclaration>[] {
    return this.getInventory().filter(entry => !entry.exclusionReason).map(entry => entry.tool);
  }

  getStats(): { registered: number; skipped: number; byDomain: Record<string, number> } {
    const selected = this.getSelectedTools();
    const counts = new Map<string, number>();
    for (const { domain } of selected) counts.set(domain, (counts.get(domain) ?? 0) + 1);

    return { registered: selected.length, skipped: this.entries.size - selected.length, byDomain: Object.fromEntries(counts) };
  }

  private exclusionReason(tool: ToolDeclaration): string | undefined {
    if (isUnsupportedTool(tool.name)) return UNSUPPORTED_TOOLS[tool.name].reason;
    if (this.config.readonlyMode && tool.operation !== "read") return "Readonly mode: mutation not available";
    if (tool.domain === "_system") return undefined;

    const profile = PROFILE_DOMAINS[this.config.toolProfile ?? "full"];
    if (profile && !profile.includes(tool.domain)) return "Excluded by tool profile";
    if (this.config.enabledDomains && !this.config.enabledDomains.includes(tool.domain)) return DOMAIN_FILTER_REASON;
    if (this.config.enabledTools && !this.config.enabledTools.includes(tool.name)) return "Excluded by tool allowlist";
    return undefined;
  }
}
