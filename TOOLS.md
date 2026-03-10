# Tool Catalog

Total tools: 440

## accounting

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `accounting_ap_credits_list` | `accounting` | `read` | List AP credits |
| `accounting_ap_credits_mark_as_exported` | `accounting` | `write` | Mark AP credits as exported |
| `accounting_ap_payments_list` | `accounting` | `read` | List AP payments |
| `accounting_ap_payments_mark_as_exported` | `accounting` | `write` | Mark AP payments as exported |
| `accounting_gl_account_types_list` | `accounting` | `read` | List GL account types |
| `accounting_gl_accounts_create` | `accounting` | `write` | Create a GL account |
| `accounting_gl_accounts_get` | `accounting` | `read` | Get a GL account by ID |
| `accounting_gl_accounts_list` | `accounting` | `read` | List GL accounts |
| `accounting_gl_accounts_update` | `accounting` | `write` | Patch a GL account |
| `accounting_invoice_items_delete` | `accounting` | `delete` | Delete an invoice item |
| `accounting_invoice_items_update` | `accounting` | `write` | Patch invoice items |
| `accounting_invoices_create_adjustment` | `accounting` | `write` | Create an adjustment invoice |
| `accounting_invoices_custom_field_types_list` | `accounting` | `read` | List invoice custom field types |
| `accounting_invoices_list` | `accounting` | `read` | List invoices |
| `accounting_invoices_mark_as_exported` | `accounting` | `write` | Mark invoices as exported |
| `accounting_invoices_update` | `accounting` | `write` | Patch an invoice |
| `accounting_invoices_update_custom_fields` | `accounting` | `write` | Update invoice custom fields |
| `accounting_journal_entries_get_details` | `accounting` | `read` | Get journal entry detail rows |
| `accounting_journal_entries_get_summary` | `accounting` | `read` | Get journal entry summary rows |
| `accounting_journal_entries_list` | `accounting` | `read` | List journal entries |
| `accounting_journal_entries_sync_update` | `accounting` | `write` | Trigger journal entry sync update |
| `accounting_journal_entries_update` | `accounting` | `write` | Patch a journal entry |
| `accounting_payment_terms_get` | `accounting` | `read` | Get a payment term by ID |
| `accounting_payment_terms_list` | `accounting` | `read` | List payment terms |
| `accounting_payment_types_get` | `accounting` | `read` | Get a payment type by ID |
| `accounting_payment_types_list` | `accounting` | `read` | List payment types |
| `accounting_payments_create` | `accounting` | `write` | Create a payment |
| `accounting_payments_custom_field_types_list` | `accounting` | `read` | List payment custom field types |
| `accounting_payments_list` | `accounting` | `read` | List payments |
| `accounting_payments_update` | `accounting` | `write` | Patch a payment |
| `accounting_payments_update_custom_fields` | `accounting` | `write` | Update payment custom fields |
| `accounting_payments_update_status` | `accounting` | `write` | Update payment statuses |
| `accounting_tax_zones_list` | `accounting` | `read` | List tax zones |

