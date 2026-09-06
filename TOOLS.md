# V3 tool catalog

Generated from the actual registry. ServiceTitan-facing read tools are backed by pinned API contracts and are eligible for stable support subject to scopes, module availability, and company validation. Live evidence covers representative reads, not every read tool. Built-in system tools provide health, readiness, and stored-result retrieval. Mutations are experimental and have not been verified against a live ServiceTitan Integration environment; they require both `ST_READONLY=false` and `ST_EXPERIMENTAL_WRITES=true`. Readonly mode always hides mutations. Profiles and tool allowlists narrow this catalog further. Discovery does not grant ServiceTitan API scopes.

ServiceTitan-facing reads: 261; built-in system tools: 3; readonly discovery: 264; experimental mutations: 194; total with explicit experimental opt-in: 458.

## _system

| Tool | Operation | Description |
| --- | --- | --- |
| `st_health_check` | read | Verify authentication and representative tenant read access. Use st_readiness_check for report and module compatibility. |
| `st_readiness_check` | read | Read-only compatibility manifest: authentication, representative module read access, report fields/parameters and definition fingerprints. Does not certify write scopes or metric totals. |
| `st_result_read` | read | Retrieve a stored large result as bounded JSON text chunks. Start at offset 0, concatenate text in nextOffset order, then parse JSON. Results expire after five minutes and belong to this session. |
## accounting

| Tool | Operation | Description |
| --- | --- | --- |
| `accounting_ap_credits_list` | read | List one requested page of vendor AP credits, filterable by credit IDs and created or modified timestamps. Use this for credits on vendor accounts; use accounting_ap_payments_list for AP disbursements and accounting_payments_list for customer receipts. |
| `accounting_ap_credits_mark_as_exported` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark AP credits as exported |
| `accounting_ap_payments_list` | read | List one requested page of vendor AP payments, filterable by payment IDs and created or modified timestamps. Use this for accounts-payable disbursements; use accounting_ap_credits_list for vendor credits and accounting_payments_list for customer receipts. |
| `accounting_ap_payments_mark_as_exported` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark AP payments as exported |
| `accounting_gl_account_types_list` | read | List one requested page of GL account-type definitions, filterable by type IDs, names, and active state. Use this catalog to resolve types for GL accounts; use accounting_gl_accounts_list for the actual ledger accounts. |
| `accounting_gl_accounts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a GL account |
| `accounting_gl_accounts_get` | read | Retrieve a GL account by its ServiceTitan ID. Returns the single upstream record without pagination; use accounting_gl_accounts_list to search when the ID is unknown. |
| `accounting_gl_accounts_list` | read | List one requested page of general-ledger accounts, with filters for IDs, names, numbers, types, subtypes, source, description, and Intacct flags. Use accounting_gl_accounts_get for one known account and accounting_gl_account_types_list to resolve account-type metadata. |
| `accounting_gl_accounts_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a GL account |
| `accounting_invoice_items_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete an invoice item |
| `accounting_invoice_items_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch invoice items |
| `accounting_invoices_create_adjustment` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create an adjustment invoice |
| `accounting_invoices_custom_field_types_list` | read | List one requested page of invoice custom-field definitions, with paging and total-count controls. Use this to resolve the metadata for invoice custom fields; use accounting_invoices_list to retrieve invoice records and their values. |
| `accounting_invoices_list` | read | List one requested page of customer invoice headers using customer, job, business-unit, invoice, date, amount, balance, review, and assignment filters. Use this for filtered invoice search; use estimates or invoice-item tools when the required grain is an estimate or individual line item. |
| `accounting_invoices_mark_as_exported` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark invoices as exported |
| `accounting_invoices_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch an invoice |
| `accounting_invoices_update_custom_fields` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update invoice custom fields |
| `accounting_journal_entries_get_details` | read | Retrieve journal-entry detail rows for the requested journal-entry IDs. Use this for line-level account and amount detail; use accounting_journal_entries_get_summary for header-level totals. |
| `accounting_journal_entries_get_summary` | read | Retrieve journal-entry summary rows for the requested journal-entry IDs. Use this for header-level accounting totals; use accounting_journal_entries_get_details for the corresponding line-level detail rows. |
| `accounting_journal_entries_list` | read | List one requested page of journal-entry headers using IDs, numbers, sync status, posted dates, and created or modified timestamps. Use this to discover entry IDs, then choose accounting_journal_entries_get_summary for summary rows or accounting_journal_entries_get_details for line-level rows. |
| `accounting_journal_entries_sync_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Trigger journal entry sync update |
| `accounting_journal_entries_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a journal entry |
| `accounting_payment_terms_get` | read | Retrieve a payment term by its ServiceTitan ID. Returns the single upstream record without pagination; use accounting_payment_terms_list to search when the ID is unknown. |
| `accounting_payment_terms_list` | read | List one requested page of invoice payment-term definitions, filterable by IDs and created or modified timestamps. Use accounting_payment_terms_get for one known term; use accounting_invoices_list for invoice transactions. |
| `accounting_payment_types_get` | read | Retrieve a payment type by its ServiceTitan ID. Returns the single upstream record without pagination; use accounting_payment_types_list to search when the ID is unknown. |
| `accounting_payment_types_list` | read | List one requested page of customer payment-type definitions, filterable by IDs, active state, and creation timestamps. Use this catalog to interpret or select payment methods; use accounting_payments_list for actual customer payment transactions. |
| `accounting_payments_custom_field_types_list` | read | List one requested page of payment custom-field definitions, with paging and total-count controls. Use this to resolve payment field metadata; use accounting_payments_list for customer payment transactions and their field values. |
| `accounting_payments_list` | read | List one requested page of customer payment transactions using payment or applied-invoice identifiers, customer, business-unit, batch, status, date, and total-amount filters. Use accounting_payment_types_list for payment-method definitions; use accounting_ap_payments_list for vendor disbursements. |
| `accounting_payments_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a payment |
| `accounting_payments_update_custom_fields` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update payment custom fields |
| `accounting_payments_update_status` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update payment statuses |
| `accounting_tax_zones_list` | read | List one requested page of tax-zone definitions, filterable by IDs, active state, and created or modified timestamps. Use this catalog to resolve tax treatment identifiers; it does not return invoice transactions or calculated tax totals. |
## crm

