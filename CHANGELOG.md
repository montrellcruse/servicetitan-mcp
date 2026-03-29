# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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

[2.3.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/montrellcruse/servicetitan-mcp/releases/tag/v1.0.0
