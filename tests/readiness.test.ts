import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ServiceTitanApiError, type ServiceTitanClient } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { checkReadiness } from "../src/readiness.js";
import { withRequestContext } from "../src/request-context.js";
import { createMcpServer } from "../src/server.js";

// Minimal synthetic definitions, explicitly maintained apart from the production
// contract table so a changed requirement cannot silently change its fixture.
// No report rows, company metadata, or captured API responses are needed here.
const reportFields: Record<string, string[]> = {
  "162": ["BookedBy", "JobNumber", "InvoiceNumber", "JobType", "CustomerName", "LocationAddress", "CustomerPhone", "JobSummary", "FirstDispatch", "JobStatus", "Campaign", "Total", "CampaignCategory", "IsPrevailingWageJob"],
  "163": ["JobNumber", "ScheduledDate", "CustomerName", "CustomerAddress", "CustomerPhone", "CustomerEmail", "LocationName", "LocationAddress", "LocationPhone", "LocationEmail", "JobType", "AssignedTechnicians", "JobSummary", "Tags", "IsPrevailingWageJob", "CampaignCategory"],
  "166": ["EmployeeName", "Date", "RegularHours", "OvertimeHours", "DoubleOvertimeHours"],
  "168": ["Name", "CompletedRevenue", "OpportunityJobAverage", "OpportunityConversionRate", "Opportunity", "ConvertedJobs", "CustomerSatisfaction", "TechnicianId", "AdjustmentRevenue", "CompletedRevenueWithAdjustments"],
  "169": ["Name", "ReplacementOpportunity", "LeadsSet", "AverageLeadSale", "ReplacementLeadConversionRate", "ReplacementLeadsSold", "TotalLeadSales", "AverageReplacementLeadSale", "TechnicianId"],
  "170": ["Name", "RevenuePerHour", "BillableEfficiency", "Upsold", "TasksPerOpportunity", "OptionsPerOpportunity", "RecallsCaused", "TechnicianId", "AdjustmentRevenue", "CompletedRevenueWithAdjustments"],
  "171": ["Name", "MembershipOpportunities", "MembershipsSold", "MembershipConversionRate", "TechnicianId", "AdjustmentRevenue", "CompletedRevenueWithAdjustments"],
  "172": ["Name", "TotalSales", "ClosedAverageSale", "CloseRate", "SalesOpportunity", "OptionsPerOpportunity", "TechnicianId", "AdjustmentRevenue", "CompletedRevenueWithAdjustments"],
  "173": ["Name", "TechnicianBusinessUnit", "TotalSalesFromTgl", "ClosedAverageSaleFromTgl", "CloseRateFromTgl", "OptionsPerOpportunityFromTgl", "TechnicianBusinessUnitId", "TechnicianDivision", "PaidTimeByBusinessUnit", "AdjustmentRevenue", "CompletedRevenueWithAdjustments", "TechnicianId"],
  "174": ["Name", "TotalSalesFromMarketingLeads", "ClosedAverageSaleFromMarketingLeads", "CloseRateFromMarketingLeads", "OptionsPerOpportunityFromMarketingLeads", "TechnicianId", "AdjustmentRevenue", "CompletedRevenueWithAdjustments"],
  "175": ["Name", "CompletedRevenue", "OpportunityJobAverage", "OpportunityConversionRate", "Opportunity", "ConvertedJobs", "CustomerSatisfaction", "AdjustmentRevenue", "TotalRevenue", "NonJobRevenue"],
  "176": ["Name", "LeadGenerationOpportunity", "LeadsSet", "LeadConversionRate", "AverageLeadSale", "ReplacementOpportunity", "ReplacementLeadsSet", "ReplacementLeadConversionRate", "MembershipSales", "AdjustmentRevenue", "TotalRevenue", "NonJobRevenue"],
  "177": ["Name", "RevenuePerHour", "BillableEfficiency", "Upsold", "TasksPerOpportunity", "OptionsPerOpportunity", "RecallsCaused", "AdjustmentRevenue", "TotalRevenue", "NonJobRevenue"],
  "178": ["Name", "MembershipOpportunities", "MembershipsConverted", "MembershipConversionRate", "AdjustmentRevenue", "TotalRevenue", "NonJobRevenue"],
  "179": ["Name", "TotalSales", "ClosedAverageSale", "CloseRate", "SalesOpportunity", "OptionsPerOpportunity", "AdjustmentRevenue", "TotalRevenue", "NonJobRevenue"],
  "182": ["Name", "Suspended", "Canceled", "Expired", "Deleted", "Renewed", "Reactivated", "NewSales", "ActiveAtEnd"],
  "2281": ["InvoiceNumber", "Customer", "EMail", "Amount", "InvoiceBalance", "CustomerBalance", "Project", "ProjectEmailed", "JobNumber", "JobType", "BusinessUnit", "Technician", "InvoicedOn", "EmailedOn"],
  "2282": ["InvoiceNumber", "Customer", "EMail", "Amount", "InvoiceBalance", "CustomerBalance", "Project", "ProjectEmailed", "JobNumber", "JobType", "BusinessUnit", "Technician", "InvoicedOn"],
};
const definitions = new Map(Object.entries(reportFields).map(([id, fields]) => [id, {
  fields: fields.map(name => ({ name })),
  parameters: ["From", "To", ...(["162", "163"].includes(id) ? ["DateType"] : [])]
    .map(name => ({ name, dataType: name === "DateType" ? "Number" : "Date", isArray: false, isRequired: true })),
}]));
const base={ST_CLIENT_ID:"fixture",ST_CLIENT_SECRET:"fixture-secret",ST_APP_KEY:"fixture-key",ST_TENANT_ID:"101"};
function fakeClient(overrides:Record<string,unknown>={},alternate=false) {
  return {ensureToken:vi.fn(async()=>{}),get:vi.fn(async(path:string)=>{
    const match=/\/reports\/(\d+)$/.exec(path);
    if(!match)return {data:[],hasMore:false};
    const id=alternate && match[1]==="900166" ? "166" : match[1];
    if(Object.hasOwn(overrides,id)) {
      if(overrides[id] instanceof Error)throw overrides[id];
      return overrides[id];
    }
    const original=definitions.get(id);if(!original)throw new ServiceTitanApiError(404,"Unavailable",path);
    return {...original,fields:alternate?[...original.fields].reverse():original.fields};
  })} as unknown as ServiceTitanClient;
}