| Tool | Operation | Description |
| --- | --- | --- |
| `crm_booking_provider_tags_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a booking provider tag |
| `crm_booking_provider_tags_get` | read | Retrieve one booking-provider tag record by ID, including its name and description. Use crm_booking_provider_tags_list to search by name, multiple IDs, or change dates. |
| `crm_booking_provider_tags_list` | read | Search booking-provider tag definitions by name, IDs, or created and modified ranges. Returns one page; use crm_booking_provider_tags_get when the tag ID is already known. |
| `crm_booking_provider_tags_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a booking provider tag |
| `crm_bookings_contacts_list` | read | List one page of contacts attached to a tenant booking. Supply the booking ID; use page and pageSize to continue through results. |
| `crm_bookings_get` | read | Retrieve one tenant booking record by booking ID. Use crm_bookings_list to search when the ID is unknown, or the provider-scoped get when the booking provider must be part of the route. |
| `crm_bookings_list` | read | Search tenant bookings by IDs, external ID, or created and modified ranges. Returns one page; use crm_bookings_get for a known booking ID. |
| `crm_bookings_provider_contacts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a contact on a provider-scoped booking |
| `crm_bookings_provider_contacts_list` | read | List one page of contacts for a booking within a specified booking provider. Requires both provider and booking IDs. |
| `crm_bookings_provider_contacts_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a provider-scoped booking contact |
| `crm_bookings_provider_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a booking for a booking provider |
| `crm_bookings_provider_get` | read | Retrieve one booking record from a specified booking provider using both provider and booking IDs. Use crm_bookings_get for the tenant-wide ID route, or the provider list when the booking ID is unknown. |
| `crm_bookings_provider_list` | read | Search one booking provider's bookings by IDs, external ID, or created and modified ranges. Returns one page and requires the provider ID. |
| `crm_bookings_provider_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a provider-scoped booking |
| `crm_bulk_tags_add_tags` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Add bulk tags |
| `crm_bulk_tags_remove_tags` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Remove bulk tags |
| `crm_contact_methods_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a contact method |
| `crm_contact_methods_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a contact method |
| `crm_contact_methods_get` | read | Retrieve one contact-method record using its parent contact UUID and contact-method UUID. Use crm_contact_methods_list to search that contact's methods when the method ID is unknown. |
| `crm_contact_methods_list` | read | Search one contact's phone, email, or other contact methods by reference, type, value, or date filters. Returns one page and requires contactId. |
| `crm_contact_methods_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a contact method |
| `crm_contact_methods_upsert` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Replace a contact method |
| `crm_contact_relationships_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a contact relationship |
| `crm_contact_relationships_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a contact relationship |
| `crm_contact_relationships_list` | read | List one page of contact-to-entity relationship records for a known contact UUID, optionally filtered by related entity, type slug, type name, or creation time. Use crm_contacts_by_relationship_list for contacts associated with a known relationship ID. |
| `crm_contacts_by_relationship_list` | read | Search contact records associated with a known relationship ID, with optional identity, archive, and date filters. Returns one page; use crm_contact_relationships_list to inspect the links owned by one known contact. |
| `crm_contacts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a contact |
| `crm_contacts_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a contact |
| `crm_contacts_get` | read | Retrieve one CRM contact record by UUID, including its stored identity fields. Use crm_contacts_list to search by name, title, reference ID, archive status, or change dates. |
| `crm_contacts_list` | read | Search CRM contacts by name, title, reference ID, archive status, or date ranges. Returns one page; use crm_contacts_get for a known UUID. |
| `crm_contacts_replace` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Replace a contact |
| `crm_contacts_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a contact |
| `crm_customers_contacts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a customer contact |
| `crm_customers_contacts_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a customer contact |
| `crm_customers_contacts_list` | read | List one page of contacts attached to a known customer. Use crm_customers_contacts_modified_list for cross-customer incremental contact queries. |
| `crm_customers_contacts_modified_list` | read | Search contact records across specified customers using created or modified time ranges. Returns one page; use crm_customers_contacts_list for all contacts of one known customer. |
| `crm_customers_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a customer |
| `crm_customers_custom_field_types_list` | read | List one page of custom-field type definitions available to customers, with created and modified date filters. This returns field metadata, not values for one customer. |
| `crm_customers_get` | read | Retrieve one customer record by ID, including the customer data returned by ServiceTitan. Use crm_customers_list to search by name, address, phone, external data, activity, or date ranges. |
| `crm_customers_list` | read | Search customers by IDs, name, address, phone, coordinates, external data, activity, or created and modified ranges. Returns one page; use crm_customers_get for a known ID. |
| `crm_customers_notes_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a note for a customer |
| `crm_customers_notes_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a customer note |
| `crm_customers_notes_list` | read | List one page of notes attached to a known customer, optionally filtered by created or modified timestamps. Requires the customer ID. |
| `crm_customers_tags_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a tag assignment for a customer |
| `crm_customers_tags_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a tag assignment from a customer |
| `crm_customers_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a customer |
| `crm_leads_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a lead |
| `crm_leads_dismiss` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Dismiss a lead |
| `crm_leads_follow_ups_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a follow-up for a lead |
| `crm_leads_form_submit` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Submit a lead form |
| `crm_leads_get` | read | Retrieve one CRM lead record by ID, including its customer and lead details. Use crm_leads_list to search by customer, status, prospect state, location fields, or date ranges. |
| `crm_leads_list` | read | Search CRM leads by IDs, customer, status, prospect state, customer location, or created and modified ranges. Returns one page; use crm_leads_get for a known ID. |
| `crm_leads_notes_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a note for a lead |
| `crm_leads_notes_list` | read | List one page of notes attached to a known lead, optionally filtered by created or modified timestamps. Requires the lead ID. |
| `crm_leads_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a lead |
| `crm_location_labor_types_list` | read | List one page of labor-type assignment records for specified location IDs, optionally filtered by active state or creation time. Use this to determine which labor types apply across known service locations. |
| `crm_locations_contacts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a contact for a location |
| `crm_locations_contacts_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a location contact |
| `crm_locations_contacts_list` | read | List one page of contacts attached to a known service location. Use crm_locations_contacts_modified_list for cross-location incremental contact queries. |
| `crm_locations_contacts_modified_list` | read | Search contact records across specified locations using created or modified time ranges. Returns one page; use crm_locations_contacts_list for all contacts of one known location. |
| `crm_locations_contacts_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a location contact |
| `crm_locations_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a location |
| `crm_locations_custom_field_types_list` | read | List one page of custom-field type definitions available to locations, with created and modified date filters. This returns field metadata, not values for one location. |
| `crm_locations_get` | read | Retrieve one service-location record by ID, including its customer and address data. Use crm_locations_list to search by customer, address, external data, activity, or date ranges. |
| `crm_locations_list` | read | Search service locations by IDs, customer, name, address, coordinates, external data, activity, or date ranges. Returns one page; use crm_locations_get for a known ID. |
| `crm_locations_notes_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a note for a location |
| `crm_locations_notes_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a location note |
| `crm_locations_notes_list` | read | List one page of notes attached to a known service location, optionally filtered by created or modified timestamps. Requires the location ID. |
| `crm_locations_tags_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a tag assignment for a location |
| `crm_locations_tags_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a tag assignment from a location |
| `crm_locations_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Patch a location |
## dispatch

| Tool | Operation | Description |
| --- | --- | --- |
| `dispatch_appointments_confirm` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Confirm an appointment |
| `dispatch_appointments_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create an appointment |
| `dispatch_appointments_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete an appointment by ID |
| `dispatch_appointments_get` | read | Retrieve one appointment record by ID, including its dispatch and scheduling data. Use dispatch_appointments_list to search by job, customer, technician, status, start time, or other filters. |
| `dispatch_appointments_hold` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Put an appointment on hold |
| `dispatch_appointments_list` | read | Search appointments by IDs, job, project, customer, technician, status, start range, or created and modified ranges. Returns one page; use dispatch_appointments_get for a known ID. |
| `dispatch_appointments_reschedule` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Reschedule an appointment |
| `dispatch_appointments_set_summary` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Set an appointment summary. Private preview: only works for accounts with the ST feature enabled. |
| `dispatch_appointments_unconfirm` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Remove appointment confirmation |
| `dispatch_appointments_unhold` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Remove hold from an appointment |
| `dispatch_appointments_update_special_instructions` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update appointment special instructions |
| `dispatch_arrival_window_configuration_get` | read | Retrieve the tenant-wide arrival-window configuration as one unpaged response. It returns scheduling configuration rather than an individual window; use dispatch_arrival_windows_get or list for window definitions. |
| `dispatch_arrival_window_configuration_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update arrival window configuration |
| `dispatch_arrival_windows_activate` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Activate an arrival window |
| `dispatch_arrival_windows_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a new arrival window |
| `dispatch_arrival_windows_get` | read | Retrieve one arrival-window definition by ID, including its time span and applicable business units. Use dispatch_arrival_windows_list to browse by active state or creation time. |
| `dispatch_arrival_windows_list` | read | List one page of arrival-window definitions, optionally filtered by active state or creation time. Each record supplies a configured window and applicable business units; use dispatch_arrival_windows_get for a known ID. |
| `dispatch_arrival_windows_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update an arrival window |
| `dispatch_call_reasons_list` | read | List one page of dispatch call-reason catalog entries, filtered by active state or created and modified ranges. Use these IDs when a workflow requires a call reason. |
| `dispatch_form_submissions_list` | read | Search submitted form records by form, creator, status, owner expression, submitted range, or active state. Returns one page; use this for submission results rather than form definitions. |
| `dispatch_forms_list` | read | Search dispatch form definitions by IDs, name, publication status, active state, conditional logic, triggers, and date ranges. Returns one page of form metadata; use dispatch_form_submissions_list for completed or pending submissions. |
| `dispatch_images_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create an image placeholder |
| `dispatch_images_get` | read | Request image response data for a ServiceTitan storage path. The upstream Pricebook image operation documents an HTTP 302 redirect; this wrapper returns the client-decoded response body through its standard JSON/text envelope, without exposing the redirect Location header. Supply the known path when targeting an image; use dispatch_jobs_list_attachments to discover job attachments. |
| `dispatch_installed_equipment_attachments_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Upload an installed equipment attachment |
| `dispatch_installed_equipment_attachments_get` | read | Request an installed-equipment attachment by its ServiceTitan storage path. Returns the client-decoded attachment response; the pinned API does not define a response-body schema. Supply the exact known path; use dispatch_installed_equipment_get for the equipment record itself. |
| `dispatch_installed_equipment_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create installed equipment |
| `dispatch_installed_equipment_get` | read | Retrieve one installed-equipment record by ID, including its location and equipment details. Use dispatch_installed_equipment_list to search by location, IDs, active state, or date ranges. |
| `dispatch_installed_equipment_list` | read | Search installed-equipment records by IDs, location IDs, active state, or created and modified ranges. Returns one page; use dispatch_installed_equipment_get for a known ID. |
| `dispatch_installed_equipment_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update installed equipment |
| `dispatch_job_cancel_reasons_list` | read | Browse the paginated job-cancellation-reason catalog using active and date filters. Use dispatch_jobs_cancel_reasons_list instead only to look up a supplied set of known reason IDs. |
| `dispatch_job_hold_reasons_list` | read | List one page of job-hold-reason catalog entries, filtered by active state or created and modified ranges. Returned records provide reason IDs and metadata used when placing a job on hold; they are distinct from cancellation reasons. |
| `dispatch_job_splits_by_jobs_list` | read | Search one page of job-split records across supplied job IDs, with activity and date filters. Use dispatch_job_splits_list when working with one job-scoped route. |
| `dispatch_job_splits_list` | read | List one page of split records for a single required job ID, with activity and date filters. Use dispatch_job_splits_by_jobs_list to query splits across multiple jobs. |
| `dispatch_job_types_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a job type |
| `dispatch_job_types_get` | read | Retrieve one job-type definition by ID, optionally scoped to an external-data application. Returns the configured defaults and associations for that type; use dispatch_job_types_list to search the catalog. |
| `dispatch_job_types_list` | read | Search job-type definitions by IDs, name, priority, duration, active state, external-data application, or date ranges. Returns one page of configured job types; use dispatch_job_types_get for a known ID. |
| `dispatch_job_types_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a job type. Warning: customFieldTypeIds uses ST replace semantics unless customFieldsUpdateMode is Merge. |
| `dispatch_jobs_booked_log_get` | read | Retrieve booking-log details for a known job ID as one unpaged audit resource. Use dispatch_jobs_get for the current job record rather than its booking audit data. |
| `dispatch_jobs_cancel` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Cancel a job |
| `dispatch_jobs_cancel_reasons_list` | read | Look up job cancellation reasons for a supplied list of known IDs. This non-paginated Jobs endpoint is distinct from dispatch_job_cancel_reasons_list, which browses and filters the reason catalog. |
| `dispatch_jobs_canceled_logs_list` | read | List one page of cancellation log entries for a known job ID. Use this for cancellation audit details rather than the current job or cancellation-reason catalog. |
| `dispatch_jobs_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a job |
| `dispatch_jobs_create_attachment` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Attach a file to a job |
| `dispatch_jobs_custom_field_types_list` | read | List one page of custom-field type definitions available to jobs, with created and modified date filters. This returns field metadata, not values for one job. |
| `dispatch_jobs_equipment_attach` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Attach installed equipment to a job |
| `dispatch_jobs_equipment_detach` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Detach a single installed equipment item from a job. Requires confirm: true. |
| `dispatch_jobs_equipment_detach_bulk` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Detach one or more installed equipment IDs from a job. Requires confirm: true. |
| `dispatch_jobs_equipment_get` | read | Retrieve the installed-equipment ID collection attached to a known job as one unpaged response. Use dispatch_installed_equipment_get or list to fetch the equipment records themselves. |
| `dispatch_jobs_get` | read | Retrieve one job record by ID, optionally scoped to an external-data application. Returns the current ServiceTitan job data; use dispatch_jobs_list to search by customer, location, status, dates, or other filters. |
| `dispatch_jobs_get_attachment` | read | Retrieve one job-attachment resource from Forms v2 by attachment ID. Use dispatch_jobs_list_attachments to browse attachment metadata for a known job when the attachment ID is unknown. |
| `dispatch_jobs_history_get` | read | Retrieve the history response for a known job ID as one unpaged audit resource. Use dispatch_jobs_get for the current job record rather than its historical changes. |
| `dispatch_jobs_list` | read | Search jobs by IDs, number, customer, location, project, status, appointments, equipment, tags, dates, or other supported filters. Returns one page; use dispatch_jobs_get for a known job ID. |
| `dispatch_jobs_list_attachments` | read | List one page of attachments for a known job, optionally filtered by creation time and sorted. Returned records identify files attached to that job. |
| `dispatch_jobs_notes_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a note for a job |
| `dispatch_jobs_notes_list` | read | List one page of notes attached to a known job. Requires the job ID; this endpoint has pagination controls but no note-content filters. |
| `dispatch_jobs_remove_cancellation` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Remove cancellation from a job |
| `dispatch_jobs_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a job |
| `dispatch_project_statuses_get` | read | Retrieve one project-status definition by ID, including its configured status metadata. Use dispatch_project_statuses_list to search the catalog and the sub-status list for finer classifications. |
| `dispatch_project_statuses_list` | read | Search one page of project-status definitions by IDs, name, or created and modified ranges. Use the returned status IDs to classify projects, and dispatch_project_sub_statuses_list to find their finer-grained sub-statuses. |
| `dispatch_project_sub_statuses_get` | read | Retrieve one project sub-status definition by ID, including its parent-status metadata. Use dispatch_project_sub_statuses_list to search by parent status, name, IDs, active state, or dates. |
| `dispatch_project_sub_statuses_list` | read | Search one page of project sub-status definitions by parent status, IDs, name, active state, or date ranges. Returned records refine a project's status; use dispatch_project_statuses_list for the parent status catalog. |
| `dispatch_project_types_get` | read | Retrieve one project-type definition by ID, including its configured type metadata. Use dispatch_project_types_list to browse the paginated type catalog when the ID is unknown. |
| `dispatch_project_types_list` | read | List one page of project-type definitions. Use dispatch_project_types_get when a project-type ID is already known. |
| `dispatch_projects_attach_job` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Attach a job to a project |
| `dispatch_projects_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a project |
| `dispatch_projects_custom_field_types_list` | read | List one page of custom-field type definitions available to projects, with created and modified date filters. This returns field metadata, not values for one project. |
| `dispatch_projects_detach_job` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Detach a job from a project |
| `dispatch_projects_get` | read | Retrieve one project record by ID, optionally scoped to an external-data application. Returns the current project data; use dispatch_projects_list to search by customer, location, status, dates, or linked work. |
| `dispatch_projects_list` | read | Search projects by IDs, customer, location, status, type, manager, dates, or linked jobs, appointments, and invoices. Returns one page; use dispatch_projects_get for a known ID. |
| `dispatch_projects_notes_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a note for a project |
| `dispatch_projects_notes_list` | read | List one page of notes attached to a known project. Requires the project ID; use dispatch_projects_get for the project record itself. |
| `dispatch_projects_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a project |
## estimates

