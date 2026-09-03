# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- **Tool descriptions now reach MCP clients** — the registry registered every tool through the SDK's `server.tool(name, schema, handler)` overload, which silently drops the description. Clients received tool names and parameter descriptions only; the intelligence tools' usage examples never left the process. Registration now goes through `server.registerTool()` so `tools/list` carries every description.

### Added
- **MCP tool annotations** — every tool now advertises `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint`, derived from its `operation` (read, write, delete). Mutations default to destructive; verified additive or idempotent behavior can be declared through the optional `annotations` field. `readOnlyHint` remains fixed by `operation`.
- `tests/mcp-contract.test.ts` — connects a real MCP client over an in-memory transport and asserts what `tools/list` actually returns, so metadata dropped at registration time is caught.

## [2.6.2] - 2026-07-13

### Fixed
- **Appointment assignment payload** — `scheduling_appointment_assignments_assign_technicians` now accepts `jobAppointmentId` with `technicianIds[]` and posts the ServiceTitan API's expected body shape.
- **Dispatch job creation appointments** — `dispatch_jobs_create` now accepts the ServiceTitan JPM create-job appointment payload and validates the documented required job fields before posting.
- **Estimate line item SKUs** — estimate create and item update schemas now expose `skuId`/`skuName`, forward documented `quantity`/`unitPrice` fields, and preserve `qty`/`unitRate` as compatibility aliases.

## [2.6.1] - 2026-06-24

### Fixed
- **Job attachment routing** — job attachment create, get, and list tools now call the ServiceTitan Forms API paths directly instead of being rewritten to JPM job routes.

## [2.6.0] - 2026-06-10

### Added
- **ServiceTitan ST-77.x dispatch tools** — added job equipment get/attach/detach tools, appointment summary creation, `equipmentIds` job filtering, `summaryOfWork`, and job type custom field assignment support.
- **Sales template tools** — added estimate template CRUD, proposal template CRUD, and proposal type lookup tools from the ST-77.2 Sales & Estimates API.
- **DELETE with body support** — added client support for ServiceTitan endpoints that require JSON payloads on DELETE requests.

### Changed
- **Tool catalog refreshed** — generated `TOOLS.md` now reflects 483 registered tools across 15 domains.
- **Job type safety wording** — job type update surfaces `customFieldsUpdateMode` and warns about ServiceTitan's replace semantics for custom field type assignments.
- **Template update safety wording** — estimate/proposal template update tools call out full-replace fields so callers can omit those fields when preserving existing assignments.

## [2.5.2] - 2026-06-02

### Fixed
- **UTC-labeled fields preserved** — timestamp conversion now leaves values unchanged when the field name explicitly signals UTC, preventing misleading local-offset values under `*Utc` keys.
- **ServiceTitan validation errors surfaced** — field-level validation reasons from ServiceTitan error responses are included in client error messages.
- **Docker build** — Dockerfile now copies `scripts/` before `npm run build`, so container builds have the bundled build script.
- **Technician shift schemas** — technician shift create and bulk-delete inputs now match ServiceTitan's required `technicianIds`, `body`, `repeatType`, and `ids` fields.

### Changed
- **Scheduling capacity schema** — `scheduling_capacity_calculate` now exposes the required ServiceTitan capacity fields directly instead of accepting an opaque payload wrapper.
- **Tool catalog refreshed** — generated `TOOLS.md` now reflects the updated scheduling capacity description and latest intelligence tool descriptions.

## [2.5.1] - 2026-04-05

### Changed
- **Homepage URL** — npm package homepage now points to the Rowvyn ServiceTitan MCP case study.

## [2.5.0] - 2026-04-02

### Performance
- **HTTP keep-alive + connection pooling** — shared `https.Agent` with `keepAlive: true`, `maxSockets: 32` eliminates TLS handshake overhead on consecutive API calls.
- **Auth pre-warming** — `client.prewarm()` called at server startup fetches and caches the OAuth token before the first tool execution, saving ~1-2s on cold starts.
- **Parallel invoice tracking** — Reports 2281 and 2282 now fetched concurrently via `Promise.all()` instead of sequentially.
- **Parallel estimate pipeline** — estimate pagination parallelized (6.49s → 1.50s).
- **`fetchAllPagesBlind` helper** — fires all `maxPages` page requests simultaneously without a probe step to determine `totalCount` first. Applied to bookings, estimates, invoices, and payments pagination. Saves one sequential round-trip per paginated call.
- **Sequential campaign calls** — `/v3/calls` endpoint uses sequential `fetchAllPages` instead of parallel. ServiceTitan's calls API exhibits extreme concurrency sensitivity (even 2 concurrent requests trigger rate-limiting and inflate results). Sequential is the only reliable approach.
- **Report 165 removal** — `technician_scorecard` no longer fetches Report 165 (redundant with `ConvertedJobs` field from Report 168). Reduces parallel POST calls from 5 to 4 on the default path.

