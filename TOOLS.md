# V3 tool catalog

Generated from the actual registry. Readonly adapters are eligible for stable support subject to scopes, module availability, and company validation. Live evidence covers representative reads, not every read adapter. Mutations are experimental and have not been verified against a live ServiceTitan Integration environment; they require both `ST_READONLY=false` and `ST_EXPERIMENTAL_WRITES=true`. Readonly mode always hides mutations. Profiles and tool allowlists narrow this catalog further. Discovery does not grant ServiceTitan API scopes.

Readonly-supported tools: 264; experimental mutations: 194; total with explicit experimental opt-in: 458.

## _system

| Tool | Operation | Description |
| --- | --- | --- |
| `st_health_check` | read | Verify authentication and representative tenant read access. Use st_readiness_check for report and module compatibility. |
| `st_readiness_check` | read | Read-only compatibility manifest: authentication, representative module read access, report fields/parameters and definition fingerprints. Does not certify write scopes or metric totals. |
| `st_result_read` | read | Retrieve a stored large result as bounded JSON text chunks. Start at offset 0, concatenate text in nextOffset order, then parse JSON. Results expire after five minutes and belong to this session. |
## accounting

| Tool | Operation | Description |
| --- | --- | --- |
| `accounting_ap_credits_list` | read | List AP credits |
| `accounting_ap_credits_mark_as_exported` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark AP credits as exported |
| `accounting_ap_payments_list` | read | List AP payments |
| `accounting_ap_payments_mark_as_exported` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark AP payments as exported |
| `accounting_gl_account_types_list` | read | List GL account types |
| `accounting_gl_accounts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a GL account |
| `accounting_gl_accounts_get` | read | Get a GL account by ID |
| `accounting_gl_accounts_list` | read | List GL accounts |
| `accounting_gl_accounts_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a GL account |
| `accounting_invoice_items_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete an invoice item |
| `accounting_invoice_items_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch invoice items |
| `accounting_invoices_create_adjustment` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create an adjustment invoice |
| `accounting_invoices_custom_field_types_list` | read | List invoice custom field types |
| `accounting_invoices_list` | read | List invoices |
| `accounting_invoices_mark_as_exported` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark invoices as exported |
| `accounting_invoices_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch an invoice |
| `accounting_invoices_update_custom_fields` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update invoice custom fields |
| `accounting_journal_entries_get_details` | read | Get journal entry detail rows |
| `accounting_journal_entries_get_summary` | read | Get journal entry summary rows |
| `accounting_journal_entries_list` | read | List journal entries |
| `accounting_journal_entries_sync_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Trigger journal entry sync update |
| `accounting_journal_entries_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a journal entry |
| `accounting_payment_terms_get` | read | Get a payment term by ID |
| `accounting_payment_terms_list` | read | List payment terms |
| `accounting_payment_types_get` | read | Get a payment type by ID |
| `accounting_payment_types_list` | read | List payment types |
| `accounting_payments_custom_field_types_list` | read | List payment custom field types |
| `accounting_payments_list` | read | List payments |
| `accounting_payments_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a payment |
| `accounting_payments_update_custom_fields` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update payment custom fields |
| `accounting_payments_update_status` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update payment statuses |
| `accounting_tax_zones_list` | read | List tax zones |
## crm

