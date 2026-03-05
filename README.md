# ServiceTitan MCP Server (Enterprise)

Enterprise-grade MCP server for the ServiceTitan API, built for safe production use with domain-level control, write safeguards, and high-value intelligence tools.

## Features

- Domain filtering via `ST_DOMAINS` to expose only the tool groups you want.
- Read-only mode enabled by default (`ST_READONLY=true`) for safer production rollout.
- Safety layer in the registry:
  - Optional confirmation for write tools (`ST_CONFIRM_WRITES=true`).
  - Required confirmation for all delete tools.
  - Audit logging for write/delete operations with sensitive fields sanitized.
- 6 intelligence tools that combine multiple ServiceTitan endpoints into operational and revenue insights.
- Dynamic domain loading from `src/domains/*` with centralized tool registration and stats.
- Built-in `st_health_check` system tool for connectivity and config verification.

## Quick Start

### Prerequisites

- Node.js 22 or newer
- ServiceTitan API credentials:
  - OAuth Client ID
  - OAuth Client Secret
  - ST App Key
  - Tenant ID

### Installation

```bash
npm install
npm run build
```

### Configuration

1. Copy `.env.example` to `.env`.
2. Set all required variables.
3. Keep `ST_READONLY=true` until you are ready to allow write/delete tools.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ST_CLIENT_ID` | Yes | None | ServiceTitan OAuth client ID. |
| `ST_CLIENT_SECRET` | Yes | None | ServiceTitan OAuth client secret. |
| `ST_APP_KEY` | Yes | None | ServiceTitan app key (`ST-App-Key` header). |
| `ST_TENANT_ID` | Yes | None | ServiceTitan tenant identifier injected into `{tenant}` API paths. |
| `ST_ENVIRONMENT` | No | `integration` | ServiceTitan environment: `integration` or `production`. |
| `ST_READONLY` | No | `true` | If `true`, all `write` and `delete` tools are skipped at registration time. |
| `ST_CONFIRM_WRITES` | No | `false` | If `true`, `write` tools require `confirm=true` to execute. |
| `ST_MAX_RESPONSE_CHARS` | No | `100000` | Positive integer cap used for tool response size limiting. |
| `ST_DOMAINS` | No | All domains | Comma-separated domain allowlist (example: `crm,dispatch,reporting`). |
| `ST_LOG_LEVEL` | No | `info` | Logger level: `debug`, `info`, `warn`, `error`. |
| `ST_TIMEZONE` | No | `UTC` | IANA timezone for the tenant (e.g. `America/New_York`). Intelligence tools use this to align date boundaries with the tenant's local time. |

Notes:
- Boolean env vars accept: `true`, `false`, `1`, `0` (case-insensitive).
- Empty `ST_DOMAINS` means all domains are enabled.
- **Set `ST_TIMEZONE`** to your tenant's local timezone. Without it, date-only queries (e.g. `startDate: "2026-02-01"`) are interpreted as UTC midnight, which can miss or include invoices/jobs near day boundaries. For example, an EST tenant should use `ST_TIMEZONE=America/New_York` so that "Feb 1" means midnight Eastern, not midnight UTC.

## MCP Client Setup

Build first:

```bash
npm run build
```

Use the built entrypoint: `build/index.js`.

### Claude Desktop

Add to Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "servicetitan": {
      "command": "node",
      "args": ["/absolute/path/to/servicetitan-mcp-server/build/index.js"],
      "env": {
        "ST_CLIENT_ID": "your-client-id",
        "ST_CLIENT_SECRET": "your-client-secret",
        "ST_APP_KEY": "your-app-key",
        "ST_TENANT_ID": "your-tenant-id",
        "ST_ENVIRONMENT": "integration",
        "ST_READONLY": "true",
        "ST_CONFIRM_WRITES": "false",
        "ST_MAX_RESPONSE_CHARS": "100000",
        "ST_DOMAINS": "",
        "ST_LOG_LEVEL": "info",
        "ST_TIMEZONE": ""
      }
    }
  }
}
```

### Cursor

Add to Cursor `settings.json`:

```json
{
  "mcpServers": {
    "servicetitan": {
      "command": "node",
      "args": ["/absolute/path/to/servicetitan-mcp-server/build/index.js"],
      "env": {
        "ST_CLIENT_ID": "your-client-id",
        "ST_CLIENT_SECRET": "your-client-secret",
        "ST_APP_KEY": "your-app-key",
        "ST_TENANT_ID": "your-tenant-id",
        "ST_ENVIRONMENT": "integration",
        "ST_READONLY": "true",
        "ST_CONFIRM_WRITES": "false",
        "ST_MAX_RESPONSE_CHARS": "100000",
        "ST_DOMAINS": "",
        "ST_LOG_LEVEL": "info",
        "ST_TIMEZONE": ""
      }
    }
  }
}
```

