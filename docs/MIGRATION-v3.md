# Migrating from v2.6.4 to v3

Version `3.0.0` is a correctness and portability release with intentional interface changes. Its `readonly-v1` support policy covers readonly use with a separate runtime/configuration for each company and requires readiness and report-definition validation for every company before use.

## Discovery and deployment

- Readonly mode now hides write/delete tools. The 194 mutation adapters are experimental and outside stable v3 operational support. An existing v2 configuration with `ST_READONLY=false` must either add `ST_EXPERIMENTAL_WRITES=true` to opt in or return to `ST_READONLY=true`; disabling readonly without the experimental flag fails startup. Confirmations remain separate controls.
- `ST_TOOL_PROFILE` and `ST_TOOLS` narrow discovery. The full profile does not include undocumented tools. Exact unsupported names and reasons appear in [TOOLS.md](../TOOLS.md).
- Native HTTP defaults to loopback. Containers must set `ST_MCP_HOST=0.0.0.0`; the included Docker/Fly configurations do so.
- Browser Origin is validated. Replace wildcard CORS with an exact origin or leave it empty for native clients only.
- `_meta.caller` and forwarded identity headers no longer satisfy `ST_ALLOWED_CALLERS`. Built-in HTTP authenticates the shared credential as `ST_MCP_CLIENT_ID` (default `api-key`). Configure allowlists accordingly, or embed with authenticated SDK identity.
- The package import entrypoint exports `createMcpServer`, `loadConfig`, `ServiceTitanClient`, and `checkReadiness`. Importing the package no longer starts stdio; command entrypoints still start transports.

## Requests

The shipped catalog is constrained to pinned official ServiceTitan operations. Module paths are resolved by method and authoritative full path; unknown/ambiguous routes fail before an API call. Unsupported operations are removed rather than retried under guessed paths.

Use the advertised query filters rather than assuming every list supports both creation and modification dates. Arrival windows, job attachments, and payment types support creation-date filters; estimate and proposal templates support modification-date filters. Payroll-adjustment exports use `from` and `includeRecentChanges`, without creation/modification-date filters. Technician and employee payroll reads support both standard date pairs.

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

Fields are no longer removed, renamed, rounded, or array-capped by generic response shaping. Arrays/scalars use `{data:...}`. `structuredContent` and text contain equivalent JSON. Errors include safe status/phase/trace/retry metadata when available; uncertain writes carry `outcomeUnknown: true` and `retryable: false` and must be verified upstream before retrying, even when diagnostic details are shortened to fit the response budget. The pinned report-data POST is a read: its timeout/5xx failures may be retried by a caller subject to reporting limits, without uncertain-write metadata or automatic replay. Report-page errors preserve the API status, trace ID, and retry metadata.

The response budget includes the serialized tool envelope. Large results can return a `st_result_read` handle; concatenate JSON text chunks to retrieve the complete stored result. Storage is temporary, per session/runtime, and bounded; small budgets or oversize results may instead produce an explicit delivery error.

If a mutation completes but its response cannot be delivered or encoded, the error contains `mutationCompleted: true` and `retryable: false` alongside `RESPONSE_TOO_LARGE` or `INVALID_RESPONSE`. These flags survive the minimum response budget. Successful stored-result handles carry the same flags at the top level. Retrieve the stored result or inspect the resource through a read tool; do not repeat the completed mutation, including when its handle expires. Audit events record execution success separately from delivery failure and remain enabled independently of diagnostic verbosity.

Each executed mutation handler receives one best-effort audit attempt outside business-result handling. Synchronous or asynchronous audit-sink failure cannot replace, cancel, or replay a committed mutation; pending audit promises are not awaited. The server emits only a fixed data-free fallback diagnostic and contains failures of that diagnostic, so custom audit-sink delivery is not guaranteed.

## Rollout procedure

1. Preserve the existing v2 package/configuration for rollback; keep credentials out of commits.
2. Build and test the candidate, then run the readiness CLI with this company's configuration.
3. Resolve unavailable reports/scopes and configure report bindings. Verify representative KPI amounts against the company's dashboard using the same dates, timezone and filters.
4. Run fixture-based configuration-isolation tests. The stable `readonly-v1` policy scopes unavailable integration-environment and independent-company live validation out rather than marking it passed; do not infer certification for another company.
5. Run the built-package protocol tests, runtime matrix, package-content/install smoke, and release gate checker against the exact source fingerprint.
6. Publish only after every gate required by the selected release policy passes. Treat all writes as experimental; if evaluating them, use disposable integration fixtures and explicitly scoped authorization.

Keep integration and production credentials separate and paired with the matching ServiceTitan environment. Do not copy `.env`, tokens, tenant identifiers, customer payloads, raw live-test output, or local paths into migration notes, CI artifacts, issues, or pull requests. Live acceptance evidence should contain only the minimum sanitized status, count, and timing data needed to establish the gate. Delete disposable records and temporary local output after verification, subject to company retention requirements and the [ServiceTitan API Terms](https://www.servicetitan.com/legal/api-terms).

Live validation covers representative reads for one production company. It does not guarantee dashboard parity or certify an independent company. Scheduling Pro returned HTTP 403 and remains unverified. Integration-environment writes and an independent second company are explicitly scoped out of `readonly-v1`, never recorded as passed, in the [acceptance record](releases/v3-acceptance.json).
