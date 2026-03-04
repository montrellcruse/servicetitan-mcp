import { z } from "zod";
import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolResult, toolError, buildParams } from "../../utils.js";

const exportSchema = {
  from: z.string().optional().describe("Continuation token or date string for incremental export"),
  includeRecentChanges: z.boolean().optional().describe("Include recent changes not yet committed"),
};

const exportDateSchema = {
  ...exportSchema,
  modifiedBefore: z.string().optional().describe("Filter: modified before this date (ISO 8601)"),
  modifiedOnOrAfter: z.string().optional().describe("Filter: modified on or after this date (ISO 8601)"),
};

function registerExportTool(
  registry: ToolRegistry,
  client: ServiceTitanClient,
  name: string,
  description: string,
  path: string,
  schema: Record<string, z.ZodType> = exportSchema,
) {
  registry.register({
    name,
    domain: "export",
    operation: "read",
    description,
    schema,
    handler: async (params: unknown) => {
      try {
        const data = await client.get(path, buildParams(params as Record<string, unknown>));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error instanceof Error ? error.message : String(error));
      }
    },
  });
}

export function registerExportTools(client: ServiceTitanClient, registry: ToolRegistry) {
  // Accounting exports
  registerExportTool(registry, client, "export_invoices", "Export invoices", "/tenant/{tenant}/export/invoices");
  registerExportTool(registry, client, "export_invoice_items", "Export invoice items", "/tenant/{tenant}/export/invoice-items");
  registerExportTool(registry, client, "export_invoice_templates", "Export invoice templates", "/tenant/{tenant}/export/invoice-templates");
  registerExportTool(registry, client, "export_payments", "Export payments", "/tenant/{tenant}/export/payments");
  registerExportTool(registry, client, "export_adjustments", "Export adjustments", "/tenant/{tenant}/export/adjustments");
  registerExportTool(registry, client, "export_inventory_bills", "Export inventory bills", "/tenant/{tenant}/export/inventory-bills");
  registerExportTool(registry, client, "export_payroll_adjustments", "Export payroll adjustments", "/tenant/{tenant}/export/payroll-adjustments", exportDateSchema);

  // CRM exports
  registerExportTool(registry, client, "export_customers", "Export customers", "/tenant/{tenant}/export/customers");
  registerExportTool(registry, client, "export_customers_contacts", "Export customer contacts", "/tenant/{tenant}/export/customers/contacts");
  registerExportTool(registry, client, "export_locations_contacts", "Export location contacts", "/tenant/{tenant}/export/locations/contacts");
  registerExportTool(registry, client, "export_contacts", "Export contacts", "/tenant/{tenant}/export/contacts");
  registerExportTool(registry, client, "export_locations", "Export locations", "/tenant/{tenant}/export/locations");
  registerExportTool(registry, client, "export_leads", "Export leads", "/tenant/{tenant}/export/leads");
  registerExportTool(registry, client, "export_bookings", "Export bookings", "/tenant/{tenant}/export/bookings");

  // Dispatch exports
  registerExportTool(registry, client, "export_jobs", "Export jobs", "/tenant/{tenant}/export/jobs");
  registerExportTool(registry, client, "export_job_notes", "Export job notes", "/tenant/{tenant}/export/job-notes");
  registerExportTool(registry, client, "export_job_history", "Export job history", "/tenant/{tenant}/export/job-history");
  registerExportTool(registry, client, "export_job_canceled_logs", "Export job canceled logs", "/tenant/{tenant}/export/job-canceled-logs");
  registerExportTool(registry, client, "export_job_splits", "Export job splits", "/tenant/{tenant}/export/jobs/splits");
  registerExportTool(registry, client, "export_job_cancel_reasons", "Export job cancel reasons", "/tenant/{tenant}/export/job-cancel-reasons");
  registerExportTool(registry, client, "export_appointments", "Export appointments", "/tenant/{tenant}/export/appointments");
  registerExportTool(registry, client, "export_appointment_assignments", "Export appointment assignments", "/tenant/{tenant}/export/appointment-assignments");
  registerExportTool(registry, client, "export_projects", "Export projects", "/tenant/{tenant}/export/projects");
  registerExportTool(registry, client, "export_project_notes", "Export project notes", "/tenant/{tenant}/export/project-notes");
  registerExportTool(registry, client, "export_installed_equipment", "Export installed equipment", "/tenant/{tenant}/export/installed-equipment");

  // People exports
  registerExportTool(registry, client, "export_technicians", "Export technicians", "/tenant/{tenant}/export/technicians");
  registerExportTool(registry, client, "export_employees", "Export employees", "/tenant/{tenant}/export/employees");

  // Pricebook exports
  registerExportTool(registry, client, "export_services", "Export pricebook services", "/tenant/{tenant}/export/services");
  registerExportTool(registry, client, "export_materials", "Export pricebook materials", "/tenant/{tenant}/export/materials");
  registerExportTool(registry, client, "export_equipment", "Export pricebook equipment", "/tenant/{tenant}/export/equipment");

  // Membership exports
  registerExportTool(registry, client, "export_memberships", "Export memberships", "/tenant/{tenant}/export/memberships");
  registerExportTool(registry, client, "export_membership_types", "Export membership types", "/tenant/{tenant}/export/membership-types");
  registerExportTool(registry, client, "export_membership_status_changes", "Export membership status changes", "/tenant/{tenant}/export/membership-status-changes");
  registerExportTool(registry, client, "export_service_agreements", "Export service agreements", "/tenant/{tenant}/export/service-agreements");
  registerExportTool(registry, client, "export_recurring_service_types", "Export recurring service types", "/tenant/{tenant}/export/recurring-service-types");
  registerExportTool(registry, client, "export_location_recurring_services", "Export location recurring services", "/tenant/{tenant}/export/location-recurring-services");
  registerExportTool(registry, client, "export_location_recurring_service_events", "Export location recurring service events", "/tenant/{tenant}/export/location-recurring-service-events");

  // Marketing exports
  registerExportTool(registry, client, "export_calls", "Export calls", "/tenant/{tenant}/export/calls");

  // Payroll exports
  registerExportTool(registry, client, "export_timesheets", "Export timesheets", "/tenant/{tenant}/export/timesheets");
  registerExportTool(registry, client, "export_timesheet_codes", "Export timesheet codes", "/tenant/{tenant}/export/timesheet-codes");
  registerExportTool(registry, client, "export_gross_pay_items", "Export gross pay items", "/tenant/{tenant}/export/gross-pay-items");
  registerExportTool(registry, client, "export_payroll_settings", "Export payroll settings", "/tenant/{tenant}/export/payroll-settings");

  // Settings exports
  registerExportTool(registry, client, "export_activities", "Export activities", "/tenant/{tenant}/export/activities");
  registerExportTool(registry, client, "export_activity_codes", "Export activity codes", "/tenant/{tenant}/export/activity-codes");
  registerExportTool(registry, client, "export_business_units", "Export business units", "/tenant/{tenant}/export/business-units");
  registerExportTool(registry, client, "export_tag_types", "Export tag types", "/tenant/{tenant}/export/tag-types");

  // Inventory exports
  registerExportTool(registry, client, "export_purchase_orders", "Export purchase orders", "/tenant/{tenant}/export/purchase-orders");
  registerExportTool(registry, client, "export_returns", "Export returns", "/tenant/{tenant}/export/returns");
  registerExportTool(registry, client, "export_transfers", "Export transfers", "/tenant/{tenant}/export/transfers");
}
