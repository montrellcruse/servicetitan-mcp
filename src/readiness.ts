import { createHash } from "node:crypto";
import { ServiceTitanApiError, type ServiceTitanClient } from "./client.js";
import type { ServiceTitanConfig } from "./config.js";
import { getOfficialOperation, OFFICIAL_OPERATIONS } from "./contracts/index.js";
import { INTELLIGENCE_REPORT_CONTRACTS, inspectReportDefinition, type ReportKey } from "./domains/intelligence/report-executor.js";
import { Logger } from "./logger.js";
import { prepareToolCatalog } from "./prepare-tool-catalog.js";
import { getRequestContext, throwIfAborted } from "./request-context.js";
import type { ToolCatalog, ToolDeclaration } from "./tool-catalog.js";

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

function findExportProbe(tools: readonly Readonly<ToolDeclaration>[], preferredPaths: ReadonlySet<string>): string | undefined {
  const scopeKey = (scopes: readonly string[]) => [...scopes].sort().join(" ");
  const exportScopes = new Set<string>();
  for (const { domain, apiContract } of tools) {
    if (domain !== "export" || !apiContract || !("operationId" in apiContract)) continue;
    const { scopes } = getOfficialOperation(apiContract.operationId);
    if (scopes.length) exportScopes.add(scopeKey(scopes));
  }

  // Incremental exports lack a page-size bound. Check a documented paginated read
  // with the same scopes and no required filters, using only the first record.
  const boundedReads = OFFICIAL_OPERATIONS.filter(({ method, path, scopes, parameters }) =>
    method === "GET" && !path.includes("/export/") && exportScopes.has(scopeKey(scopes))
    && !parameters.some(parameter => parameter.required && (parameter.in !== "path" || parameter.name !== "tenant"))
    && ["page", "pageSize"].every(name =>
      parameters.some(parameter => parameter.in === "query" && parameter.name === name)),
  );
  return boundedReads.find(({ fullPath }) => preferredPaths.has(fullPath))?.fullPath ?? boundedReads[0]?.fullPath;
}

function planReports(catalog: ToolCatalog, reports: boolean | undefined) {
  if (reports === false) return [];
  const requirements = new Map<ReportKey, boolean>();
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

  const selectedTools = catalog.getSelectedTools();
  const probeDomains = new Set(
    selectedTools
      .filter(tool => !options.domains || options.domains.includes(tool.domain))
      .flatMap(tool => [tool.domain, ...(tool.readinessDomains ?? [])]),
  );
  const includesDomain = (domain: string) => probeDomains.has(domain);
  const probePlan: Array<readonly [domain: string, path: string]> = READINESS_PROBES.filter(([domain]) => includesDomain(domain));
  const probes: Array<Record<string, unknown>> = [];
  if (includesDomain("export")) {
    const exportPath = findExportProbe(selectedTools, new Set(probePlan.map(([, path]) => path)));
    if (exportPath) {
      probePlan.push(["export", exportPath]);
    } else {
      probes.push({ domain: "export", status: "unverified", reason: "No bounded read shares the scopes of a selected export" });
      manifest.status = "partial";
    }
  }
  for (const [domain, path] of probePlan) {
    getRequestContext().signal?.throwIfAborted();
    const existing = probes.find(probe => probe.path === path);
    if (existing) {
      probes.push({ ...existing, domain });
      continue;
    }
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