### Windsurf

Add to Windsurf MCP config:

```json
{
  "mcpServers": {
    "servicetitan": {
      "command": "node",
      "args": ["/absolute/path/to/servicetitan-mcp-server/build/index.js"],
      "env": {
        "ST_CLIENT_ID": "your-client-id",
        "ST_CLIENT_SECRET": "your-client-secret",
        "ST_APP_KEY": "your-app-key",
        "ST_TENANT_ID": "your-tenant-id",
        "ST_ENVIRONMENT": "integration",
        "ST_READONLY": "true",
        "ST_CONFIRM_WRITES": "false",
        "ST_MAX_RESPONSE_CHARS": "100000",
        "ST_DOMAINS": "",
        "ST_LOG_LEVEL": "info",
        "ST_TIMEZONE": ""
      }
    }
  }
}
```

### OpenClaw / Generic StdIO Host

Any MCP host that supports stdio can run:

```bash
ST_CLIENT_ID=your-client-id \
ST_CLIENT_SECRET=your-client-secret \
ST_APP_KEY=your-app-key \
ST_TENANT_ID=your-tenant-id \
ST_ENVIRONMENT=integration \
ST_READONLY=true \
ST_CONFIRM_WRITES=false \
ST_MAX_RESPONSE_CHARS=100000 \
ST_LOG_LEVEL=info \
ST_TIMEZONE="" \
node /absolute/path/to/servicetitan-mcp-server/build/index.js
```

### Remote Hosting (SSE + mcp-remote)

If you deploy the SSE server (for example on Fly.io), use your `/sse` endpoint:

- URL pattern: `https://<your-app>.fly.dev/sse`
- Remote host auth: set `ST_MCP_API_KEY` on the server and send it as `x-api-key` from the client.

Example MCP client config using `mcp-remote`:

```json
{
  "mcpServers": {
    "servicetitan": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-instance.fly.dev/sse",
        "--header",
        "x-api-key: YOUR_MCP_API_KEY"
      ]
    }
  }
}
```

## Available Domains

Tool counts are from:

```bash
grep -rc 'registry.register(' src/domains/
```

| Domain | Tools | Description |
| --- | ---: | --- |
| `accounting` | 33 | GL accounts, invoices, payments, payment terms/types, AP credits/payments, journal entries, tax zones. |
| `crm` | 87 | Customers, locations, contacts, bookings, leads, customer memberships, and CRM tagging flows. |
| `dispatch` | 74 | Jobs, appointments, projects, job types, arrival windows, forms, images, installed equipment. |
| `estimates` | 14 | Estimate lifecycle and estimate item management. |
| `export` | 1 | Export tooling for packaged extraction workflows. |
| `intelligence` | 6 | Composite analytics tools across revenue, pipeline, marketing, memberships, operations, and technician performance. |
| `inventory` | 37 | Purchase orders, returns, receipts, transfers, vendors, warehouses, and PO markups/types. |
| `marketing` | 38 | Campaigns, categories, costs, calls, attributions, suppressions, and opt-in/out operations. |
| `memberships` | 21 | Memberships, membership types, recurring services, and service agreements. |
| `payroll` | 27 | Payroll runs, settings, timesheets, gross pay, and payroll adjustments. |
| `people` | 22 | Employees, technicians, trucks, and GPS telemetry lookups. |
| `pricebook` | 33 | Categories, services, materials, equipment, discounts/fees, and bulk pricebook operations. |
| `reporting` | 5 | Reports, report categories, and dynamic value sets. |
| `scheduling` | 23 | Teams, zones, shifts, appointment assignments, non-job appointments, capacity, and business hours. |
| `settings` | 23 | Business units, tag types, activities, tasks, and user roles. |

## Intelligence Tools

The intelligence domain includes 6 high-value analytical tools:

