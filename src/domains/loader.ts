import loadAccountingDomain from "./accounting/index.js";
import loadCrmDomain from "./crm/index.js";
import loadDispatchDomain from "./dispatch/index.js";
import loadEstimatesDomain from "./estimates/index.js";
import loadExportDomain from "./export/index.js";
import loadIntelligenceDomain from "./intelligence/index.js";
import loadInventoryDomain from "./inventory/index.js";
import loadMarketingDomain from "./marketing/index.js";
import loadMembershipsDomain from "./memberships/index.js";
import loadPayrollDomain from "./payroll/index.js";
import loadPeopleDomain from "./people/index.js";
import loadPricebookDomain from "./pricebook/index.js";
import loadReportingDomain from "./reporting/index.js";
import loadSchedulingDomain from "./scheduling/index.js";
import loadSettingsDomain from "./settings/index.js";

import type { Logger } from "../logger.js";
import { type DomainLoader, type ToolRegistry } from "../registry.js";

const DOMAIN_LOADERS = [
  ["accounting", loadAccountingDomain],
  ["crm", loadCrmDomain],
  ["dispatch", loadDispatchDomain],
  ["estimates", loadEstimatesDomain],
  ["export", loadExportDomain],
  ["intelligence", loadIntelligenceDomain],
  ["inventory", loadInventoryDomain],
  ["marketing", loadMarketingDomain],
  ["memberships", loadMembershipsDomain],
  ["payroll", loadPayrollDomain],
  ["people", loadPeopleDomain],
  ["pricebook", loadPricebookDomain],
  ["reporting", loadReportingDomain],
  ["scheduling", loadSchedulingDomain],
  ["settings", loadSettingsDomain],
] as const satisfies ReadonlyArray<readonly [string, DomainLoader]>;

export async function loadDomainModules(
  registry: ToolRegistry,
  _logger: Logger,
): Promise<void> {
  for (const [domainName, loader] of DOMAIN_LOADERS) {
    registry.registerDomain(domainName, loader);
  }
}
