/**
 * Domain tool registration smoke tests.
 *
 * These tests prove that every domain module:
 *  1. Loads without errors
 *  2. Registers at least one tool
 *  3. Produces tools that have name, description, and schema
 *  4. Names follow the naming convention: <domain>_<resource>_<action>
 *
 * They also assert a minimum total tool count to catch accidental regressions
 * where domains stop loading.
 */

import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { loadAccountingDomain } from "../../src/domains/accounting/index.js";
import { loadCrmDomain } from "../../src/domains/crm/index.js";
import { loadDispatchDomain } from "../../src/domains/dispatch/index.js";
import { loadEstimatesDomain } from "../../src/domains/estimates/index.js";
import { loadExportDomain } from "../../src/domains/export/index.js";
import { loadIntelligenceDomain } from "../../src/domains/intelligence/index.js";
import { loadInventoryDomain } from "../../src/domains/inventory/index.js";
import { loadMarketingDomain } from "../../src/domains/marketing/index.js";
import { loadMembershipsDomain } from "../../src/domains/memberships/index.js";
import { loadPayrollDomain } from "../../src/domains/payroll/index.js";
import { loadPeopleDomain } from "../../src/domains/people/index.js";
import { loadPricebookDomain } from "../../src/domains/pricebook/index.js";
import { loadReportingDomain } from "../../src/domains/reporting/index.js";
import { loadSchedulingDomain } from "../../src/domains/scheduling/index.js";
import { loadSettingsDomain } from "../../src/domains/settings/index.js";
import type { DomainLoader, ToolDefinition } from "../../src/registry.js";
import { ToolRegistry } from "../../src/registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfig(overrides: Partial<ServiceTitanConfig> = {}): ServiceTitanConfig {
  return {
    clientId: "client-id",
    clientSecret: "client-secret",
    appKey: "app-key",
    tenantId: "tenant-id",
    environment: "integration",
    // Non-readonly + no confirmWrites → all tool types (read, write, delete) register
    readonlyMode: false,
    confirmWrites: false,
    maxResponseChars: 100_000,
    enabledDomains: null,
    logLevel: "error",
    timezone: "UTC",
    ...overrides,
  };
}

function buildRegistryForDomain(
  domainName: string,
  loader: DomainLoader,
): { tools: ToolDefinition[] } {
  const server = { tool: vi.fn() };
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const registry = new ToolRegistry(server as any, createConfig(), logger as any);
  const client = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as ServiceTitanClient;

  registry.attachClient(client);
  registry.registerDomain(domainName, loader);

  return { tools: registry.getRegisteredTools() };
}

// ---------------------------------------------------------------------------
// All domains under test
// ---------------------------------------------------------------------------

const ALL_DOMAINS: Array<{ name: string; loader: DomainLoader }> = [
  { name: "accounting", loader: loadAccountingDomain },
  { name: "crm", loader: loadCrmDomain },
  { name: "dispatch", loader: loadDispatchDomain },
  { name: "estimates", loader: loadEstimatesDomain },
  { name: "export", loader: loadExportDomain },
  { name: "intelligence", loader: loadIntelligenceDomain },
  { name: "inventory", loader: loadInventoryDomain },
  { name: "marketing", loader: loadMarketingDomain },
  { name: "memberships", loader: loadMembershipsDomain },
  { name: "payroll", loader: loadPayrollDomain },
  { name: "people", loader: loadPeopleDomain },
  { name: "pricebook", loader: loadPricebookDomain },
  { name: "reporting", loader: loadReportingDomain },
  { name: "scheduling", loader: loadSchedulingDomain },
  { name: "settings", loader: loadSettingsDomain },
];

// ---------------------------------------------------------------------------
// Per-domain structural tests
// ---------------------------------------------------------------------------

describe("domain tool registration", () => {
  it.each(ALL_DOMAINS)("$name: loads without errors and registers ≥ 1 tool", ({ name, loader }) => {
    const { tools } = buildRegistryForDomain(name, loader);
    expect(tools.length).toBeGreaterThanOrEqual(1);
  });

  it.each(ALL_DOMAINS)(
    "$name: every registered tool has name, description, and schema",
    ({ name, loader }) => {
      const { tools } = buildRegistryForDomain(name, loader);
      for (const tool of tools) {
        expect(tool.name, `${name}: tool missing name`).toBeTruthy();
        expect(
          tool.description,
          `${name}: tool "${tool.name}" missing description`,
        ).toBeTruthy();
        expect(
          tool.schema,
          `${name}: tool "${tool.name}" missing schema`,
        ).toBeDefined();
      }
    },
  );

  it.each(ALL_DOMAINS)(
    "$name: all tool names follow the naming convention (prefix_resource[_action])",
    ({ name, loader }) => {
      const { tools } = buildRegistryForDomain(name, loader);
      for (const tool of tools) {
        // Must have at least two underscore-delimited segments: <prefix>_<resource>
        // Some tools (e.g. estimates_get, intel_lookup) use only two segments
        // intentionally — three is common but not universal.
        const segments = tool.name.split("_");
        expect(
          segments.length,
          `Tool "${tool.name}" must have at least 2 underscore-delimited segments`,
        ).toBeGreaterThanOrEqual(2);

        // First segment must equal the domain name (intelligence domain uses
        // "intel" as its prefix — handle that special case)
        const expectedPrefix = name === "intelligence" ? "intel" : name;
        expect(
          tool.name.startsWith(expectedPrefix + "_"),
          `Tool "${tool.name}" does not start with expected prefix "${expectedPrefix}_"`,
        ).toBe(true);
      }
    },
  );

  it.each(ALL_DOMAINS)("$name: all tool names are unique within the domain", ({ name, loader }) => {
    const { tools } = buildRegistryForDomain(name, loader);
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(
      unique.size,
      `Domain "${name}" has duplicate tool names: ${duplicates.join(", ")}`,
    ).toBe(names.length);
  });

  it.each(ALL_DOMAINS)(
    "$name: all tools have a valid operation (read | write | delete)",
    ({ name, loader }) => {
      const { tools } = buildRegistryForDomain(name, loader);
      const validOps = new Set(["read", "write", "delete"]);
      for (const tool of tools) {
        expect(
          validOps.has(tool.operation),
          `Tool "${tool.name}" has invalid operation "${tool.operation}"`,
        ).toBe(true);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Aggregate cross-domain test
// ---------------------------------------------------------------------------

describe("total tool count", () => {
  it("all domains combined register ≥ 400 tools", () => {
    const server = { tool: vi.fn() };
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const registry = new ToolRegistry(server as any, createConfig(), logger as any);
    const client = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as ServiceTitanClient;
    registry.attachClient(client);

    for (const { name, loader } of ALL_DOMAINS) {
      registry.registerDomain(name, loader);
    }

    const stats = registry.getStats();
    expect(
      stats.registered,
      `Expected ≥ 400 registered tools, got ${stats.registered}`,
    ).toBeGreaterThanOrEqual(400);
  });

  it("each domain appears in the stats byDomain map", () => {
    const server = { tool: vi.fn() };
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const registry = new ToolRegistry(server as any, createConfig(), logger as any);
    const client = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as ServiceTitanClient;
    registry.attachClient(client);

    for (const { name, loader } of ALL_DOMAINS) {
      registry.registerDomain(name, loader);
    }

    const { byDomain } = registry.getStats();
    for (const { name } of ALL_DOMAINS) {
      expect(
        byDomain[name],
        `Domain "${name}" missing from byDomain stats`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
