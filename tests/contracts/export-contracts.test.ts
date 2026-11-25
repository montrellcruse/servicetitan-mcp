import { describe, expect, it } from "vitest";

import { checkExportContracts } from "../../scripts/check-export-contracts.js";
import { OFFICIAL_OPERATIONS } from "../../src/contracts/index.js";

describe("export contract gate", () => {
  it("accounts for the complete registered export set, including multiline registrations", async () => {
    const result = await checkExportContracts(OFFICIAL_OPERATIONS);
    expect(result.verified).toBe(44);
    expect(result.excluded.map(({ tool }) => tool).sort()).toEqual([
      "export_contacts",
      "export_job_cancel_reasons",
      "export_location_recurring_service_events",
      "export_location_recurring_services",
      "export_timesheets",
    ]);
  });

  it.each([
    ["method", { method: "POST" }, "POST /accounting/v2/tenant/42/export/invoices"],
    ["module path", { fullPath: "/inventory/v2/tenant/{tenant}/export/invoices" }, "GET /inventory/v2/tenant/42/export/invoices"],
  ])("fails when the captured request differs from the pinned %s", async (_, override, expected) => {
    const operations = OFFICIAL_OPERATIONS.map(operation =>
      operation.id === "Export_Invoices" ? { ...operation, ...override } : operation);
    await expect(checkExportContracts(operations)).rejects.toThrow(
      `export_invoices (Export_Invoices): expected ${expected}, captured GET /accounting/v2/tenant/42/export/invoices`,
    );
  });
});
