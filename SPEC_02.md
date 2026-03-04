# Spec 02: Domain Modules — Tool Migration

**Objective:** Port all ServiceTitan API tools from the original single-file server into properly structured domain modules. Fix all naming, typing, and duplication issues.

**Depends on:** Spec 01 (core infrastructure must be complete)

**Input:** The original `src/index.ts` from https://github.com/JordanDalton/ServiceTitanMcpServer contains 454 `server.tool()` calls. Use these as a reference for which endpoints exist and what parameters they accept. Do NOT copy the implementation patterns — use the new infrastructure from Spec 01.

**Output:** All 454 endpoints migrated into domain modules using the new registry, client, and utility patterns.

---

## Domain Module Structure

Each domain is a directory under `src/domains/` with an `index.ts` that exports a `DomainLoader`:

```
src/domains/
├── accounting/
│   ├── index.ts          # DomainLoader — registers all accounting tools
│   ├── invoices.ts       # Invoice tools
│   ├── payments.ts       # Payment tools
│   ├── credits.ts        # AP credit tools
│   ├── gl-accounts.ts    # GL account tools
│   └── journal-entries.ts
├── crm/
│   ├── index.ts
│   ├── customers.ts
│   ├── contacts.ts
│   ├── locations.ts
│   ├── leads.ts
│   └── bookings.ts
├── dispatch/
│   ├── index.ts
│   ├── jobs.ts
│   ├── appointments.ts
│   └── projects.ts
├── payroll/
│   ├── index.ts
│   ├── payrolls.ts
│   ├── timesheets.ts
│   ├── gross-pay.ts
│   ├── adjustments.ts
│   └── settings.ts
├── pricebook/
│   ├── index.ts
│   ├── services.ts
│   ├── materials.ts
│   ├── equipment.ts
│   ├── categories.ts
│   └── discounts-fees.ts
├── estimates/
│   ├── index.ts
│   ├── estimates.ts
│   └── items.ts
├── memberships/
│   ├── index.ts
│   ├── types.ts
│   ├── recurring-services.ts
│   └── service-agreements.ts
├── people/
│   ├── index.ts
│   ├── employees.ts
│   ├── technicians.ts
│   └── user-roles.ts
├── marketing/
│   ├── index.ts
│   ├── campaigns.ts
│   ├── calls.ts
│   └── opt-in-out.ts
├── scheduling/
│   ├── index.ts
│   ├── schedulers.ts
│   └── sessions.ts
├── settings/
│   ├── index.ts
│   ├── business-units.ts
│   ├── tag-types.ts
│   ├── activities.ts
│   ├── activity-categories.ts
│   ├── activity-types.ts
│   └── tasks.ts
├── reporting/
│   ├── index.ts
│   ├── report-categories.ts
│   ├── reports.ts
│   └── dynamic-value-sets.ts
├── inventory/
│   ├── index.ts
│   ├── purchase-orders.ts
│   ├── vendors.ts
│   ├── warehouses.ts
│   └── bills.ts
└── export/
    ├── index.ts
    └── exporters.ts       # All export/bulk endpoints consolidated
```

---

## Domain Loader Pattern

Each domain's `index.ts` follows this exact pattern:

```typescript
// src/domains/crm/index.ts
import type { DomainLoader } from "../../registry.js";
import { registerCustomerTools } from "./customers.js";
import { registerContactTools } from "./contacts.js";
import { registerLocationTools } from "./locations.js";
import { registerLeadTools } from "./leads.js";
import { registerBookingTools } from "./bookings.js";

export const loadCrmDomain: DomainLoader = (client, registry) => {
  registerCustomerTools(client, registry);
  registerContactTools(client, registry);
  registerLocationTools(client, registry);
  registerLeadTools(client, registry);
  registerBookingTools(client, registry);
};
```

---

## Tool Implementation Pattern

Every tool follows the exact same pattern. Here's the template:

