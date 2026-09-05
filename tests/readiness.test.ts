import { describe, expect, it, vi } from "vitest";
import { ServiceTitanApiError, type ServiceTitanClient } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { checkReadiness } from "../src/readiness.js";
import { withRequestContext } from "../src/request-context.js";

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

describe("readiness compatibility manifests",()=>{
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