| Tool | Operation | Description |
| --- | --- | --- |
| `crm_booking_provider_tags_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a booking provider tag |
| `crm_booking_provider_tags_get` | read | Get a booking provider tag by ID |
| `crm_booking_provider_tags_list` | read | List booking provider tags |
| `crm_booking_provider_tags_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a booking provider tag |
| `crm_bookings_contacts_list` | read | List contacts for a booking |
| `crm_bookings_get` | read | Get a booking by ID |
| `crm_bookings_list` | read | List bookings |
| `crm_bookings_provider_contacts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a contact on a provider-scoped booking |
| `crm_bookings_provider_contacts_list` | read | List contacts for a provider-scoped booking |
| `crm_bookings_provider_contacts_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a provider-scoped booking contact |
| `crm_bookings_provider_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a booking for a booking provider |
| `crm_bookings_provider_get` | read | Get a provider-scoped booking |
| `crm_bookings_provider_list` | read | List bookings for a booking provider |
| `crm_bookings_provider_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a provider-scoped booking |
| `crm_bulk_tags_add_tags` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Add bulk tags |
| `crm_bulk_tags_remove_tags` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Remove bulk tags |
| `crm_contact_methods_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a contact method |
| `crm_contact_methods_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a contact method |
| `crm_contact_methods_get` | read | Get a contact method |
| `crm_contact_methods_list` | read | List contact methods for a contact |
| `crm_contact_methods_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a contact method |
| `crm_contact_methods_upsert` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Replace a contact method |
| `crm_contact_relationships_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a contact relationship |
| `crm_contact_relationships_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a contact relationship |
| `crm_contact_relationships_list` | read | List relationships for a contact |
| `crm_contacts_by_relationship_list` | read | List contacts by relationship ID |
| `crm_contacts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a contact |
| `crm_contacts_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a contact |
| `crm_contacts_get` | read | Get a contact by ID |
| `crm_contacts_list` | read | List contacts |
| `crm_contacts_replace` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Replace a contact |
| `crm_contacts_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a contact |
| `crm_customers_contacts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a customer contact |
| `crm_customers_contacts_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a customer contact |
| `crm_customers_contacts_list` | read | List customer contacts |
| `crm_customers_contacts_modified_list` | read | List customer contacts modified in a time range |
| `crm_customers_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a customer |
| `crm_customers_custom_field_types_list` | read | List customer custom field types |
| `crm_customers_get` | read | Get a customer by ID |
| `crm_customers_list` | read | List customers |
| `crm_customers_notes_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a note for a customer |
| `crm_customers_notes_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a customer note |
| `crm_customers_notes_list` | read | List notes for a customer |
| `crm_customers_tags_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a tag assignment for a customer |
| `crm_customers_tags_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a tag assignment from a customer |
| `crm_customers_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a customer |
| `crm_leads_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a lead |
| `crm_leads_dismiss` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Dismiss a lead |
| `crm_leads_follow_ups_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a follow-up for a lead |
| `crm_leads_form_submit` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Submit a lead form |
| `crm_leads_get` | read | Get a lead by ID |
| `crm_leads_list` | read | List leads |
| `crm_leads_notes_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a note for a lead |
| `crm_leads_notes_list` | read | List notes for a lead |
| `crm_leads_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a lead |
| `crm_location_labor_types_list` | read | List location labor types by locations |
| `crm_locations_contacts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a contact for a location |
| `crm_locations_contacts_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a location contact |
| `crm_locations_contacts_list` | read | List contacts for a location |
| `crm_locations_contacts_modified_list` | read | List location contacts modified in a time range |
| `crm_locations_contacts_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a location contact |
| `crm_locations_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a location |
| `crm_locations_custom_field_types_list` | read | List location custom field types |
| `crm_locations_get` | read | Get a location by ID |
| `crm_locations_list` | read | List locations |
| `crm_locations_notes_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a note for a location |
| `crm_locations_notes_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a location note |
| `crm_locations_notes_list` | read | List notes for a location |
| `crm_locations_tags_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a tag assignment for a location |
| `crm_locations_tags_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a tag assignment from a location |
| `crm_locations_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a location |
## dispatch

| Tool | Operation | Description |
| --- | --- | --- |
| `dispatch_appointments_confirm` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Confirm an appointment |
| `dispatch_appointments_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create an appointment |
| `dispatch_appointments_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete an appointment by ID |
| `dispatch_appointments_get` | read | Get an appointment by ID |
| `dispatch_appointments_hold` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Put an appointment on hold |
| `dispatch_appointments_list` | read | List appointments |
| `dispatch_appointments_reschedule` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Reschedule an appointment |
| `dispatch_appointments_set_summary` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Set an appointment summary. Private preview: only works for accounts with the ST feature enabled. |
| `dispatch_appointments_unconfirm` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Remove appointment confirmation |
| `dispatch_appointments_unhold` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Remove hold from an appointment |
| `dispatch_appointments_update_special_instructions` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update appointment special instructions |
| `dispatch_arrival_window_configuration_get` | read | Get arrival window configuration |
| `dispatch_arrival_window_configuration_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update arrival window configuration |
| `dispatch_arrival_windows_activate` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Activate an arrival window |
| `dispatch_arrival_windows_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a new arrival window |
| `dispatch_arrival_windows_get` | read | Get an arrival window by ID |
| `dispatch_arrival_windows_list` | read | List arrival windows |
| `dispatch_arrival_windows_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update an arrival window |
| `dispatch_call_reasons_list` | read | List call reasons |
| `dispatch_form_submissions_list` | read | List form submissions |
| `dispatch_forms_list` | read | List forms |
| `dispatch_images_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create an image placeholder |
| `dispatch_images_get` | read | Get image metadata by storage path |
| `dispatch_installed_equipment_attachments_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Upload an installed equipment attachment |
| `dispatch_installed_equipment_attachments_get` | read | Get installed equipment attachment metadata by storage path |
| `dispatch_installed_equipment_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create installed equipment |
| `dispatch_installed_equipment_get` | read | Get installed equipment by ID |
| `dispatch_installed_equipment_list` | read | List installed equipment |
| `dispatch_installed_equipment_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update installed equipment |
| `dispatch_job_cancel_reasons_list` | read | List job cancel reasons |
| `dispatch_job_hold_reasons_list` | read | List job hold reasons |
| `dispatch_job_splits_by_jobs_list` | read | List splits filtered by one or more jobs |
| `dispatch_job_splits_list` | read | List splits for a single job |
| `dispatch_job_types_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a job type |
| `dispatch_job_types_get` | read | Get a job type by ID |
| `dispatch_job_types_list` | read | List job types |
| `dispatch_job_types_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a job type. Warning: customFieldTypeIds uses ST replace semantics unless customFieldsUpdateMode is Merge. |
| `dispatch_jobs_booked_log_get` | read | Get booked log details for a job |
| `dispatch_jobs_cancel` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Cancel a job |
| `dispatch_jobs_cancel_reasons_list` | read | List cancel reasons available for jobs |
| `dispatch_jobs_canceled_logs_list` | read | List canceled log entries for a job |
| `dispatch_jobs_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a job |
| `dispatch_jobs_create_attachment` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Attach a file to a job |
| `dispatch_jobs_custom_field_types_list` | read | List job custom field types |
| `dispatch_jobs_equipment_attach` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Attach installed equipment to a job |
| `dispatch_jobs_equipment_detach` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Detach a single installed equipment item from a job. Requires confirm: true. |
| `dispatch_jobs_equipment_detach_bulk` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Detach one or more installed equipment IDs from a job. Requires confirm: true. |
| `dispatch_jobs_equipment_get` | read | Get installed equipment IDs attached to a job |
| `dispatch_jobs_get` | read | Get a job by ID |
| `dispatch_jobs_get_attachment` | read | Get a job attachment by ID |
| `dispatch_jobs_history_get` | read | Get history for a job |
| `dispatch_jobs_list` | read | List jobs |
| `dispatch_jobs_list_attachments` | read | List attachments for a job |
| `dispatch_jobs_notes_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a note for a job |
| `dispatch_jobs_notes_list` | read | List notes for a job |
| `dispatch_jobs_remove_cancellation` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Remove cancellation from a job |
| `dispatch_jobs_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a job |
| `dispatch_project_statuses_get` | read | Get a project status by ID |
| `dispatch_project_statuses_list` | read | List project statuses |
| `dispatch_project_sub_statuses_get` | read | Get a project sub-status by ID |
| `dispatch_project_sub_statuses_list` | read | List project sub-statuses |
| `dispatch_project_types_get` | read | Get a project type by ID |
| `dispatch_project_types_list` | read | List project types |
| `dispatch_projects_attach_job` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Attach a job to a project |
| `dispatch_projects_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a project |
| `dispatch_projects_custom_field_types_list` | read | List project custom field types |
| `dispatch_projects_detach_job` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Detach a job from a project |
| `dispatch_projects_get` | read | Get a project by ID |
| `dispatch_projects_list` | read | List projects |
| `dispatch_projects_notes_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a note for a project |
| `dispatch_projects_notes_list` | read | List notes for a project |
| `dispatch_projects_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a project |
## estimates