```typescript
// src/domains/crm/customers.ts
import { z } from "zod";
import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolResult, toolError, buildParams, paginationParams, dateFilterParams, activeFilterParam, sortParam } from "../../utils.js";

export function registerCustomerTools(client: ServiceTitanClient, registry: ToolRegistry) {

  // READ: Get single customer
  registry.register({
    name: "crm_customers_get",
    domain: "crm",
    operation: "read",
    description: "Get a customer by ID",
    schema: {
      id: z.number().int().describe("Customer ID"),
    },
    handler: async ({ id }) => {
      try {
        const data = await client.get(`/crm/v2/tenant/{tenant}/customers/${id}`);
        return toolResult(data);
      } catch (error: any) {
        return toolError(error.message);
      }
    },
  });

  // READ: List customers
  registry.register({
    name: "crm_customers_list",
    domain: "crm",
    operation: "read",
    description: "List customers with filters",
    schema: {
      ...paginationParams(),
      ...dateFilterParams(),
      ...activeFilterParam(),
      ...sortParam(["Id", "Name", "CreatedOn", "ModifiedOn"]),
      ids: z.string().optional().describe("Comma-separated IDs (max 50)"),
      name: z.string().optional().describe("Filter by name (case-insensitive contains)"),
      modifiedBefore: z.string().datetime().optional(),
      modifiedOnOrAfter: z.string().datetime().optional(),
    },
    handler: async (params) => {
      try {
        const data = await client.get(`/crm/v2/tenant/{tenant}/customers`, buildParams(params));
        return toolResult(data);
      } catch (error: any) {
        return toolError(error.message);
      }
    },
  });

  // WRITE: Create customer
  registry.register({
    name: "crm_customers_create",
    domain: "crm",
    operation: "write",
    description: "Create a new customer",
    schema: {
      name: z.string().describe("Customer name"),
      // ... all typed fields from ST API spec
    },
    handler: async (params) => {
      try {
        const data = await client.post(`/crm/v2/tenant/{tenant}/customers`, params);
        return toolResult(data);
      } catch (error: any) {
        return toolError(error.message);
      }
    },
  });

  // DELETE: Delete customer
  registry.register({
    name: "crm_customers_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a customer by ID",
    schema: {
      id: z.number().int().describe("Customer ID"),
    },
    handler: async ({ id }) => {
      try {
        await client.delete(`/crm/v2/tenant/{tenant}/customers/${id}`);
        return toolResult({ success: true, message: "Customer deleted" });
      } catch (error: any) {
        return toolError(error.message);
      }
    },
  });
}
```

---

## Tool Naming Convention

**All tools MUST follow this pattern:** `{domain}_{resource}_{action}`

### Actions:
| Action | HTTP Method | Operation Tag |
|--------|-------------|---------------|
| `get` | GET (single) | read |
| `list` | GET (collection) | read |
| `create` | POST | write |
| `update` | PUT/PATCH | write |
| `delete` | DELETE | delete |
| `export` | GET (export endpoint) | read |
| `sell` | PUT (status change) | write |
| `unsell` | PUT (status change) | write |
| `dismiss` | PUT (status change) | write |

### Examples:
```
crm_customers_get
crm_customers_list
crm_customers_create
crm_customers_update
crm_customers_delete
pricebook_services_get
pricebook_services_list
payroll_timesheets_list
payroll_timesheets_create
export_invoices                    # export domain tools don't repeat "export"
export_customers
estimates_items_get
estimates_items_list
estimates_items_delete
estimates_sell                     # action on the estimate itself
```

---

## Typing Requirements

### ELIMINATE all `z.record(z.any())`

The original repo uses `z.record(z.any())` for 35 tool payloads. This is NOT acceptable. Every tool must have fully typed schemas.

For complex create/update endpoints, define the full Zod schema matching the ServiceTitan API documentation. Reference: https://developer.servicetitan.io/

If you cannot determine the exact schema for a create/update endpoint, use a reasonable typed schema based on the GET response shape for that same resource. For example, if `crm_customers_get` returns `{ name, address, phone, email }`, then `crm_customers_update` should accept those same fields as optional.

### Shared schema fragments

Use the utility functions from Spec 01's `utils.ts`:
- `paginationParams()` — page, pageSize, includeTotal
- `dateFilterParams()` — createdBefore, createdOnOrAfter, modifiedBefore, modifiedOnOrAfter
- `activeFilterParam()` — active enum
- `sortParam(fields)` — sort with documented field list

---

## ServiceTitan API Path Patterns

The ST API uses versioned paths per module. Map them correctly:

| Domain | API Path Prefix |
|--------|----------------|
| accounting | `/accounting/v2/tenant/{tenant}/` |
| crm | `/crm/v2/tenant/{tenant}/` |
| dispatch | `/jpm/v2/tenant/{tenant}/` |
| payroll | `/payroll/v2/tenant/{tenant}/` |
| pricebook | `/pricebook/v2/tenant/{tenant}/` |
| estimates | `/sales/v2/tenant/{tenant}/` |
| memberships | `/memberships/v2/tenant/{tenant}/` |
| people | `/crm/v2/tenant/{tenant}/` (employees/technicians share CRM module) |
| marketing | `/marketing/v2/tenant/{tenant}/` |
| scheduling | `/dispatch/v2/tenant/{tenant}/` |
| settings | `/settings/v2/tenant/{tenant}/` |
| reporting | `/reporting/v2/tenant/{tenant}/` |
| inventory | `/inventory/v2/tenant/{tenant}/` |
| export | Varies by resource — each export tool uses the appropriate module prefix |
| calls (v2) | `/v2/tenant/{tenant}/calls` |
| calls (v3) | `/v3/tenant/{tenant}/calls` |