## crm

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `crm_booking_provider_tags_create` | `crm` | `write` | Create a booking provider tag |
| `crm_booking_provider_tags_get` | `crm` | `read` | Get a booking provider tag by ID |
| `crm_booking_provider_tags_list` | `crm` | `read` | List booking provider tags |
| `crm_booking_provider_tags_update` | `crm` | `write` | Patch a booking provider tag |
| `crm_bookings_contacts_list` | `crm` | `read` | List contacts for a booking |
| `crm_bookings_get` | `crm` | `read` | Get a booking by ID |
| `crm_bookings_get_contact_list2` | `crm` | `read` | List contacts for a provider-scoped booking (legacy naming) |
| `crm_bookings_list` | `crm` | `read` | List bookings |
| `crm_bookings_provider_contacts_create` | `crm` | `write` | Create a contact on a provider-scoped booking |
| `crm_bookings_provider_contacts_list` | `crm` | `read` | List contacts for a provider-scoped booking |
| `crm_bookings_provider_contacts_update` | `crm` | `write` | Patch a provider-scoped booking contact |
| `crm_bookings_provider_create` | `crm` | `write` | Create a booking for a booking provider |
| `crm_bookings_provider_get` | `crm` | `read` | Get a provider-scoped booking |
| `crm_bookings_provider_list` | `crm` | `read` | List bookings for a booking provider |
| `crm_bookings_provider_update` | `crm` | `write` | Patch a provider-scoped booking |
| `crm_bookings_updatebookingcontact` | `crm` | `write` | Patch a provider-scoped booking contact (legacy naming) |
| `crm_bulk_tags_add_tags` | `crm` | `write` | Add bulk tags |
| `crm_bulk_tags_remove_tags` | `crm` | `delete` | Remove bulk tags |
| `crm_contact_methods_create` | `crm` | `write` | Create a contact method |
| `crm_contact_methods_delete` | `crm` | `delete` | Delete a contact method |
| `crm_contact_methods_get` | `crm` | `read` | Get a contact method |
| `crm_contact_methods_list` | `crm` | `read` | List contact methods for a contact |
| `crm_contact_methods_update` | `crm` | `write` | Patch a contact method |
| `crm_contact_methods_upsert` | `crm` | `write` | Replace a contact method |
| `crm_contact_relationships_create` | `crm` | `write` | Create a contact relationship |
| `crm_contact_relationships_delete` | `crm` | `delete` | Delete a contact relationship |
| `crm_contact_relationships_list` | `crm` | `read` | List relationships for a contact |
| `crm_contacts_by_relationship_list` | `crm` | `read` | List contacts by relationship ID |
| `crm_contacts_create` | `crm` | `write` | Create a contact |
| `crm_contacts_delete` | `crm` | `delete` | Delete a contact |
| `crm_contacts_get` | `crm` | `read` | Get a contact by ID |
| `crm_contacts_list` | `crm` | `read` | List contacts |
| `crm_contacts_replace` | `crm` | `write` | Replace a contact |
| `crm_contacts_update` | `crm` | `write` | Patch a contact |
| `crm_customer_memberships_create` | `crm` | `write` | Create a customer membership |
| `crm_customer_memberships_custom_fields_list` | `crm` | `read` | List customer membership custom fields |
| `crm_customer_memberships_get` | `crm` | `read` | Get a customer membership by ID |
| `crm_customer_memberships_list` | `crm` | `read` | List customer memberships |
| `crm_customer_memberships_status_changes_list` | `crm` | `read` | List status changes for a customer membership |
| `crm_customer_memberships_update` | `crm` | `write` | Patch a customer membership |
| `crm_customers_contacts_create` | `crm` | `write` | Create a customer contact |
| `crm_customers_contacts_delete` | `crm` | `delete` | Delete a customer contact |
| `crm_customers_contacts_list` | `crm` | `read` | List customer contacts |
| `crm_customers_contacts_modified_list` | `crm` | `read` | List customer contacts modified in a time range |
| `crm_customers_create` | `crm` | `write` | Create a customer |
| `crm_customers_custom_field_types_list` | `crm` | `read` | List customer custom field types |
| `crm_customers_delete_note` | `crm` | `delete` | Delete a customer note (legacy naming) |
| `crm_customers_delete_tag` | `crm` | `delete` | Delete a tag assignment from a customer (legacy naming) |
| `crm_customers_get` | `crm` | `read` | Get a customer by ID |
| `crm_customers_list` | `crm` | `read` | List customers |
| `crm_customers_notes_create` | `crm` | `write` | Create a note for a customer |
| `crm_customers_notes_delete` | `crm` | `delete` | Delete a customer note |
| `crm_customers_notes_list` | `crm` | `read` | List notes for a customer |
| `crm_customers_tags_create` | `crm` | `write` | Create a tag assignment for a customer |
| `crm_customers_tags_delete` | `crm` | `delete` | Delete a tag assignment from a customer |
| `crm_customers_update` | `crm` | `write` | Patch a customer |
| `crm_leads_create` | `crm` | `write` | Create a lead |
| `crm_leads_dismiss` | `crm` | `write` | Dismiss a lead |
| `crm_leads_follow_ups_create` | `crm` | `write` | Create a follow-up for a lead |
| `crm_leads_form_submit` | `crm` | `write` | Submit a lead form |
| `crm_leads_get` | `crm` | `read` | Get a lead by ID |
| `crm_leads_list` | `crm` | `read` | List leads |
| `crm_leads_notes_create` | `crm` | `write` | Create a note for a lead |
| `crm_leads_notes_list` | `crm` | `read` | List notes for a lead |
| `crm_leads_update` | `crm` | `write` | Patch a lead |
| `crm_location_labor_types_list` | `crm` | `read` | List location labor types by locations |
| `crm_location_recurring_service_events_list` | `crm` | `read` | List location recurring service events |
| `crm_location_recurring_service_events_mark_complete` | `crm` | `write` | Mark a recurring service event complete |
| `crm_location_recurring_service_events_mark_incomplete` | `crm` | `write` | Mark a recurring service event incomplete |
| `crm_location_recurring_services_get` | `crm` | `read` | Get a location recurring service by ID |
| `crm_location_recurring_services_list` | `crm` | `read` | List location recurring services |
| `crm_location_recurring_services_update` | `crm` | `write` | Patch a location recurring service |
| `crm_locations_contacts_create` | `crm` | `write` | Create a contact for a location |
| `crm_locations_contacts_delete` | `crm` | `delete` | Delete a location contact |
| `crm_locations_contacts_list` | `crm` | `read` | List contacts for a location |
| `crm_locations_contacts_modified_list` | `crm` | `read` | List location contacts modified in a time range |
| `crm_locations_contacts_update` | `crm` | `write` | Patch a location contact |
| `crm_locations_create` | `crm` | `write` | Create a location |
| `crm_locations_custom_field_types_list` | `crm` | `read` | List location custom field types |
| `crm_locations_get` | `crm` | `read` | Get a location by ID |
| `crm_locations_list` | `crm` | `read` | List locations |
| `crm_locations_notes_create` | `crm` | `write` | Create a note for a location |
| `crm_locations_notes_delete` | `crm` | `delete` | Delete a location note |
| `crm_locations_notes_list` | `crm` | `read` | List notes for a location |
| `crm_locations_tags_create` | `crm` | `write` | Create a tag assignment for a location |
| `crm_locations_tags_delete` | `crm` | `delete` | Delete a tag assignment from a location |
| `crm_locations_update` | `crm` | `write` | Patch a location |

