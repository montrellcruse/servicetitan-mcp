# Migrating from v2.6.4 to v3

V3 is a correctness and portability release with intentional interface changes. Validate a company's configuration and report definitions before enabling workflows. The current candidate is `3.0.0-rc.1`; publication remains subject to its acceptance record.

## Discovery and deployment

- Readonly mode now hides write/delete tools. Set `ST_READONLY=false` only for installations that need them; confirmations remain separate controls.
- `ST_TOOL_PROFILE` and `ST_TOOLS` narrow discovery. The full profile does not include undocumented tools. Exact unsupported names and reasons appear in [TOOLS.md](../TOOLS.md).
- Native HTTP defaults to loopback. Containers must set `ST_MCP_HOST=0.0.0.0`; the included Docker/Fly configurations do so.
- Browser Origin is validated. Replace wildcard CORS with an exact origin or leave it empty for native clients only.
- `_meta.caller` and forwarded identity headers no longer satisfy `ST_ALLOWED_CALLERS`. Built-in HTTP authenticates the shared credential as `ST_MCP_CLIENT_ID` (default `api-key`). Configure allowlists accordingly, or embed with authenticated SDK identity.
- The package import entrypoint exports `createMcpServer`, `loadConfig`, `ServiceTitanClient`, and `checkReadiness`. Importing the package no longer starts stdio; command entrypoints still start transports.

## Requests

The shipped catalog is constrained to pinned official ServiceTitan operations. Module paths are resolved by method and authoritative full path; unknown/ambiguous routes fail before an API call. Unsupported operations are removed rather than retried under guessed paths.

Accounting export marking still accepts convenience IDs, but serializes the required top-level array of endpoint-specific ID objects. Gross-pay creation now requires the official payroll/activity/date/amount fields. Technician shifts use the official title/type and recurrence fields; bulk deletion uses the official date range. Other action and write schemas were reconciled against official required properties and enums. Re-read a tool's published input schema before replaying a saved v2 write invocation.

The corrected write surfaces include customer/location/contact/note and membership creation/updates; technician and truck updates; appointment creation/hold/unassignment; job cancellation; estimate selling; arrival-window configuration; tasks/subtasks; GL accounts and account actions; ratings; journal synchronization; opt-out requests; and inventory purchase orders/types/markups, receipts, returns, transfers, vendors, and warehouses. Bulk customer tags use `customerIds` and `tagTypeIds`; arrival-window configuration requires its documented `configuration` enum. Inventory bodies preserve explicit nulls, zero amounts, and false flags. Do not translate saved payloads by field-name resemblance: use the current tool schema and the owning ServiceTitan operation.

Official date-time fields accept RFC 3339 numeric timezone offsets as well as UTC timestamps, preserving the supplied instant. All 210 published JSON request schemas are checked by generated valid fixtures and required-field removal tests. Captured-call tests verify corrected high-risk adapters; this is not live execution of every write or independent dispatch coverage of every published request schema. Complete disposable-fixture integration tests before adopting write workflows.

## Analytics and report bindings

- Set `ST_REPORT_BINDINGS` to bind logical report IDs to each company's real report IDs/categories. Required fields are checked by name; field reordering is supported. Missing/duplicate fields and malformed/inconsistent pages fail visibly.
- CSR completion date uses numeric option key 1. Upcoming appointment queries use key 6 (Jobs with Appt Date), distinct from key 7 (next appointment start).
- Technician business-unit filters use singular `BusinessUnitId` for the technician reports. Unknown or ambiguous names produce errors instead of all-company results or arbitrary first matches.
- Report 166 now reports actual hours. Default gross-pay and hourly-rate values are null with `costAvailability`; a verified configured report with `GrossPay` can supply costs. Zero no longer means a missing source field.
- Multi-page reports run to completion within configured bounds or report a failure. Shared report scheduling can make large requests take minutes; coordinate host deadlines and cancellation. Optional sources remain visibly unavailable through `_warnings`.
- Period revenue/payments are separate; their difference is not A/R. Membership period ratios are not starting-cohort retention. Campaign booking/call populations and unweighted subgroup averages are labeled explicitly. Saved dashboards/consumers must adopt the new metric names/definitions and not silently map them back to old labels.

## Results, errors, and audit

Fields are no longer removed, renamed, rounded, or array-capped by generic response shaping. Arrays/scalars use `{data:...}`. `structuredContent` and text contain equivalent JSON. Errors include safe status/phase/trace/retry metadata when available; uncertain writes carry `outcomeUnknown` and must be verified upstream before retrying.

The response budget includes the serialized tool envelope. Large results can return a `st_result_read` handle; concatenate JSON text chunks to retrieve the complete stored result. Storage is temporary, per session/runtime, and bounded; small budgets or oversize results may instead produce an explicit delivery error. A failed delivery is not proof that a preceding mutation failed. Audit events distinguish these cases and remain enabled independently of diagnostic verbosity.

## Rollout procedure

1. Preserve the existing v2 package/configuration for rollback; keep credentials out of commits.
2. Build and test the candidate, then run the readiness CLI with this company's configuration.
3. Resolve unavailable reports/scopes and configure report bindings. Verify representative KPI amounts against the company's dashboard using the same dates, timezone and filters.
4. Test independent company fixtures, then complete the separate live second-company and integration-environment gates. Fixture success does not replace live evidence.
5. Run the built-package protocol tests, runtime matrix, package-content/install smoke, and release gate checker against the exact source fingerprint.
6. Publish only after every required gate passes. Revalidate saved workflows before enabling writes; integration fixtures should be disposable and explicitly scoped.

Live validation currently covers representative reads for one production company. Integration-environment mutations and an independent second company remain unverified in the [acceptance record](releases/v3-acceptance.json).
