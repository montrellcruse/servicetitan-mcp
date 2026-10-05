import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ServiceTitanClient } from "../src/client.js";
import type { ServiceTitanConfig } from "../src/config.js";
import { registerInvoiceTools } from "../src/domains/accounting/invoices.js";
import { registerJournalEntryTools } from "../src/domains/accounting/journal-entries.js";
import { registerVendorTools } from "../src/domains/inventory/vendors.js";
import { registerMarketingAttributionTools } from "../src/domains/marketing/attributions.js";
import { registerMarketingCallTools } from "../src/domains/marketing/calls.js";
import { registerReportTools } from "../src/domains/reporting/reports.js";
import type { ToolDefinition, ToolRegistry } from "../src/registry.js";

const config: ServiceTitanConfig = {
  clientId: "fixture-client", clientSecret: "fixture-secret", appKey: "fixture-key", tenantId: "42",
  environment: "integration", readonlyMode: true, confirmWrites: false, maxResponseChars: 100_000,
  enabledDomains: null, logLevel: "error", timezone: "UTC", corsOrigin: "", allowedCallers: null,
};
const response = (request: InternalAxiosRequestConfig, data: unknown) => ({
  config: request, data, status: 200, statusText: "OK", headers: {},
});
const tokenAdapter: AxiosAdapter = async request => response(request, { access_token: "fixture-token", expires_in: 900 });