| Tool | Operation | Description |
| --- | --- | --- |
| `estimates_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a new estimate |
| `estimates_dismiss` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Dismiss an estimate |
| `estimates_estimate_templates_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create an estimate template |
| `estimates_estimate_templates_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete an estimate template by ID |
| `estimates_estimate_templates_get` | read | Get an estimate template by ID |
| `estimates_estimate_templates_list` | read | List estimate templates |
| `estimates_estimate_templates_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update an estimate template. Warning: items are full-replace when provided; omit items to preserve existing template items. |
| `estimates_export_estimates` | read | Export estimates |
| `estimates_get` | read | Get a single estimate by ID |
| `estimates_items_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a single item from an estimate |
| `estimates_items_list` | read | List estimate items with optional filters |
| `estimates_items_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Add a new SKU line or update an existing item on an estimate |
| `estimates_list` | read | List estimates with filters |
| `estimates_proposal_templates_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a proposal template |
| `estimates_proposal_templates_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a proposal template by ID |
| `estimates_proposal_templates_get` | read | Get a proposal template by ID |
| `estimates_proposal_templates_list` | read | List proposal templates |
| `estimates_proposal_templates_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a proposal template. Warning: businessUnitIds and estimateAssignments are full-replace when provided; omit them to preserve existing assignments. |
| `estimates_proposal_types_list` | read | List proposal types |
| `estimates_sell` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark an estimate as sold |
| `estimates_unsell` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Revert an estimate from sold status |
| `estimates_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update an existing estimate |
## export

