import { describe, expect, it, vi } from "vitest";

import type { ServiceTitanClient } from "../../src/client.js";
import type { ServiceTitanConfig } from "../../src/config.js";
import { OFFICIAL_OPERATIONS, OFFICIAL_ROUTES, officialRequestSchema, resolveServiceTitanPath, UNSUPPORTED_TOOLS } from "../../src/contracts/index.js";
import { loadAccountingDomain } from "../../src/domains/accounting/index.js";
import { loadCrmDomain } from "../../src/domains/crm/index.js";
import { loadDispatchDomain } from "../../src/domains/dispatch/index.js";
import { loadEstimatesDomain } from "../../src/domains/estimates/index.js";
import { loadExportDomain } from "../../src/domains/export/index.js";
import { loadInventoryDomain } from "../../src/domains/inventory/index.js";
import { loadMarketingDomain } from "../../src/domains/marketing/index.js";
import { loadMembershipsDomain } from "../../src/domains/memberships/index.js";
import { loadPayrollDomain } from "../../src/domains/payroll/index.js";
import { loadPeopleDomain } from "../../src/domains/people/index.js";
import { loadPricebookDomain } from "../../src/domains/pricebook/index.js";
import { loadSchedulingDomain } from "../../src/domains/scheduling/index.js";
import { loadSettingsDomain } from "../../src/domains/settings/index.js";
import { ToolRegistry } from "../../src/registry.js";
import type { ToolResponse } from "../../src/types.js";

const config: ServiceTitanConfig = {
  clientId: "client-id", clientSecret: "secret", appKey: "app-key", tenantId: "42",
  environment: "integration", readonlyMode: false, confirmWrites: false,
  maxResponseChars: 100_000, enabledDomains: null, logLevel: "error", timezone: "UTC",
  corsOrigin: "", allowedCallers: null,
};

function representative(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return null;
  const raw = schema as Record<string, unknown>;
  const value = raw.schema && typeof raw.schema === "object" ? raw.schema as Record<string, unknown> : raw;
  if (Array.isArray(value.enum)) return value.enum[0];
  const alternative = (value.oneOf ?? value.anyOf) as unknown[] | undefined;
  if (alternative?.length) return representative(alternative.find((item) => (item as Record<string, unknown>)?.type !== "null") ?? alternative[0]);
  const types = (Array.isArray(value.type) ? value.type : [value.type]).filter((type) => type !== "null");
  switch (types[0]) {
    case "boolean": return false;
    case "integer": case "number": return typeof value.minimum === "number" ? value.minimum : 1;
    case "string": return value.format === "date-time" ? "2026-09-04T12:00:00Z" : "x".repeat(Math.max(1, Number(value.minLength ?? 1)));
    case "array": return Array.from({ length: Number(value.minItems ?? 0) }, () => representative(value.items));
    default: return Object.fromEntries(((value.required ?? []) as string[]).map((name) => [name, representative((value.properties as Record<string, unknown>)[name])]));
  }
}

function context(loader: (client: ServiceTitanClient, registry: ToolRegistry) => void) {
  const server = { registerTool: vi.fn() };
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const client = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), deleteWithBody: vi.fn() } as unknown as ServiceTitanClient;
  const registry = new ToolRegistry(server as never, config, logger as never);
  registry.attachClient(client); loader(client, registry);
  const handlers = new Map<string, (params: unknown) => Promise<ToolResponse>>();
  for (const [name, , handler] of server.registerTool.mock.calls) handlers.set(name, handler);
  return { client, handlers };
}