## dispatch

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `dispatch_appointments_confirm` | `dispatch` | `write` | Confirm an appointment |
| `dispatch_appointments_create` | `dispatch` | `write` | Create an appointment |
| `dispatch_appointments_delete` | `dispatch` | `delete` | Delete an appointment by ID |
| `dispatch_appointments_get` | `dispatch` | `read` | Get an appointment by ID |
| `dispatch_appointments_hold` | `dispatch` | `write` | Put an appointment on hold |
| `dispatch_appointments_list` | `dispatch` | `read` | List appointments |
| `dispatch_appointments_reschedule` | `dispatch` | `write` | Reschedule an appointment |
| `dispatch_appointments_unconfirm` | `dispatch` | `delete` | Remove appointment confirmation |
| `dispatch_appointments_unhold` | `dispatch` | `delete` | Remove hold from an appointment |
| `dispatch_appointments_update_special_instructions` | `dispatch` | `write` | Update appointment special instructions |
| `dispatch_arrival_window_configuration_get` | `dispatch` | `read` | Get arrival window configuration |
| `dispatch_arrival_window_configuration_update` | `dispatch` | `write` | Update arrival window configuration |
| `dispatch_arrival_windows_activate` | `dispatch` | `write` | Activate an arrival window |
| `dispatch_arrival_windows_create` | `dispatch` | `write` | Create a new arrival window |
| `dispatch_arrival_windows_get` | `dispatch` | `read` | Get an arrival window by ID |
| `dispatch_arrival_windows_list` | `dispatch` | `read` | List arrival windows |
| `dispatch_arrival_windows_update` | `dispatch` | `write` | Update an arrival window |
| `dispatch_call_reasons_list` | `dispatch` | `read` | List call reasons |
| `dispatch_form_submissions_list` | `dispatch` | `read` | List form submissions |
| `dispatch_forms_list` | `dispatch` | `read` | List forms |
| `dispatch_images_create` | `dispatch` | `write` | Create an image placeholder |
| `dispatch_images_get` | `dispatch` | `read` | Get image metadata by storage path |
| `dispatch_installed_equipment_attachments_create` | `dispatch` | `write` | Upload an installed equipment attachment |
| `dispatch_installed_equipment_attachments_get` | `dispatch` | `read` | Get installed equipment attachment metadata by storage path |
| `dispatch_installed_equipment_create` | `dispatch` | `write` | Create installed equipment |
| `dispatch_installed_equipment_delete` | `dispatch` | `delete` | Delete installed equipment |
| `dispatch_installed_equipment_get` | `dispatch` | `read` | Get installed equipment by ID |
| `dispatch_installed_equipment_list` | `dispatch` | `read` | List installed equipment |
| `dispatch_installed_equipment_update` | `dispatch` | `write` | Update installed equipment |
| `dispatch_job_cancel_reasons_list` | `dispatch` | `read` | List job cancel reasons |
| `dispatch_job_hold_reasons_list` | `dispatch` | `read` | List job hold reasons |
| `dispatch_job_splits_by_jobs_list` | `dispatch` | `read` | List splits filtered by one or more jobs |
| `dispatch_job_splits_list` | `dispatch` | `read` | List splits for a single job |
| `dispatch_job_types_create` | `dispatch` | `write` | Create a job type |
| `dispatch_job_types_delete` | `dispatch` | `delete` | Delete a job type |
| `dispatch_job_types_get` | `dispatch` | `read` | Get a job type by ID |
| `dispatch_job_types_list` | `dispatch` | `read` | List job types |
| `dispatch_job_types_update` | `dispatch` | `write` | Update a job type |
| `dispatch_jobs_booked_log_get` | `dispatch` | `read` | Get booked log details for a job |
| `dispatch_jobs_cancel` | `dispatch` | `write` | Cancel a job |
| `dispatch_jobs_cancel_reasons_list` | `dispatch` | `read` | List cancel reasons available for jobs |
| `dispatch_jobs_canceled_logs_list` | `dispatch` | `read` | List canceled log entries for a job |
| `dispatch_jobs_complete` | `dispatch` | `write` | Complete a job |
| `dispatch_jobs_create` | `dispatch` | `write` | Create a job |
| `dispatch_jobs_create_attachment` | `dispatch` | `write` | Attach a file to a job |
| `dispatch_jobs_custom_field_types_list` | `dispatch` | `read` | List job custom field types |
| `dispatch_jobs_get` | `dispatch` | `read` | Get a job by ID |
| `dispatch_jobs_get_attachment` | `dispatch` | `read` | Get a job attachment by ID |
| `dispatch_jobs_history_get` | `dispatch` | `read` | Get history for a job |
| `dispatch_jobs_hold` | `dispatch` | `write` | Put a job on hold |
| `dispatch_jobs_list` | `dispatch` | `read` | List jobs |
| `dispatch_jobs_list_attachments` | `dispatch` | `read` | List attachments for a job |
| `dispatch_jobs_messages_create` | `dispatch` | `write` | Create a message for a job |
| `dispatch_jobs_notes_create` | `dispatch` | `write` | Create a note for a job |
| `dispatch_jobs_notes_list` | `dispatch` | `read` | List notes for a job |
| `dispatch_jobs_remove_cancellation` | `dispatch` | `write` | Remove cancellation from a job |
| `dispatch_jobs_update` | `dispatch` | `write` | Update a job |
| `dispatch_project_statuses_get` | `dispatch` | `read` | Get a project status by ID |
| `dispatch_project_statuses_list` | `dispatch` | `read` | List project statuses |
| `dispatch_project_sub_statuses_get` | `dispatch` | `read` | Get a project sub-status by ID |
| `dispatch_project_sub_statuses_list` | `dispatch` | `read` | List project sub-statuses |
| `dispatch_project_types_get` | `dispatch` | `read` | Get a project type by ID |
| `dispatch_project_types_list` | `dispatch` | `read` | List project types |
| `dispatch_projects_attach_job` | `dispatch` | `write` | Attach a job to a project |
| `dispatch_projects_create` | `dispatch` | `write` | Create a project |
| `dispatch_projects_custom_field_types_list` | `dispatch` | `read` | List project custom field types |
| `dispatch_projects_delete` | `dispatch` | `delete` | Delete a project |
| `dispatch_projects_detach_job` | `dispatch` | `write` | Detach a job from a project |
| `dispatch_projects_get` | `dispatch` | `read` | Get a project by ID |
| `dispatch_projects_list` | `dispatch` | `read` | List projects |
| `dispatch_projects_messages_create` | `dispatch` | `write` | Create a message for a project |
| `dispatch_projects_notes_create` | `dispatch` | `write` | Create a note for a project |
| `dispatch_projects_notes_list` | `dispatch` | `read` | List notes for a project |
| `dispatch_projects_update` | `dispatch` | `write` | Update a project |