| Tool | Operation | Description |
| --- | --- | --- |
| `export_activities` | read | Export activities |
| `export_activity_codes` | read | Export activity codes |
| `export_adjustments` | read | Export adjustments |
| `export_appointment_assignments` | read | Export appointment assignments |
| `export_appointments` | read | Export appointments |
| `export_bookings` | read | Export bookings |
| `export_business_units` | read | Export business units |
| `export_calls` | read | Export calls |
| `export_customers` | read | Export customers |
| `export_customers_contacts` | read | Export customer contacts |
| `export_employees` | read | Export employees |
| `export_equipment` | read | Export pricebook equipment |
| `export_gross_pay_items` | read | Export gross pay items |
| `export_installed_equipment` | read | Export installed equipment |
| `export_inventory_bills` | read | Export inventory bills |
| `export_invoice_items` | read | Export invoice items |
| `export_invoice_templates` | read | Export invoice templates |
| `export_invoices` | read | Export invoices |
| `export_job_canceled_logs` | read | Export job canceled logs |
| `export_job_history` | read | Export job history |
| `export_job_notes` | read | Export job notes |
| `export_job_splits` | read | Export job splits |
| `export_jobs` | read | Export jobs |
| `export_leads` | read | Export leads |
| `export_locations` | read | Export locations |
| `export_locations_contacts` | read | Export location contacts |
| `export_materials` | read | Export pricebook materials |
| `export_membership_status_changes` | read | Export membership status changes |
| `export_membership_types` | read | Export membership types |
| `export_memberships` | read | Export memberships |
| `export_payments` | read | Export payments |
| `export_payroll_adjustments` | read | Export payroll adjustments |
| `export_payroll_settings` | read | Export payroll settings |
| `export_project_notes` | read | Export project notes |
| `export_projects` | read | Export projects |
| `export_purchase_orders` | read | Export purchase orders |
| `export_recurring_service_types` | read | Export recurring service types |
| `export_returns` | read | Export returns |
| `export_service_agreements` | read | Export service agreements |
| `export_services` | read | Export pricebook services |
| `export_tag_types` | read | Export tag types |
| `export_technicians` | read | Export technicians |
| `export_timesheet_codes` | read | Export timesheet codes |
| `export_transfers` | read | Export transfers |
## intelligence

| Tool | Operation | Description |
| --- | --- | --- |
| `intel_campaign_performance` | read | Marketing campaign performance summary with calls, bookings, conversion rate, revenue, and revenue per call |
| `intel_csr_performance` | read | CSR booking performance using Job Detail By CSR with booked jobs, revenue, average ticket, campaign mix, job type mix, and team averages |
| `intel_daily_snapshot` | read | Daily operational snapshot with appointments, job progress, revenue to-date, call outcomes, next-day upcoming jobs, and plain-English highlights |
| `intel_estimate_pipeline` | read | Estimate pipeline summary with open/sold/dismissed funnel, conversion rate, close speed, age buckets, and stale opportunities |
| `intel_invoice_tracking` | read | Invoice email tracking with sent vs not-sent counts, send rate, dollar impact, and unsent breakdown by business unit and technician |
| `intel_labor_cost` | read | Reported labor hours by employee from Report 166. The default report does not expose gross pay, so cost and hourly-rate fields are returned as unavailable. |
| `intel_lookup` | read | Look up reference data (technicians, business units, payment types, membership types). Returns IDs and names from a 30-minute cache. Use this to find IDs for other intel tool filters. |
| `intel_membership_health` | read | Membership health summary with active counts, signups, cancellations, renewals, an active-to-cancellation ratio, and business-unit membership conversion metrics. Set includeServiceRevenue=true to also fetch tenant-wide totalServiceRevenue from invoices. |
| `intel_revenue_summary` | read | Revenue summary using ServiceTitan's native reporting engine (matches the ST dashboard). Returns total revenue, breakdown by business unit (completed, non-job, adjustment), opportunities, conversion rates, and sales metrics. Set includeProductivityMetrics=true for BU-level productivity metrics (adds ~0.5-1s). Set includeCollections=true for payment/collections data (adds ~20s). |
| `intel_technician_scorecard` | read | Technician performance scorecard with completed jobs, revenue, opportunities, conversion rates, productivity, and lead generation. Set includeExtendedMetrics=true for memberships sold and sales from tech/marketing leads (adds ~0.5-1s). |
## inventory

