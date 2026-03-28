# Documentation Audit v4

Date: 2026-03-28

Scope:
- `README.md`
- `CHANGELOG.md`
- `ARCHITECTURE.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `TOOLS.md`
- `.env.example`

Method:
- Read the audited docs plus `package.json` and the relevant code under `src/`.
- Derived the live tool inventory from current source registration sites, including helper-based registrations and `st_health_check`.
- Checked repository-relative Markdown links in the audited files.

## Findings

### High - `TOOLS.md` is still undercounting the live registry by 7 tools

Docs:
- `TOOLS.md:3`

Source:
- `src/registry.ts:70-101`
- `src/domains/crm/customers.ts:467-485`
- `src/domains/crm/locations.ts:471-499`
- `src/domains/dispatch/jobs.ts:466-482`
- `src/domains/dispatch/jobs.ts:685-703`
- `src/domains/dispatch/projects.ts:437-455`
- `src/domains/payroll/timesheets.ts:392-402`
- `src/domains/people/technicians.ts:384-404`

Details:
- Current source still registers **467** tools total, but `TOOLS.md` says **460**.
- These live tools exist in `src/` but are absent from `TOOLS.md`:
  `crm_customers_tags_create`,
  `crm_locations_contacts_update`,
  `dispatch_jobs_cancel`,
  `dispatch_jobs_custom_field_types_list`,
  `dispatch_projects_custom_field_types_list`,
  `payroll_timesheets_non_job_delete`,
  `people_technician_shifts_update`.
- This is catalog drift, not a source drift issue: the numeric totals in `README.md` still match the live registry.

### High - Read-only behavior is documented as registration-time filtering, but the code enforces it at execution time

Docs:
- `README.md:143`
- `README.md:211`
- `README.md:290`
- `ARCHITECTURE.md:247`
- `ARCHITECTURE.md:280`
- `CONTRIBUTING.md:83`

Source:
- `src/registry.ts:70-101`
- `src/registry.ts:204-215`

Details:
- `ToolRegistry.register()` only skips tools for domain filtering. It does not drop write or delete tools when `ST_READONLY=true`.
- Mutating tools still register and remain visible to MCP clients.
- The actual protection is runtime-only: both writes and deletes return `Readonly mode: operation not permitted` when invoked while read-only mode is enabled.
- `SECURITY.md` matches the current behavior. `README.md`, `ARCHITECTURE.md`, and `CONTRIBUTING.md` do not.

### Medium - Configuration docs are incomplete, and `ARCHITECTURE.md` overstates what `loadConfig()` validates

Docs:
- `README.md:196-218`
- `ARCHITECTURE.md:136-152`

Source:
- `src/config.ts:1-15`
- `src/config.ts:155-182`
- `src/response-shaping.ts:138-140`
- `src/domains/intelligence/helpers.ts:14-17`
- `src/streamable-http.ts:46-50`
- `src/sse.ts:41-45`
- `.env.example:15-24`

Details:
- `README.md` and `ARCHITECTURE.md` omit active env vars used by current code:
  `ST_ALLOWED_CALLERS`,
  `ST_INTEL_CACHE_TTL_MS`.
- `README.md` also omits the remote port controls:
  `ST_MCP_PORT` and `PORT`.
- `ARCHITECTURE.md` says `loadConfig()` validates every variable at startup, but several active env vars are handled outside `loadConfig()`:
  `ST_RESPONSE_SHAPING`,
  `ST_INTEL_CACHE_TTL_MS`,
  `ST_MCP_API_KEY`,
  `ST_MCP_PORT` / `PORT`.
- `.env.example` is the accurate source of truth here; the prose docs are not.

### Medium - Health-check documentation does not match the current HTTP endpoints

Docs:
- `ARCHITECTURE.md:105-110`
- `CHANGELOG.md:13-16`

Source:
- `src/streamable-http.ts:117-139`
- `src/streamable-http.ts:255-264`
- `src/sse.ts:96-118`
- `src/sse.ts:151-159`

Details:
- The MCP tool `st_health_check` returns only `authentication` and `tenant_access`.
- But `GET /health` on both remote transports still returns config-adjacent fields:
  `environment` and `readonly`.
- `ARCHITECTURE.md` currently says the HTTP health endpoint returns only basic status/tool count.
- `CHANGELOG.md` currently says the health check returns only auth and tenant connectivity status.
- Those statements are too strong for the current `GET /health` implementation.

### Medium - `README.md` uses stale payroll example tool names

Docs:
- `README.md:133`

Source:
- `src/domains/payroll/payrolls.ts:64-72`
- `src/domains/payroll/gross-pay.ts:56-64`
- `src/domains/payroll/gross-pay.ts:113-121`
- `src/domains/payroll/timesheets.ts:189-197`
- `src/domains/payroll/timesheets.ts:249-257`
- `src/domains/payroll/timesheets.ts:282-290`
- `src/domains/payroll/timesheets.ts:337-345`

Details:
- `payroll_payrolls_list` exists.
- `payroll_timesheets_list` does not exist in current source.
- `payroll_gross_pay_list` does not exist in current source.
- Current payroll read names are split across:
  `payroll_timesheets_non_job_list`,
  `payroll_timesheets_job_list`,
  `payroll_timesheets_jobs_list`,
  and `payroll_gross_pay_items_list`.

### Medium - `ARCHITECTURE.md`'s domain ownership table is stale and crossed between domains

Docs:
- `ARCHITECTURE.md:255-267`

Source:
- `src/domains/dispatch/index.ts:3-21`
- `src/domains/scheduling/index.ts:3-17`
- `src/domains/people/index.ts:3-13`
- `src/domains/settings/index.ts:3-15`

Details:
- `dispatch` currently owns appointments, jobs, job types, projects, images, installed equipment, forms, and arrival windows. The doc describes it like the older capacity/teams/zones slice.
- `scheduling` currently owns appointment assignments, business hours, capacity, non-job appointments, teams, and zones. The doc describes it like the older appointments/job-types slice.
- `people` currently owns employees, technicians, trucks, and GPS. The doc says `people` is employees and user roles.
- `settings` currently owns business units, tag types, activities, tasks, and user roles. The doc still attributes technicians and business hours there.

### Medium - `ARCHITECTURE.md`'s response-shaping behavior is stale

Docs:
- `ARCHITECTURE.md:357-359`

Source:
- `src/response-shaping.ts:154-180`
- `src/response-shaping.ts:183-200`

Details:
- Currency-like numeric fields are rounded to **2 decimal places**, not 0.
- Full timestamps are preserved for most fields; only explicit date-only fields such as `date`, `scheduledDate`, `dueDate`, and `expirationDate` are compacted to `YYYY-MM-DD`.
- The current prose still describes the older “round to 0 decimals / reduce ISO timestamps broadly” behavior.

### Low - Name-matching docs overstate the matching strategy and include a false example

Docs:
- `README.md:188`
- `ARCHITECTURE.md:392`

Source:
- `src/domains/intelligence/resolvers.ts:24-58`
- `src/domains/intelligence/resolvers.ts:65-86`
- `src/cache.ts:358-370`

Details:
- `businessUnitName` resolution does use exact -> prefix -> contains fallback.
- `technicianName` resolution does not. It uses `findTechniciansByName()`, which performs substring matching across normalized name fields.
- `ARCHITECTURE.md` says `"gonzalo"` matches `"Alex Ruiz"`, which is impossible under the current substring matcher.
- `README.md` currently describes the exact/prefix/contains sequence as if it applied uniformly to all name-based filters.

## Checked With No Findings

- `package.json` version `2.3.0` matches the hardcoded server version in the entrypoints.
- The numeric tool/domain claims in `README.md` are still correct: **467 tools**, **15 domains**, **10 intelligence tools**.
- `SECURITY.md` is consistent with the current authorization and transport-auth behavior.
- `.env.example` is complete for the env vars currently used by `src/`.
- No broken repository-relative Markdown links were found in the audited files.