## estimates

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `estimates_create` | `estimates` | `write` | Create a new estimate |
| `estimates_delete_item` | `estimates` | `delete` | Delete a single item from an estimate |
| `estimates_dismiss` | `estimates` | `write` | Dismiss an estimate |
| `estimates_export_estimates` | `estimates` | `read` | Export estimates |
| `estimates_get` | `estimates` | `read` | Get a single estimate by ID |
| `estimates_get_items` | `estimates` | `read` | List estimate items with optional filters |
| `estimates_items_delete` | `estimates` | `delete` | Delete a single item from an estimate |
| `estimates_items_list` | `estimates` | `read` | List estimate items with optional filters |
| `estimates_items_update` | `estimates` | `write` | Add or replace an item collection on an estimate |
| `estimates_list` | `estimates` | `read` | List estimates with filters |
| `estimates_put_item` | `estimates` | `write` | Add or replace an item collection on an estimate |
| `estimates_sell` | `estimates` | `write` | Mark an estimate as sold |
| `estimates_unsell` | `estimates` | `write` | Revert an estimate from sold status |
| `estimates_update` | `estimates` | `write` | Update an existing estimate |

## intelligence

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `intel_campaign_performance` | `intelligence` | `read` | Marketing campaign performance summary with calls, bookings, conversion rate, revenue, and revenue per call |
| `intel_csr_performance` | `intelligence` | `read` | CSR booking performance using Job Detail By CSR with booked jobs, revenue, average ticket, campaign mix, job type mix, and team averages |
| `intel_daily_snapshot` | `intelligence` | `read` | Daily operational snapshot with appointments, job progress, revenue to-date, call outcomes, next-day upcoming jobs, and plain-English highlights |
| `intel_estimate_pipeline` | `intelligence` | `read` | Estimate pipeline summary with open/sold/dismissed funnel, conversion rate, close speed, age buckets, and stale opportunities |
| `intel_invoice_tracking` | `intelligence` | `read` | Invoice email tracking with sent vs not-sent counts, send rate, dollar impact, and unsent breakdown by business unit and technician |
| `intel_labor_cost` | `intelligence` | `read` | Labor cost summary from the Master Pay File with employee hours, gross pay, hourly rates, activity mix, and business unit breakdown |
| `intel_lookup` | `intelligence` | `read` | Look up reference data (technicians, business units, payment types, membership types).  |
| `intel_membership_health` | `intelligence` | `read` | Membership health summary with active counts, signups, cancellations, renewals, retention rate, total invoiced revenue, and business-unit membership conversion metrics |
| `intel_revenue_summary` | `intelligence` | `read` | Revenue summary using ServiceTitan's native reporting engine (matches the ST dashboard). Returns total revenue, breakdown by business unit (completed, non-job, adjustment), collections, outstanding balance, opportunities, conversion rates, plus BU-level productivity and sales metrics. |
| `intel_technician_scorecard` | `intelligence` | `read` | Technician performance scorecard using ServiceTitan reports for completed jobs, revenue, opportunities, conversion, productivity, lead generation, memberships, sales from tech leads, sales from marketing leads, and team averages |

