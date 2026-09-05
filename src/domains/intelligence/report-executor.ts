import type { ServiceTitanClient } from "../../client.js";
import { ServiceTitanApiError } from "../../client.js";
import { awaitWithSignal, getRequestContext, sleepWithSignal, throwIfAborted } from "../../request-context.js";
import { getErrorMessage, isRecord } from "./helpers.js";

export interface ReportBinding { category: string; reportId: number }
export interface ReportContract extends ReportBinding {
  key: string;
  requiredParameters: readonly string[];
  fields: readonly string[];
  optionalFields?: readonly string[];
  parameterTypes?: Readonly<Record<string, string>>;
}

export interface ReportExecution {
  fields: Array<{ name: string; [key: string]: unknown }>;
  data: unknown[][];
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalCount?: number;
  complete: boolean;
  pagesFetched: number;
  binding: ReportBinding;
}

export const INTELLIGENCE_REPORT_CONTRACTS: readonly ReportContract[] = [
  { key:"162",category:"operations",reportId:162,requiredParameters:["DateType","From","To"],parameterTypes:{DateType:"Number"},fields:["BookedBy","JobNumber","InvoiceNumber","JobType","CustomerName","LocationAddress","CustomerPhone","JobSummary","FirstDispatch","JobStatus","Campaign","Total","CampaignCategory","IsPrevailingWageJob"] },
  { key:"163",category:"operations",reportId:163,requiredParameters:["DateType","From","To"],parameterTypes:{DateType:"Number"},fields:["JobNumber","ScheduledDate","CustomerName","CustomerAddress","CustomerPhone","CustomerEmail","LocationName","LocationAddress","LocationPhone","LocationEmail","JobType","AssignedTechnicians","JobSummary","Tags","IsPrevailingWageJob","CampaignCategory"] },
  { key:"166",category:"accounting",reportId:166,requiredParameters:["From","To"],fields:["EmployeeName","Date","RegularHours","OvertimeHours","DoubleOvertimeHours"],optionalFields:["GrossPay"] },
  { key:"168",category:"technician-dashboard",reportId:168,requiredParameters:["From","To"],fields:["Name","CompletedRevenue","OpportunityJobAverage","OpportunityConversionRate","Opportunity","ConvertedJobs","CustomerSatisfaction","TechnicianId","AdjustmentRevenue","CompletedRevenueWithAdjustments"] },
  { key:"169",category:"technician-dashboard",reportId:169,requiredParameters:["From","To"],fields:["Name","ReplacementOpportunity","LeadsSet","AverageLeadSale","ReplacementLeadConversionRate","ReplacementLeadsSold","TotalLeadSales","AverageReplacementLeadSale","TechnicianId"] },
  { key:"170",category:"technician-dashboard",reportId:170,requiredParameters:["From","To"],fields:["Name","RevenuePerHour","BillableEfficiency","Upsold","TasksPerOpportunity","OptionsPerOpportunity","RecallsCaused","TechnicianId","AdjustmentRevenue","CompletedRevenueWithAdjustments"] },
  { key:"171",category:"technician-dashboard",reportId:171,requiredParameters:["From","To"],fields:["Name","MembershipOpportunities","MembershipsSold","MembershipConversionRate","TechnicianId","AdjustmentRevenue","CompletedRevenueWithAdjustments"] },
  { key:"172",category:"technician-dashboard",reportId:172,requiredParameters:["From","To"],fields:["Name","TotalSales","ClosedAverageSale","CloseRate","SalesOpportunity","OptionsPerOpportunity","TechnicianId","AdjustmentRevenue","CompletedRevenueWithAdjustments"] },
  { key:"173",category:"technician-dashboard",reportId:173,requiredParameters:["From","To"],fields:["Name","TechnicianBusinessUnit","TotalSalesFromTgl","ClosedAverageSaleFromTgl","CloseRateFromTgl","OptionsPerOpportunityFromTgl","TechnicianBusinessUnitId","TechnicianDivision","PaidTimeByBusinessUnit","AdjustmentRevenue","CompletedRevenueWithAdjustments","TechnicianId"] },
  { key:"174",category:"technician-dashboard",reportId:174,requiredParameters:["From","To"],fields:["Name","TotalSalesFromMarketingLeads","ClosedAverageSaleFromMarketingLeads","CloseRateFromMarketingLeads","OptionsPerOpportunityFromMarketingLeads","TechnicianId","AdjustmentRevenue","CompletedRevenueWithAdjustments"] },
  { key:"175",category:"business-unit-dashboard",reportId:175,requiredParameters:["From","To"],fields:["Name","CompletedRevenue","OpportunityJobAverage","OpportunityConversionRate","Opportunity","ConvertedJobs","CustomerSatisfaction","AdjustmentRevenue","TotalRevenue","NonJobRevenue"] },
  { key:"176",category:"business-unit-dashboard",reportId:176,requiredParameters:["From","To"],fields:["Name","LeadGenerationOpportunity","LeadsSet","LeadConversionRate","AverageLeadSale","ReplacementOpportunity","ReplacementLeadsSet","ReplacementLeadConversionRate","MembershipSales","AdjustmentRevenue","TotalRevenue","NonJobRevenue"] },
  { key:"177",category:"business-unit-dashboard",reportId:177,requiredParameters:["From","To"],fields:["Name","RevenuePerHour","BillableEfficiency","Upsold","TasksPerOpportunity","OptionsPerOpportunity","RecallsCaused","AdjustmentRevenue","TotalRevenue","NonJobRevenue"] },
  { key:"178",category:"business-unit-dashboard",reportId:178,requiredParameters:["From","To"],fields:["Name","MembershipOpportunities","MembershipsConverted","MembershipConversionRate","AdjustmentRevenue","TotalRevenue","NonJobRevenue"] },
  { key:"179",category:"business-unit-dashboard",reportId:179,requiredParameters:["From","To"],fields:["Name","TotalSales","ClosedAverageSale","CloseRate","SalesOpportunity","OptionsPerOpportunity","AdjustmentRevenue","TotalRevenue","NonJobRevenue"] },
  { key:"182",category:"marketing",reportId:182,requiredParameters:["From","To"],fields:["Name","Suspended","Canceled","Expired","Deleted","Renewed","Reactivated","NewSales","ActiveAtEnd"] },
  { key:"2281",category:"operations",reportId:2281,requiredParameters:["From","To"],fields:["InvoiceNumber","Customer","EMail","Amount","InvoiceBalance","CustomerBalance","Project","ProjectEmailed","JobNumber","JobType","BusinessUnit","Technician","InvoicedOn","EmailedOn"] },
  { key:"2282",category:"operations",reportId:2282,requiredParameters:["From","To"],fields:["InvoiceNumber","Customer","EMail","Amount","InvoiceBalance","CustomerBalance","Project","ProjectEmailed","JobNumber","JobType","BusinessUnit","Technician","InvoicedOn"] }
] as const;

