# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[2.1.1]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/montrellcruse/servicetitan-mcp/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/montrellcruse/servicetitan-mcp/releases/tag/v1.0.0