describe("pinned ServiceTitan contracts", () => {
  it("pins all official operations and the 27 explicit migration exclusions", () => {
    expect(OFFICIAL_OPERATIONS).toHaveLength(580);
    expect(Object.keys(UNSUPPORTED_TOOLS)).toHaveLength(27);
    expect(OFFICIAL_OPERATIONS.find((operation) => operation.id === "GrossPayItems_Create")).toMatchObject({
      method: "POST", fullPath: "/payroll/v2/tenant/{tenant}/gross-pay-items", scopes: ["tn.prl.grosspayitems:w"],
    });
  });

  it("fully expands every request schema reference from the official snapshots", () => {
    const hasReference = (value: unknown): boolean => !!value && typeof value === "object"
      && ("$ref" in value || Object.values(value).some(hasReference));
    const requests = OFFICIAL_OPERATIONS.flatMap((operation) => operation.request);
    expect(requests.length).toBeGreaterThan(100);
    expect(requests.filter(({ schema }) => hasReference(schema))).toEqual([]);
  });

  it("builds strict Zod validation from official required fields and enums", () => {
    const optOut = officialRequestSchema("OptInOut_CreateOptOutList");
    expect(optOut.safeParse({ contactNumbers: ["+15555550100"] }).success).toBe(false);
    expect(optOut.safeParse({ optOutType: "invalid", contactNumbers: ["+15555550100"] }).success).toBe(false);
    expect(optOut.safeParse({ optOutType: "Marketing", contactNumbers: ["+15555550100"] }).success).toBe(true);
    expect(optOut.safeParse({ optOutType: "Marketing", contactNumbers: [], invented: true }).success).toBe(false);
  });

  it("accepts RFC 3339 offsets and rejects invalid official date-time values", () => {
    const grossPay = officialRequestSchema("GrossPayItems_Create");
    const body = {
      payrollId: 1,
      amount: 125,
      activityCodeId: 2,
      date: "2026-09-04T09:30:00-04:00",
    };
    expect(grossPay.safeParse(body).success).toBe(true);
    expect(grossPay.safeParse({ ...body, date: "2026-09-04 09:30" }).success).toBe(false);
  });

  it("preserves every top-level required field across all official JSON request schemas", () => {
    let checked = 0;
    for (const operation of OFFICIAL_OPERATIONS) {
      const request = operation.request.find(({ mediaType }) => mediaType.includes("json"));
      if (!request) continue;
      const raw = request.schema as Record<string, unknown>;
      const body = (raw.schema ?? raw) as Record<string, unknown>;
      const sample = representative(request.schema) as Record<string, unknown>;
      const validator = officialRequestSchema(operation.id);
      expect(validator.safeParse(sample).success, operation.id).toBe(true);
      for (const required of (body.required ?? []) as string[]) {
        const missing = { ...sample }; delete missing[required];
        expect(validator.safeParse(missing).success, `${operation.id}.${required}`).toBe(false);
      }
      checked += 1;
    }
    expect(checked).toBe(210);
  });

  it("excludes every unsupported migration tool from the default catalog", () => {
    const server = { registerTool: vi.fn() };
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const client = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), deleteWithBody: vi.fn() } as unknown as ServiceTitanClient;
    const registry = new ToolRegistry(server as never, config, logger as never);
    registry.attachClient(client);
    for (const loader of [loadAccountingDomain, loadCrmDomain, loadDispatchDomain, loadEstimatesDomain, loadExportDomain, loadInventoryDomain, loadMarketingDomain, loadMembershipsDomain, loadPayrollDomain, loadPeopleDomain, loadPricebookDomain, loadSchedulingDomain, loadSettingsDomain]) loader(client, registry);
    const registered = new Set(server.registerTool.mock.calls.map(([name]) => name));
    const unavailable = registry.getUnavailableTools();
    for (const name of Object.keys(UNSUPPORTED_TOOLS)) {
      expect(registered.has(name), name).toBe(false);
      expect(unavailable[name], name).toBeTruthy();
    }
  });

  it.each([
    ["/tenant/{tenant}/installed-equipment", "/equipmentsystems/v2/tenant/42/installed-equipment"],
    ["/tenant/{tenant}/submissions", "/forms/v2/tenant/42/submissions"],
    ["/tenant/{tenant}/tasks", "/taskmanagement/v2/tenant/42/tasks"],
    ["/tenant/{tenant}/technician-shifts", "/dispatch/v2/tenant/42/technician-shifts"],
    ["/tenant/{tenant}/locations/rates", "/payroll/v2/tenant/42/locations/rates"],
    ["/tenant/{tenant}/clientspecificpricing", "/pricebook/v2/tenant/42/clientspecificpricing"],
    ["/tenant/{tenant}/reviews", "/marketingreputation/v2/tenant/42/reviews"],
    ["/tenant/{tenant}/service-agreements", "/service-agreements/v2/tenant/42/service-agreements"],
    ["/tenant/{tenant}/categories", "/pricebook/v2/tenant/42/categories"],
    ["/tenant/{tenant}/categories/7", "/pricebook/v2/tenant/42/categories/7"],
    ["/tenant/{tenant}/calls", "/telecom/v2/tenant/42/calls"],
    ["/v2/tenant/{tenant}/calls", "/telecom/v2/tenant/42/calls"],
    ["/v3/tenant/{tenant}/calls", "/telecom/v3/tenant/42/calls"],
  ])("resolves %s through its official module", (input, expected) => {
    expect(resolveServiceTitanPath(input, "42")).toBe(expected);
  });

  it("rejects paths absent from the pinned contract", () => {
    expect(() => resolveServiceTitanPath("/tenant/{tenant}/suppressions", "42")).toThrow(/No pinned ServiceTitan contract/);
  });

  it("validates method for already-prefixed and resolved routes", () => {
    expect(resolveServiceTitanPath("/tenant/{tenant}/customers", "42", "GET")).toBe("/crm/v2/tenant/42/customers");
    expect(() => resolveServiceTitanPath("/crm/v2/tenant/{tenant}/customers", "42", "DELETE")).toThrow(/No pinned ServiceTitan DELETE contract/);
  });

  it("resolves every unambiguous official route template to its pinned full path", () => {
    const ownersByPath = new Map<string, Set<string>>();
    for (const route of OFFICIAL_ROUTES) {
      const owners = ownersByPath.get(route.path) ?? new Set<string>();
      owners.add(route.moduleBasePath); ownersByPath.set(route.path, owners);
    }
    let checked = 0;
    for (const route of OFFICIAL_ROUTES) {
      if ((ownersByPath.get(route.path)?.size ?? 0) > 1) continue;
      const concrete = route.path.replace("{tenant}", "42").replace(/\{[^}]+\}/g, "1");
      expect(resolveServiceTitanPath(concrete, "42"), `${route.document}: ${route.path}`)
        .toBe(`${route.moduleBasePath}${concrete}`);
      checked += 1;
    }
    expect(checked).toBe(410);
  });
});