### Added
- **`includeServiceRevenue`** parameter on `intel_membership_health` — opt-in invoice pagination for service revenue breakdown. Default: `false` (saves ~2-4s).
- **`includeProductivityMetrics`** parameter on `intel_revenue_summary` — opt-in Report 177 fetch for BU-level productivity metrics. Default: `false` (saves ~0.5-1s).
- **`includeExtendedMetrics`** parameter on `intel_technician_scorecard` — opt-in Reports 171/173/174 for revenue-per-hour, billable efficiency, and recall data. Default: `false` (saves ~1-2s).
- **`fetchAllPagesWithTotal`** helper — variant that returns both items and `totalCount` for callers that need the count.

### Changed
- **Score improvement** — baseline score improved from 0.91 to 0.92-0.94 (typical), up to 1.24 on fast ServiceTitan API days. All 25 ground truth questions still pass.
- **Non-campaign tool latency** — `revenue_summary` 2.7-3.3s, `technician_scorecard` 2.1-2.7s, `membership_health` 2.0-2.8s, `estimate_pipeline` 1.5-1.8s, `invoice_tracking` 2.2-4.4s.

### Fixed
- **Test suite** — 12 test failures fixed for new opt-in parameter defaults and `fetchAllPagesBlind` mock compatibility. All 260 tests passing.

## [2.4.2] - 2026-03-29

### Fixed
- **README cleanup** — removed misleading "0.001% revenue accuracy" stat (replaced with "Dashboard-matched revenue"), stripped internal "Report 175" jargon throughout. No code changes.

## [2.4.0] - 2026-03-28

### Added
- **npm distribution metadata** — package description, author, repository, homepage, bugs, keywords, and Node.js engine requirements are now declared for npm publishing.
- **CLI bin entries** — `servicetitan-mcp-server`, `servicetitan-mcp-sse`, and `servicetitan-mcp-http` now map to the stdio, SSE, and Streamable HTTP entrypoints.

### Changed
- **Files whitelist** — npm packages now ship only `build/`, `LICENSE`, `README.md`, `CHANGELOG.md`, `.env.example`, and `package.json`.
- **`prepublishOnly` validation** — `npm publish` now runs typecheck, lint, tests, and build before packaging.
- **README quick start restructure** — npm `npx` usage is now documented first, followed by global install and source-build instructions.
- **Entry-point shebangs** — all three transport entrypoints now compile to directly executable Node.js bin scripts.

## [2.3.1] - 2026-03-28

### Fixed
- **Pagination truncation surfaced** — `fetchAllPages()` and `fetchAllPagesParallel()` now push truncation and page-failure warnings to callers via optional `warnings[]` parameter. Intelligence tools surface these as `_warnings` in responses instead of silently undercounting.
- **GPS provider path injection** — `people_gps_create` now validates `gpsProvider` with `^[A-Za-z0-9_-]+$` regex, preventing path traversal in outbound ST API calls.
- **Truncation guard edge case** — `Math.min` → `Math.max(0, ...)` prevents negative slice index when `ST_MAX_RESPONSE_CHARS` < 256.
- **Response shaping scoped to intelligence only** — removed from `toolResult()` baseline; added `shape: true` parameter to 9 intelligence domain handlers. Non-intelligence tools now return unmodified ServiceTitan schemas.
- **UTC day math** — `countWeekdaysInclusive()` and `dayDiff()` accept timezone parameter, normalize to tenant-local calendar dates. Fixes jobsPerDay inflation for non-UTC tenants.
- **Pagination off-by-one** — page increment no longer skips `maxPages` detection; `_truncated` marker properly surfaced.
- **JSON truncation format** — truncated responses now produce valid parseable JSON.
- **Phone number PII redaction** — expanded `sanitizeParams()` to catch `contactNumbers`, `campaignPhoneNumbers`, `phoneNumberCalled`, `callerPhoneNumber` variants.
- **Cross-domain import** — CRM customers no longer imports `getErrorMessage` from intelligence helpers.
- **SSE CORS consistency** — `sendCorsHeaders()` skips header emission when `corsOrigin` is empty, matching Streamable HTTP behavior.
- **Domain loader error masking** — distinguishes transitive import failures (throw) from missing `index.js` (skip gracefully).
- **Non-UTC end-of-day 999ms off-by-one** — `parseDateInput()` computes local date via `Intl.DateTimeFormat` without offset reconstruction.
- **`ST_INTEL_MAX_PAGES` configurable** — pagination cap now reads from env var (default 20 pages × 500 rows).
- **`sortParam()` validation** — accepts bare field names alongside signed `+Field`/`-Field` format.