**IMPORTANT:** Cross-reference the paths from the original repo's tool implementations. The original code uses paths like `/tenant/${tenant}/customers` (without the module prefix) because it was hitting a base URL that already included the module prefix. With our new client that uses the root API URL, you need to include the full module path.

Actually — looking at the original code more carefully, the original `axios.create` uses `baseURL: env.apiUrl` which is just `https://api.servicetitan.io`. The tools then use paths like `/tenant/${tenant}/customers`, which means the paths DON'T include module prefixes in the original. ServiceTitan routes by the ST-App-Key permissions, not URL prefixes.

**Use the exact same path patterns as the original repo** (e.g., `/tenant/{tenant}/customers`) since the base URL routing is the same. The paths in the original code are the correct ones.

---

## Domain Loading in `src/index.ts`

Update the entry point to dynamically load all domain modules:

```typescript
// In src/index.ts, after creating the registry:

import { loadAccountingDomain } from "./domains/accounting/index.js";
import { loadCrmDomain } from "./domains/crm/index.js";
import { loadDispatchDomain } from "./domains/dispatch/index.js";
import { loadPayrollDomain } from "./domains/payroll/index.js";
import { loadPricebookDomain } from "./domains/pricebook/index.js";
import { loadEstimatesDomain } from "./domains/estimates/index.js";
import { loadMembershipsDomain } from "./domains/memberships/index.js";
import { loadPeopleDomain } from "./domains/people/index.js";
import { loadMarketingDomain } from "./domains/marketing/index.js";
import { loadSchedulingDomain } from "./domains/scheduling/index.js";
import { loadSettingsDomain } from "./domains/settings/index.js";
import { loadReportingDomain } from "./domains/reporting/index.js";
import { loadInventoryDomain } from "./domains/inventory/index.js";
import { loadExportDomain } from "./domains/export/index.js";

registry.registerDomain("accounting", loadAccountingDomain);
registry.registerDomain("crm", loadCrmDomain);
registry.registerDomain("dispatch", loadDispatchDomain);
registry.registerDomain("payroll", loadPayrollDomain);
registry.registerDomain("pricebook", loadPricebookDomain);
registry.registerDomain("estimates", loadEstimatesDomain);
registry.registerDomain("memberships", loadMembershipsDomain);
registry.registerDomain("people", loadPeopleDomain);
registry.registerDomain("marketing", loadMarketingDomain);
registry.registerDomain("scheduling", loadSchedulingDomain);
registry.registerDomain("settings", loadSettingsDomain);
registry.registerDomain("reporting", loadReportingDomain);
registry.registerDomain("inventory", loadInventoryDomain);
registry.registerDomain("export", loadExportDomain);
```

---

## Empty-Body Create Tools

The original repo has several create tools that POST with no body (e.g., `categories_create`, `materials_create`, `technicians_create`). These are likely bugs in the original. For our implementation:

- If the ServiceTitan API docs show a required request body → implement the typed schema
- If the API truly accepts an empty POST (rare, but some "trigger" endpoints do) → document this in the tool description and keep the schema minimal
- When in doubt, add the typed schema based on the GET response shape for that resource

---

## Acceptance Criteria

- [ ] All 454 original endpoints are migrated into domain modules
- [ ] Every tool follows the `{domain}_{resource}_{action}` naming convention
- [ ] Zero `z.record(z.any())` — all payloads are typed
- [ ] All shared params use utility functions (paginationParams, dateFilterParams, etc.)
- [ ] Every tool uses `toolResult()` / `toolError()` (no raw content arrays)
- [ ] `{tenant}` is never a tool parameter — it comes from config
- [ ] `npm run build` succeeds with zero errors
- [ ] `npm run typecheck` passes with strict mode
- [ ] Domain filtering works: `ST_DOMAINS=crm,pricebook` only registers tools from those domains
- [ ] Read-only mode works: `ST_READONLY=true` skips all write/delete tools
- [ ] Server logs domain summary on startup: "Registered X tools across Y domains (Z skipped)"