function wireHarness() {
  const requests: Array<{ uri: string; method: string | undefined; body: unknown }> = [];
  const client = new ServiceTitanClient(config, {
    authAdapter: tokenAdapter,
    adapter: async request => {
      // Exercise Axios's real URL builder with the final merged request config,
      // rather than asserting only the parameters passed to a mocked client.
      requests.push({ uri: axios.getUri(request), method: request.method, body: request.data });
      return response(request, { page: 1, data: [], hasMore: false, totalCount: 0 });
    },
  });
  const tools = new Map<string, ToolDefinition>();
  const registry = { register: (tool: ToolDefinition) => tools.set(tool.name, tool) } as unknown as ToolRegistry;
  for (const register of [registerInvoiceTools, registerJournalEntryTools, registerVendorTools,
    registerMarketingCallTools, registerMarketingAttributionTools, registerReportTools]) register(client, registry);
  return {
    client,
    requests,
    async call(name: string, input: Record<string, unknown>) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Missing fixture tool ${name}`);
      const result = await tool.handler(z.object(tool.schema).parse(input));
      expect(result.isError).not.toBe(true);
      expect(requests).toHaveLength(1);
      return new URL(requests[0].uri);
    },
  };
}

// The public Inventory, Accounting and Telecom query schemas declare arrays
// without a style/explode override: OpenAPI form/explode=true repeats plain keys.
// Invoice statuses additionally documents &statuses=Pending&statuses=Posted.
// These URI checks do not certify unresolved provider binding of v2 call IDs.
const directArrays = [
  { tool: "inventory_vendors_list", path: "/inventory/v2/tenant/42/vendors", field: "ids", values: [11, 22] },
  { tool: "accounting_invoices_list", path: "/accounting/v2/tenant/42/invoices", field: "statuses", values: ["Pending", "Posted"] },
  { tool: "accounting_invoices_list", path: "/accounting/v2/tenant/42/invoices", field: "reviewStatuses", values: ["NeedsReview", "Reviewed"] },
  { tool: "accounting_invoices_list", path: "/accounting/v2/tenant/42/invoices", field: "assignedToIds", values: [11, 22] },
  { tool: "accounting_journal_entries_list", path: "/accounting/v2/tenant/42/journal-entries", field: "statuses", values: ["Open", "Closed"] },
  { tool: "accounting_journal_entries_list", path: "/accounting/v2/tenant/42/journal-entries", field: "syncStatuses", values: ["NotSynced", "Synced"] },
  { tool: "accounting_journal_entries_list", path: "/accounting/v2/tenant/42/journal-entries", field: "transactionTypes", values: ["Invoice", "Bill"] },
  { tool: "marketing_calls_v2_list", path: "/telecom/v2/tenant/42/calls", field: "ids", values: [11, 22] },
];

describe("direct query arrays use their public repeated-key encoding", () => {
  it.each(directArrays)("$tool $field repeats unbracketed keys", async ({ tool, path, field, values }) => {
    const wire = wireHarness();
    const uri = await wire.call(tool, { [field]: values, page: 1, pageSize: 2 });
    expect(uri.pathname).toBe(path);
    expect(uri.searchParams.getAll(field)).toEqual(values.map(String));
    expect(uri.searchParams.has(`${field}[]`)).toBe(false);
    expect(uri.searchParams.has(`${field}[0]`)).toBe(false);
  });

  it.each(directArrays)("$tool $field keeps a singleton on the plain key", async ({ tool, field, values }) => {
    const wire = wireHarness();
    const uri = await wire.call(tool, { [field]: values.slice(0, 1) });
    expect(uri.searchParams.getAll(field)).toEqual([String(values[0])]);
    expect(uri.searchParams.has(`${field}[]`)).toBe(false);
  });

  it.each(directArrays)("$tool $field omits an empty array", async ({ tool, field }) => {
    const wire = wireHarness();
    const uri = await wire.call(tool, { [field]: [] });
    expect(uri.searchParams.has(field)).toBe(false);
    expect(uri.searchParams.has(`${field}[]`)).toBe(false);
  });
});

describe("query-array encoding preserves other request contracts", () => {
  it("keeps declared scalar CSV filters and literal plus sort values", async () => {
    const wire = wireHarness();
    const uri = await wire.call("accounting_journal_entries_list", {
      ids: "11,22", businessUnitIds: "33,44", statuses: ["Open", "Closed"], sort: "+Id",
    });
    expect(uri.searchParams.getAll("ids")).toEqual(["11,22"]);
    expect(uri.searchParams.getAll("businessUnitIds")).toEqual(["33,44"]);
    expect(uri.searchParams.get("sort")).toBe("+Id");
    expect(uri.href).toContain("sort=%2BId");
  });

  it("keeps review arrays that their adapter deliberately converts to CSV", async () => {
    const wire = wireHarness();
    const uri = await wire.call("marketing_reviews", {
      reviewStatuses: ["Reviewed", "NeedsReview"], locationIds: [11, 22], sources: ["Web", "Phone"],
    });
    expect(uri.searchParams.getAll("reviewStatuses")).toEqual(["Reviewed,NeedsReview"]);
    expect(uri.searchParams.getAll("locationIds")).toEqual(["11,22"]);
    expect(uri.searchParams.getAll("sources")).toEqual(["Web,Phone"]);
  });

  it("preserves nested invoice dictionary keys and reserved characters", async () => {
    const wire = wireHarness();
    const uri = await wire.call("accounting_invoices_list", {
      customFieldFields: { "Dispatch region": "A+B & C/D?" }, customFieldOperator: "And",
      balanceFilterBalance: 0, balanceFilterComparer: "Equals", includeTotal: false,
    });
    expect(uri.searchParams.get("customField.Fields[Dispatch region]")).toBe("A+B & C/D?");
    expect(uri.searchParams.get("customField.Operator")).toBe("And");
    expect(uri.searchParams.get("balanceFilter.Balance")).toBe("0");
    expect(uri.searchParams.get("balanceFilter.Comparer")).toBe("Equals");
    expect(uri.searchParams.get("includeTotal")).toBe("false");
  });

  it("preserves already flattened journal dictionary keys", async () => {
    const wire = wireHarness();
    const uri = await wire.call("accounting_journal_entries_list", { customField: { Region: "A+B & C/D?" } });
    expect(uri.searchParams.get("customField.Region")).toBe("A+B & C/D?");
    expect(uri.searchParams.has("customField[Region]")).toBe(false);
  });

  it("keeps false, zero and empty strings while omitting nullish query values", async () => {
    const wire = wireHarness();
    await wire.client.get("/accounting/v2/tenant/42/invoices", {
      includeTotal: false, totalGreater: 0, number: "", ids: null, jobId: undefined,
      statuses: [], reviewStatuses: ["Reviewed", null, undefined, "NeedsReview"],
    });
    expect(wire.requests).toHaveLength(1);
    const uri = new URL(wire.requests[0].uri);
    expect(uri.searchParams.get("includeTotal")).toBe("false");
    expect(uri.searchParams.get("totalGreater")).toBe("0");
    expect(uri.searchParams.get("number")).toBe("");
    for (const key of ["ids", "jobId", "statuses", "statuses[]"]) expect(uri.searchParams.has(key)).toBe(false);
    expect(uri.searchParams.getAll("reviewStatuses")).toEqual(["Reviewed", "NeedsReview"]);
  });

  it("does not transform JSON report arrays, empty arrays or explicit null values", async () => {
    const wire = wireHarness();
    const parameters = [
      { name: "BusinessUnitIds", value: [11, 22] }, { name: "EmptyIds", value: [] },
      { name: "OptionalValue", value: null }, { name: "IncludeInactive", value: false },
    ];
    const uri = await wire.call("reporting_reports_data_create", {
      reportCategory: "operations", reportId: 162, parameters, page: 1, pageSize: 2, includeTotal: false,
    });
    expect(uri.pathname).toBe("/reporting/v2/tenant/42/report-category/operations/reports/162/data");
    expect(wire.requests[0].method).toBe("post");
    expect(JSON.parse(String(wire.requests[0].body))).toEqual({ parameters });
    expect(uri.searchParams.get("includeTotal")).toBe("false");
    expect(uri.searchParams.has("BusinessUnitIds")).toBe(false);
  });
});