### Changed
- **Version read from package.json** — removed hardcoded version strings from all 3 entry points (stdio, SSE, Streamable HTTP). Single source of truth.
- **TOOLS.md regenerated** — 467 tools (was 460), catalog script corrected.
- **Documentation alignment** — ARCHITECTURE.md domain tables, health check description, readonly semantics, name matching examples, route table entries all corrected to match implementation. README env vars complete. CONTRIBUTING.md getErrorMessage guidance updated.

### Added
- 249 tests across 18 test files (up from 245 / 17).
- 7-round audit trail in `audit/` directory with full findings and remediation evidence.

## [2.3.0] - 2026-03-28

### Security
- **Write middleware** — readonly mode, confirmation enforcement (`_confirmed: true`), and audit logging now enforced at the registry level. No write tool can bypass these guards regardless of handler implementation.
- **CORS** — default changed from wildcard `*` to empty (no CORS headers sent). Set `ST_CORS_ORIGIN` explicitly for remote deployments.
- **Health check** — stripped config details (environment, readonly_mode, tools_registered). Returns only auth and tenant connectivity status.
- **Error sanitization** — Zod validation errors now return human-readable `Invalid input: field: message` instead of raw schema internals.
- **Health check errors** — FAILED messages no longer leak internal error text.

### Fixed
- **Response shaping** — semantic fields (id, type, description, active, count, date, notes, tags, source, category) no longer stripped from tool output. Only true metadata (pagination, HTTP status, internal timestamps) excluded.
- **Route table** — added 48 missing API route prefixes (18 regular + 17 export + 13 domain routes). Added drift test to prevent regressions.
- **Session lifecycle** — proper `server.close()` on client disconnect for both SSE and Streamable HTTP transports. Prevents file descriptor leaks.
- **HTTP timeouts** — 60s request timeout, 15s token fetch timeout, single retry with `Retry-After` backoff. `parseRetryAfter()` now handles HTTP-date format.
- **Report 175 validation** — Zod runtime schema validates response structure before data extraction. Fails fast with clear error on schema drift.
- **safeDivide()** — all division operations in intelligence layer protected against NaN/Infinity. Zero-denominator edge-case tests for all 10 intel tools.
- **Empty write schemas** — 6 write tools (capacity calculate, payment create, payment status update, AP credits/payments mark-as-exported, invoice adjustment/mark-as-exported) now require valid input instead of accepting empty `{}`.
- **Server-managed fields** — removed `createdOn`, `modifiedOn`, `createdBy`, `modifiedBy`, `mergedToId`, `id` from write schemas across CRM, inventory, pricebook, and settings domains.

### Changed
- **12 duplicate tool registrations removed** — CRM (customer note/tag delete aliases), marketing (campaign category list alias), scheduling (technician shifts moved to canonical domain), pricebook (images alias). Net **-1,300 lines**.
- **getErrorMessage** consolidated from 59 per-file copies to 2 shared utilities: `src/utils.ts` (main) and `src/domains/intelligence/helpers.ts` (intelligence layer).
- **Domain loader** extracted to `src/domains/loader.ts`, replacing 3 identical `loadDomainModules()` copies across stdio, SSE, and Streamable HTTP transports.
- **Duplicate tool name detection** — `ToolRegistry.register()` now throws on duplicate tool names at startup.
- Dead gzip infrastructure removed from Streamable HTTP transport (`createGzip` import, `acceptsGzip`, `supportsGzip()`).
- Version bumped to 2.3.0 across package.json and all transports.