| Tool | Operation | Description |
| --- | --- | --- |
| `estimates_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a new estimate |
| `estimates_dismiss` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Dismiss an estimate |
| `estimates_estimate_templates_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create an estimate template |
| `estimates_estimate_templates_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete an estimate template by ID |
| `estimates_estimate_templates_get` | read | Retrieve an estimate template by its ServiceTitan ID. Returns the single upstream record without pagination; use estimates_estimate_templates_list to search when the ID is unknown. |
| `estimates_estimate_templates_list` | read | List one requested page of estimate templates, filterable by active state and modified timestamps. Use estimates_estimate_templates_get for a known template ID; use estimates_list for customer estimates created from templates. |
| `estimates_estimate_templates_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update an estimate template. Warning: items are full-replace when provided; omit items to preserve existing template items. |
| `estimates_export_estimates` | read | Read the incremental estimate export feed for synchronization. Supply from as the change-window start and continue with the response continuation token when present; use estimates_list for interactive filtered browsing and estimates_get for a known ID. |
| `estimates_get` | read | Retrieve a single estimate by its ServiceTitan ID. Returns the single upstream record without pagination; use estimates_list to search when the ID is unknown. |
| `estimates_items_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a single item from an estimate |
| `estimates_items_list` | read | Search one requested page of estimate line items by estimate ID, item IDs, active state, or creation and modification dates. Each result represents an item attached to an estimate, rather than an estimate header returned by estimates_list. |
| `estimates_items_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Add a new SKU line or update an existing item on an estimate |
| `estimates_list` | read | Search one requested page of estimates by job, project, location, status, dates, salesperson, or total amount. Use estimates_get for one known estimate; use estimates_export_estimates for incremental synchronization. |
| `estimates_proposal_templates_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a proposal template |
| `estimates_proposal_templates_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a proposal template by ID |
| `estimates_proposal_templates_get` | read | Retrieve a proposal template by its ServiceTitan ID. Returns the single upstream record without pagination; use estimates_proposal_templates_list to search when the ID is unknown. |
| `estimates_proposal_templates_list` | read | List one requested page of proposal templates, filterable by active state, modified timestamps, and proposal type ID. Use estimates_proposal_templates_get for a known template and estimates_proposal_types_list to resolve the type filter. |
| `estimates_proposal_templates_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a proposal template. Warning: businessUnitIds and estimateAssignments are full-replace when provided; omit them to preserve existing assignments. |
| `estimates_proposal_types_list` | read | List proposal-type definitions available for grouping and filtering proposal templates. Use estimates_proposal_templates_list to retrieve the templates that reference these types. |
| `estimates_sell` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark an estimate as sold |
| `estimates_unsell` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Revert an estimate from sold status |
| `estimates_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update an existing estimate |
## export