| Tool | Operation | Description |
| --- | --- | --- |
| `inventory_purchase_order_markups_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a purchase order markup |
| `inventory_purchase_order_markups_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a purchase order markup |
| `inventory_purchase_order_markups_get` | read | Get a purchase order markup by ID |
| `inventory_purchase_order_markups_list` | read | List purchase order markups |
| `inventory_purchase_order_markups_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a purchase order markup |
| `inventory_purchase_order_types_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a purchase order type |
| `inventory_purchase_order_types_list` | read | List purchase order types |
| `inventory_purchase_order_types_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a purchase order type |
| `inventory_purchase_orders_approve_request` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Approve a purchase order request |
| `inventory_purchase_orders_cancel` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Cancel a purchase order |
| `inventory_purchase_orders_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a purchase order |
| `inventory_purchase_orders_get` | read | Get a purchase order by ID |
| `inventory_purchase_orders_list` | read | List purchase orders |
| `inventory_purchase_orders_reject_request` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Reject a purchase order request |
| `inventory_purchase_orders_requests_list` | read | List purchase order requests |
| `inventory_purchase_orders_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a purchase order |
| `inventory_receipts_cancel` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Cancel a receipt |
| `inventory_receipts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a receipt |
| `inventory_receipts_list` | read | List receipts |
| `inventory_receipts_update_custom_fields` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update receipt custom fields |
| `inventory_return_types_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a return type |
| `inventory_return_types_list` | read | List return types |
| `inventory_return_types_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a return type |
| `inventory_returns_cancel` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Cancel a return |
| `inventory_returns_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a return |
| `inventory_returns_list` | read | List returns |
| `inventory_returns_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a return |
| `inventory_returns_update_custom_fields` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update return custom fields |
| `inventory_transfers_list` | read | List transfers |
| `inventory_transfers_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a transfer |
| `inventory_transfers_update_custom_fields` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update transfer custom fields |
| `inventory_vendors_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a vendor |
| `inventory_vendors_get` | read | Get a vendor by ID |
| `inventory_vendors_list` | read | List vendors |
| `inventory_vendors_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a vendor |
| `inventory_warehouses_list` | read | List warehouses |
| `inventory_warehouses_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a warehouse |
## marketing

