import { createHash } from "node:crypto";
import type { ServiceTitanClient } from "./client.js";
import type { ServiceTitanConfig } from "./config.js";
import { ServiceTitanApiError } from "./client.js";
import { INTELLIGENCE_REPORT_CONTRACTS, inspectReportDefinition } from "./domains/intelligence/report-executor.js";
import { Logger } from "./logger.js";
import { prepareToolCatalog } from "./prepare-tool-catalog.js";
import { getRequestContext, throwIfAborted } from "./request-context.js";
import type { ToolCatalog } from "./tool-catalog.js";

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
    : status === 404 ? "Operation or report unavailable"
    : status === 429 ? "Rate limited; retry readiness after the reporting cooldown"
    : "Request failed; inspect sanitized server diagnostics";
  return { httpStatus: status, reason };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

type ReadinessOptions = { reports?: boolean; domains?: readonly string[] };

function planReports(catalog: ToolCatalog, reports: boolean | undefined) {
  if (reports === false) return [];
  const requirements = new Map<string, boolean>();
  for (const tool of catalog.getSelectedTools()) {
    for (const key of tool.reports?.optional ?? []) {
      if (!requirements.has(key)) requirements.set(key, false);
    }
    for (const key of tool.reports?.required ?? []) requirements.set(key, true);
  }
  return INTELLIGENCE_REPORT_CONTRACTS.flatMap(contract =>
    reports === true || requirements.has(contract.key)
      ? [{ contract, required: reports === true || requirements.get(contract.key) === true }]
      : []);
}

export async function checkReadiness(
  client: ServiceTitanClient,
  config: ServiceTitanConfig,
  options: ReadinessOptions = {},
): Promise<Record<string, unknown>> {
  const logger = new Logger(config.logLevel, [config.clientSecret, config.appKey]);
  const catalog = await prepareToolCatalog(config, client, logger);
  return checkCatalogReadiness(client, config, catalog, options);
}

export async function checkCatalogReadiness(
  client: ServiceTitanClient,
  config: ServiceTitanConfig,
  catalog: ToolCatalog,
  options: ReadinessOptions = {},
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

  const selected = new Set(catalog.getSelectedTools().map(tool => tool.domain));
  const probes: Array<Record<string, unknown>> = [];
  for (const [domain, path] of READINESS_PROBES) {
    if (!selected.has(domain) || (options.domains && !options.domains.includes(domain))) continue;
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
  const limitations = ["One company configuration per manifest", "No business records are retained", "Readiness does not reconcile KPI amounts against dashboards"];
  const reports: Array<Record<string, unknown>> = [];
  for (const { contract, required } of planReports(catalog, options.reports)) {
    throwIfAborted(getRequestContext().signal);
    let status: "available" | "incompatible" | "unavailable";
    try {
      const { binding, definition, errors } = await inspectReportDefinition(client, contract, config.reportBindings);
      throwIfAborted(getRequestContext().signal);
      const fields = (Array.isArray(definition?.fields) ? definition.fields : [])
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
        .map(f => ({ name: f.name, dataType: f.dataType }));
      const parameters = (Array.isArray(definition?.parameters) ? definition.parameters : [])
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .map(p => ({ name: p.name, dataType: p.dataType, isArray: p.isArray, isRequired: p.isRequired }));
      status = errors.length ? "incompatible" : "available";
      reports.push({ key: contract.key, binding, required, status, errors,
        definitionFingerprint: fingerprint({ fields, parameters }), fields, parameters,
        ...(contract.key === "166" ? { grossPayAvailable: fields.some(f => f.name === "GrossPay") } : {}),
      });
    } catch (error) {
      throwIfAborted(getRequestContext().signal);
      status = "unavailable";
      reports.push({ key: contract.key, required, status, ...safeFailure(error) });
    }
    if (status !== "available") {
      if (required) manifest.status = "partial";
      else limitations.push(`Optional report ${contract.key} is ${status}`);
    }
  }
  manifest.reports = reports;
  manifest.limitations = limitations;
  return manifest;
}