| Tool | Operation | Description |
| --- | --- | --- |
| `export_activities` | read | Read the incremental timesheet-activity export feed for cross-domain bulk synchronization. This is the same feed as settings_activities_export; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records. |
| `export_activity_codes` | read | Read the incremental activity-code export feed for cross-domain bulk synchronization. This is the same feed as settings_activity_codes_export; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records. |
| `export_adjustments` | read | Read the incremental adjustments export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_appointment_assignments` | read | Read the incremental appointment assignments export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_appointments` | read | Read the incremental appointments export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_bookings` | read | Read the incremental bookings export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_business_units` | read | Read the incremental business units export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_calls` | read | Read the incremental calls export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_customers` | read | Read the incremental customers export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_customers_contacts` | read | Read the incremental customers contacts export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_employees` | read | Read the incremental employee export feed for cross-domain bulk synchronization. This is the same feed as people_employees_export; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records. |
| `export_equipment` | read | Read the incremental equipment export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_gross_pay_items` | read | Read the incremental gross pay items export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_installed_equipment` | read | Read the incremental installed equipment export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_inventory_bills` | read | Read the incremental inventory bills export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_invoice_items` | read | Read the incremental invoice items export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_invoice_templates` | read | Read the incremental invoice templates export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_invoices` | read | Read the incremental invoices export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_job_canceled_logs` | read | Read the incremental job canceled logs export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_job_history` | read | Read the incremental job history export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_job_notes` | read | Read the incremental job notes export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_job_splits` | read | Read the incremental job splits export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_jobs` | read | Read the incremental jobs export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_leads` | read | Read the incremental leads export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_locations` | read | Read the incremental locations export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_locations_contacts` | read | Read the incremental locations contacts export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_materials` | read | Read the incremental materials export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_membership_status_changes` | read | Read the incremental membership status changes export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_membership_types` | read | Read the incremental membership types export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_memberships` | read | Read the incremental memberships export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_payments` | read | Read the incremental payments export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_payroll_adjustments` | read | Read the incremental payroll adjustments export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_payroll_settings` | read | Read the incremental payroll settings export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_project_notes` | read | Read the incremental project notes export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_projects` | read | Read the incremental projects export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_purchase_orders` | read | Read the incremental purchase orders export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_recurring_service_types` | read | Read the incremental recurring service types export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_returns` | read | Read the incremental returns export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_service_agreements` | read | Read the incremental service agreements export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_services` | read | Read the incremental services export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_tag_types` | read | Read the incremental tag-type export feed for cross-domain bulk synchronization. This is the same feed as settings_tag_types_export; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records. |
| `export_technicians` | read | Read the incremental technicians export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_timesheet_codes` | read | Read the incremental timesheet codes export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
| `export_transfers` | read | Read the incremental transfers export feed for bulk synchronization. Start with a date or omit from to start at the beginning of the feed, continue immediately with continueFrom while hasMore is true, and when false retain it and wait before polling again. includeRecentChanges may return records sooner but can repeat them. |
## intelligence

