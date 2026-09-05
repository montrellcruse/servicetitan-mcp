import { createHash } from "node:crypto";
import type { ServiceTitanClient } from "./client.js";
import type { ServiceTitanConfig } from "./config.js";
import { ServiceTitanApiError } from "./client.js";
import { INTELLIGENCE_REPORT_CONTRACTS, inspectReportDefinition } from "./domains/intelligence/report-executor.js";
import { getRequestContext, throwIfAborted } from "./request-context.js";

/** Small documented reads verify module access, not every scope or product entitlement. */
export const READINESS_PROBES = [
  ["crm", "/crm/v2/tenant/{tenant}/customers"],
  ["dispatch", "/jpm/v2/tenant/{tenant}/job-types"],
  ["scheduling", "/dispatch/v2/tenant/{tenant}/business-hours"],
  ["accounting", "/accounting/v2/tenant/{tenant}/invoices"],
  ["pricebook", "/pricebook/v2/tenant/{tenant}/categories"],
  ["payroll", "/payroll/v2/tenant/{tenant}/gross-pay-items"],
  ["memberships", "/memberships/v2/tenant/{tenant}/membership-types"],
  ["marketing", "/marketing/v2/tenant/{tenant}/campaigns"],
  ["inventory", "/inventory/v2/tenant/{tenant}/warehouses"],
  ["people", "/settings/v2/tenant/{tenant}/technicians"],
  ["settings", "/settings/v2/tenant/{tenant}/business-units"],
  ["estimates", "/sales/v2/tenant/{tenant}/estimates"],
  ["reporting", "/reporting/v2/tenant/{tenant}/report-categories"],
] as const;

function safeFailure(error: unknown): { httpStatus: number; reason: string } {
  const status = error instanceof ServiceTitanApiError ? error.status : 0;
  const reason = status === 403 ? "Access denied; verify API scope and product entitlement"
    : status === 401 ? "Authentication rejected"
    : status === 404 ? "Required operation or report unavailable"
    : status === 429 ? "Rate limited; retry readiness after the reporting cooldown"
    : "Request failed; inspect sanitized server diagnostics";
  return { httpStatus: status, reason };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function checkReadiness(
  client: ServiceTitanClient,
  config: ServiceTitanConfig,
  options: { reports?: boolean; domains?: readonly string[] } = {},
): Promise<Record<string, unknown>> {
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    environment: config.environment,
    timezone: config.timezone,
    readonly: config.readonlyMode,
    status: "ready",
    scopeCoverage: "Representative read access only; write scopes and unprobed operations are not certified",
  };
  throwIfAborted(getRequestContext().signal);
  try { await client.ensureToken(); throwIfAborted(getRequestContext().signal); manifest.authentication = "ok"; }
  catch (error) { throwIfAborted(getRequestContext().signal); return { ...manifest, status: "unavailable", authentication: "failed", failure: safeFailure(error) }; }

  const profileDomains: Record<string, string[]> = { crm: ["crm"], dispatch: ["dispatch", "scheduling", "people", "settings"], analytics: ["intelligence", "reporting", "settings"] };
  const profile = profileDomains[config.toolProfile ?? "full"];
  let selected = new Set(config.enabledDomains ?? profile ?? [...READINESS_PROBES.map(([domain]) => domain), "intelligence"]);
  if (profile) selected = new Set([...selected].filter(domain => profile.includes(domain)));
  if (config.enabledTools) {
    const toolDomains = new Set(config.enabledTools.map(name => name.startsWith("intel_") ? "intelligence" : name.split("_")[0]));
    selected = new Set([...selected].filter(domain => toolDomains.has(domain)));
  }
  const inspectReports = options.reports ?? (selected.has("intelligence") || selected.has("reporting"));
  // Analytics has optional API sources; their absence is reported as a limitation, not evidence that unrelated domains were enabled.
  const requestedDomains = options.domains
    ? options.domains.filter((domain) => selected.has(domain))
    : [...selected];
  const probes: Array<Record<string, unknown>> = [];
  for (const [domain, path] of READINESS_PROBES) {
    if (!requestedDomains.includes(domain)) continue;
    getRequestContext().signal?.throwIfAborted();
    try {
      await client.get(path, { page: 1, pageSize: 1 });
      throwIfAborted(getRequestContext().signal);
      probes.push({ domain, path, status: "available" });
    } catch (error) {
      throwIfAborted(getRequestContext().signal);
      probes.push({ domain, path, status: "unavailable", ...safeFailure(error) });
      manifest.status = "partial";
    }
  }
  manifest.modules = probes;
  const reports: Array<Record<string, unknown>> = [];
  if (inspectReports) {
    for (const contract of INTELLIGENCE_REPORT_CONTRACTS) {
      getRequestContext().signal?.throwIfAborted();
      try {
        const { binding, definition, errors } = await inspectReportDefinition(client, contract, config.reportBindings);
        throwIfAborted(getRequestContext().signal);
        const fields = (definition.fields ?? []).filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
          .map(f => ({ name: f.name, dataType: f.dataType }));
        const parameters = (definition.parameters ?? []).filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
          .map(p => ({ name: p.name, dataType: p.dataType, isArray: p.isArray, isRequired: p.isRequired }));
        reports.push({ key: contract.key, binding, status: errors.length ? "incompatible" : "available", errors,
          definitionFingerprint: fingerprint({ fields, parameters }), fields, parameters,
          ...(contract.key === "166" ? { grossPayAvailable: fields.some(f => f.name === "GrossPay") } : {}),
        });
        if (errors.length) manifest.status = "partial";
      } catch (error) {
        throwIfAborted(getRequestContext().signal);
        reports.push({ key: contract.key, status: "unavailable", ...safeFailure(error) });
        manifest.status = "partial";
      }
    }
  }
  manifest.reports = reports;
  manifest.limitations = ["One company configuration per manifest", "No business records are retained", "Readiness does not reconcile KPI amounts against dashboards"];
  return manifest;
}
