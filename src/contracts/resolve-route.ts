import { OFFICIAL_ROUTES } from "./official-routes.generated.js";
import { findOfficialOperation } from "./operations.js";

const MODULE_PREFIX = /^\/(?:accounting|crm|customer-interactions|dispatch|equipmentsystems|findings|forms|inventory|jbce|jpm|marketing|marketingads|marketingreputation|memberships|payroll|pricebook|reporting|sales|schedulingpro|service-agreements|settings|taskmanagement|telecom|timesheets)(?:\/v\d+)?\//;

// The public API has two different `/categories` resources. MCP category tools
// are Pricebook tools; the Marketing category operations are not registered.
const AMBIGUOUS_PATH_OWNERS: Readonly<Record<string, string>> = {
  "/tenant/{tenant}/categories": "/pricebook/v2",
  "/tenant/{tenant}/categories/{id}": "/pricebook/v2",
};

function templateRegex(template: string): RegExp {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\{[^}]+\\\}/g, "[^/]+")}$`);
}

const COMPILED_ROUTES = OFFICIAL_ROUTES.map((route) => ({
  ...route,
  regex: templateRegex(route.path),
  v2AliasRegex: templateRegex(route.path.replace(/^\/v2(?=\/tenant\/)/, "")),
  fullRegex: templateRegex(`${route.moduleBasePath}${route.path}`),
  specificity: route.path.split("/").filter((segment) => segment && !segment.startsWith("{")).length,
}));

function validateResolvedPath(resolved: string, method?: string): string {
  const exists = method
    ? findOfficialOperation(method, resolved) !== undefined
    : COMPILED_ROUTES.some(({ fullRegex }) => fullRegex.test(resolved));
  if (!exists) {
    throw new Error(`No pinned ServiceTitan ${method?.toUpperCase() ?? "API"} contract for path: ${resolved}`);
  }
  return resolved;
}

/** Resolve an MCP handler path to the exact module/version path in pinned ServiceTitan OpenAPI. */
export function resolveServiceTitanPath(path: string, tenantId: string, method?: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const withTenant = normalized.replaceAll("{tenant}", tenantId);
  if (MODULE_PREFIX.test(withTenant)) return validateResolvedPath(withTenant, method);

  const tenantPattern = new RegExp(`(/tenant/)${tenantId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const versionedTemplate = withTenant.replace(tenantPattern, "$1{tenant}");
  const unversionedTemplate = versionedTemplate.replace(/^\/v\d+(?=\/tenant\/)/, "");
  const candidateTemplates = [versionedTemplate, unversionedTemplate];
  const templatePath = unversionedTemplate.replace(
    new RegExp(`^/tenant/${tenantId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    "/tenant/{tenant}",
  );
  const preferredOwner = Object.entries(AMBIGUOUS_PATH_OWNERS)
    .find(([template]) => templateRegex(template).test(templatePath))?.[1];
  const directMatches = COMPILED_ROUTES.filter(({ regex }) => candidateTemplates.some((candidate) => regex.test(candidate)));
  const aliasMatches = COMPILED_ROUTES.filter(({ v2AliasRegex }) => candidateTemplates.some((candidate) => v2AliasRegex.test(candidate)));
  const initialMatches = directMatches.length > 0 ? directMatches : aliasMatches;
  const highestSpecificity = Math.max(...initialMatches.map(({ specificity }) => specificity));
  const matches = initialMatches.filter(({ specificity }) => specificity === highestSpecificity);
  const owners = new Set(matches.map(({ moduleBasePath }) => moduleBasePath));
  if (owners.size > 1 && !preferredOwner) {
    throw new Error(`Ambiguous pinned ServiceTitan contract route for path: ${normalized}`);
  }
  const match = matches.find(({ moduleBasePath }) => moduleBasePath === preferredOwner) ?? matches[0];
  if (!match) throw new Error(`No pinned ServiceTitan contract route for path: ${normalized}`);

  // Telecom declares `/telecom` as its server and `/v2/...` in operation paths.
  const directTemplate = candidateTemplates.find((candidate) => match.regex.test(candidate));
  const aliasTemplate = candidateTemplates.find((candidate) => match.v2AliasRegex.test(candidate));
  const matchedTemplate = directTemplate ?? (aliasTemplate ? `/v2${aliasTemplate}` : templatePath);
  return validateResolvedPath(`${match.moduleBasePath}${matchedTemplate.replace("{tenant}", tenantId)}`, method);
}
