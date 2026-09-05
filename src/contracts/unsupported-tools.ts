export interface UnsupportedToolContract {
  reason: string;
  migration?: string;
}

/**
 * Tools retained temporarily in source for migration compatibility but excluded
 * from the supported/default catalog because no matching operation exists in
 * the pinned 2026-09-04 public ServiceTitan OpenAPI catalog.
 */
export const UNSUPPORTED_TOOLS = Object.freeze({
  accounting_payments_create: { reason: "POST /accounting/v2/tenant/{tenant}/payments is undocumented; the collection is GET-only." },
  dispatch_installed_equipment_delete: { reason: "DELETE installed-equipment/{id} is undocumented; the item supports GET and PATCH." },
  dispatch_job_types_delete: { reason: "DELETE job-types/{id} is undocumented; the item supports GET and PATCH." },
  dispatch_jobs_hold: { reason: "PUT jobs/{id}/hold is undocumented." },
  dispatch_jobs_complete: { reason: "PUT jobs/{id}/complete is undocumented." },
  dispatch_jobs_messages_create: { reason: "POST jobs/{id}/messages is undocumented." },
  dispatch_projects_delete: { reason: "DELETE projects/{id} is undocumented; the item supports GET and PATCH." },
  dispatch_projects_messages_create: { reason: "POST projects/{id}/messages is undocumented." },
  marketing_campaign_costs_delete: { reason: "DELETE costs/{id} is undocumented; the item supports GET and PATCH." },
  marketing_suppressions_list: { reason: "No suppression resource exists in the public ServiceTitan OpenAPI catalog." },
  marketing_suppressions_get: { reason: "No suppression resource exists in the public ServiceTitan OpenAPI catalog." },
  marketing_suppressions_remove: { reason: "No suppression resource exists in the public ServiceTitan OpenAPI catalog." },
  marketing_suppressions_add: { reason: "No suppression resource exists in the public ServiceTitan OpenAPI catalog." },
  payroll_payrolls_get: { reason: "GET payrolls/{id} is undocumented; Payroll exposes collection and employee/technician list endpoints." },
  payroll_timesheets_non_job_create: { reason: "POST non-job-timesheets is undocumented; the collection is GET-only." },
  payroll_timesheets_non_job_get: { reason: "GET non-job-timesheets/{id} is undocumented." },
  payroll_timesheets_create_job: { reason: "POST jobs/{job}/timesheets is undocumented; the collection is GET-only." },
  payroll_timesheets_job_update: { reason: "PUT jobs/{job}/timesheets/{id} is undocumented." },
  payroll_timesheets_non_job_update: { reason: "PUT non-job-timesheets/{id} is undocumented." },
  payroll_timesheets_non_job_delete: { reason: "DELETE non-job-timesheets/{id} is undocumented." },
  settings_tag_types_get: { reason: "GET tag-types/{id} is undocumented; use settings_tag_types_list.", migration: "Use settings_tag_types_list with filters and paginate to the desired ID." },
  settings_tag_types_delete: { reason: "DELETE tag-types/{id} is undocumented; the item supports PATCH only." },
  export_contacts: { reason: "Standalone export/contacts is undocumented.", migration: "Use export_customers_contacts or export_locations_contacts according to relationship type." },
  export_job_cancel_reasons: { reason: "export/job-cancel-reasons is undocumented." },
  export_location_recurring_services: { reason: "export/location-recurring-services is undocumented.", migration: "Use the documented export_recurring_services feed." },
  export_location_recurring_service_events: { reason: "export/location-recurring-service-events is undocumented.", migration: "Use the documented recurring-service-events export path." },
  export_timesheets: { reason: "export/timesheets is undocumented.", migration: "Use the documented /export/jobs/timesheets feed." },
} satisfies Record<string, UnsupportedToolContract>);

export type UnsupportedToolName = keyof typeof UNSUPPORTED_TOOLS;

export function isUnsupportedTool(name: string): name is UnsupportedToolName {
  return Object.hasOwn(UNSUPPORTED_TOOLS, name);
}