| Tool | Operation | Description |
| --- | --- | --- |
| `intel_campaign_performance` | read | Compare marketing campaigns over the selected date range by combining all fetched call, booking, job, and invoice pages. Returns calls, bookings, booked-call conversion, attributed revenue, and revenue per call; campaignId narrows the analysis to one known campaign. The metrics reflect the wrapper's cross-source attribution logic, and partial source failures are returned in _warnings. |
| `intel_csr_performance` | read | Summarize CSR-attributed jobs from Report 162 for the selected date range. Returns booked-job counts, revenue, average ticket, campaign and job-type mixes, rankings, and team averages; an optional business-unit name narrows matching report rows. Report execution is cached briefly and may wait for per-report/client spacing; unavailable source data is identified in _warnings. |
| `intel_daily_snapshot` | read | Build a one-day operational snapshot in the configured tenant timezone from all fetched appointment, job, invoice, payment, estimate, and call pages plus Report 163 for the next day. Returns appointment progress, daily invoiced revenue and collections, sold-estimate value, call outcomes, highlights, and at most 20 upcoming jobs; truncation and partial source failures appear in _warnings. Results are cached for 60 seconds. |
| `intel_estimate_pipeline` | read | Analyze all fetched estimate pages as an open, sold, and dismissed pipeline, with value, conversion, close speed, age buckets, and open estimates older than 30 days. startDate and endDate bound estimate creation timestamps; when both are supplied, Report 172 adds technician sales metrics. soldById filters both sources. Partial source failures are returned in _warnings. |
| `intel_invoice_tracking` | read | Track invoice email delivery for the selected date range by combining and deduplicating Reports 2281 and 2282. Returns sent and not-sent counts, send rate, invoice amount and balance impact, and unsent breakdowns by business unit and technician; an optional business-unit filter applies to both reports. Report calls may wait for per-report/client spacing, and partial source failures are returned in _warnings. |
| `intel_labor_cost` | read | Summarize employee regular, overtime, double-overtime, and total hours from Report 166 for the selected date range. When the tenant report exposes GrossPay, the tool also derives cost and effective hourly rate; otherwise those fields are unavailable rather than estimated. Report execution may wait for per-report/client spacing, and source failures are returned in _warnings. |
| `intel_lookup` | read | Look up technicians, business units, payment types, or membership types for use in intelligence-tool filters. Returns matching IDs and names from a 30-minute in-process cache; search performs a case-insensitive name match, while omission returns the available cached set. |
| `intel_membership_health` | read | Summarize membership activity from Report 182 and business-unit membership opportunities and conversions from Report 178 for the selected date range. Returns active-at-end counts, sales, cancellations, expirations, renewals, other status movements, and conversion metrics; it does not calculate a cohort retention rate. includeServiceRevenue adds tenant-wide invoice service revenue for the period, which is not membership-attributed. Partial source failures are returned in _warnings. |
| `intel_revenue_summary` | read | Summarize Report 175 revenue and Report 179 sales for the selected date range, optionally filtered to one business unit. Returns completed, non-job, adjustment, and total revenue plus opportunities, conversion, and sales metrics by business unit; the aggregate reflects returned report rows and is not certified as an all-company total or as matching every tenant dashboard configuration. includeProductivityMetrics adds Report 177 metrics, and includeCollections fetches all payment pages for the period. Report calls are cached briefly and serialized per report/client with at least 65 seconds between starts; a failed source is identified in _warnings and its affected metrics may be empty. |
| `intel_technician_scorecard` | read | Build a technician scorecard for the selected date range from ServiceTitan technician reports. Returns revenue, converted jobs, opportunities, conversion, productivity, recalls, upsells, and lead-generation metrics; includeExtendedMetrics adds membership and tech/marketing-lead sales reports. Filter by technician or business unit when comparing a subset, and use limit to bound ranked results. Report calls may wait for per-report/client spacing, and partial source failures are returned in _warnings. |
## inventory

| Tool | Operation | Description |
| --- | --- | --- |
| `inventory_purchase_order_markups_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a purchase order markup |
| `inventory_purchase_order_markups_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a purchase order markup |
| `inventory_purchase_order_markups_get` | read | Retrieve a purchase order markup by its ServiceTitan ID. Returns the single upstream record without pagination; use inventory_purchase_order_markups_list to search when the ID is unknown. |
| `inventory_purchase_order_markups_list` | read | List one requested page of purchase-order markup definitions, filterable by IDs and created or modified timestamps. Use inventory_purchase_order_markups_get for one known markup ID; use inventory_purchase_orders_list for purchase-order transactions. |
| `inventory_purchase_order_markups_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a purchase order markup |
| `inventory_purchase_order_types_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a purchase order type |
| `inventory_purchase_order_types_list` | read | List one requested page of purchase-order type definitions, with active-state and created or modified timestamp filters. Use this catalog to interpret order classifications; use inventory_purchase_orders_list for issued purchase-order records. |
| `inventory_purchase_order_types_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a purchase order type |
| `inventory_purchase_orders_approve_request` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Approve a purchase order request |
| `inventory_purchase_orders_cancel` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Cancel a purchase order |
| `inventory_purchase_orders_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a purchase order |
| `inventory_purchase_orders_get` | read | Retrieve a purchase order by its ServiceTitan ID. Returns the single upstream record without pagination; use inventory_purchase_orders_list to search when the ID is unknown. |
| `inventory_purchase_orders_list` | read | List one requested page of issued purchase orders using IDs, number, status, technician, job, project, and order or sent-date filters. Use inventory_purchase_orders_get for one known order and inventory_purchase_orders_requests_list for requests that precede issued orders. |
| `inventory_purchase_orders_reject_request` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Reject a purchase order request |
| `inventory_purchase_orders_requests_list` | read | Search purchase-order requests with the exposed identifiers, status, date, technician, job, and paging filters. These are requests that may precede a purchase order; use inventory_purchase_orders_list for issued purchase orders. |
| `inventory_purchase_orders_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a purchase order |
| `inventory_receipts_cancel` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Cancel a receipt |
| `inventory_receipts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a receipt |
| `inventory_receipts_list` | read | List one requested page of inventory receipt transactions using IDs, number, vendor, purchase order, bill, business unit, inventory location, sync status, and received-date filters. Use inventory_purchase_orders_list for originating orders and inventory_returns_list for outbound vendor returns. |
| `inventory_receipts_update_custom_fields` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update receipt custom fields |
| `inventory_return_types_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a return type |
| `inventory_return_types_list` | read | List one requested page of inventory return-type definitions, with active-state and created or modified timestamp filters. Use this catalog to interpret return classifications; use inventory_returns_list for actual return transactions. |
| `inventory_return_types_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a return type |
| `inventory_returns_cancel` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Cancel a return |
| `inventory_returns_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a return |
| `inventory_returns_list` | read | List one requested page of inventory return transactions using IDs, number, vendor, job, inventory location, sync status, return dates, and external-data filters. Use inventory_return_types_list for the separate return-type catalog; use inventory_transfers_list for movement between inventory locations. |
| `inventory_returns_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a return |
| `inventory_returns_update_custom_fields` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update return custom fields |
| `inventory_transfers_list` | read | List one requested page of inventory transfers using IDs, number, status, transfer type, source and destination locations, dates, sync status, and external-data filters. Use this for stock moved between locations; use inventory_returns_list for stock returned to a vendor. |
| `inventory_transfers_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a transfer |
| `inventory_transfers_update_custom_fields` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update transfer custom fields |
| `inventory_vendors_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a vendor |
| `inventory_vendors_get` | read | Retrieve a vendor by its ServiceTitan ID. Returns the single upstream record without pagination; use inventory_vendors_list to search when the ID is unknown. |
| `inventory_vendors_list` | read | List one requested page of inventory vendors using IDs, active state, created or modified timestamps, and external-data mapping filters. Use inventory_vendors_get for one known vendor; use inventory_purchase_orders_list for purchase-order records. |
| `inventory_vendors_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a vendor |
| `inventory_warehouses_list` | read | List one requested page of warehouse definitions using IDs, active state, created or modified dates, and external-data mapping filters. Use this to resolve warehouse and inventory-location identifiers; use inventory transfers or purchase orders for stock movement and procurement. |
| `inventory_warehouses_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a warehouse |
## marketing