## inventory

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `inventory_purchase_order_markups_create` | `inventory` | `write` | Create a purchase order markup |
| `inventory_purchase_order_markups_delete` | `inventory` | `delete` | Delete a purchase order markup |
| `inventory_purchase_order_markups_get` | `inventory` | `read` | Get a purchase order markup by ID |
| `inventory_purchase_order_markups_list` | `inventory` | `read` | List purchase order markups |
| `inventory_purchase_order_markups_update` | `inventory` | `write` | Update a purchase order markup |
| `inventory_purchase_order_types_create` | `inventory` | `write` | Create a purchase order type |
| `inventory_purchase_order_types_list` | `inventory` | `read` | List purchase order types |
| `inventory_purchase_order_types_update` | `inventory` | `write` | Update a purchase order type |
| `inventory_purchase_orders_approve_request` | `inventory` | `write` | Approve a purchase order request |
| `inventory_purchase_orders_cancel` | `inventory` | `write` | Cancel a purchase order |
| `inventory_purchase_orders_create` | `inventory` | `write` | Create a purchase order |
| `inventory_purchase_orders_get` | `inventory` | `read` | Get a purchase order by ID |
| `inventory_purchase_orders_list` | `inventory` | `read` | List purchase orders |
| `inventory_purchase_orders_reject_request` | `inventory` | `write` | Reject a purchase order request |
| `inventory_purchase_orders_requests_list` | `inventory` | `read` | List purchase order requests |
| `inventory_purchase_orders_update` | `inventory` | `write` | Update a purchase order |
| `inventory_receipts_cancel` | `inventory` | `write` | Cancel a receipt |
| `inventory_receipts_create` | `inventory` | `write` | Create a receipt |
| `inventory_receipts_list` | `inventory` | `read` | List receipts |
| `inventory_receipts_update_custom_fields` | `inventory` | `write` | Update receipt custom fields |
| `inventory_return_types_create` | `inventory` | `write` | Create a return type |
| `inventory_return_types_list` | `inventory` | `read` | List return types |
| `inventory_return_types_update` | `inventory` | `write` | Update a return type |
| `inventory_returns_cancel` | `inventory` | `write` | Cancel a return |
| `inventory_returns_create` | `inventory` | `write` | Create a return |
| `inventory_returns_list` | `inventory` | `read` | List returns |
| `inventory_returns_update` | `inventory` | `write` | Update a return |
| `inventory_returns_update_custom_fields` | `inventory` | `write` | Update return custom fields |
| `inventory_transfers_list` | `inventory` | `read` | List transfers |
| `inventory_transfers_update` | `inventory` | `write` | Update a transfer |
| `inventory_transfers_update_custom_fields` | `inventory` | `write` | Update transfer custom fields |
| `inventory_vendors_create` | `inventory` | `write` | Create a vendor |
| `inventory_vendors_get` | `inventory` | `read` | Get a vendor by ID |
| `inventory_vendors_list` | `inventory` | `read` | List vendors |
| `inventory_vendors_update` | `inventory` | `write` | Update a vendor |
| `inventory_warehouses_list` | `inventory` | `read` | List warehouses |
| `inventory_warehouses_update` | `inventory` | `write` | Update a warehouse |

## marketing

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `marketing_attributed_leads_get` | `marketing` | `read` | Get attributed leads |
| `marketing_call_reasons_get` | `marketing` | `read` | List call reasons |
| `marketing_calls_get` | `marketing` | `read` | Get call details by ID (v2) |
| `marketing_calls_recording_get` | `marketing` | `read` | Get call recording metadata or payload (v2) |
| `marketing_calls_update` | `marketing` | `write` | Update a call (v2) |
| `marketing_calls_v2_list` | `marketing` | `read` | List calls from v2 calls endpoint |
| `marketing_calls_v3_list` | `marketing` | `read` | List calls from v3 calls endpoint |
| `marketing_calls_voice_mail_get` | `marketing` | `read` | Get call voicemail metadata or payload (v2) |
| `marketing_campaign_categories_create` | `marketing` | `write` | Create a campaign category |
| `marketing_campaign_categories_delete` | `marketing` | `delete` | Delete a campaign category |
| `marketing_campaign_categories_get` | `marketing` | `read` | Get a campaign category by ID |
| `marketing_campaign_categories_update` | `marketing` | `write` | Update a campaign category |
| `marketing_campaign_costs_create` | `marketing` | `write` | Create a campaign cost |
| `marketing_campaign_costs_delete` | `marketing` | `delete` | Delete a campaign cost |
| `marketing_campaign_costs_get` | `marketing` | `read` | Get a campaign cost by ID |
| `marketing_campaign_costs_update` | `marketing` | `write` | Update a campaign cost |
| `marketing_campaigns_costs_list` | `marketing` | `read` | List costs for a campaign |
| `marketing_campaigns_create` | `marketing` | `write` | Create a campaign |
| `marketing_campaigns_get` | `marketing` | `read` | Get a campaign by ID |
| `marketing_campaigns_list` | `marketing` | `read` | List campaigns |
| `marketing_campaigns_update` | `marketing` | `write` | Update a campaign |
| `marketing_client_side_data_get` | `marketing` | `read` | Get marketing client-side data |
| `marketing_client_specific_pricing_get_all_rate_sheets` | `marketing` | `read` | List all client-specific pricing rate sheets |
| `marketing_client_specific_pricing_update_rate_sheet` | `marketing` | `write` | Update a client-specific pricing rate sheet |
| `marketing_reviews` | `marketing` | `read` | List marketing reviews |
| `marketing_scheduler_scheduler_performance` | `marketing` | `read` | Get scheduler performance |
| `marketing_scheduler_schedulers` | `marketing` | `read` | List schedulers |
| `marketing_scheduler_schedulersessions` | `marketing` | `read` | List scheduler sessions |
| `marketing_suppressions_add` | `marketing` | `write` | Add a suppression |
| `marketing_suppressions_get` | `marketing` | `read` | Get a suppression by email |
| `marketing_suppressions_remove` | `marketing` | `write` | Remove suppression records |