async function mcpReadiness(client: ServiceTitanClient, tool: string, reports?: boolean) {
  const config = loadConfig({ ...base, ST_TOOLS: tool });
  const runtime = await createMcpServer(config, { client });
  const sdk = new Client({ name: "readiness-fixture", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await runtime.server.connect(serverTransport);
    await sdk.connect(clientTransport);
    const result = await sdk.callTool({ name: "st_readiness_check", arguments: reports === undefined ? {} : { reports } });
    expect(result.isError).toBeFalsy();
    return result.structuredContent;
  } finally {
    await sdk.close();
    await runtime.server.close();
  }
}

describe("readiness compatibility manifests",()=>{
  it("checks only the required labor report in a labor-cost-only MCP catalog", async () => {
    const client = fakeClient();
    const result = await mcpReadiness(client, "intel_labor_cost");

    expect(result).toMatchObject({
      status: "ready",
      reports: [{ key: "166", status: "available", required: true, grossPayAvailable: false }],
    });
    expect(client.get).toHaveBeenCalledExactlyOnceWith("/tenant/{tenant}/report-category/accounting/reports/166");
  });
  it.each([
    ["unavailable", new ServiceTitanApiError(404, "Missing fixture definition", "/report")],
    ["incompatible", { parameters: [], fields: [] }],
  ])("is partial when its required definition is %s", async (reportStatus, definition) => {
    const result = await mcpReadiness(fakeClient({ "166": definition }), "intel_labor_cost");

    expect(result).toMatchObject({
      status: "partial",
      reports: [{ key: "166", status: reportStatus, required: true }],
    });
  });
  const laborDefinition = definitions.get("166")!;
  it.each([
    ["duplicate field names", { fields: [...laborDefinition.fields, laborDefinition.fields[0]] }],
    ["invalid field metadata", { fields: [...laborDefinition.fields, { name: " " }] }],
    ["parameter From", {
      parameters: laborDefinition.parameters.map(parameter => ({
        ...parameter,
        isArray: parameter.name === "From",
      })),
    }],
    ["unsupported required parameter PayrollCode", {
      parameters: [...laborDefinition.parameters, { name: "PayrollCode", isRequired: true }],
    }],
  ])("is partial when the required labor definition has %s", async (reason, override) => {
    const result = await mcpReadiness(fakeClient({ "166": { ...laborDefinition, ...override } }), "intel_labor_cost");

    expect(result).toMatchObject({
      status: "partial",
      reports: [{
        key: "166", status: "incompatible", required: true,
        errors: expect.arrayContaining([expect.stringContaining(reason)]),
      }],
    });
  });
  it("reports unavailable extended metrics while default scorecard readiness stays ready", async () => {
    const client = fakeClient({ "171": new ServiceTitanApiError(404, "Missing fixture definition", "/report") });
    const result = await mcpReadiness(client, "intel_technician_scorecard");

    expect(result).toMatchObject({
      status: "ready",
      reports: [
        { key: "168", required: true, status: "available" },
        { key: "169", required: true, status: "available" },
        { key: "170", required: true, status: "available" },
        { key: "171", required: false, status: "unavailable", httpStatus: 404 },
        { key: "173", required: false, status: "available" },
        { key: "174", required: false, status: "available" },
      ],
      limitations: expect.arrayContaining(["Optional report 171 is unavailable"]),
    });
  });
  it("explicitly checks definitions beyond the catalog or skips report checks", async () => {
    const client = fakeClient();
    const expanded = await mcpReadiness(client, "intel_labor_cost", true);
    expect(expanded).toMatchObject({ status: "ready" });
    expect(expanded?.reports).toHaveLength(18);
    expect(expanded?.reports).toContainEqual(expect.objectContaining({ key: "2282" }));

    const skipClient = fakeClient();
    const skipped = await mcpReadiness(skipClient, "intel_labor_cost", false);
    expect(skipped).toMatchObject({ status: "ready", reports: [] });
    expect(skipClient.get).not.toHaveBeenCalled();
  });
  it("validates synthetic definitions without reading report rows",async()=>{
    const client=fakeClient();const result=await checkReadiness(client,loadConfig(base),{domains:["crm"]});
    expect(result.authentication).toBe("ok");expect(result.status).toBe("ready");
    expect(result.reports).toHaveLength(18);
    expect((result.reports as any[]).find(r=>r.key==="166").grossPayAvailable).toBe(false);
    expect((client.get as any).mock.calls.every(([p]:string[])=>!p.endsWith("/data"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fixture-secret");expect(JSON.stringify(result)).not.toContain("fixture-key");
  });
  it("supports a second fixture with custom IDs, reordered fields and different timezone",async()=>{
    const config=loadConfig({...base,ST_TENANT_ID:"202",ST_TIMEZONE:"America/New_York",ST_REPORT_BINDINGS:'{"166":{"category":"accounting","reportId":900166}}'});
    const client=fakeClient({},true);const result=await checkReadiness(client,config,{domains:[]});
    expect(result.status).toBe("ready");expect(result.timezone).toBe("America/New_York");
    expect(client.get).toHaveBeenCalledWith("/tenant/{tenant}/report-category/accounting/reports/900166");
    expect((result.reports as any[]).find(r=>r.key==="166").binding.reportId).toBe(900166);
  });
  it("reports missing scope/report and incompatible fields without exposing server error text",async()=>{
    const client=fakeClient({"162":new ServiceTitanApiError(403,"Sensitive fixture value", "/report"),"166":{parameters:definitions.get("166")!.parameters,fields:[{name:"EmployeeName"}]}});
    const result=await checkReadiness(client,loadConfig(base),{domains:[]});
    expect(result.status).toBe("partial");
    expect((result.reports as any[]).find(r=>r.key==="162")).toMatchObject({status:"unavailable",httpStatus:403});
    expect((result.reports as any[]).find(r=>r.key==="166")).toMatchObject({status:"incompatible"});
    expect(JSON.stringify(result)).not.toContain("Sensitive fixture value");
  });
  it("stops on authentication failure instead of issuing every dependent probe",async()=>{
    const client=fakeClient();(client.ensureToken as any).mockRejectedValue(new Error("secret upstream body"));
    const result=await checkReadiness(client,loadConfig(base));
    expect(result.status).toBe("unavailable");expect(client.get).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("secret upstream body");
  });
  it("propagates cancellation from the final selected module probe",async()=>{
    const controller=new AbortController();
    const client=fakeClient();
    (client.get as any).mockImplementationOnce(async()=>{
      controller.abort();
      return {data:[],hasMore:false};
    });
    await expect(withRequestContext({signal:controller.signal},()=>checkReadiness(client,loadConfig(base),{domains:["reporting"],reports:false}))).rejects.toMatchObject({name:"AbortError"});
    expect(client.get).toHaveBeenCalledTimes(1);
  });
  it("propagates cancellation from the final report-definition probe",async()=>{
    const controller=new AbortController();
    const client=fakeClient();
    const originalGet=client.get as any;
    originalGet.mockImplementation(async(path:string)=>{
      if(path.endsWith("/reports/2282")){
        controller.abort();
        return definitions.get("2282");
      }
      const match=/\/reports\/(\d+)$/.exec(path);
      const definition=match&&definitions.get(match[1]);
      if(!definition)throw new ServiceTitanApiError(404,"Unavailable",path);
      return definition;
    });
    await expect(withRequestContext({signal:controller.signal},()=>checkReadiness(client,loadConfig(base),{domains:[]}))).rejects.toMatchObject({name:"AbortError"});
    expect(originalGet.mock.calls.at(-1)?.[0]).toMatch(/\/reports\/2282$/);
  });
  it.each([
    ["export_customers", "/crm/v2/tenant/{tenant}/customers"],
    ["export_payments", "/accounting/v2/tenant/{tenant}/payments"],
  ])("probes a bounded read with the scope used by %s", async (tool, path) => {
    const client = fakeClient();
    const result = await mcpReadiness(client, tool);

    expect(result).toMatchObject({
      status: "ready",
      modules: [{ domain: "export", path, status: "available" }],
    });
    expect(client.get).toHaveBeenCalledExactlyOnceWith(path, { page: 1, pageSize: 1 });
  });
  it("reports a denied export scope without disclosing the upstream error", async () => {
    const client = fakeClient();
    const path = "/crm/v2/tenant/{tenant}/customers";
    vi.mocked(client.get).mockRejectedValueOnce(new ServiceTitanApiError(403, "Sensitive fixture value", path));

    const result = await mcpReadiness(client, "export_customers");

    expect(result).toMatchObject({
      status: "partial",
      modules: [{ domain: "export", path, status: "unavailable", httpStatus: 403 }],
    });
    expect(JSON.stringify(result)).not.toContain("Sensitive fixture value");
  });
  it("reports partial when the only selected export has no bounded scope probe", async () => {
    const client = fakeClient();

    const result = await mcpReadiness(client, "export_invoice_items");

    expect(result).toMatchObject({
      authentication: "ok",
      status: "partial",
      modules: [{ domain: "export", status: "unverified" }],
    });
    expect(client.get).not.toHaveBeenCalled();
  });
  it("shares a matching scope probe with an exposed list domain", async () => {
    const client = fakeClient();
    const path = "/crm/v2/tenant/{tenant}/customers";
    const result = await mcpReadiness(client, "export_customers,crm_customers_list");

    expect(result).toMatchObject({
      status: "ready",
      modules: [
        { domain: "crm", path, status: "available" },
        { domain: "export", path, status: "available" },
      ],
    });
    expect(client.get).toHaveBeenCalledExactlyOnceWith(path, { page: 1, pageSize: 1 });
  });
  it("limits probes to the selected profile and explicit tool allowlist",async()=>{
    const profileClient=fakeClient();
    const profileResult=await checkReadiness(profileClient,loadConfig({...base,ST_TOOL_PROFILE:"crm"}));
    expect((profileResult.modules as any[]).map(module=>module.domain)).toEqual(["crm"]);
    expect(profileResult.reports).toEqual([]);
    expect(profileClient.get).toHaveBeenCalledTimes(1);
    const overrideClient=fakeClient();
    const overrideResult=await checkReadiness(overrideClient,loadConfig({...base,ST_TOOL_PROFILE:"crm"}),{domains:["inventory"],reports:false});
    expect(overrideResult.modules).toEqual([]);
    expect(overrideClient.get).not.toHaveBeenCalled();

    const allowlistClient=fakeClient();
    const allowlistResult=await checkReadiness(allowlistClient,loadConfig({...base,ST_DOMAINS:"crm,dispatch,inventory",ST_TOOLS:"inventory_warehouses_list"}));
    expect((allowlistResult.modules as any[]).map(module=>module.domain)).toEqual(["inventory"]);
    expect(allowlistResult.reports).toEqual([]);
    expect(allowlistClient.get).toHaveBeenCalledTimes(1);
  });
});