### Added
- **Per-tool cache TTL** — `withIntelCache()` and `ReferenceDataCache.getOrLoad()` support per-call TTL overrides (default 5min unchanged).
- `tests/safety/write-middleware.test.ts` — dedicated test suite for readonly blocking, confirmation enforcement, audit logging, and schema hardening.
- `tests/domains/intelligence-revenue-validation.test.ts` — Report 175 structure validation and empty dataset handling.
- `cacheTtlMs` field on `ToolDefinition` for declarative per-tool cache configuration.
- 245 tests across 17 test files (up from 222 / 14).

## [2.2.0] - 2026-03-27

### Security
- **Constant-time API key comparison** via `timingSafeEqual` (replaces `===`)
- Request ID tracking on all error responses (UUID per request)
- Configurable CORS origin (`ST_CORS_ORIGIN`)
- SSE keepalive (30s interval) with dead connection detection
- Graceful shutdown on SIGTERM/SIGINT

### Added
- **Streamable HTTP transport** (`src/streamable-http.ts`) — replaces SSE as primary remote transport. Per-session server isolation, session TTL (30min), 1MB body limit.
- Full README rewrite with hero section, Claude Desktop quickstart, tool catalog, intelligence spotlight, comparison table
- CHANGELOG, ARCHITECTURE.md, CONTRIBUTING.md, SECURITY.md
- GitHub issue/PR templates, CI + MIT badges
- Startup banner with version, port, tool count, config summary

### Changed
- **94 → 222 tests** (+136%) — SSE transport, cache, domain registration, accounting, CRM domain tests
- SSE transport deprecated in favor of Streamable HTTP (still available at `build/sse.js`)

## [2.1.1] - 2026-03-26

### Security
- Fixed unguarded `JSON.parse` in SSE `/messages` handler — returns HTTP 400 on malformed JSON instead of crashing
- Added 1MB request body size limit to SSE `/messages` endpoint (HTTP 413 on oversize requests)
- Added `SIGTERM`/`SIGINT` graceful shutdown handler with 10-second force-exit fallback
- Added `uncaughtException` and `unhandledRejection` handlers in SSE server to prevent silent crashes

### Changed
- Extracted 19 duplicated `errorMessage()` functions across domain files to a shared `getErrorMessage` import from `src/domains/intelligence/helpers.ts`
- Documented `ST_RESPONSE_SHAPING` and `ST_MCP_API_KEY` environment variables in README

### Added
- MIT `LICENSE` file
- `.editorconfig` for consistent editor settings across contributors

## [2.1.0] - 2026-03-10

### Added
- Reference data cache (`src/cache.ts`) with 30-minute TTL, in-flight request deduplication, and name-based filtering for technicians, business units, payment types, and membership types
- `intel_lookup` tool for resolving names to IDs via the reference cache
- Response shaping middleware (`src/response-shaping.ts`) — strips low-signal fields, abbreviates keys, rounds currency/ratio values, compacts ISO timestamps to date-only strings, and applies per-field array limits to reduce LLM token consumption
- 10th intelligence tool (`intel_lookup`) completing the intelligence layer

### Changed
- Expanded intelligence layer from 9 to 10 tools
- Autoresearch iter2 round 2 shaping improvements ported into response shaping middleware
- Updated README and TOOLS.md to document all 10 intelligence tools and name-filtering capability
- Rewrote PROJECT_MAP for current architecture

### Removed
- Dead cache module replaced by the new unified `ReferenceDataCache`

## [2.0.0] - 2026-03-09 through 2026-03-05

### Added
- **Enterprise intelligence layer** — 9 composite business intelligence tools built on 18 ServiceTitan reports:
  - `intel_revenue_summary` — revenue by business unit using Report 175
  - `intel_technician_scorecard` — per-technician performance via ST Reporting API
  - `intel_membership_health` — membership metrics via Report 182
  - `intel_campaign_performance` — marketing ROI using Reports 172 and 176
  - `intel_operational_snapshot` — daily operational health snapshot
  - `intel_csr_performance` — CSR call performance metrics
  - `intel_labor_cost` — payroll and labor efficiency analysis
  - `intel_pipeline` — estimate and job pipeline status
  - `intel_invoice_tracking` — invoice aging and collection metrics