## memberships

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `memberships_create` | `memberships` | `write` | Create a customer membership sale |
| `memberships_custom_fields_list` | `memberships` | `read` | List membership custom field definitions |
| `memberships_get` | `memberships` | `read` | Get a single customer membership by ID |
| `memberships_list` | `memberships` | `read` | List customer memberships |
| `memberships_recurring_service_events_list` | `memberships` | `read` | List recurring service events |
| `memberships_recurring_service_events_mark_complete` | `memberships` | `write` | Mark a recurring service event as complete |
| `memberships_recurring_service_events_mark_incomplete` | `memberships` | `write` | Mark a recurring service event as incomplete |
| `memberships_recurring_service_types_get` | `memberships` | `read` | Get a recurring service type by ID |
| `memberships_recurring_service_types_list` | `memberships` | `read` | List recurring service types |
| `memberships_recurring_services_get` | `memberships` | `read` | Get a recurring service by ID |
| `memberships_recurring_services_list` | `memberships` | `read` | List recurring services |
| `memberships_recurring_services_update` | `memberships` | `write` | Update a recurring service |
| `memberships_service_agreements_get` | `memberships` | `read` | Get a service agreement by ID |
| `memberships_service_agreements_list` | `memberships` | `read` | List service agreements |
| `memberships_status_changes_list` | `memberships` | `read` | List status changes for a customer membership |
| `memberships_types_discounts_list` | `memberships` | `read` | List discounts for a membership type |
| `memberships_types_duration_billing_list` | `memberships` | `read` | List duration billing items for a membership type |
| `memberships_types_get` | `memberships` | `read` | Get a membership type by ID |
| `memberships_types_list` | `memberships` | `read` | List membership types |
| `memberships_types_recurring_service_items_list` | `memberships` | `read` | List recurring service items for a membership type |
| `memberships_update` | `memberships` | `write` | Update a customer membership |

## payroll

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `payroll_employees_payrolls_list` | `payroll` | `read` | List payroll periods for an employee |
| `payroll_gross_pay_items_create` | `payroll` | `write` | Create a gross pay item |
| `payroll_gross_pay_items_delete` | `payroll` | `delete` | Delete a gross pay item |
| `payroll_gross_pay_items_list` | `payroll` | `read` | List gross pay items |
| `payroll_gross_pay_items_update` | `payroll` | `write` | Update a gross pay item |
| `payroll_payroll_adjustments_create` | `payroll` | `write` | Create a payroll adjustment |
| `payroll_payroll_adjustments_get` | `payroll` | `read` | Get a payroll adjustment by ID |
| `payroll_payroll_adjustments_list` | `payroll` | `read` | List payroll adjustments |
| `payroll_payroll_settings_employee_get` | `payroll` | `read` | Get payroll settings for an employee |
| `payroll_payroll_settings_employee_update` | `payroll` | `write` | Update payroll settings for an employee |
| `payroll_payroll_settings_list` | `payroll` | `read` | List payroll settings |
| `payroll_payroll_settings_technician_get` | `payroll` | `read` | Get payroll settings for a technician |
| `payroll_payroll_settings_technician_update` | `payroll` | `write` | Update payroll settings for a technician |
| `payroll_payrolls_get` | `payroll` | `read` | Get a payroll period by ID |
| `payroll_payrolls_list` | `payroll` | `read` | List payroll periods |
| `payroll_technicians_payrolls_list` | `payroll` | `read` | List payroll periods for a technician |
| `payroll_timesheet_codes_get` | `payroll` | `read` | Get a timesheet code by ID |
| `payroll_timesheet_codes_list` | `payroll` | `read` | List timesheet codes |
| `payroll_timesheets_create_job` | `payroll` | `write` | Create a job timesheet |
| `payroll_timesheets_job_list` | `payroll` | `read` | List job timesheets for a job |
| `payroll_timesheets_job_update` | `payroll` | `write` | Update a job timesheet |
| `payroll_timesheets_jobs_list` | `payroll` | `read` | List job timesheets across multiple jobs |
| `payroll_timesheets_non_job_create` | `payroll` | `write` | Create a non-job timesheet |
| `payroll_timesheets_non_job_delete` | `payroll` | `delete` | Delete a non-job timesheet |
| `payroll_timesheets_non_job_get` | `payroll` | `read` | Get a non-job timesheet by ID |
| `payroll_timesheets_non_job_list` | `payroll` | `read` | List non-job timesheets |
| `payroll_timesheets_non_job_update` | `payroll` | `write` | Update a non-job timesheet |