| Tool | Operation | Description |
| --- | --- | --- |
| `marketing_attributed_leads_get` | read | Search attributed leads within a required UTC time window, optionally filtered by lead type. Returns one page of leads linked to marketing attribution activity. |
| `marketing_calls_get` | read | Retrieve one Marketing Calls v2 call record by numeric ID, including the call details returned by ServiceTitan. Use a call-list tool when the ID is unknown, and the recording or voicemail tools for those media resources. |
| `marketing_calls_recording_get` | read | Request the audio recording for a known Marketing Calls v2 call ID. ServiceTitan documents an audio/mpeg stream, but this wrapper delivers client-decoded data through its standard JSON/text envelope; use a binary-capable API client when faithful audio bytes are required. Use marketing_calls_get for the call record itself. |
| `marketing_calls_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a call (v2) |
| `marketing_calls_v2_list` | read | Search calls through Marketing Calls v2 using its activeOnly flag, explicit orderBy and direction, numeric ID array, agents, campaign, duration, phone, or timestamps. Returns one page; prefer v3 unless these v2-specific filter or sorting semantics are required. |
| `marketing_calls_v3_list` | read | Search calls through Marketing Calls v3 using comma-delimited IDs, caller number, active state, agents, campaign, duration, timestamps, or sort. Returns one page; prefer this for ordinary call search, and use v2 only for its numeric ID array, activeOnly, or orderBy contract. |
| `marketing_calls_voice_mail_get` | read | Request the voicemail audio for a known Marketing Calls v2 call ID. ServiceTitan documents an audio/mpeg stream, but this wrapper delivers client-decoded data through its standard JSON/text envelope; use a binary-capable API client when faithful audio bytes are required. Use marketing_calls_get for the call record itself. |
| `marketing_campaign_costs_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a campaign cost |
| `marketing_campaign_costs_get` | read | Retrieve one campaign-cost record by cost ID. Use marketing_campaign_costs_list to search when the cost ID is unknown. |
| `marketing_campaign_costs_list` | read | Search campaign costs across campaigns by campaign ID, year, or month. Returns one page; use marketing_campaigns_costs_list when a specific campaign ID is the required path scope. |
| `marketing_campaign_costs_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a campaign cost |
| `marketing_campaigns_costs_list` | read | List one page of costs for a required campaign ID, optionally filtered by year or month. Use marketing_campaign_costs_list for a broader cost search across campaigns. |
| `marketing_campaigns_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a campaign |
| `marketing_campaigns_get` | read | Retrieve one marketing campaign record by ID, including its configured campaign data. Use marketing_campaigns_list to search by name, phone number, active state, IDs, or date ranges. |
| `marketing_campaigns_list` | read | Search campaigns by IDs, name, phone number, active state, or created and modified ranges. Returns one page; use marketing_campaigns_get for a known campaign ID. |
| `marketing_campaigns_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a campaign |
| `marketing_client_side_data_get` | read | Retrieve tenant task reference data: employees, business units, priorities, statuses, types, sources, and resolutions. This Task Management client-side-data operation returns one unpaged response with no inputs; use it to populate task filters or forms, not for marketing analytics. |
| `marketing_client_specific_pricing_get_all_rate_sheets` | read | Search client-specific pricing rate sheets by IDs, search term, or active state. Returns one page of pricing definitions; despite the legacy name, pagination still applies. Use the rate-sheet ID from this result when updating a sheet. |
| `marketing_client_specific_pricing_update_rate_sheet` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a client-specific pricing rate sheet |
| `marketing_external_call_attributions_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create external call attributions |
| `marketing_opt_in_outs_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create opt-out records for phone numbers |
| `marketing_opt_in_outs_list` | read | Retrieve the tenant's marketing phone opt-out records from the v3 opt-in/out endpoint. This operation accepts no filters or pagination inputs. |
| `marketing_opt_in_outs_lookup_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Lookup opt-out records for phone numbers |
| `marketing_reviews` | read | Search customer review records by text, rating, source, response type, review status, location, technician, campaign, and date ranges. Returns one page; use inclusion flags when reviews missing those associations must remain in the result. |
| `marketing_scheduled_job_attributions_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create scheduled job attributions |
| `marketing_scheduler_scheduler_performance` | read | Retrieve one scheduler's performance metrics over a required session-created time window. Returns the scheduler performance response for that exact ID and period; use marketing_scheduler_schedulersessions for individual sessions. |
| `marketing_scheduler_schedulers` | read | List one page of marketing scheduler records, optionally filtered by created or modified timestamps. Use marketing_scheduler_scheduler_performance for metrics about one known scheduler. |
| `marketing_scheduler_schedulersessions` | read | List one page of sessions for a known scheduler, optionally filtered by created or modified timestamps. Use scheduler performance when aggregated metrics are needed. |
| `marketing_web_booking_attributions_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create web booking attributions |
| `marketing_web_lead_form_attributions_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create web lead form attributions |
## memberships

| Tool | Operation | Description |
| --- | --- | --- |
| `memberships_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a customer membership sale |
| `memberships_custom_fields_list` | read | List one requested page of membership custom-field definitions using created and modified timestamp filters. Use this for field metadata; use memberships_list for customer membership records and their field values. |
| `memberships_get` | read | Retrieve a single customer membership by its ServiceTitan ID. Returns the single upstream record without pagination; use memberships_list to search when the ID is unknown. |
| `memberships_list` | read | List one requested page of customer membership records using membership and customer IDs, status, active state, billing frequency, duration, and created or modified timestamps. Use memberships_get for one known sold membership and memberships_types_list for reusable membership-plan definitions. |
| `memberships_recurring_service_events_list` | read | List one requested page of recurring-service events using event IDs, status, job, location, and created or modified timestamp filters. Use memberships_recurring_services_get for the parent service record; use job tools for a job referenced by an event. |
| `memberships_recurring_service_events_mark_complete` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark a recurring service event as complete |
| `memberships_recurring_service_events_mark_incomplete` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Mark a recurring service event as incomplete |
| `memberships_recurring_service_types_get` | read | Retrieve a recurring service type by its ServiceTitan ID. Returns the single upstream record without pagination; use memberships_recurring_service_types_list to search when the ID is unknown. |
| `memberships_recurring_service_types_list` | read | List one requested page of recurring-service type definitions using IDs, membership type, recurrence type, duration type, active state, and created or modified timestamps. Use memberships_recurring_service_types_get for one known type and memberships_recurring_services_list for customer-location service instances. |
| `memberships_recurring_services_get` | read | Retrieve a recurring service by its ServiceTitan ID. Returns the single upstream record without pagination; use memberships_recurring_services_list to search when the ID is unknown. |
| `memberships_recurring_services_list` | read | List one requested page of customer-location recurring services using service, membership, and location IDs, active state, and created or modified timestamps. Use memberships_recurring_services_get for one known service and memberships_types_recurring_service_items_list for plan-level service configuration. |
| `memberships_recurring_services_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a recurring service |
| `memberships_service_agreements_get` | read | Retrieve a service agreement by its ServiceTitan ID. Returns the single upstream record without pagination; use memberships_service_agreements_list to search when the ID is unknown. |
| `memberships_service_agreements_list` | read | List one requested page of customer service agreements using agreement, customer, business-unit, status, and created or modified timestamp filters. Use memberships_service_agreements_get for a known agreement; use memberships_list for customer membership sales rather than agreement records. |
| `memberships_status_changes_list` | read | Retrieve the status-change history attached to one required customer membership ID. Use memberships_get for the current membership record or memberships_list when the membership ID must be discovered first. |
| `memberships_types_discounts_list` | read | Retrieve discounts configured for one known membership type ID. These are type-level benefits, not the tenant pricebook discount-and-fee catalog. |
| `memberships_types_duration_billing_list` | read | Retrieve duration and billing configurations under one required membership-type ID. Use this for plan-level term and billing choices; use memberships_types_get for the parent plan and memberships_list for customer memberships. |
| `memberships_types_get` | read | Retrieve a membership type by its ServiceTitan ID. Returns the single upstream record without pagination; use memberships_types_list to search when the ID is unknown. |
| `memberships_types_list` | read | List one requested page of membership-type definitions using IDs, active state, billing frequency, duration, and created or modified timestamps; includeDurationBilling controls embedded billing details. Use memberships_types_get for one known plan and memberships_list for memberships sold to customers. |
| `memberships_types_recurring_service_items_list` | read | Retrieve the recurring-service items configured under one required membership-type ID. Use memberships_types_get for the parent plan; use memberships_recurring_services_list for recurring services scheduled for customer locations. |
| `memberships_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a customer membership |
## payroll

