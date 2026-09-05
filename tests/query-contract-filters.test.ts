import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ServiceTitanClient } from "../src/client.js";
import { findOfficialOperation, resolveServiceTitanPath } from "../src/contracts/index.js";
import { loadConfig } from "../src/config.js";
import { registerDispatchArrivalWindowTools } from "../src/domains/dispatch/arrival-windows.js";
import { registerDispatchJobTools } from "../src/domains/dispatch/jobs.js";
import { registerEstimateTemplateTools, registerProposalTemplateTools } from "../src/domains/estimates/templates.js";
import { registerPaymentTypeTools } from "../src/domains/accounting/payment-types.js";
import { registerExportTools } from "../src/domains/export/exporters.js";
import { registerPayrollTools } from "../src/domains/payroll/payrolls.js";
import type { ToolDefinition, ToolRegistry } from "../src/registry.js";
import { createMcpServer } from "../src/server.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dateKeys = new Set(["createdBefore", "createdOnOrAfter", "modifiedBefore", "modifiedOnOrAfter"]);

function capture(register: (client: ServiceTitanClient, registry: ToolRegistry) => void) {
  const definitions = new Map<string, ToolDefinition>();
  const get = vi.fn(async () => ({ data: [] }));
  register({ get } as unknown as ServiceTitanClient, {
    register: (tool: ToolDefinition) => definitions.set(tool.name, tool),
  } as unknown as ToolRegistry);
  return { definitions, get };
}

describe("list query schemas match the pinned official date filters", () => {
  it.each([
    ["dispatch_arrival_windows_list", "arrival", ["createdBefore", "createdOnOrAfter"], ["modifiedBefore", "modifiedOnOrAfter"], "/tenant/{tenant}/arrival-windows"],
    ["dispatch_jobs_list_attachments", "jobs", ["createdBefore", "createdOnOrAfter"], ["modifiedBefore", "modifiedOnOrAfter"], "/forms/v2/tenant/{tenant}/jobs/7/attachments"],
    ["estimates_estimate_templates_list", "templates", ["modifiedBefore", "modifiedOnOrAfter"], ["createdBefore", "createdOnOrAfter"], "/tenant/{tenant}/estimate-templates"],
    ["estimates_proposal_templates_list", "proposals", ["modifiedBefore", "modifiedOnOrAfter"], ["createdBefore", "createdOnOrAfter"], "/tenant/{tenant}/proposal-templates"],
    ["accounting_payment_types_list", "payment-types", ["createdBefore", "createdOnOrAfter"], ["modifiedBefore", "modifiedOnOrAfter"], "/tenant/{tenant}/payment-types"],
    ["export_payroll_adjustments", "exports", [], ["createdBefore", "createdOnOrAfter", "modifiedBefore", "modifiedOnOrAfter"], "/tenant/{tenant}/export/payroll-adjustments"],
    ["payroll_payrolls_list", "payrolls", [...dateKeys], [], "/tenant/{tenant}/payrolls"],
  ] as const)("%s exposes and forwards only documented date filters", async (name, group, allowed, forbidden, path) => {
    const register = group === "arrival" ? registerDispatchArrivalWindowTools
      : group === "jobs" ? registerDispatchJobTools
        : group === "proposals" ? registerProposalTemplateTools
          : group === "payment-types" ? registerPaymentTypeTools
            : group === "exports" ? registerExportTools
              : group === "payrolls" ? registerPayrollTools
          : registerEstimateTemplateTools;
    const { definitions, get } = capture(register);
    const tool = definitions.get(name);
    expect(tool).toBeDefined();
    const keys = Object.keys(tool!.schema);
    expect(keys).toEqual(expect.arrayContaining([...allowed]));
    for (const key of forbidden) expect(keys).not.toContain(key);

    const timestamp = "2026-09-05T12:00:00Z";
    const input: Record<string, unknown> = Object.fromEntries([...dateKeys].map(key => [key, timestamp]));
    if (name === "dispatch_jobs_list_attachments") input.jobId = 7;
    await tool!.handler(input);
    expect(get).toHaveBeenCalledOnce();
    const expectedQuery = Object.fromEntries(allowed.map(key => [key, timestamp]));
    expect(get).toHaveBeenCalledWith(path, expect.objectContaining(expectedQuery));
    const query = get.mock.calls[0]![1] as Record<string, unknown>;
    for (const key of forbidden) expect(query).not.toHaveProperty(key);
  });

  it("matches every unambiguous stable date-filter schema to its official GET query contract", async () => {
    expect(findOfficialOperation("GET", "/accounting/v2/tenant/42/gl-accounts/types")?.id).toBe("GlAccounts_GetTypeList");
    const calls: Array<{ tool: string; path: string }> = [];
    const domains = join(root, "src/domains");
    for (const directory of readdirSync(domains)) {
      const domain = join(domains, directory);
      if (!statSync(domain).isDirectory()) continue;
      for (const file of readdirSync(domain).filter(name => name.endsWith(".ts"))) {
        const source = readFileSync(join(domain, file), "utf8");
        for (const match of source.matchAll(/client\.get\s*\(\s*([`'"])(.*?)\1/gs)) {
          const names = [...source.slice(0, match.index).matchAll(/name:\s*"([^"]+)"/g)];
          if (names.at(-1)?.[1]) calls.push({ tool: names.at(-1)![1], path: match[2] });
        }
        if (file === "exporters.ts") {
          for (const match of source.matchAll(/registerExportTool\([^\n]+?"(export_[^"]+)"\s*,\s*"[^"]+"\s*,\s*"([^"]+)"/g)) {
            calls.push({ tool: match[1], path: match[2] });
          }
        }
      }
    }

    const config = loadConfig({ ST_CLIENT_ID: "fixture", ST_CLIENT_SECRET: "fixture", ST_APP_KEY: "fixture", ST_TENANT_ID: "42", ST_READONLY: "true", ST_LOG_LEVEL: "error" });
    const forbidden = async () => { throw new Error("No handler should execute"); };
    const runtime = await createMcpServer(config, { client: { config, get: forbidden, post: forbidden, patch: forbidden, put: forbidden, delete: forbidden } as unknown as ServiceTitanClient });
    try {
      const audited: string[] = [];
      const ambiguous: string[] = [];
      for (const tool of runtime.registry.getRegisteredTools().filter(tool => tool.operation === "read")) {
        const exposed = Object.keys(tool.schema).filter(key => dateKeys.has(key)).sort();
        if (!exposed.length) continue;
        const candidates = calls.filter(call => call.tool === tool.name);
        if (candidates.length !== 1) { ambiguous.push(`${tool.name}:${candidates.length}`); continue; }
        const concrete = candidates[0].path.replace(/\$\{[^}]+\}/g, "1");
        const resolved = resolveServiceTitanPath(concrete, "42", "GET");
        const operation = findOfficialOperation("GET", resolved);
        expect(operation, `${tool.name}: ${resolved}`).toBeDefined();
        const official = operation!.parameters.filter(parameter => parameter.in === "query" && dateKeys.has(parameter.name)).map(parameter => parameter.name).sort();
        expect(exposed.every(key => official.includes(key)), `${tool.name}: ${operation!.id}`).toBe(true);
        audited.push(tool.name);
      }
      expect(audited).toHaveLength(102);
      expect(ambiguous).toEqual([]);
    } finally {
      await runtime.server.close();
    }
  });
});