## people

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `people_employees_accountactions` | `people` | `write` | Run account actions for an employee |
| `people_employees_create` | `people` | `write` | Create an employee |
| `people_employees_export` | `people` | `read` | Export employees |
| `people_employees_get` | `people` | `read` | Get an employee by ID |
| `people_employees_list` | `people` | `read` | List employees |
| `people_employees_update` | `people` | `write` | Update an employee |
| `people_gps_create` | `people` | `write` | Submit GPS pings from an external provider |
| `people_performance_get` | `people` | `read` | Get performance segmented by campaign/ad group/keyword |
| `people_technician_ratings_update` | `people` | `write` | Update technician rating for a specific job |
| `people_technician_shifts_bulk_delete` | `people` | `write` | Delete multiple technician shifts |
| `people_technician_shifts_create` | `people` | `write` | Create a technician shift |
| `people_technician_shifts_delete` | `people` | `delete` | Delete a technician shift |
| `people_technician_shifts_get` | `people` | `read` | Get a technician shift by ID |
| `people_technician_shifts_list` | `people` | `read` | List technician shifts |
| `people_technician_shifts_update` | `people` | `write` | Update a technician shift |
| `people_technicians_accountactions` | `people` | `write` | Run account actions for a technician |
| `people_technicians_create` | `people` | `write` | Create a technician |
| `people_technicians_get` | `people` | `read` | Get a technician by ID |
| `people_technicians_list` | `people` | `read` | List technicians |
| `people_technicians_update` | `people` | `write` | Update a technician |
| `people_trucks_list` | `people` | `read` | List trucks |
| `people_trucks_update` | `people` | `write` | Update a truck |

## pricebook

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `pricebook_bulk_create` | `pricebook` | `write` | Create or import bulk pricebook operations |
| `pricebook_bulk_update` | `pricebook` | `write` | Update pricebook records in bulk |
| `pricebook_categories_create` | `pricebook` | `write` | Create a pricebook category |
| `pricebook_categories_delete` | `pricebook` | `delete` | Delete a pricebook category |
| `pricebook_categories_get` | `pricebook` | `read` | Get a pricebook category by ID |
| `pricebook_categories_list` | `pricebook` | `read` | List pricebook categories |
| `pricebook_categories_update` | `pricebook` | `write` | Update a pricebook category |
| `pricebook_discounts_fees_create` | `pricebook` | `write` | Create a discount or fee |
| `pricebook_discounts_fees_delete` | `pricebook` | `delete` | Delete a discount or fee |
| `pricebook_discounts_fees_get` | `pricebook` | `read` | Get a discount or fee by ID |
| `pricebook_discounts_fees_list` | `pricebook` | `read` | List discounts and fees |
| `pricebook_discounts_fees_update` | `pricebook` | `write` | Update a discount or fee |
| `pricebook_equipment_delete` | `pricebook` | `delete` | Delete equipment item |
| `pricebook_equipment_get` | `pricebook` | `read` | Get equipment item by ID |
| `pricebook_equipment_list` | `pricebook` | `read` | List equipment pricebook items |
| `pricebook_equipment_update` | `pricebook` | `write` | Update equipment item |
| `pricebook_images_create` | `pricebook` | `write` | Create a new pricebook image placeholder |
| `pricebook_images_get` | `pricebook` | `read` | Get pricebook images by storage path |
| `pricebook_materials_cost_types_list` | `pricebook` | `read` | List material cost types |
| `pricebook_materials_create` | `pricebook` | `write` | Create a material pricebook item |
| `pricebook_materials_delete` | `pricebook` | `delete` | Delete a material by ID |
| `pricebook_materials_get` | `pricebook` | `read` | Get a material by ID |
| `pricebook_materials_list` | `pricebook` | `read` | List material pricebook items |
| `pricebook_materials_markup_create` | `pricebook` | `write` | Create a material markup range |
| `pricebook_materials_markup_get` | `pricebook` | `read` | Get a material markup range by ID |
| `pricebook_materials_markup_list` | `pricebook` | `read` | List material markup ranges |
| `pricebook_materials_markup_update` | `pricebook` | `write` | Update a material markup range |
| `pricebook_materials_update` | `pricebook` | `write` | Update a material pricebook item |
| `pricebook_services_create` | `pricebook` | `write` | Create a service pricebook item |
| `pricebook_services_delete` | `pricebook` | `delete` | Delete a service pricebook item |
| `pricebook_services_get` | `pricebook` | `read` | Get a service by ID |
| `pricebook_services_list` | `pricebook` | `read` | List service pricebook items |
| `pricebook_services_update` | `pricebook` | `write` | Update a service pricebook item |

