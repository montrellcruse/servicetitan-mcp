import { z } from "../../schema.js";
import { isInvoiceCalendarTimestamp } from "../accounting/invoice-dates.js";
import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolResult, toolError, buildParams } from "../../utils.js";

const exportSchema = {
  from: z.string().optional().describe("Continuation token or date string for incremental export"),
  includeRecentChanges: z.boolean().optional().describe("Include recent changes not yet committed"),
};

function registerExportTool(
  registry: ToolRegistry,
  client: ServiceTitanClient,
  name: string,
  operationId: string | null,
  description: string,
  path: string,
  schema: Record<string, z.ZodType> = exportSchema,
) {
  registry.register({
    name,
    domain: "export",
    operation: "read",
    description,
    apiContract: operationId === null
      ? { unsupportedRequest: { method: "get", path } }
      : { operationId },
    schema,
    handler: async (params: unknown) => {
      try {
        const data = await client.get(path, buildParams(z.object(schema).parse(params)));
        return toolResult(data, operationId === "Export_Invoices"
          ? { preserveTimestamp: isInvoiceCalendarTimestamp }
          : undefined);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}

export function registerExportTools(client: ServiceTitanClient, registry: ToolRegistry) {
  // Accounting exports
  registerExportTool(
    registry,
    client,
    "export_invoices",
    "Export_Invoices",
    "Read the incremental invoices export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.",
    "/tenant/{tenant}/export/invoices",
  );
  registerExportTool(registry, client, "export_invoice_items", "Export_InvoiceItems", "Read the incremental invoice items export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/invoice-items");
  registerExportTool(registry, client, "export_invoice_templates", "Export_InvoiceTemplates", "Read the incremental invoice templates export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/invoice-templates");
  registerExportTool(registry, client, "export_payments", "Export_Payments", "Read the incremental payments export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/payments");
  registerExportTool(registry, client, "export_adjustments", "Export_Adjustments", "Read the incremental adjustments export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/adjustments");
  registerExportTool(registry, client, "export_inventory_bills", "Export_InventoryBills", "Read the incremental inventory bills export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/inventory-bills");
  registerExportTool(registry, client, "export_payroll_adjustments", "Export_PayrollAdjustments", "Read the incremental payroll adjustments export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/payroll-adjustments");

  // CRM exports
  registerExportTool(registry, client, "export_customers", "ExportCustomers_GetCustomers", "Read the incremental customers export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/customers");
  registerExportTool(registry, client, "export_customers_contacts", "ExportContacts_CustomersContacts", "Read the incremental customers contacts export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/customers/contacts");
  registerExportTool(registry, client, "export_locations_contacts", "ExportContacts_LocationsContacts", "Read the incremental locations contacts export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/locations/contacts");
  registerExportTool(registry, client, "export_contacts", null, "Export contacts", "/tenant/{tenant}/export/contacts");
  registerExportTool(registry, client, "export_locations", "ExportLocations_Locations", "Read the incremental locations export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/locations");
  registerExportTool(registry, client, "export_leads", "ExportLeads_Leads", "Read the incremental leads export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/leads");
  registerExportTool(registry, client, "export_bookings", "ExportBookings_Get", "Read the incremental bookings export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/bookings");

  // Dispatch exports
  registerExportTool(registry, client, "export_jobs", "Export_Jobs", "Read the incremental jobs export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/jobs");
  registerExportTool(registry, client, "export_job_notes", "Export_JobNotes", "Read the incremental job notes export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/job-notes");
  registerExportTool(registry, client, "export_job_history", "Export_JobHistory", "Read the incremental job history export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/job-history");
  registerExportTool(registry, client, "export_job_canceled_logs", "Export_JobCancelReasons", "Read the incremental job canceled logs export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/job-canceled-logs");
  registerExportTool(registry, client, "export_job_splits", "Export_JobSplits", "Read the incremental job splits export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/jobs/splits");
  registerExportTool(registry, client, "export_job_cancel_reasons", null, "Export job cancel reasons", "/tenant/{tenant}/export/job-cancel-reasons");
  registerExportTool(registry, client, "export_appointments", "Export_Appointments", "Read the incremental appointments export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/appointments");
  registerExportTool(registry, client, "export_appointment_assignments", "Export_AppointmentAssignments", "Read the incremental appointment assignments export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/appointment-assignments");
  registerExportTool(registry, client, "export_projects", "Export_Projects", "Read the incremental projects export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/projects");
  registerExportTool(registry, client, "export_project_notes", "Export_ProjectNotes", "Read the incremental project notes export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/project-notes");
  registerExportTool(registry, client, "export_installed_equipment", "Export_ExportInstalledEquipment", "Read the incremental installed equipment export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/installed-equipment");

  // People exports
  registerExportTool(registry, client, "export_technicians", "Export_Technicians", "Read the incremental technicians export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/technicians");
  registerExportTool(registry, client, "export_employees", "Export_Employees", "Read the incremental employee export feed for cross-domain bulk synchronization. This is the same feed as people_employees_export; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records.", "/tenant/{tenant}/export/employees");

  // Pricebook exports
  registerExportTool(registry, client, "export_services", "Export_Services", "Read the incremental services export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/services");
  registerExportTool(registry, client, "export_materials", "Export_Materials", "Read the incremental materials export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/materials");
  registerExportTool(registry, client, "export_equipment", "Export_Equipment", "Read the incremental equipment export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/equipment");

  // Membership exports
  registerExportTool(registry, client, "export_memberships", "Export_Memberships", "Read the incremental memberships export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/memberships");
  registerExportTool(registry, client, "export_membership_types", "Export_MembershipTypes", "Read the incremental membership types export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/membership-types");
  registerExportTool(registry, client, "export_membership_status_changes", "Export_MembershipStatusChanges", "Read the incremental membership status changes export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/membership-status-changes");
  registerExportTool(registry, client, "export_service_agreements", "Export_ServiceAgreements", "Read the incremental service agreements export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/service-agreements");
  registerExportTool(registry, client, "export_recurring_service_types", "Export_RecurringServiceTypes", "Read the incremental recurring service types export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/recurring-service-types");
  registerExportTool(registry, client, "export_location_recurring_services", null, "Export location recurring services", "/tenant/{tenant}/export/location-recurring-services");
  registerExportTool(registry, client, "export_location_recurring_service_events", null, "Export location recurring service events", "/tenant/{tenant}/export/location-recurring-service-events");

  // Marketing exports
  registerExportTool(registry, client, "export_calls", "Export_Calls", "Read the incremental calls export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/calls");

  // Payroll exports
  registerExportTool(registry, client, "export_timesheets", null, "Export timesheets", "/tenant/{tenant}/export/timesheets");
  registerExportTool(registry, client, "export_timesheet_codes", "Export_TimesheetCodes", "Read the incremental timesheet codes export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/timesheet-codes");
  registerExportTool(registry, client, "export_gross_pay_items", "Export_GrossPayItems", "Read the incremental gross pay items export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/gross-pay-items");
  registerExportTool(registry, client, "export_payroll_settings", "Export_PayrollSettings", "Read the incremental payroll settings export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/payroll-settings");

  // Settings exports
  registerExportTool(registry, client, "export_activities", "Export_Activities", "Read the incremental timesheet-activity export feed for cross-domain bulk synchronization. This is the same feed as settings_activities_export; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records.", "/tenant/{tenant}/export/activities");
  registerExportTool(registry, client, "export_activity_codes", "Export_ActivityCodes", "Read the incremental activity-code export feed for cross-domain bulk synchronization. This is the same feed as settings_activity_codes_export; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records.", "/tenant/{tenant}/export/activity-codes");
  registerExportTool(registry, client, "export_business_units", "Export_BusinessUnits", "Read the incremental business units export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/business-units");
  registerExportTool(registry, client, "export_tag_types", "Export_TagTypes", "Read the incremental tag-type export feed for cross-domain bulk synchronization. This is the same feed as settings_tag_types_export; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records.", "/tenant/{tenant}/export/tag-types");

  // Inventory exports
  registerExportTool(registry, client, "export_purchase_orders", "Export_PurchaseOrders", "Read the incremental purchase orders export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/purchase-orders");
  registerExportTool(registry, client, "export_returns", "Export_Returns", "Read the incremental returns export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/returns");
  registerExportTool(registry, client, "export_transfers", "Export_Transfers", "Read the incremental transfers export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them.", "/tenant/{tenant}/export/transfers");
}
