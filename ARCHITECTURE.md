# Architecture

This document describes the internal design of the ServiceTitan MCP Server.

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Transport Modes](#transport-modes)
- [Configuration System](#configuration-system)
- [Authentication Flow](#authentication-flow)
- [Route Table](#route-table)
- [Domain Organization](#domain-organization)
- [Tool Registry and Safety Layer](#tool-registry-and-safety-layer)
- [Intelligence Layer](#intelligence-layer)
- [Response Shaping](#response-shaping)
- [Reference Data Cache](#reference-data-cache)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Environment Variables                     │
│   ST_CLIENT_ID, ST_CLIENT_SECRET, ST_APP_KEY, ST_TENANT_ID  │
│   ST_READONLY, ST_CONFIRM_WRITES, ST_TIMEZONE, ST_DOMAINS   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  loadConfig │  src/config.ts
                    │  validates  │  Parses and validates all env vars.
                    │  all vars   │  Throws on missing required vars.
                    └──────┬──────┘
                           │ ServiceTitanConfig
                           ▼
         ┌─────────────────────────────────────┐
         │         ServiceTitanClient           │  src/client.ts
         │  OAuth 2.0 token caching             │
         │  Route table prefix resolution       │
         │  401 auto-retry, 429 backoff         │
         └──────────────────┬──────────────────┘
                            │ HTTP (axios)
                            ▼
               ┌────────────────────────┐
               │  ServiceTitan REST API │
               │  api.servicetitan.io   │
               └────────────────────────┘

         ┌─────────────────────────────────────┐
         │           ToolRegistry               │  src/registry.ts
         │  Domain filter (ST_DOMAINS)          │
         │  Readonly guard (ST_READONLY)         │
         │  Confirmation wrapper (deletes/      │
         │    writes when ST_CONFIRM_WRITES)    │
         │  Audit logging (write/delete)        │
         └──────────────────┬──────────────────┘
                            │ registry.register()
              ┌─────────────┴──────────────┐
              │                            │
              ▼                            ▼
   ┌────────────────────┐      ┌──────────────────────┐
   │   Domain Modules   │      │  Intelligence Layer   │
   │  src/domains/*/    │      │  src/domains/         │
   │  14 domains        │      │  intelligence/        │
   │  440+ CRUD tools   │      │  10 composite tools   │
   └────────────────────┘      └──────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │       McpServer          │  @modelcontextprotocol/sdk
              │  Handles MCP protocol   │
              └──────────┬──────────────┘
              ┌──────────┴──────────────┐
              │                         │
              ▼                         ▼
   ┌────────────────────┐   ┌────────────────────────────────┐
   │  StdioTransport    │   │ StreamableHTTPServerTransport │
   │  (index.ts)        │   │   (streamable-http.ts)        │
   │  Local use /       │   │  Remote HTTP access           │
   │  Claude Desktop    │   │  Fly.io deployment            │
   └────────────────────┘   └────────────────────────────────┘
```

---

## Transport Modes

The server ships two entrypoints.

### stdio (`src/index.ts`)

The default transport. The MCP server reads from `stdin` and writes to `stdout` using the MCP protocol. This is the standard mode for Claude Desktop and local integrations.

Start with:
```bash
npm start
# or: node build/index.js
```

### Streamable HTTP (`src/streamable-http.ts`)

The primary remote transport. It exposes the MCP server over Streamable HTTP for remote MCP clients, with `GET /mcp` available for server-initiated notifications and `POST /mcp` for MCP requests.

Endpoints:
- `POST /mcp` — MCP request endpoint; initializes and reuses per-session transports
- `GET /mcp` — SSE stream for server-initiated notifications
- `DELETE /mcp` — closes the active session
- `GET /health` — health check (no auth); returns status, tool count, environment, and readonly mode. Auth/tenant connectivity available via the `st_health_check` MCP tool.
- `GET /sse` — deprecated legacy route; returns `410 Gone`

Security:
- `ST_MCP_API_KEY` is required at startup; the server exits if it's missing
- Request body is limited to 1MB
- Invalid JSON returns HTTP 400
- Graceful shutdown on `SIGTERM`/`SIGINT` with a 10-second force-exit

Port: `PORT` env var, then `ST_MCP_PORT`, then `3100`.

Start with:
```bash
npm run start:streamable-http
# or: ST_MCP_API_KEY=<secret> node build/streamable-http.js
```

Legacy note:
- `src/sse.ts` remains available for backward compatibility.
- Prefer `src/streamable-http.ts` for all new remote deployments.

---

## Configuration System

**File:** `src/config.ts`

All configuration is loaded from environment variables. `loadConfig()` validates every variable at startup and throws a descriptive error on the first failure. There is no configuration file — env vars only.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ST_CLIENT_ID` | ✅ | — | ServiceTitan OAuth client ID |
| `ST_CLIENT_SECRET` | ✅ | — | ServiceTitan OAuth client secret |
| `ST_APP_KEY` | ✅ | — | ServiceTitan app key (`ST-App-Key` header) |
| `ST_TENANT_ID` | ✅ | — | ServiceTitan tenant ID |
| `ST_ENVIRONMENT` | | `integration` | `integration` or `production` |
| `ST_READONLY` | | `true` | Set `false` to enable write/delete tools |
| `ST_CONFIRM_WRITES` | | `false` | Require `_confirmed: true` for write operations |
| `ST_MAX_RESPONSE_CHARS` | | `100000` | Max characters in a tool response |
| `ST_DOMAINS` | | (all) | Comma-separated domain whitelist (e.g. `crm,dispatch,marketing`) |
| `ST_LOG_LEVEL` | | `info` | `debug`, `info`, `warn`, or `error` |
| `ST_TIMEZONE` | | `UTC` | IANA timezone for date boundary calculation (e.g. `America/New_York`) |
| `ST_RESPONSE_SHAPING` | | `true` | Set `false` to disable response shaping middleware |
| `ST_MCP_API_KEY` | Remote HTTP only | — | Bearer token for remote Streamable HTTP authentication |

`ST_TIMEZONE` is critical for intelligence tools: date inputs like `2025-02-01` are interpreted as midnight in this timezone, then converted to UTC boundaries before being sent to the ServiceTitan API.

---

## Authentication Flow

**File:** `src/client.ts`

The server authenticates to ServiceTitan using the OAuth 2.0 **client credentials** grant. This flow is machine-to-machine — no user interaction required.

```
Client                  auth.servicetitan.io          api.servicetitan.io
  │                            │                              │
  │  POST /connect/token       │                              │
  │  grant_type=client_credentials                            │
  │  client_id=...             │                              │
  │  client_secret=...         │                              │
  │ ─────────────────────────► │                              │
  │                            │                              │
  │  { access_token, expires_in }                             │
  │ ◄───────────────────────── │                              │
  │                            │                              │
  │  GET /crm/v2/tenant/{id}/customers                        │
  │  Authorization: Bearer <token>                            │
  │  ST-App-Key: <app_key>     │                              │
  │ ──────────────────────────────────────────────────────► │
  │                            │                              │
  │  { data: [...] }           │                              │
  │ ◄────────────────────────────────────────────────────── │
```

**Token caching:** The access token is stored in memory with its expiry time. A 60-second buffer (`TOKEN_EXPIRY_BUFFER_MS`) ensures the token is refreshed before it actually expires.

**Concurrent request deduplication:** If multiple requests arrive simultaneously when no token exists, only one `fetchAccessToken()` call is made. All callers await the same `Promise` via `this.tokenRequest`.

**Auto-retry on 401:** If any API call returns 401, the client forces a token refresh and retries the request once (`_retried401` flag prevents infinite loops).

**Rate limit backoff:** If the API returns 429, the client reads the `Retry-After` header (defaults to 1 second) and retries once after the delay.

**Token acquisition** uses raw `axios.post()` outside the interceptor chain to avoid recursive authentication loops.

---

## Route Table

**File:** `src/client.ts` — `ROUTE_TABLE` and `EXPORT_ROUTE_TABLE`

ServiceTitan's production API requires a module prefix on every URL:

```
/tenant/{id}/customers  →  /crm/v2/tenant/{id}/customers
/tenant/{id}/jobs       →  /jpm/v2/tenant/{id}/jobs
/tenant/{id}/invoices   →  /accounting/v2/tenant/{id}/invoices
```

The `addApiPrefix()` method handles this automatically. Domain tools write simple paths like `/tenant/{tenant}/customers`, and the client resolves the full URL at request time.

The route table maps resource path segments to API modules:

| Module | Resources |
|---|---|
| `crm` | customers, contacts, leads, locations, bookings, tags |
| `jpm` | jobs, appointments, job-types, projects, installed-equipment |
| `dispatch` | appointment-assignments, arrival-windows, capacity, teams, zones |
| `accounting` | invoices, payments, gl-accounts, journal-entries, tax-zones |
| `sales` | estimates |
| `pricebook` | services, materials, equipment, categories, discounts |
| `payroll` | payrolls, timesheets, gross-pay-items, payroll-adjustments |
| `memberships` | memberships, membership-types, recurring-services |
| `marketing` | campaigns, costs, attributed-leads, suppressions |
| `telecom` | calls, call-reasons |
| `inventory` | purchase-orders, vendors, warehouses, adjustments, transfers |
| `reporting` | report-categories, dynamic-value-sets, data |
| `settings` | business-units, tag-types, activities, activity-categories, activity-types, user-roles |
| `people` | technicians, technician-shifts, employees, trucks, gps-provider |
| `scheduling` | appointment-assignments, business-hours, capacity, non-job-appointments, teams, zones |

**Export routes** (`/tenant/{id}/export/{resource}`) have a separate `EXPORT_ROUTE_TABLE` since export endpoints live under their parent domain module.

Paths that already include a module prefix (e.g. `/crm/v2/tenant/...`) are passed through unchanged.

---

## Domain Organization

**Directory:** `src/domains/`

Domains are loaded dynamically at startup. `loadDomainModules()` scans `src/domains/*/index.js` and calls each module's default export as a `DomainLoader`:

```typescript
type DomainLoader = (client: ServiceTitanClient, registry: ToolRegistry) => void;
```

Each domain module calls `registry.register()` for each tool it provides. The registry applies domain filtering (`ST_DOMAINS`) at registration time. When `ST_READONLY=true` (default), all tools are still registered and visible to MCP clients, but write and delete operations are blocked at execution time by the middleware, which returns `Readonly mode: operation not permitted`.

Current domains (15 total, including `intelligence`):

| Domain | Description |
|---|---|
| `accounting` | Invoices, payments, AP credits/payments, GL accounts, journal entries, tax zones |
| `crm` | Customers, contacts, leads, locations, bookings, booking provider tags |
| `dispatch` | Appointments, jobs, job types, projects, images, installed equipment, forms, arrival windows |
| `estimates` | Estimate CRUD and line items |
| `export` | Bulk export endpoints for major resources |
| `intelligence` | 10 composite business intelligence tools (see below) |
| `inventory` | Purchase orders, vendors, warehouses, adjustments, transfers, receipts, returns |
| `marketing` | Campaigns, costs, attributed leads, opt-in/out, suppressions, calls |
| `memberships` | Memberships, membership types, recurring services and service types |
| `payroll` | Payrolls, adjustments, gross pay items, timesheets, non-job timesheets, splits |
| `people` | Employees, technicians, trucks, GPS |
| `pricebook` | Services, materials, equipment, categories, discounts |
| `reporting` | Report categories, dynamic value sets, raw report data |
| `scheduling` | Appointment assignments, business hours, capacity, non-job appointments, teams, zones |
| `settings` | Business units, tag types, activities, tasks, user roles |

---

## Tool Registry and Safety Layer

**File:** `src/registry.ts`

Every tool goes through `ToolRegistry.register()`, which acts as a gatekeeper and wrapper.

### Filtering (registration time)

1. **Domain filter:** If `ST_DOMAINS` is set, only tools whose `domain` matches are registered. The `_system` domain (health check) is always registered.
2. **Readonly enforcement:** If `ST_READONLY=true` (the default), all tools remain registered. Write and delete operations are blocked at execution time with `Readonly mode: operation not permitted`.

### Confirmation wrapper (execution time)

**Delete operations** always require `confirm: true`. Without it, the handler returns a preview object:

```json
{
  "action": "DELETE",
  "resource": "customer",
  "id": 12345,
  "warning": "This will permanently delete the customer.",
  "confirm": "Call crm_customers_delete again with confirm=true to proceed."
}
```

**Write operations**, when `ST_CONFIRM_WRITES=true`, require `_confirmed: true`. Without it, the handler returns an error message ("Write confirmation required. Re-call with _confirmed: true to proceed.").

The `_confirmed` parameter (for writes) and `confirm` parameter (for deletes) are auto-injected into tool schemas at registration time.

### Audit logging

All write and delete operations are logged via `AuditLogger`. Each log entry includes:
- Timestamp
- Tool name, operation, domain, resource type, resource ID
- Sanitized parameters (passwords, tokens, secrets, keys are redacted)
- Success/failure status and error message if applicable

---

## Intelligence Layer

**Directory:** `src/domains/intelligence/`

Intelligence tools are the project's core differentiator. Rather than exposing raw CRUD endpoints, they combine multiple ServiceTitan reports into pre-computed business answers.

### Tools

| Tool | Reports Used | Description |
|---|---|---|
| `intel_revenue_summary` | Report 175 | Revenue by business unit, breakdown by completed/adjustment/non-job |
| `intel_technician_scorecard` | ST Reporting API | Per-technician performance: revenue, efficiency, tickets, callbacks |
| `intel_membership_health` | Report 182 | Membership counts, renewals, expirations, health metrics |
| `intel_campaign_performance` | Reports 172, 176 | Marketing ROI: spend, leads, revenue attributed per campaign |
| `intel_daily_snapshot` | Multiple reports | Daily operational health: open jobs, dispatched techs, unbooked calls |
| `intel_csr_performance` | Call reports | CSR call handling metrics: booking rate, average handle time |
| `intel_labor_cost` | Payroll + job reports | Labor efficiency, billable hours, cost per revenue dollar |
| `intel_estimate_pipeline` | Estimates + jobs | Open estimate value, job pipeline by stage and age |
| `intel_invoice_tracking` | Invoice reports | Invoice aging, outstanding balances, collection rates |
| `intel_lookup` | Reference cache | Resolve technician/business unit names to IDs |

### Why Report 175 for Revenue?

ServiceTitan's REST endpoints and the ServiceTitan dashboard use different revenue calculation methods. Report 175 ("Revenue") under the business-unit dashboard is the canonical source that matches the dashboard's displayed totals exactly. Intelligence tools use the ST Reporting API (`/reporting/v2/tenant/{id}/report-category/...`) rather than CRUD endpoints for all revenue-related data.

### Partial failure handling

Intelligence tools use `fetchWithWarning()` to collect partial data when some sub-requests fail. If Report 176 is unavailable but Report 175 succeeds, the tool returns what it has plus a `_warnings` array explaining what was skipped. This prevents a single failing report from blacking out an entire intelligence tool.

### Timezone-aware date handling

All date inputs (`YYYY-MM-DD` strings) are converted to UTC ISO boundaries using the tenant's `ST_TIMEZONE`. For example, `2025-02-01` in `America/New_York` becomes `2025-02-01T05:00:00.000Z` (midnight EST = 05:00 UTC). This ensures date filters align with ServiceTitan's tenant-local timestamps.

---

## Response Shaping

**File:** `src/response-shaping.ts`

Response shaping is applied **only to intelligence (`intel_*`) tool responses** (enabled by default, disable with `ST_RESPONSE_SHAPING=false`). Non-intelligence domain tools (CRM, dispatch, accounting, etc.) return raw ServiceTitan API responses without any transformation.

### What it does (intelligence tools only)

1. **Excludes low-signal fields** — A hardcoded `EXCLUDED_FIELDS` set removes metadata fields (`requestId`, `paginationToken`), redundant breakdowns (e.g. `regularHours`/`overtimeHours` when `totalHours` is present), and blocks that are too verbose at the summary level (e.g. `byBusinessUnit`, `productivity`, `membershipTypes`).

2. **Abbreviates field names** — Common verbose keys are replaced with shorter aliases (e.g. `customerName` → `customer`, `businessUnit` → `bu`, `technician` → `tech`, `averageTicket` → `avgTicket`).

3. **Rounds numbers** — Currency tokens (`revenue`, `amount`, `ticket`, etc.) are rounded to 2 decimal places. Ratio tokens (`efficiency`, `rate`, `percent`, etc.) are rounded to 1 decimal place.

4. **Compacts date-only fields** — Explicit date-only fields (`date`, `scheduledDate`, `dueDate`, `expirationDate`) are compacted to `YYYY-MM-DD`. All other timestamps preserve full precision including seconds and timezone offset.

5. **Limits array lengths** — Intelligence-specific arrays are truncated to prevent response bloat (e.g. `byTechnician` → 4 items, `campaigns` → 3 items, `staleEstimates` → 3 items). Generic field names like `items` are **never** truncated.

6. **Preserves zero values** — Fields with value `0` are kept (zero is meaningful for financial and operational metrics).

### Why it exists

The autoresearch evaluation framework showed that raw ServiceTitan API responses contain significant token overhead from metadata, redundant fields, and excessive precision. Shaping reduces response size by 40–60% on typical intelligence tool payloads without losing information that matters for business analysis. It is scoped to intelligence tools because non-intelligence responses are raw API passthrough and must preserve the ServiceTitan schema exactly.

---

## Reference Data Cache

**File:** `src/cache.ts`

The reference data cache provides fast, name-based lookups for frequently accessed ServiceTitan reference entities.

### What's cached

| Key | Endpoint | TTL |
|---|---|---|
| `technicians` | `/tenant/{id}/technicians?active=Any` | 30 minutes |
| `business-units` | `/tenant/{id}/business-units?active=Any` | 30 minutes |
| `payment-types` | `/tenant/{id}/payment-types?active=Any` | 30 minutes |
| `membership-types` | `/tenant/{id}/membership-types?active=Any` | 30 minutes |

### In-flight deduplication

The `ReferenceDataCache` uses a `Map<string, Promise<T>>` to track in-flight requests. If two tools request `technicians` simultaneously before the cache is populated, only one API call is made. Both callers await the same `Promise`.

### Name-based filtering

`findTechniciansByName()` normalizes and searches across all available name fields (`name`, `displayName`, `fullName`, `firstName + lastName`, `nickname`). The search is case-insensitive substring matching, so `"alex"` matches `"Alex Ramirez"`.

### `TtlCache<T>`

The underlying generic cache uses a `Map<string, CacheEntry<T>>` where each entry stores the value and an `expiresAt` timestamp. Expired entries are lazily evicted on the next `get()` or `has()` call.

### `intel_lookup` tool

The `intel_lookup` intelligence tool exposes the reference cache directly to LLM clients, allowing them to resolve names to IDs without building that logic themselves:

```
intel_lookup(entity="technician", name="Alex") → [{ id: 1234, name: "Alex Ruiz" }]
```