| Tool | Operation | Description |
| --- | --- | --- |
| `payroll_employees_payrolls_list` | read | List one requested page of payroll periods for a required employee, with status, active-state, and date filters. Use payroll_payrolls_list for a tenant-wide search. |
| `payroll_gross_pay_items_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a gross pay item |
| `payroll_gross_pay_items_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a gross pay item |
| `payroll_gross_pay_items_list` | read | List one requested page of gross-pay line items, optionally scoped by employee, payroll IDs, or pay date range. Use this to inspect pay components rather than payroll-period summaries. |
| `payroll_gross_pay_items_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a gross pay item |
| `payroll_payroll_adjustments_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a payroll adjustment |
| `payroll_payroll_adjustments_get` | read | Retrieve one payroll adjustment by its required ID. Use payroll_payroll_adjustments_list to search when the ID is unknown. |
| `payroll_payroll_adjustments_list` | read | List one requested page of payroll adjustments, optionally filtered by employee IDs and posted timestamp. Use payroll_payroll_adjustments_get for one known adjustment ID. |
| `payroll_payroll_settings_employee_get` | read | Retrieve payroll settings for one employee by the required employee ID. Use payroll_payroll_settings_list to search across workers when the ID is unknown. |
| `payroll_payroll_settings_employee_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update payroll settings for an employee |
| `payroll_payroll_settings_list` | read | List one requested page of payroll-setting records across employees and technicians, with active, employee-type, created, and modified filters. Use the employee or technician get tool when a worker ID is known. |
| `payroll_payroll_settings_technician_get` | read | Retrieve payroll settings for one technician by the required technician ID. Use payroll_payroll_settings_list to search across workers when the ID is unknown. |
| `payroll_payroll_settings_technician_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update payroll settings for a technician |
| `payroll_payrolls_list` | read | List one requested page of payroll periods across employees, with employee type, status, active-state, and date filters. Use the employee- or technician-specific payroll tools when that worker ID is known. |
| `payroll_technicians_payrolls_list` | read | List one requested page of payroll periods for a required technician, with status, active-state, and date filters. Use payroll_payrolls_list for a tenant-wide search. |
| `payroll_timesheet_codes_get` | read | Retrieve one timesheet code by its required ID. Use payroll_timesheet_codes_list to search when the ID is unknown. |
| `payroll_timesheet_codes_list` | read | Retrieve one requested page of timesheet codes. Use the available filters to narrow results and request subsequent pages explicitly. |
| `payroll_timesheets_job_list` | read | List one requested page of timesheets attached to a required job. Use this when the job ID is known; use payroll_timesheets_jobs_list to search across optional comma-delimited job IDs. |
| `payroll_timesheets_jobs_list` | read | List one requested page of job timesheets across jobs, optionally filtered by comma-delimited job IDs. Use payroll_timesheets_job_list when retrieving timesheets for one required job. |
| `payroll_timesheets_non_job_list` | read | List one requested page of non-job timesheets, optionally filtered by employee, employee type, dates, or active state. These records are not attached to jobs; use the job timesheet tools for job labor. |
## people

| Tool | Operation | Description |
| --- | --- | --- |
| `people_employees_accountactions` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Run account actions for an employee |
| `people_employees_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create an employee |
| `people_employees_export` | read | Read the incremental employee export feed for People synchronization. This is the same feed as export_employees; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records. |
| `people_employees_get` | read | Retrieve one employee by its required ID. Use people_employees_list to search when the ID is unknown. |
| `people_employees_list` | read | List one requested page of employees, optionally filtered by IDs, user IDs, name, active state, or dates. Use the get tool for one known ID or the export feed for synchronization. |
| `people_employees_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update an employee |
| `people_gps_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Submit GPS pings from an external provider |
| `people_performance_get` | read | Retrieve one requested page of marketing performance metrics for a UTC period, segmented by campaign, ad group, or keyword. Use this to compare acquisition performance at one selected grain. |
| `people_technician_ratings_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update technician rating for a specific job |
| `people_technician_shifts_bulk_delete` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete multiple technician shifts |
| `people_technician_shifts_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a technician shift |
| `people_technician_shifts_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a technician shift |
| `people_technician_shifts_get` | read | Retrieve one technician shift by its required ID. Use people_technician_shifts_list to search when the shift ID is unknown. |
| `people_technician_shifts_list` | read | List one requested page of technician shifts, including normal, on-call, and time-off shifts. Filter by technician, time bounds, text, type, or active state; use the get tool for one known shift ID. |
| `people_technician_shifts_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a technician shift |
| `people_technicians_accountactions` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Run account actions for a technician |
| `people_technicians_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a technician |
| `people_technicians_get` | read | Retrieve one technician by its required ID. Use people_technicians_list to search when the technician ID is unknown. |
| `people_technicians_list` | read | List one requested page of technicians, optionally filtered by IDs, user IDs, name, active state, or dates. Use the get tool for one known ID or the export feed for synchronization. |
| `people_technicians_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a technician |
| `people_trucks_list` | read | List one requested page of inventory trucks, optionally filtered by IDs, active state, dates, or external-data mapping. externalDataKey and externalDataValues must be supplied together. |
| `people_trucks_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a truck |
## pricebook

| Tool | Operation | Description |
| --- | --- | --- |
| `pricebook_bulk_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create or import bulk pricebook operations |
| `pricebook_bulk_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update pricebook records in bulk |
| `pricebook_categories_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a pricebook category |
| `pricebook_categories_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a pricebook category |
| `pricebook_categories_get` | read | Retrieve a pricebook category by its ServiceTitan ID. Returns the single upstream record without pagination; use pricebook_categories_list to search when the ID is unknown. |
| `pricebook_categories_list` | read | List one requested page of pricebook categories using category type, active state, and created or modified timestamps. Use pricebook_categories_get for one known category ID; use the service, material, or equipment list tool for sellable items. |
| `pricebook_categories_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a pricebook category |
| `pricebook_discounts_fees_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a discount or fee |
| `pricebook_discounts_fees_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a discount or fee |
| `pricebook_discounts_fees_get` | read | Retrieve a discount or fee by its ServiceTitan ID. Returns the single upstream record without pagination; use pricebook_discounts_fees_list to search when the ID is unknown. |
| `pricebook_discounts_fees_list` | read | List one requested page of pricebook discount and fee items using IDs, active state, created or modified timestamps, and external-data mappings. Use pricebook_discounts_fees_get for a known item; membership-type discounts are a separate plan-level benefit. |
| `pricebook_discounts_fees_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a discount or fee |
| `pricebook_equipment_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete equipment item |
| `pricebook_equipment_get` | read | Retrieve equipment item by its ServiceTitan ID. Returns the single upstream record without pagination; use pricebook_equipment_list to search when the ID is unknown. |
| `pricebook_equipment_list` | read | List one requested page of equipment pricebook items using IDs, active state, created or modified timestamps, and external-data mappings. Use pricebook_equipment_get for a known pricebook item; use installed-equipment tools for equipment attached to customer locations. |
| `pricebook_equipment_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update equipment item |
| `pricebook_materials_cost_types_list` | read | List the material cost-type definitions available to pricebook material records; this operation has no filters or caller-managed paging. Use pricebook_materials_list for material items and inventory tools for stock transactions. |
| `pricebook_materials_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a material pricebook item |
| `pricebook_materials_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a material by ID |
| `pricebook_materials_get` | read | Retrieve a material by its ServiceTitan ID. Returns the single upstream record without pagination; use pricebook_materials_list to search when the ID is unknown. |
| `pricebook_materials_list` | read | List one requested page of material pricebook items using IDs, cost-type IDs, other-direct-cost state, active state, timestamps, and external-data mappings. Use pricebook_materials_get for a known item, pricebook_materials_cost_types_list for cost metadata, or inventory tools for stock movement. |
| `pricebook_materials_markup_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a material markup range |
| `pricebook_materials_markup_get` | read | Retrieve a material markup range by its ServiceTitan ID. Returns the single upstream record without pagination; use pricebook_materials_markup_list to search when the ID is unknown. |
| `pricebook_materials_markup_list` | read | List one requested page of configured material markup ranges using paging, sorting, and total-count controls. Use pricebook_materials_markup_get for a known range ID; use pricebook_materials_list for the material items those pricing rules affect. |
| `pricebook_materials_markup_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a material markup range |
| `pricebook_materials_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a material pricebook item |
| `pricebook_services_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a service pricebook item |
| `pricebook_services_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a service pricebook item |
| `pricebook_services_get` | read | Retrieve a service by its ServiceTitan ID. Returns the single upstream record without pagination; use pricebook_services_list to search when the ID is unknown. |
| `pricebook_services_list` | read | List one requested page of service pricebook items using IDs, active state, created or modified timestamps, and external-data mappings. Use pricebook_services_get for one known item; use estimates or invoices for services quoted or sold on customer transactions. |
| `pricebook_services_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a service pricebook item |
## reporting