| Tool | What It Returns | Example Use Case |
| --- | --- | --- |
| `intel_revenue_summary` | Total revenue (matches ST dashboard), breakdown by BU (completed, non-job, adjustment), collections, outstanding, conversion rates. | "Summarize January revenue by business unit." |
| `intel_technician_scorecard` | Per-tech completed jobs, revenue, avg ticket, opportunities/conversion, customer satisfaction, revenue per hour, billable efficiency, upsold amount, recalls caused, jobs/day, plus team averages. Uses ST Reporting API reports 168, 170, and 165 for dashboard-accurate metrics. | "Compare technician productivity and close rates this month." |
| `intel_membership_health` | Dashboard-accurate membership metrics via ST Reporting API Report 182: active counts, signups, cancellations, renewals, expirations, suspended/reactivated/deleted counts, retention rate, and member vs non-member revenue. | "Check churn pressure and membership revenue mix for last quarter." |
| `intel_estimate_pipeline` | Open/sold/dismissed funnel, conversion rate, days-to-close, age buckets, stale opportunities. | "Find stale open estimates older than 30 days and quantify pipeline risk." |
| `intel_campaign_performance` | Campaign calls, bookings, conversion, revenue, revenue per call. | "Rank campaigns by revenue efficiency and identify low-conversion spend." |
| `intel_daily_snapshot` | Same-day appointment/job progress, revenue-to-date, call outcomes, and highlights. | "Get a daily ops briefing before end-of-day dispatch review." |

### Revenue: API vs Dashboard Accuracy

`intel_revenue_summary` uses ServiceTitan's **Reporting API** (Report 175: "Revenue") to calculate totals. This matches the ST dashboard exactly because it includes:

- **Completed Revenue** — revenue from completed jobs
- **Non-Job Revenue** — membership fees, add-ons, and other income not tied to a specific job
- **Adjustment Revenue** — credits, adjustments, and corrections

Raw invoice or job endpoint sums will **not** match the dashboard. The invoices API returns invoice-level totals (which include tax and exclude non-job revenue), while the jobs API only captures job-level totals. Both miss the non-job revenue component that ST's internal reporting engine includes.

If you need invoice-level detail (line items, individual invoice totals), use `accounting_invoices_list`. For dashboard-matching revenue figures, use `intel_revenue_summary`.

### Reporting API Integration

Intelligence tools now use a mix of ServiceTitan Reporting API and REST endpoints:

| Tool | Data Source | Notes |
| --- | --- | --- |
| `intel_revenue_summary` | Reporting API + REST | Revenue comes from Report 175 (dashboard-accurate). Payments/collections still use REST. |
| `intel_technician_scorecard` | Reporting API | Uses Reports 168, 170, and 165. Replaced 51+ REST N+1 calls with 3 report calls. |
| `intel_membership_health` | Reporting API + REST | Core membership metrics come from Report 182; invoice revenue split uses REST. |
| `intel_estimate_pipeline` | REST | Funnel + age-bucket logic currently computed from REST estimate data. |
| `intel_campaign_performance` | REST | Currently REST-based; Reporting API rewire tracked separately. |
| `intel_daily_snapshot` | REST | Real-time daily operations data; REST is the right fit for low-latency snapshots. |

- **Timezone matters:** Set `ST_TIMEZONE` to the tenant's IANA timezone for all reporting/date-bound intelligence tools. This prevents day-boundary drift from UTC interpretation.
- **Report IDs are universal:** Built-in dashboard report IDs (for example 165, 168, 170, 175, 182) are standardized across ServiceTitan tenants.

## Safety Features

- Read-only mode (`ST_READONLY=true` by default):
  - Non-read tools are skipped during registration.
  - Helps validate production connectivity before enabling mutations.
- Confirmation workflow:
  - All delete tools require `confirm=true`.
  - Write tools require `confirm=true` when `ST_CONFIRM_WRITES=true`.
  - When confirmation is missing, the tool returns a preview/warning payload instead of executing.
- Audit logging:
  - All write/delete executions emit `[AUDIT]` log records.
  - Captures timestamp, tool, domain, operation, resource, ID, params, success/failure.
  - Sensitive fields (`secret`, `password`, `token`, `key`) are removed from logged params.

## Development

```bash
npm run dev        # tsc --watch
npm run test       # vitest run
npm run lint       # eslint src/
npm run typecheck  # tsc --noEmit
npm run build      # compile to build/
```

To run compiled server directly:

```bash
npm run start
```

## Architecture Overview

- Domain module pattern:
  - Each domain lives in `src/domains/<domain>/`.
  - Domain `index.ts` exports a loader that registers all tools in that domain.
- Dynamic domain discovery:
  - `src/index.ts` scans `src/domains/*` and imports each domain `index.js` at runtime.
- Central registry:
  - `ToolRegistry` handles filtering (`ST_DOMAINS`, `ST_READONLY`), confirmation wrapping, audit hooks, and registration stats.
- API client layer:
  - `ServiceTitanClient` manages OAuth client-credentials auth, token refresh, retry-on-401/429 behavior, and `{tenant}` path replacement.
- System tool:
  - `st_health_check` validates auth, tenant access, active config, and registration summary.

## License

MIT