const CONTRACTS = new Map(INTELLIGENCE_REPORT_CONTRACTS.map((c) => [c.key, c]));

export function getReportContract(key: string): ReportContract {
  const contract = CONTRACTS.get(key);
  if (!contract) throw new Error(`Unknown intelligence report contract: ${key}`);
  return contract;
}

export function resolveReportBinding(
  key: string,
  overrides?: Record<string, ReportBinding>,
): ReportBinding {
  const contract = getReportContract(key);
  return overrides?.[key] ?? { category: contract.category, reportId: contract.reportId };
}

export interface ReportDefinition { parameters?: unknown[]; fields?: unknown[]; [key: string]: unknown }

export function validateReportDefinition(contract: ReportContract, definition: unknown): string[] {
  if (!isRecord(definition)) return ["definition is not an object"];
  const parameterNames = new Set((Array.isArray(definition.parameters) ? definition.parameters : [])
    .filter(isRecord).map((p) => p.name).filter((n): n is string => typeof n === "string"));
  const fieldNames = (Array.isArray(definition.fields) ? definition.fields : [])
    .filter(isRecord).map((f) => f.name).filter((n): n is string => typeof n === "string");
  const errors = contract.requiredParameters.filter((name) => !parameterNames.has(name))
    .map((name) => `missing required parameter ${name}`);
  for (const parameter of (Array.isArray(definition.parameters) ? definition.parameters : []).filter(isRecord)) {
    const name = typeof parameter.name === "string" ? parameter.name : undefined;
    const expected = name ? contract.parameterTypes?.[name] : undefined;
    if (expected && typeof parameter.dataType === "string" && parameter.dataType.toLowerCase() !== expected.toLowerCase()) {
      errors.push(`parameter ${name} has type ${parameter.dataType}; expected ${expected}`);
    }
  }
  const missingFields = contract.fields.filter((name) => !fieldNames.includes(name));
  if (missingFields.length) errors.push(`missing required fields ${missingFields.join(", ")}`);
  return errors;
}

