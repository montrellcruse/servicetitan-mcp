import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { activeFilterParam, buildParams, toolError, toolResult } from "../../utils.js";

const exportCursorSchema = z.object({
  from: z
    .string()
    .optional()
    .describe("Continuation token or custom date to begin export"),
  includeRecentChanges: z
    .boolean()
    .optional()
    .describe("Include recent changes (may include duplicates)"),
});

const exportCursorWithActiveSchema = exportCursorSchema.extend({
  ...activeFilterParam(),
});

interface StandardExportTool {
  name: string;
  description: string;
  path: string;
}

interface ExportRegistrationOptions<TSchema extends z.ZodObject<z.ZodRawShape>> {
  name: string;
  description: string;
  path: string;
  schema: TSchema;
  toQuery?: (input: z.infer<TSchema>) => Record<string, unknown>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function registerExportTool<TSchema extends z.ZodObject<z.ZodRawShape>>(
  client: ServiceTitanClient,
  registry: ToolRegistry,
  options: ExportRegistrationOptions<TSchema>,
): void {
  registry.register({
    name: options.name,
    domain: "export",
    operation: "read",
    description: options.description,
    schema: options.schema.shape,
    handler: async (params) => {
      const input = params as z.infer<TSchema>;

      try {
        const query = options.toQuery
          ? options.toQuery(input)
          : (input as Record<string, unknown>);
        const data = await client.get(options.path, buildParams(query));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}

const standardExportTools: StandardExportTool[] = [
  {
    name: "export_invoices_export",
    description: "Export invoices",
    path: "/tenant/{tenant}/export/invoices",
  },
  {
    name: "export_invoice_items_export",
    description: "Export invoice items",
    path: "/tenant/{tenant}/export/invoice-items",
  },
  {
    name: "export_payments_export",
    description: "Export payments",
    path: "/tenant/{tenant}/export/payments",
  },
  {
    name: "export_inventory_bills_export",
    description: "Export inventory bills",
    path: "/tenant/{tenant}/export/inventory-bills",
  },
  {
    name: "export_bookings_export",
    description: "Export bookings",
    path: "/tenant/{tenant}/export/bookings",
  },
  {
    name: "export_customers_contacts_export",
    description: "Export customer contacts",
    path: "/tenant/{tenant}/export/customers/contacts",
  },
  {
    name: "export_customers_export",
    description: "Export customers",
    path: "/tenant/{tenant}/export/customers",
  },
  {
    name: "export_leads_export",
    description: "Export leads",
    path: "/tenant/{tenant}/export/leads",
  },
  {
    name: "export_locations_export",
    description: "Export locations",
    path: "/tenant/{tenant}/export/locations",
  },
  {
    name: "export_installed_equipment_export",
    description: "Export installed equipment",
    path: "/tenant/{tenant}/export/installed-equipment",
  },
  {
    name: "export_adjustments_export",
    description: "Export adjustments",
    path: "/tenant/{tenant}/export/adjustments",
  },
  {
    name: "export_purchase_orders_export",
    description: "Export purchase orders",
    path: "/tenant/{tenant}/export/purchase-orders",
  },
  {
    name: "export_returns_export",
    description: "Export returns",
    path: "/tenant/{tenant}/export/returns",
  },
  {
    name: "export_transfers_export",
    description: "Export transfers",
    path: "/tenant/{tenant}/export/transfers",
  },
  {
    name: "export_jobs_export",
    description: "Export jobs",
    path: "/tenant/{tenant}/export/jobs",
  },
  {
    name: "export_projects_export",
    description: "Export projects",
    path: "/tenant/{tenant}/export/projects",
  },
  {
    name: "export_appointments_export",
    description: "Export appointments",
    path: "/tenant/{tenant}/export/appointments",
  },
  {
    name: "export_job_cancel_reasons_export",
    description: "Export job cancel reasons",
    path: "/tenant/{tenant}/export/job-canceled-logs",
  },
  {
    name: "export_job_notes_export",
    description: "Export job notes",
    path: "/tenant/{tenant}/export/job-notes",
  },
  {
    name: "export_memberships_export",
    description: "Export memberships",
    path: "/tenant/{tenant}/export/memberships",
  },
  {
    name: "export_recurring_service_types_export",
    description: "Export recurring service types",
    path: "/tenant/{tenant}/export/recurring-service-types",
  },
  {
    name: "export_recurring_service_events_export",
    description: "Export recurring service events",
    path: "/tenant/{tenant}/export/recurring-service-events",
  },
  {
    name: "export_recurring_services_export",
    description: "Export recurring services",
    path: "/tenant/{tenant}/export/recurring-services",
  },
  {
    name: "export_job_splits_export",
    description: "Export job splits",
    path: "/tenant/{tenant}/export/jobs/splits",
  },
  {
    name: "export_payroll_adjustments_export",
    description: "Export payroll adjustments",
    path: "/tenant/{tenant}/export/payroll-adjustments",
  },
  {
    name: "export_activity_codes_export",
    description: "Export activity codes",
    path: "/tenant/{tenant}/export/activity-codes",
  },
  {
    name: "export_timesheet_codes_export",
    description: "Export timesheet codes",
    path: "/tenant/{tenant}/export/timesheet-codes",
  },
  {
    name: "export_equipment_export",
    description: "Export equipment",
    path: "/tenant/{tenant}/export/equipment",
  },
  {
    name: "export_services_export",
    description: "Export services",
    path: "/tenant/{tenant}/export/services",
  },
  {
    name: "export_materials_export",
    description: "Export materials",
    path: "/tenant/{tenant}/export/materials",
  },
  {
    name: "export_service_agreements_export",
    description: "Export service agreements",
    path: "/tenant/{tenant}/export/service-agreements",
  },
  {
    name: "export_employees_export",
    description: "Export employees",
    path: "/tenant/{tenant}/export/employees",
  },
  {
    name: "export_technicians_export",
    description: "Export technicians",
    path: "/tenant/{tenant}/export/technicians",
  },
  {
    name: "export_business_units_export",
    description: "Export business units",
    path: "/tenant/{tenant}/export/business-units",
  },
  {
    name: "export_tag_types_export",
    description: "Export tag types",
    path: "/tenant/{tenant}/export/tag-types",
  },
  {
    name: "export_calls_export",
    description: "Export calls",
    path: "/v2/tenant/{tenant}/export/calls",
  },
  {
    name: "export_activities_export",
    description: "Export activities",
    path: "/tenant/{tenant}/export/activities",
  },
];

export function registerExportTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  for (const tool of standardExportTools) {
    registerExportTool(client, registry, {
      name: tool.name,
      description: tool.description,
      path: tool.path,
      schema: exportCursorSchema,
    });
  }

  registerExportTool(client, registry, {
    name: "export_appointment_assignments_export",
    description: "Export appointment assignments",
    path: "/tenant/{tenant}/export/appointment-assignments",
    schema: exportCursorWithActiveSchema,
    toQuery: (input) => ({
      active: input.active,
      from: input.from,
      includeRecentChanges: input.includeRecentChanges,
    }),
  });
}
