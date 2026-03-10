# ServiceTitan MCP Server (Enterprise)

Enterprise-grade MCP server for the ServiceTitan API, built for safe production use with domain-level control, write safeguards, and high-value intelligence tools.

## Features

- Domain filtering via `ST_DOMAINS` to expose only the tool groups you want.
- Read-only mode enabled by default (`ST_READONLY=true`) for safer production rollout.
- Safety layer in the registry:
  - Optional confirmation for write tools (`ST_CONFIRM_WRITES=true`).
  - Required confirmation for all delete tools.
  - Audit logging for write/delete operations with sensitive fields sanitized.
- 9 intelligence tools that combine multiple ServiceTitan endpoints into operational and revenue insights.
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

### Claude Desktop, Cursor, Windsurf, and Other MCP-Compatible Hosts

Claude Desktop, Cursor, Windsurf, and most MCP hosts that accept an `mcpServers` JSON block use the same stdio config. Paste this into the host's MCP settings file, then adjust the env vars for your tenant:

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
| `intelligence` | 9 | Composite analytics tools across revenue, pipeline, marketing, memberships, operations, technician performance, CSR booking, labor cost, and invoice delivery. |
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

The intelligence domain includes 9 high-value analytical tools:

| Tool | What It Returns | Example Use Case |
| --- | --- | --- |
| `intel_revenue_summary` | Dashboard-accurate revenue totals, BU breakdowns, collections, outstanding balance, conversion metrics, plus BU productivity and sales rollups. | "Summarize January revenue by business unit." |
| `intel_technician_scorecard` | Per-tech completed jobs, revenue, productivity, lead generation, memberships, sales from tech leads, sales from marketing leads, and team averages. | "Compare technician productivity and close rates this month." |
| `intel_membership_health` | Active memberships, signups, cancellations, renewals, retention rate, total invoiced revenue, and membership conversion by business unit. | "Check churn pressure and membership conversion for last quarter." |
| `intel_estimate_pipeline` | Open/sold/dismissed funnel, conversion rate, days-to-close, age buckets, stale opportunities, and technician sales funnel metrics. | "Find stale open estimates older than 30 days and quantify pipeline risk." |
| `intel_campaign_performance` | Campaign calls, bookings, conversion, total-period revenue context, and BU lead-generation metrics from Report 176. | "Rank campaigns by call volume and identify weak conversion." |
| `intel_daily_snapshot` | Same-day appointment/job progress, revenue-to-date, call outcomes, next-day upcoming jobs, and plain-English highlights. | "Get a daily ops briefing before end-of-day dispatch review." |
| `intel_csr_performance` | CSR booking performance with jobs booked, revenue, average ticket, top campaigns, job type mix, conversion metrics, and team averages. | "Which CSR booked the most revenue this month?" |
| `intel_labor_cost` | Labor cost summary from the Master Pay File with employee hours, gross pay, hourly rates, activity mix, and business-unit breakdowns. | "What did labor cost us last month?" |
| `intel_invoice_tracking` | Invoice email tracking with sent vs not-sent counts, send rate, dollar impact, and unsent breakdowns by business unit and technician. | "Which techs are not sending invoices?" |

### Revenue: API vs Dashboard Accuracy

`intel_revenue_summary` uses ServiceTitan's **Reporting API** (Report 175: "Revenue") to calculate totals. This matches the ST dashboard exactly because it includes:

- **Completed Revenue** — revenue from completed jobs
- **Non-Job Revenue** — membership fees, add-ons, and other income not tied to a specific job
- **Adjustment Revenue** — credits, adjustments, and corrections

Raw invoice or job endpoint sums will **not** match the dashboard. The invoices API returns invoice-level totals (which include tax and exclude non-job revenue), while the jobs API only captures job-level totals. Both miss the non-job revenue component that ST's internal reporting engine includes.

If you need invoice-level detail (line items, individual invoice totals), use `accounting_invoices_list`. For dashboard-matching revenue figures, use `intel_revenue_summary`.

### Reporting API Integration

Intelligence tools now use a mix of ServiceTitan Reporting API and REST endpoints. The reporting side currently uses these report definitions:

| Report ID(s) | Tool | Purpose |
| --- | --- | --- |
| `162` | `intel_csr_performance` | Job Detail By CSR for booked jobs, revenue, campaign mix, job type mix, and CSR conversion metrics. |
| `163` | `intel_daily_snapshot` | Upcoming jobs scheduled for tomorrow. |
| `165` | `intel_technician_scorecard` | Completed job detail used to count jobs by technician assignment. |
| `166` | `intel_labor_cost` | Master Pay File hours, overtime, gross pay, and labor activity mix. |
| `168` | `intel_technician_scorecard` | Technician revenue, avg ticket, opportunities, conversion, and customer satisfaction. |
| `169` | `intel_technician_scorecard` | Technician lead generation metrics. |
| `170` | `intel_technician_scorecard` | Technician productivity metrics such as revenue per hour and billable efficiency. |
| `171` | `intel_technician_scorecard` | Technician membership opportunities and close rate. |
| `172` | `intel_estimate_pipeline` | Technician sales funnel and close-rate rollups. |
| `173` | `intel_technician_scorecard` | Sales generated from technician leads. |
| `174` | `intel_technician_scorecard` | Sales generated from marketing leads. |
| `175` | `intel_revenue_summary` | Dashboard-accurate business-unit revenue. |
| `176` | `intel_campaign_performance` | Business-unit lead-generation metrics that add sales context to campaign activity. |
| `177` | `intel_revenue_summary` | Business-unit productivity metrics. |
| `178` | `intel_membership_health` | Business-unit membership conversion metrics. |
| `179` | `intel_revenue_summary` | Business-unit sales metrics. |
| `182` | `intel_membership_health` | Membership summary totals by membership type. |
| `2281 / 2282` | `intel_invoice_tracking` | Sent vs not-sent invoice email tracking. |

Supporting REST endpoints are still used where the reports do not expose record-level detail or where near-real-time operational data is a better fit, including payments, invoices, calls, estimates, appointments, jobs, bookings, and campaigns.

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