| Tool | Operation | Description |
| --- | --- | --- |
| `marketing_attributed_leads_get` | read | Get attributed leads |
| `marketing_calls_get` | read | Get call details by ID (v2) |
| `marketing_calls_recording_get` | read | Get call recording metadata or payload (v2) |
| `marketing_calls_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a call (v2) |
| `marketing_calls_v2_list` | read | List calls from v2 calls endpoint |
| `marketing_calls_v3_list` | read | List calls from v3 calls endpoint |
| `marketing_calls_voice_mail_get` | read | Get call voicemail metadata or payload (v2) |
| `marketing_campaign_costs_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a campaign cost |
| `marketing_campaign_costs_get` | read | Get a campaign cost by ID |
| `marketing_campaign_costs_list` | read | List campaign costs |
| `marketing_campaign_costs_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a campaign cost |
| `marketing_campaigns_costs_list` | read | List costs for a campaign |
| `marketing_campaigns_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a campaign |
| `marketing_campaigns_get` | read | Get a campaign by ID |
| `marketing_campaigns_list` | read | List campaigns |
| `marketing_campaigns_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a campaign |
| `marketing_client_side_data_get` | read | Get marketing client-side data |
| `marketing_client_specific_pricing_get_all_rate_sheets` | read | List all client-specific pricing rate sheets |
| `marketing_client_specific_pricing_update_rate_sheet` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a client-specific pricing rate sheet |
| `marketing_external_call_attributions_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create external call attributions |
| `marketing_opt_in_outs_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create opt-out records for phone numbers |
| `marketing_opt_in_outs_list` | read | List all opt-out records |
| `marketing_opt_in_outs_lookup_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Lookup opt-out records for phone numbers |
| `marketing_reviews` | read | List marketing reviews |
| `marketing_scheduled_job_attributions_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create scheduled job attributions |
| `marketing_scheduler_scheduler_performance` | read | Get scheduler performance |
| `marketing_scheduler_schedulers` | read | List schedulers |
| `marketing_scheduler_schedulersessions` | read | List scheduler sessions |
| `marketing_web_booking_attributions_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create web booking attributions |
| `marketing_web_lead_form_attributions_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create web lead form attributions |
## memberships

| Tool | Operation | Description |
| --- | --- | --- |
| `memberships_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a customer membership sale |
| `memberships_custom_fields_list` | read | List membership custom field definitions |
| `memberships_get` | read | Get a single customer membership by ID |
| `memberships_list` | read | List customer memberships |
| `memberships_recurring_service_events_list` | read | List recurring service events |
| `memberships_recurring_service_events_mark_complete` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark a recurring service event as complete |
| `memberships_recurring_service_events_mark_incomplete` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark a recurring service event as incomplete |
| `memberships_recurring_service_types_get` | read | Get a recurring service type by ID |
| `memberships_recurring_service_types_list` | read | List recurring service types |
| `memberships_recurring_services_get` | read | Get a recurring service by ID |
| `memberships_recurring_services_list` | read | List recurring services |
| `memberships_recurring_services_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a recurring service |
| `memberships_service_agreements_get` | read | Get a service agreement by ID |
| `memberships_service_agreements_list` | read | List service agreements |
| `memberships_status_changes_list` | read | List status changes for a customer membership |
| `memberships_types_discounts_list` | read | List discounts for a membership type |
| `memberships_types_duration_billing_list` | read | List duration billing items for a membership type |
| `memberships_types_get` | read | Get a membership type by ID |
| `memberships_types_list` | read | List membership types |
| `memberships_types_recurring_service_items_list` | read | List recurring service items for a membership type |
| `memberships_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a customer membership |
## payroll

| Tool | Operation | Description |
| --- | --- | --- |
| `payroll_employees_payrolls_list` | read | List payroll periods for an employee |
| `payroll_gross_pay_items_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a gross pay item |
| `payroll_gross_pay_items_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a gross pay item |
| `payroll_gross_pay_items_list` | read | List gross pay items |
| `payroll_gross_pay_items_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a gross pay item |
| `payroll_payroll_adjustments_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a payroll adjustment |
| `payroll_payroll_adjustments_get` | read | Get a payroll adjustment by ID |
| `payroll_payroll_adjustments_list` | read | List payroll adjustments |
| `payroll_payroll_settings_employee_get` | read | Get payroll settings for an employee |
| `payroll_payroll_settings_employee_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update payroll settings for an employee |
| `payroll_payroll_settings_list` | read | List payroll settings |
| `payroll_payroll_settings_technician_get` | read | Get payroll settings for a technician |
| `payroll_payroll_settings_technician_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update payroll settings for a technician |
| `payroll_payrolls_list` | read | List payroll periods |
| `payroll_technicians_payrolls_list` | read | List payroll periods for a technician |
| `payroll_timesheet_codes_get` | read | Get a timesheet code by ID |
| `payroll_timesheet_codes_list` | read | List timesheet codes |
| `payroll_timesheets_job_list` | read | List job timesheets for a job |
| `payroll_timesheets_jobs_list` | read | List job timesheets across multiple jobs |
| `payroll_timesheets_non_job_list` | read | List non-job timesheets |
## people