describe("official request serialization", () => {
  it.each([
    ["accounting_ap_credits_mark_as_exported", { items: [{ apCreditId: 11 }] }, "/tenant/{tenant}/ap-credits/markasexported", [{ apCreditId: 11 }]],
    ["accounting_ap_payments_mark_as_exported", { items: [{ apPaymentId: 12, externalId: "ext" }] }, "/tenant/{tenant}/ap-payments/markasexported", [{ apPaymentId: 12, externalId: "ext" }]],
    ["accounting_invoices_mark_as_exported", { items: [{ invoiceId: 13, externalMessage: "done" }] }, "/tenant/{tenant}/invoices/markasexported", [{ invoiceId: 13, externalMessage: "done" }]],
  ])("sends %s as the documented top-level array", async (name, params, endpoint, body) => {
    const { client, handlers } = context(loadAccountingDomain);
    vi.mocked(client.post).mockResolvedValue([]);
    await handlers.get(name)!(params);
    expect(client.post).toHaveBeenCalledWith(endpoint, body);
  });

  it("sends the documented gross-pay create fields without invented names", async () => {
    const { client, handlers } = context(loadPayrollDomain);
    vi.mocked(client.post).mockResolvedValue({ id: 1 });
    const body = { payrollId: 2, amount: 125, activityCodeId: 3, date: "2026-09-04T12:00:00Z", memo: "bonus" };
    await handlers.get("payroll_gross_pay_items_create")!(body);
    expect(client.post).toHaveBeenCalledWith("/tenant/{tenant}/gross-pay-items", body);
  });

  it("sends the current technician-shift contract field names", async () => {
    const { client, handlers } = context(loadPeopleDomain);
    vi.mocked(client.post).mockResolvedValue({ id: 1 });
    const body = { technicianIds: [7], shiftType: "Normal", title: "Day", start: "2026-09-04T12:00:00Z", end: "2026-09-04T20:00:00Z", repeatType: "Never" };
    await handlers.get("people_technician_shifts_create")!(body);
    expect(client.post).toHaveBeenCalledWith("/tenant/{tenant}/technician-shifts", body);
  });

  it("sends only documented technician-shift update fields", async () => {
    const { client, handlers } = context(loadPeopleDomain);
    vi.mocked(client.patch).mockResolvedValue({ id: 7 });
    const body = { id: 7, shiftType: "Normal", title: "Updated", start: "2026-09-04T12:00:00Z", end: "2026-09-04T20:00:00Z", timesheetCodeId: 3 };
    await handlers.get("people_technician_shifts_update")!(body);
    const { id: _id, ...payload } = body;
    expect(client.patch).toHaveBeenCalledWith(`/tenant/{tenant}/technician-shifts/${body.id}`, payload);
  });

  it.each([
    [loadDispatchDomain, "dispatch_appointments_hold", "put", { id: 1, reasonId: 2, memo: "weather" }, "/tenant/{tenant}/appointments/1/hold", { reasonId: 2, memo: "weather" }],
    [loadDispatchDomain, "dispatch_jobs_cancel", "put", { id: 1, reasonId: 2, memo: "duplicate" }, "/tenant/{tenant}/jobs/1/cancel", { reasonId: 2, memo: "duplicate" }],
    [loadDispatchDomain, "dispatch_arrival_windows_activate", "put", { id: 1, isActive: false }, "/tenant/{tenant}/arrival-windows/1/activated", { isActive: false }],
    [loadEstimatesDomain, "estimates_sell", "put", { id: 1, soldBy: 9 }, "/tenant/{tenant}/estimates/1/sell", { soldBy: 9 }],
    [loadSchedulingDomain, "scheduling_appointment_assignments_unassign_technicians", "post", { jobAppointmentId: 1, technicianIds: [9] }, "/tenant/{tenant}/appointment-assignments/unassign-technicians", { jobAppointmentId: 1, technicianIds: [9] }],
    [loadPeopleDomain, "people_technician_shifts_bulk_delete", "post", { start: "2026-09-04T12:00:00Z", end: "2026-09-04T20:00:00Z" }, "/tenant/{tenant}/technician-shifts/bulk-delete", { start: "2026-09-04T12:00:00Z", end: "2026-09-04T20:00:00Z" }],
  ] as const)("serializes required action bodies for %s", async (loader, name, method, params, endpoint, body) => {
    const { client, handlers } = context(loader);
    vi.mocked(client[method]).mockResolvedValue({});
    await handlers.get(name)!(params);
    expect(client[method]).toHaveBeenCalledWith(endpoint, body);
  });
});
