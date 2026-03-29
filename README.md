# ServiceTitan MCP Server

[![CI](https://github.com/montrellcruse/servicetitan-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/montrellcruse/servicetitan-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@rowvyn/servicetitan-mcp.svg)](https://www.npmjs.com/package/@rowvyn/servicetitan-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)
[![Tools](https://img.shields.io/badge/tools-467-blue.svg)](#tool-catalog)
[![Domains](https://img.shields.io/badge/domains-15-purple.svg)](#tool-catalog)

The only MCP server for the ServiceTitan API — 467 tools across 15 domains, plus 10 intelligence tools that turn raw API data into business decisions.

<p align="center">
  <em>Connect any AI assistant to ServiceTitan's full API — CRM, dispatch, invoicing, payroll, and operational intelligence — through the Model Context Protocol.</em>
</p>

---

## Why

- **ServiceTitan has no official MCP server** or developer tooling beyond REST docs
- **Raw API access is friction-heavy** — OAuth token management, module-prefix routing, pagination, and response parsing all fall on you
- **This server handles all of that** and adds 10 intelligence tools that aggregate multiple endpoints into operational insights
- **Dashboard-matched revenue** — verified on production data using the same Reporting API source that powers ST's own dashboard

---

## Features

- **467 tools across 15 domains** — CRM, dispatch, accounting, payroll, inventory, marketing, and more
- **10 intelligence tools** — composite analytics that aggregate multiple API calls into revenue summaries, ops snapshots, technician scorecards, and more
- **Dashboard-matched revenue** — `intel_revenue_summary` pulls from the same source as ST's own dashboard
- **Read-only by default** — `ST_READONLY=true` out of the box; write tools only activate when you're ready
- **Safety layer** — confirmation workflow for writes/deletes, audit logging with sensitive field redaction
- **Domain filtering** — expose only the tool groups you need via `ST_DOMAINS`
- **Name-based filtering** — pass `businessUnitName` or `technicianName` instead of numeric IDs; resolved via 30-minute cache
- **LLM-optimized responses** — response shaping trims API noise and structures data for AI consumption
- **Streamable HTTP remote deployment** — deploy to Fly.io (or anywhere) and connect via `mcp-remote`
- **Built-in health check** — `st_health_check` validates auth and tenant access (no config details exposed)

---

## Quick Start

### Prerequisites

- Node.js 22 or newer
- ServiceTitan API credentials: Client ID, Client Secret, App Key, Tenant ID

### npx (recommended)

No install needed — runs directly:

```json
{
  "mcpServers": {
    "servicetitan": {
      "command": "npx",
      "args": ["-y", "@rowvyn/servicetitan-mcp"],
      "env": {
        "ST_CLIENT_ID": "your-client-id",
        "ST_CLIENT_SECRET": "your-client-secret",
        "ST_APP_KEY": "your-app-key",
        "ST_TENANT_ID": "your-tenant-id"
      }
    }
  }
}
```

### Install globally

```bash
npm install -g @rowvyn/servicetitan-mcp
servicetitan-mcp       # stdio transport (for Claude Desktop)
servicetitan-mcp-sse     # SSE transport (legacy remote)
servicetitan-mcp-http    # Streamable HTTP transport (recommended remote)
```

### From source

```bash
npm install
npm run build
```

### Claude Desktop

For a local checkout, point Claude Desktop at the built stdio entrypoint:

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "servicetitan": {
      "command": "node",
      "args": ["/absolute/path/to/servicetitan-mcp/build/index.js"],
      "env": {
        "ST_CLIENT_ID": "your-client-id",
        "ST_CLIENT_SECRET": "your-client-secret",
        "ST_APP_KEY": "your-app-key",
        "ST_TENANT_ID": "your-tenant-id",
        "ST_TIMEZONE": "America/New_York"
      }
    }
  }
}
```

Works the same way in **Cursor**, **Windsurf**, and any other MCP-compatible host.

### Generic stdio

```bash
ST_CLIENT_ID=your-client-id \
ST_CLIENT_SECRET=your-client-secret \
ST_APP_KEY=your-app-key \
ST_TENANT_ID=your-tenant-id \
ST_TIMEZONE=America/New_York \
node /absolute/path/to/servicetitan-mcp/build/index.js
```

### Remote Deployment (Streamable HTTP)

Deploy to Fly.io or any server, then connect via `mcp-remote`:

```bash
# On the server
ST_CLIENT_ID=... ST_CLIENT_SECRET=... ST_APP_KEY=... ST_TENANT_ID=... \
  ST_MCP_API_KEY=your-secret node build/streamable-http.js
```

```json
{
  "mcpServers": {
    "servicetitan": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-instance.fly.dev/mcp",
        "--header",
        "x-api-key: YOUR_MCP_API_KEY"
      ]
    }
  }
}
```

> SSE remains available at `build/sse.js` for backward compatibility, but it is deprecated. Prefer Streamable HTTP at `/mcp` for new deployments.

---

## Tool Catalog

467 tools registered across 15 domains:

| Domain | Tools | Example Tools |
|--------|------:|---------------|
| `dispatch` | 74 | `dispatch_jobs_list`, `dispatch_appointments_get`, `dispatch_job_types_list` |
| `crm` | 71 | `crm_customers_list`, `crm_contacts_get`, `crm_bookings_create` |
| `export` | 49 | `export_invoices`, `export_customers`, `export_jobs` |
| `inventory` | 37 | `inventory_purchase_orders_list`, `inventory_vendors_list`, `inventory_warehouses_list` |
| `marketing` | 35 | `marketing_campaigns_list`, `marketing_calls_v3_list`, `marketing_reviews` |
| `accounting` | 33 | `accounting_invoices_list`, `accounting_payments_list`, `accounting_gl_accounts_list` |
| `pricebook` | 31 | `pricebook_services_list`, `pricebook_materials_list`, `pricebook_equipment_list` |
| `payroll` | 27 | `payroll_payrolls_list`, `payroll_timesheets_job_list`, `payroll_gross_pay_items_list` |
| `settings` | 23 | `settings_business_units_list`, `settings_tag_types_list`, `settings_user_roles_list` |
| `people` | 22 | `people_technicians_list`, `people_employees_list`, `people_trucks_list` |
| `memberships` | 21 | `memberships_list`, `memberships_types_list`, `memberships_recurring_services_list` |
| `scheduling` | 17 | `scheduling_teams_list`, `scheduling_zones_list`, `scheduling_capacity_calculate` |
| `estimates` | 11 | `estimates_list`, `estimates_get`, `estimates_items_list` |
| **`intelligence`** | **10** | `intel_revenue_summary`, `intel_daily_snapshot`, `intel_technician_scorecard` |
| `reporting` | 5 | `reporting_reports_list`, `reporting_report_categories_list` |
| **Total** | **466** | *(+ 1 system tool: `st_health_check` = **467** total)* |

> With `ST_READONLY=true` (default), all tools are registered but write and delete operations are blocked at execution time with a clear error message (`Readonly mode: operation not permitted`). Use `ST_CONFIRM_WRITES=true` to require `_confirmed: true` on write operations, or `confirm: true` on delete operations.

---

## Intelligence Tools

The real differentiator. These 10 tools aggregate multiple API calls and report endpoints into operational insights — the kind of answers that would otherwise require custom BI tooling.

| Tool | What It Returns |
|------|----------------|
| `intel_revenue_summary` | Dashboard-matched revenue by business unit. Includes completed revenue, non-job revenue, adjustments, collections, and BU productivity rollups. |
| `intel_daily_snapshot` | 6-metric same-day ops briefing: revenue-to-date, jobs in progress, call outcomes, bookings, open estimates, and upcoming next-day jobs. |
| `intel_technician_scorecard` | Per-tech jobs, revenue, avg ticket, productivity, lead gen, membership close rate, and sales from both tech and marketing leads — with team averages. |
| `intel_membership_health` | Active memberships, signups, cancellations, renewals, retention rate, invoiced revenue, and conversion by business unit. |
| `intel_estimate_pipeline` | Open/sold/dismissed funnel, conversion rate, days-to-close, age buckets, stale opportunities, and tech sales funnel metrics. |
| `intel_campaign_performance` | Campaign calls, bookings, conversion rate, total revenue context, and BU lead-gen metrics from Report 176. |
| `intel_csr_performance` | CSR booking performance: jobs booked, revenue, avg ticket, top campaigns, job type mix, conversion metrics, and team averages. |
| `intel_labor_cost` | Labor cost summary from the Master Pay File: employee hours, gross pay, hourly rates, activity mix, and BU breakdowns. |
| `intel_invoice_tracking` | Invoice email tracking: sent vs not-sent counts, send rate, dollar impact, and unsent breakdowns by business unit and technician. |
| `intel_lookup` | Cached reference data — technicians, business units, payment types, membership types with IDs and names. 30-minute TTL. |

These tools are why this server exists. Raw CRUD tools are table stakes. Intelligence tools turn API data into business decisions.

### Revenue Accuracy

`intel_revenue_summary` uses ServiceTitan's **Reporting API** to calculate totals. This is the same source ST's own dashboard uses — which means it includes:

- **Completed Revenue** — revenue from completed jobs
- **Non-Job Revenue** — membership fees, add-ons, and other income not tied to a specific job
- **Adjustment Revenue** — credits, adjustments, and corrections

Raw invoice or job endpoint sums will not match the dashboard. Both miss non-job revenue. For dashboard-matching figures, use `intel_revenue_summary`. For invoice-level detail, use `accounting_invoices_list`.

### Name-Based Filtering

Most intelligence tools accept `businessUnitName` and `technicianName` as alternatives to numeric IDs:

```
# Instead of:
intel_revenue_summary(startDate="2026-01-01", endDate="2026-04-01", businessUnitId=12345)

# Use:
intel_revenue_summary(startDate="2026-01-01", endDate="2026-04-01", businessUnitName="HVAC")
```

Business unit name matching uses exact → prefix → contains fallback. Technician name matching uses case-insensitive substring search. If no match is found, the tool returns all data with a warning.

---

## Configuration

Copy `.env.example` to `.env` and fill in your credentials.

**Required**

| Variable | Description |
|----------|-------------|
| `ST_CLIENT_ID` | ServiceTitan OAuth client ID |
| `ST_CLIENT_SECRET` | ServiceTitan OAuth client secret |
| `ST_APP_KEY` | ServiceTitan app key (`ST-App-Key` header) |
| `ST_TENANT_ID` | ServiceTitan tenant identifier |
| `ST_MCP_API_KEY` | API key for remote MCP clients *(required for remote HTTP deployment)* |

**Optional**

| Variable | Default | Description |
|----------|---------|-------------|
| `ST_ENVIRONMENT` | `integration` | ServiceTitan environment: `integration` or `production` |
| `ST_READONLY` | `true` | Block write and delete operations at execution time |
| `ST_CONFIRM_WRITES` | `false` | Require `_confirmed: true` to execute write tools |
| `ST_MAX_RESPONSE_CHARS` | `100000` | Cap tool response size |
| `ST_DOMAINS` | *(all)* | Comma-separated domain allowlist (e.g. `crm,dispatch,reporting`) |
| `ST_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `ST_TIMEZONE` | `UTC` | IANA timezone for the tenant (e.g. `America/New_York`) — used for date-bound intelligence queries and local-time display conversion in all tool responses |
| `ST_RESPONSE_SHAPING` | `true` | Set to `false` to disable intelligence response transformation |
| `ST_CORS_ORIGIN` | _(none)_ | Allowed CORS origin for Streamable HTTP / SSE. Required for browser access. |
| `ST_ALLOWED_CALLERS` | _(none)_ | Comma-separated caller identity allowlist (e.g. `alice@example.com,svc-user`) |
| `ST_INTEL_CACHE_TTL_MS` | `300000` | Intelligence result cache TTL in milliseconds (default: 5 minutes) |
| `ST_MCP_PORT` / `PORT` | `3100` | HTTP server port for Streamable HTTP and SSE transports |
| `ST_MCP_API_KEY` | _(none)_ | API key for authenticating remote MCP clients (required for HTTP transports) |

> **Set `ST_TIMEZONE`** to your tenant's local timezone. Without it, date-only queries (e.g. `startDate: "2026-02-01"`) are interpreted as UTC midnight — which can miss or include invoices and jobs near day boundaries for non-UTC tenants, and tool responses will keep timestamps in UTC instead of your local display timezone.

Boolean env vars accept: `true`, `false`, `1`, `0` (case-insensitive).

---

## Architecture

The server is built as a layered system: **Config → OAuth Client → Domain Registry → MCP Server**.

- **Domain module pattern** — each domain lives in `src/domains/<domain>/` and exports a loader that registers its tools
- **Dynamic discovery** — `src/domains/loader.ts` scans `src/domains/*/index.ts` and imports each domain at runtime
- **Central registry** — `ToolRegistry` handles domain filtering, read-only enforcement, confirmation wrapping, and audit logging
- **OAuth client** — `ServiceTitanClient` manages client-credentials auth, token refresh, retry-on-401/429, and `{tenant}` path injection
- **Response shaping** — transformer layer strips API noise and structures responses for LLM consumption
- **Intelligence layer** — composite tools fan out to multiple endpoints and report IDs, then aggregate results

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full deep-dive: route table, response shaping pipeline, intelligence layer design, and safety system.

---

## CLI Companion

If you prefer working from the terminal directly, [servicetitan-cli](https://github.com/montrellcruse/servicetitan-cli) is a companion `st` binary built from the same auth and intelligence layer:

```bash
# Install
npm install -g @rowvyn/servicetitan-cli

# Same intelligence — no MCP required
st revenue --period ytd --compact
st snapshot --compact

# Pipe into your agent
st customers list --all --json | your-agent process
```

The CLI and this MCP server share the same design philosophy: push the business question into the tool name, minimize schema overhead, and shape responses for AI consumption.

---

## Comparison

| Feature | This Server | Community MCP Servers |
|---------|------------|----------------------|
| Revenue accuracy | ✅ Dashboard-matched | ❌ $17–21K off per period |
| Intelligence tools | ✅ 10 tools | ❌ None |
| Domain coverage | ✅ 467 tools, 15 domains | ⚠️ 10–50 tools |
| Safety layer | ✅ Read-only default, audit log | ❌ None |
| Response shaping | ✅ LLM-optimized | ❌ Raw API responses |
| Name-based filtering | ✅ Resolve names to IDs automatically | ❌ Numeric IDs required |
| Remote deployment | ✅ Streamable HTTP + `mcp-remote` | ⚠️ Varies |

---

## Development

```bash
npm run dev        # tsc --watch
npm run test       # vitest run
npm run lint       # eslint src/
npm run typecheck  # tsc --noEmit
npm run build      # compile to build/
npm run start      # run compiled server
```

---

## Safety

- **Read-only mode** (`ST_READONLY=true` by default) — all tools are registered but write and delete operations are blocked at execution time
- **Confirmation workflow** — delete tools require `confirm: true` (returns preview payload when missing); write tools optionally require `_confirmed: true` via `ST_CONFIRM_WRITES=true` (returns error when missing)
- **Audit logging** — all write/delete executions emit `[AUDIT]` log records with timestamp, tool, operation, resource, and sanitized params (secrets/tokens redacted)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

---

## License

MIT