export async function inspectReportDefinition(
  client: ServiceTitanClient,
  contract: ReportContract,
  overrides?: Record<string, ReportBinding>,
): Promise<{ binding: ReportBinding; definition: ReportDefinition; errors: string[] }> {
  const binding = resolveReportBinding(contract.key, overrides);
  const definition = await client.get(`/tenant/{tenant}/report-category/${binding.category}/reports/${binding.reportId}`);
  return { binding, definition: definition as ReportDefinition, errors: validateReportDefinition(contract, definition) };
}

interface ExecutorOptions {
  cooldownMs?: number;
  pageSize?: number;
  maxPages?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  maxRows?: number;
}

interface ReportState { lastStartedAt: number; tail: Promise<void>; cache: Map<string,{expiresAt:number;value:ReportExecution}> }
const CLIENT_STATES = new WeakMap<object, Map<string, ReportState>>();

function fieldNames(fields: unknown): string[] {
  return Array.isArray(fields) ? fields.filter(isRecord).map((f) => f.name).filter((v):v is string => typeof v === "string") : [];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function stable(value: unknown): string { return JSON.stringify(canonical(value)); }

export async function executeReport(
  client: ServiceTitanClient,
  key: string,
  parameters: Array<{name:string;value:unknown}>,
  overrides?: Record<string, ReportBinding>,
  options: ExecutorOptions = {},
): Promise<ReportExecution> {
  const contract = getReportContract(key);
  const suppliedNames = new Set(parameters.map((parameter) => parameter.name));
  const missingParameters = contract.requiredParameters.filter((name) => !suppliedNames.has(name));
  if (missingParameters.length) throw new Error(`Report ${key} is missing required parameters: ${missingParameters.join(", ")}`);
  for (const parameter of parameters) {
    const expected = contract.parameterTypes?.[parameter.name];
    if (expected === "Number" && typeof parameter.value !== "number") {
      throw new Error(`Report ${key} parameter ${parameter.name} must be a number`);
    }
  }
  const binding = resolveReportBinding(key, overrides);
  const reportKey = `${binding.category}:${binding.reportId}`;
  let states = CLIENT_STATES.get(client as object);
  if (!states) { states = new Map(); CLIENT_STATES.set(client as object, states); }
  let state = states.get(reportKey);
  if (!state) { state = { lastStartedAt:0, tail:Promise.resolve(), cache:new Map() }; states.set(reportKey,state); }
  const cooldownMs = options.cooldownMs ?? (process.env.NODE_ENV === "test" ? 0 : 65_000);
  const pageSize = options.pageSize ?? 1_000;
  const maxPages = options.maxPages ?? 20;
  const maxRows = options.maxRows ?? 100_000;
  const now = options.now ?? Date.now;
  const signal = options.signal ?? getRequestContext().signal;
  const sleep = options.sleep ?? ((ms:number) => sleepWithSignal(ms, signal));
  const requestKey = stable({ contractKey:key, binding, parameters, pageSize, maxPages, maxRows });
  const cached = state.cache.get(requestKey);
  if (cached && cached.expiresAt > now()) return cached.value;

  let release!: () => void;
  const predecessor = state.tail;
  state.tail = new Promise<void>((resolve) => { release = resolve; });
  try {
    await awaitWithSignal(predecessor, signal);
  } catch (error) {
    void predecessor.then(release, release);
    throw error;
  }
  try {
    const cachedAfterWait = state.cache.get(requestKey);
    if (cachedAfterWait && cachedAfterWait.expiresAt > now()) return cachedAfterWait.value;
    const allRows: unknown[][] = [];
    let fields: Array<{name:string;[key:string]:unknown}> = [];
    let responseFieldNames: string[] = [];
    let totalCount: number | undefined;
    let hasMore = false;
    let pagesFetched = 0;
    for (let page=1; page<=maxPages; page += 1) {
      throwIfAborted(signal);
      const waitMs = Math.max(0, state.lastStartedAt + cooldownMs - now());
      if (waitMs > 0) await sleep(waitMs);
      throwIfAborted(signal);
      state.lastStartedAt = now();
      let response: unknown;
      try {
        response = await client.post(
          `/tenant/{tenant}/report-category/${binding.category}/reports/${binding.reportId}/data`,
          { parameters },
          { page, pageSize, includeTotal: true },
        );
      } catch (error) {
        const message = `Report ${key} page ${page} failed: ${getErrorMessage(error)}`;
        if (error instanceof ServiceTitanApiError) {
          throw new ServiceTitanApiError(error.status, message, error.path, error.details);
        }
        throw new Error(message);
      }
      if (!isRecord(response) || !Array.isArray(response.data)) throw new Error(`Report ${key} returned an invalid page`);
      if (typeof response.hasMore !== "boolean") throw new Error(`Report ${key} page ${page} omitted boolean hasMore`);
      if (response.page !== undefined && response.page !== page) throw new Error(`Report ${key} returned page ${String(response.page)} while page ${page} was requested`);
      if (response.totalCount !== undefined && (!Number.isSafeInteger(response.totalCount) || (response.totalCount as number) < 0)) {
        throw new Error(`Report ${key} returned an invalid totalCount`);
      }
      const names = fieldNames(response.fields);
      if (new Set(names).size !== names.length) throw new Error(`Report ${key} page ${page} has duplicate field names`);
      if (page === 1) {
        const missing = contract.fields.filter((name) => !names.includes(name));
        if (missing.length) throw new Error(`Report ${key} is missing required fields: ${missing.join(", ")}`);
        responseFieldNames = names;
        const outputNames = [...contract.fields, ...(contract.optionalFields ?? []).filter((name) => names.includes(name))];
        fields = outputNames.map((name) => ({ name }));
        if (typeof response.totalCount === "number") totalCount = response.totalCount;
      } else if (names.join("\0") !== responseFieldNames.join("\0")) {
        throw new Error(`Report ${key} fields changed between pages`);
      }
      const indexes = fields.map((field) => names.indexOf(field.name));
      const rows = (response.data.filter(Array.isArray) as unknown[][])
        .map((row) => {
          if (row.length !== names.length) throw new Error(`Report ${key} page ${page} returned a row with ${row.length} cells for ${names.length} fields`);
          return indexes.map((index) => row[index]);
        });
      allRows.push(...rows); pagesFetched += 1; hasMore = response.hasMore === true;
      if (allRows.length > maxRows) throw new Error(`Report ${key} exceeded the ${maxRows}-row safety limit`);
      if (!hasMore) break;
      if (rows.length === 0) throw new Error(`Report ${key} returned hasMore=true with no rows`);
    }
    if (hasMore) throw new Error(`Report ${key} exceeded the ${maxPages}-page safety limit`);
    if (totalCount !== undefined && allRows.length !== totalCount) {
      throw new Error(`Report ${key} returned ${allRows.length} rows but totalCount was ${totalCount}`);
    }
    const result: ReportExecution = { fields, data:allRows, page:1, pageSize, hasMore:false, totalCount, complete:true, pagesFetched, binding };
    for (const [cacheKey, entry] of state.cache) if (entry.expiresAt <= now()) state.cache.delete(cacheKey);
    while (state.cache.size >= 100) state.cache.delete(state.cache.keys().next().value as string);
    state.cache.set(requestKey,{expiresAt:now()+cooldownMs,value:result});
    return result;
  } finally { release(); }
}