## reporting

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `reporting_dynamic_value_sets_get` | `reporting` | `read` | Get values from a dynamic value set |
| `reporting_report_categories_list` | `reporting` | `read` | List report categories |
| `reporting_reports_data_create` | `reporting` | `read` | Fetch report data rows. Use the report definition to discover required parameters. Date parameters use YYYY-MM-DD format. |
| `reporting_reports_get` | `reporting` | `read` | Get a report definition in a category |
| `reporting_reports_list` | `reporting` | `read` | List reports in a report category |

## scheduling

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `scheduling_appointment_assignments_assign_technicians` | `scheduling` | `write` | Assign technicians to appointments |
| `scheduling_appointment_assignments_list` | `scheduling` | `read` | List appointment assignments |
| `scheduling_appointment_assignments_unassign_technicians` | `scheduling` | `write` | Unassign technicians from appointments |
| `scheduling_business_hours_create` | `scheduling` | `write` | Create business hour configuration |
| `scheduling_business_hours_list` | `scheduling` | `read` | Get business hour configuration |
| `scheduling_capacity_calculate` | `scheduling` | `write` | Calculate capacity for scheduling |
| `scheduling_non_job_appointments_create` | `scheduling` | `write` | Create a non-job appointment |
| `scheduling_non_job_appointments_delete` | `scheduling` | `delete` | Delete a non-job appointment |
| `scheduling_non_job_appointments_get` | `scheduling` | `read` | Get a non-job appointment by ID |
| `scheduling_non_job_appointments_list` | `scheduling` | `read` | List non-job appointments |
| `scheduling_non_job_appointments_update` | `scheduling` | `write` | Update a non-job appointment |
| `scheduling_teams_create` | `scheduling` | `write` | Create a team |
| `scheduling_teams_delete` | `scheduling` | `delete` | Delete a team |
| `scheduling_teams_get` | `scheduling` | `read` | Get a team by ID |
| `scheduling_teams_list` | `scheduling` | `read` | List teams |
| `scheduling_technician_shifts_bulk_delete` | `scheduling` | `write` | Delete multiple technician shifts |
| `scheduling_technician_shifts_create` | `scheduling` | `write` | Create a technician shift |
| `scheduling_technician_shifts_delete` | `scheduling` | `delete` | Delete a technician shift |
| `scheduling_technician_shifts_get` | `scheduling` | `read` | Get a technician shift by ID |
| `scheduling_technician_shifts_list` | `scheduling` | `read` | List technician shifts |
| `scheduling_technician_shifts_update` | `scheduling` | `write` | Update a technician shift |
| `scheduling_zones_get` | `scheduling` | `read` | Get a zone by ID |
| `scheduling_zones_list` | `scheduling` | `read` | List zones |

## settings

| Name | Domain | Operation | Description |
| --- | --- | --- | --- |
| `settings_activities_export` | `settings` | `read` | Export activities |
| `settings_activity_categories_export` | `settings` | `read` | Export activity categories |
| `settings_activity_categories_get` | `settings` | `read` | Get an activity category by ID |
| `settings_activity_categories_list` | `settings` | `read` | List activity categories |
| `settings_activity_codes_export` | `settings` | `read` | Export activity codes |
| `settings_activity_codes_get` | `settings` | `read` | Get an activity code by ID |
| `settings_activity_codes_list` | `settings` | `read` | List activity codes |
| `settings_activity_types_get` | `settings` | `read` | Get an activity type by ID |
| `settings_activity_types_list` | `settings` | `read` | List activity types |
| `settings_business_units_get` | `settings` | `read` | Get a business unit by ID |
| `settings_business_units_list` | `settings` | `read` | List business units |
| `settings_business_units_update` | `settings` | `write` | Update a business unit |
| `settings_tag_types_create` | `settings` | `write` | Create a tag type |
| `settings_tag_types_delete` | `settings` | `delete` | Delete a tag type |
| `settings_tag_types_export` | `settings` | `read` | Export tag types |
| `settings_tag_types_get` | `settings` | `read` | Get a tag type by ID |
| `settings_tag_types_list` | `settings` | `read` | List tag types |
| `settings_tag_types_update` | `settings` | `write` | Update a tag type |
| `settings_tasks_create` | `settings` | `write` | Create a task |
| `settings_tasks_create_subtask` | `settings` | `write` | Create a subtask under an existing task |
| `settings_tasks_get` | `settings` | `read` | Get a task by ID |
| `settings_tasks_list` | `settings` | `read` | List tasks |
| `settings_user_roles_list` | `settings` | `read` | List user roles |