- SSE server (`src/sse.ts`) for remote MCP access over HTTP with bearer token authentication
- Fly.io deployment configuration (Dockerfile, `fly.toml`)
- `ST_TIMEZONE` environment variable for tenant-local date alignment (IANA format)
- `ST_MCP_API_KEY` requirement for remote SSE deployments
- CI pipeline (GitHub Actions), Docker support, and generated tool catalog (TOOLS.md)
- Versioned API prefix routing — resolves `/tenant/{id}/customers` to `/crm/v2/tenant/{id}/customers` automatically via route table
- Safety layer: readonly mode, write confirmation, audit logging with sensitive field sanitization
- Health check endpoint (`GET /health`) on SSE server

### Fixed
- Revenue accuracy: switched to ST Reporting API (Report 175) to match dashboard totals exactly
- Technician scorecard uses job totals for revenue calculation
- Route table corrections for production ServiceTitan API
- Filtered zero-activity rows from intelligence reports
- Corrected v3 call API mocks in tests
- Closed previous MCP connection before accepting new SSE client
- Single Fly machine to prevent SSE session routing mismatch
- Bumped Fly memory to 512MB to prevent tool registration crashes
- Bound SSE server to `0.0.0.0` for Fly proxy compatibility
- Kept 1 machine always running to avoid cold-start 502s
- Removed `src/` from `.dockerignore` (required for multi-stage build)
- 5 accuracy bugs from live MCP audit

### Changed
- Rewired `intel_membership_health` to use ST Report 182
- Rewired `intel_technician_scorecard` to use ST Reporting API
- Optimized campaign performance tool; added Reports 172/176 integration
- Removed spec files (build artifacts, not source)

## [1.0.0] - 2026-03-04

### Added
- **Core infrastructure** (Spec 01):
  - `ServiceTitanClient` with OAuth 2.0 client credentials flow, token caching, 401 auto-retry, and 429 rate-limit backoff
  - `ToolRegistry` with domain filtering, readonly mode, write confirmation, and audit logging
  - `loadConfig()` with validation for all environment variables
  - `AuditLogger` with sensitive field sanitization
  - `Logger` (structured JSON output)
  - `st_health_check` system tool
  - stdio transport via `@modelcontextprotocol/sdk`
- **Domain tools** (Spec 02) — 440+ tools across 14 domains:
  - `accounting` — invoices, payments, GL accounts, journal entries, tax zones
  - `crm` — customers, contacts, leads, locations, bookings, tags
  - `dispatch` — appointment assignments, arrival windows, capacity, teams, zones
  - `estimates` — estimate CRUD and line items
  - `export` — bulk export endpoints for all major resources
  - `inventory` — purchase orders, vendors, warehouses, adjustments, transfers, receipts
  - `marketing` — campaigns, costs, attributed leads, submissions
  - `memberships` — memberships, membership types, recurring services
  - `payroll` — payrolls, adjustments, gross pay items, timesheets
  - `people` — employees, user roles
  - `pricebook` — services, materials, equipment, categories, discounts
  - `reporting` — report categories, dynamic value sets, report data
  - `scheduling` — appointments, job types, job cancel/hold reasons
  - `settings` — business units, technicians, tag types, activity categories
- **Safety layer** (Spec 03):
  - Required `confirm=true` for all delete operations
  - Optional `confirm=true` for write operations when `ST_CONFIRM_WRITES=true`
  - Audit log entries for all write/delete operations
  - Expanded test suite covering safety layer behavior
- **Initial intelligence layer** (Spec 04) — 6 composite business tools
- **CI, docs, and Docker** (Spec 05/06):
  - GitHub Actions CI workflow
  - Dockerfile for containerized deployment
  - Generated TOOLS.md tool catalog
  - `.env.example` with all environment variables documented

[2.6.2]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.6.1...v2.6.2
[2.6.1]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.6.0...v2.6.1
[2.6.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.5.2...v2.6.0
[2.5.2]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.5.1...v2.5.2
[2.5.1]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.4.2...v2.5.0
[2.4.2]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.4.0...v2.4.2
[2.3.1]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.3.0...v2.3.1
[2.4.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.3.1...v2.4.0
[2.3.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/montrellcruse/servicetitan-mcp/releases/tag/v1.0.0