| Tool | Operation | Description |
| --- | --- | --- |
| `people_employees_accountactions` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Run account actions for an employee |
| `people_employees_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create an employee |
| `people_employees_export` | read | Export employees |
| `people_employees_get` | read | Get an employee by ID |
| `people_employees_list` | read | List employees |
| `people_employees_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update an employee |
| `people_gps_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Submit GPS pings from an external provider |
| `people_performance_get` | read | Get performance segmented by campaign/ad group/keyword |
| `people_technician_ratings_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update technician rating for a specific job |
| `people_technician_shifts_bulk_delete` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete multiple technician shifts |
| `people_technician_shifts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a technician shift |
| `people_technician_shifts_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a technician shift |
| `people_technician_shifts_get` | read | Get a technician shift by ID |
| `people_technician_shifts_list` | read | List technician shifts |
| `people_technician_shifts_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a technician shift |
| `people_technicians_accountactions` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Run account actions for a technician |
| `people_technicians_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a technician |
| `people_technicians_get` | read | Get a technician by ID |
| `people_technicians_list` | read | List technicians |
| `people_technicians_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a technician |
| `people_trucks_list` | read | List trucks |
| `people_trucks_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a truck |
## pricebook

| Tool | Operation | Description |
| --- | --- | --- |
| `pricebook_bulk_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create or import bulk pricebook operations |
| `pricebook_bulk_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update pricebook records in bulk |
| `pricebook_categories_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a pricebook category |
| `pricebook_categories_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a pricebook category |
| `pricebook_categories_get` | read | Get a pricebook category by ID |
| `pricebook_categories_list` | read | List pricebook categories |
| `pricebook_categories_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a pricebook category |
| `pricebook_discounts_fees_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a discount or fee |
| `pricebook_discounts_fees_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a discount or fee |
| `pricebook_discounts_fees_get` | read | Get a discount or fee by ID |
| `pricebook_discounts_fees_list` | read | List discounts and fees |
| `pricebook_discounts_fees_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a discount or fee |
| `pricebook_equipment_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete equipment item |
| `pricebook_equipment_get` | read | Get equipment item by ID |
| `pricebook_equipment_list` | read | List equipment pricebook items |
| `pricebook_equipment_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update equipment item |
| `pricebook_materials_cost_types_list` | read | List material cost types |
| `pricebook_materials_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a material pricebook item |
| `pricebook_materials_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a material by ID |
| `pricebook_materials_get` | read | Get a material by ID |
| `pricebook_materials_list` | read | List material pricebook items |
| `pricebook_materials_markup_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a material markup range |
| `pricebook_materials_markup_get` | read | Get a material markup range by ID |
| `pricebook_materials_markup_list` | read | List material markup ranges |
| `pricebook_materials_markup_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a material markup range |
| `pricebook_materials_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a material pricebook item |
| `pricebook_services_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a service pricebook item |
| `pricebook_services_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a service pricebook item |
| `pricebook_services_get` | read | Get a service by ID |
| `pricebook_services_list` | read | List service pricebook items |
| `pricebook_services_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a service pricebook item |
## reporting

| Tool | Operation | Description |
| --- | --- | --- |
| `reporting_dynamic_value_sets_get` | read | Get values from a dynamic value set |
| `reporting_report_categories_list` | read | List report categories |
| `reporting_reports_data_create` | read | Fetch report data rows. Use the report definition to discover required parameters. Date parameters use YYYY-MM-DD format. |
| `reporting_reports_get` | read | Get a report definition in a category |
| `reporting_reports_list` | read | List reports in a report category |
## scheduling

| Tool | Operation | Description |
| --- | --- | --- |
| `scheduling_appointment_assignments_assign_technicians` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Assign technicians to an appointment |
| `scheduling_appointment_assignments_list` | read | List appointment assignments |
| `scheduling_appointment_assignments_unassign_technicians` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Unassign technicians from appointments |
| `scheduling_business_hours_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create business hour configuration |
| `scheduling_business_hours_list` | read | Get business hour configuration |
| `scheduling_capacity_calculate` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Calculate available time slots for scheduling. Returns arrival windows with technician availability for the given business unit(s) within the time window. Note: this is a POST that does not mutate state; it is flagged 'write' due to the HTTP verb. |
| `scheduling_non_job_appointments_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a non-job appointment |
| `scheduling_non_job_appointments_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a non-job appointment |
| `scheduling_non_job_appointments_get` | read | Get a non-job appointment by ID |
| `scheduling_non_job_appointments_list` | read | List non-job appointments |
| `scheduling_non_job_appointments_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a non-job appointment |
| `scheduling_teams_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a team |
| `scheduling_teams_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a team |
| `scheduling_teams_get` | read | Get a team by ID |
| `scheduling_teams_list` | read | List teams |
| `scheduling_zones_get` | read | Get a zone by ID |
| `scheduling_zones_list` | read | List zones |
## settings