| Tool | Operation | Description |
| --- | --- | --- |
| `reporting_dynamic_value_sets_get` | read | Resolve selectable values for a report dynamic-value-set identifier. Use values from the report definition to supply the required identifier and paging inputs when that report parameter offers dynamic choices. |
| `reporting_report_categories_list` | read | List one requested page of report categories with paging and total-count controls. Start here to discover a category ID, then use reporting_reports_list for reports in that category and reporting_reports_get for a report parameter definition. |
| `reporting_reports_data_create` | read | Execute one requested page of a known report and return the upstream report-data response. First inspect reporting_reports_get for that report's required parameter names, value types, and accepted formats; pass those entries in parameters, and use page, pageSize, and includeTotal to control this request. This generic reporting call is not subject to the intelligence tools' report scheduler or 65-second spacing. |
| `reporting_reports_get` | read | Retrieve one report definition from a known category and report ID, including its parameter contract. Use reporting_reports_list to discover reports and reporting_reports_data_create to execute the selected definition. |
| `reporting_reports_list` | read | List report definitions within a known report category. Use reporting_report_categories_list to discover category IDs, then use reporting_reports_get for one report definition before executing it. |
## scheduling

| Tool | Operation | Description |
| --- | --- | --- |
| `scheduling_appointment_assignments_assign_technicians` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Assign technicians to an appointment |
| `scheduling_appointment_assignments_list` | read | Find one page of technician-to-appointment assignments by assignment IDs, appointment IDs, job ID, active state, or creation and modification dates. Use dispatch_appointments_get or dispatch_appointments_list for the appointment records themselves; this tool returns the assignment relationships. |
| `scheduling_appointment_assignments_unassign_technicians` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Unassign technicians from appointments |
| `scheduling_business_hours_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create business hour configuration |
| `scheduling_business_hours_list` | read | Retrieve the tenant business-hours configuration used for scheduling availability. This returns configured hours rather than appointment records or calculated open capacity. |
| `scheduling_capacity_calculate` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Calculate available time slots for scheduling. Returns arrival windows with technician availability for the given business unit(s) within the time window. Note: this is a POST that does not mutate state; it is flagged 'write' due to the HTTP verb. |
| `scheduling_non_job_appointments_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a non-job appointment |
| `scheduling_non_job_appointments_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a non-job appointment |
| `scheduling_non_job_appointments_get` | read | Retrieve a non-job appointment by its ServiceTitan ID. Returns the single upstream record without pagination; use scheduling_non_job_appointments_list to search when the ID is unknown. |
| `scheduling_non_job_appointments_list` | read | List one requested page of non-job appointments using IDs, technician, timesheet code, schedule visibility, active state, start bounds, and created or modified timestamps. Use scheduling_non_job_appointments_get for a known appointment; use dispatch appointment tools for appointments attached to jobs. |
| `scheduling_non_job_appointments_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a non-job appointment |
| `scheduling_teams_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a team |
| `scheduling_teams_delete` | delete | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Delete a team |
| `scheduling_teams_get` | read | Retrieve a team by its ServiceTitan ID. Returns the single upstream record without pagination; use scheduling_teams_list to search when the ID is unknown. |
| `scheduling_teams_list` | read | List one requested page of scheduling teams using includeInactive and created or modified timestamp filters. Use scheduling_teams_get for one known team ID; use scheduling appointment assignments for technician-to-appointment assignments rather than team definitions. |
| `scheduling_zones_get` | read | Retrieve a zone by its ServiceTitan ID. Returns the single upstream record without pagination; use scheduling_zones_list to search when the ID is unknown. |
| `scheduling_zones_list` | read | List one requested page of scheduling zones using active state and created or modified timestamp filters. Use scheduling_zones_get for one known zone ID; use scheduling_business_hours_list for configured operating hours rather than geographic zone definitions. |
## settings

| Tool | Operation | Description |
| --- | --- | --- |
| `settings_activities_export` | read | Read the incremental timesheet-activity export feed for Settings workflows. This is the same feed as export_activities; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records. |
| `settings_activity_categories_export` | read | Read the incremental activity-category export feed for Settings synchronization. Use the list or get tools for filtered browsing or a known ID. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records. |
| `settings_activity_categories_get` | read | Retrieve one timesheet activity category by its required ID. Use settings_activity_categories_list to search when the ID is unknown. |
| `settings_activity_categories_list` | read | List one requested page of timesheet activity categories with active-state, date, and sort controls. Use the get tool for one known category or the export feed for synchronization. |
| `settings_activity_codes_export` | read | Read the incremental activity-code export feed for Settings workflows. This is the same feed as export_activity_codes; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records. |
| `settings_activity_codes_get` | read | Retrieve one payroll activity code by its required ID. Use settings_activity_codes_list to search when the ID is unknown. |
| `settings_activity_codes_list` | read | List one requested page of payroll activity codes with active-state, date, and sort controls. Use the get tool for one known code or the export feed for synchronization. |
| `settings_activity_types_get` | read | Retrieve one timesheet activity type by its required ID. Use settings_activity_types_list to search when the ID is unknown. |
| `settings_activity_types_list` | read | List one requested page of timesheet activity types with active-state, date, and sort controls. Use the get tool for one known type ID. |
| `settings_business_units_get` | read | Retrieve one business unit by its required ID. Use settings_business_units_list to search when the ID is unknown. |
| `settings_business_units_list` | read | List one requested page of business units, optionally filtered by IDs, name, active state, dates, or external-data application. Use the get tool for one known ID or the export feed for synchronization. |
| `settings_business_units_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a business unit |
| `settings_tag_types_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a tag type |
| `settings_tag_types_export` | read | Read the incremental tag-type export feed for Settings workflows. This is the same feed as export_tag_types; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records. |
| `settings_tag_types_list` | read | List one requested page of tag types with active-state, date, and sort controls. Use the export feed for incremental synchronization; this endpoint is for paginated browsing. |
| `settings_tag_types_update` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Update a tag type |
| `settings_tasks_create` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a task |
| `settings_tasks_create_subtask` | write | EXPERIMENTAL: This mutation has not been verified against a live ServiceTitan Integration environment. Create a subtask under an existing task |
| `settings_tasks_get` | read | Retrieve one task by its required ID. Use settings_tasks_list to search when the ID is unknown. |
| `settings_tasks_list` | read | List one requested page of employee tasks using status, assignment, related-record, date, priority, and other filters. Use settings_tasks_get for one known task ID; statuses is preferred over deprecated isClosed. |
| `settings_user_roles_list` | read | List one requested page of user roles, optionally filtered by IDs, name, active state, creation date, or employee type. Use this catalog to resolve role IDs and availability. |

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