| Tool | Operation | Description |
| --- | --- | --- |
| `settings_activities_export` | read | Export activities |
| `settings_activity_categories_export` | read | Export activity categories |
| `settings_activity_categories_get` | read | Get an activity category by ID |
| `settings_activity_categories_list` | read | List activity categories |
| `settings_activity_codes_export` | read | Export activity codes |
| `settings_activity_codes_get` | read | Get an activity code by ID |
| `settings_activity_codes_list` | read | List activity codes |
| `settings_activity_types_get` | read | Get an activity type by ID |
| `settings_activity_types_list` | read | List activity types |
| `settings_business_units_get` | read | Get a business unit by ID |
| `settings_business_units_list` | read | List business units |
| `settings_business_units_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a business unit |
| `settings_tag_types_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a tag type |
| `settings_tag_types_export` | read | Export tag types |
| `settings_tag_types_list` | read | List tag types |
| `settings_tag_types_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a tag type |
| `settings_tasks_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a task |
| `settings_tasks_create_subtask` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a subtask under an existing task |
| `settings_tasks_get` | read | Get a task by ID |
| `settings_tasks_list` | read | List tasks |
| `settings_user_roles_list` | read | List user roles |

## Removed undocumented operations

These tools are unavailable in v3.

| Tool | Reason |
| --- | --- |
| `accounting_payments_create` | POST /accounting/v2/tenant/{tenant}/payments is undocumented; the collection is GET-only. |
| `dispatch_installed_equipment_delete` | DELETE installed-equipment/{id} is undocumented; the item supports GET and PATCH. |
| `dispatch_job_types_delete` | DELETE job-types/{id} is undocumented; the item supports GET and PATCH. |
| `dispatch_jobs_complete` | PUT jobs/{id}/complete is undocumented. |
| `dispatch_jobs_hold` | PUT jobs/{id}/hold is undocumented. |
| `dispatch_jobs_messages_create` | POST jobs/{id}/messages is undocumented. |
| `dispatch_projects_delete` | DELETE projects/{id} is undocumented; the item supports GET and PATCH. |
| `dispatch_projects_messages_create` | POST projects/{id}/messages is undocumented. |
| `export_contacts` | Standalone export/contacts is undocumented. |
| `export_job_cancel_reasons` | export/job-cancel-reasons is undocumented. |
| `export_location_recurring_service_events` | export/location-recurring-service-events is undocumented. |
| `export_location_recurring_services` | export/location-recurring-services is undocumented. |
| `export_timesheets` | export/timesheets is undocumented. |
| `marketing_campaign_costs_delete` | DELETE costs/{id} is undocumented; the item supports GET and PATCH. |
| `marketing_suppressions_add` | No suppression resource exists in the public ServiceTitan OpenAPI catalog. |
| `marketing_suppressions_get` | No suppression resource exists in the public ServiceTitan OpenAPI catalog. |
| `marketing_suppressions_list` | No suppression resource exists in the public ServiceTitan OpenAPI catalog. |
| `marketing_suppressions_remove` | No suppression resource exists in the public ServiceTitan OpenAPI catalog. |
| `payroll_payrolls_get` | GET payrolls/{id} is undocumented; Payroll exposes collection and employee/technician list endpoints. |
| `payroll_timesheets_create_job` | POST jobs/{job}/timesheets is undocumented; the collection is GET-only. |
| `payroll_timesheets_job_update` | PUT jobs/{job}/timesheets/{id} is undocumented. |
| `payroll_timesheets_non_job_create` | POST non-job-timesheets is undocumented; the collection is GET-only. |
| `payroll_timesheets_non_job_delete` | DELETE non-job-timesheets/{id} is undocumented. |
| `payroll_timesheets_non_job_get` | GET non-job-timesheets/{id} is undocumented. |
| `payroll_timesheets_non_job_update` | PUT non-job-timesheets/{id} is undocumented. |
| `settings_tag_types_delete` | DELETE tag-types/{id} is undocumented; the item supports PATCH only. |
| `settings_tag_types_get` | GET tag-types/{id} is undocumented; use settings_tag_types_list. |
