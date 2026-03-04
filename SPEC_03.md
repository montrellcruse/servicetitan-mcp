# Spec 03: Safety Layer, Audit Logging & Test Suite

**Objective:** Add production safety mechanisms for write/delete operations, structured audit logging, and comprehensive test coverage for all domain modules.

**Depends on:** Spec 01 + Spec 02 (core infrastructure and domain modules must be complete)

**Output:** A server that's safe to run against production ServiceTitan with write operations enabled, plus a full test suite.

---

## Part A: Safety Layer

### 1. Write Operation Confirmation Pattern

Add a two-step confirmation pattern for all `delete` operations and optionally for `write` operations.

#### How it works:

When a DELETE tool is called, instead of executing immediately, it returns a **preview** of what will happen and asks for confirmation:

```typescript
// First call: crm_customers_delete({ id: 12345 })
// Response:
{
  "action": "DELETE",
  "resource": "customer",
  "id": 12345,
  "confirm": "To confirm deletion, call crm_customers_delete with id=12345 and confirm=true"
}

// Second call: crm_customers_delete({ id: 12345, confirm: true })
// Response:
{
  "success": true,
  "message": "Customer 12345 deleted"
}
```

#### Implementation:

Add a `confirm` parameter to all `delete` operation tools:

```typescript
// In the tool schema, add:
confirm: z.boolean().optional().default(false).describe("Set to true to confirm this destructive action")
```

In the handler:
```typescript
handler: async ({ id, confirm }) => {
  if (!confirm) {
    return toolResult({
      action: "DELETE",
      resource: "customer",
      id,
      warning: "This will permanently delete this customer and cannot be undone.",
      confirm: `Call this tool again with confirm=true to proceed.`,
    });
  }
  // Actually execute the delete
  await client.delete(`/crm/v2/tenant/{tenant}/customers/${id}`);
  return toolResult({ success: true, message: `Customer ${id} deleted` });
}
```

#### Scope:
- **Required** for all `delete` operation tools
- **Optional** for `write` operation tools — controlled by a new env var `ST_CONFIRM_WRITES` (default: `false`). When true, create/update tools also require confirmation.

Add `ST_CONFIRM_WRITES` to `config.ts`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ST_CONFIRM_WRITES` | No | `false` | Require confirmation for write (create/update) operations |

---

### 2. Audit Logger

Create `src/audit.ts` — a dedicated audit log for all write/delete operations.

```typescript
export class AuditLogger {
  constructor(private logger: Logger)

  /**
   * Log a write/delete operation.
   * Called AFTER successful execution (not on preview/confirmation step).
   */
  log(entry: AuditEntry): void
}

export interface AuditEntry {
  timestamp: string;          // ISO 8601
  tool: string;               // Tool name (e.g., "crm_customers_delete")
  operation: 'write' | 'delete';
  domain: string;
  resource: string;           // Resource type (e.g., "customer")
  resourceId?: number | string;
  params: Record<string, any>; // Sanitized params (no secrets)
  success: boolean;
  error?: string;
}
```

**Output:** Audit entries go to stderr via the Logger at `info` level, prefixed with `[AUDIT]`:

```json
{"level":"info","ts":"2026-03-04T20:15:00.000Z","msg":"[AUDIT] DELETE crm_customers_delete","tool":"crm_customers_delete","operation":"delete","resource":"customer","resourceId":12345,"success":true}
```

#### Integration with tool handlers:

Update the tool registration pattern so that write/delete handlers automatically log audit entries. The cleanest way is to wrap the handler in the registry:

```typescript
// In registry.ts, when registering a write/delete tool:
if (tool.operation === 'write' || tool.operation === 'delete') {
  const originalHandler = tool.handler;
  tool.handler = async (params) => {
    const result = await originalHandler(params);
    // Only log if not a confirmation preview
    if (params.confirm !== false || tool.operation === 'write') {
      this.auditLogger.log({
        timestamp: new Date().toISOString(),
        tool: tool.name,
        operation: tool.operation,
        domain: tool.domain,
        resource: tool.name.split('_')[1] || 'unknown',
        resourceId: params.id,
        params: sanitizeParams(params),
        success: !result.isError,
        error: result.isError ? result.content[0]?.text : undefined,
      });
    }
    return result;
  };
}
```

**`sanitizeParams()`** strips any field named `secret`, `password`, `token`, or `key` from the params object before logging.

---

### 3. Response Size Limiting

Large list/export responses can dump megabytes of JSON into the LLM context, which is useless and expensive.

Add a response size cap to `toolResult()`:

```typescript
const MAX_RESPONSE_CHARS = 100_000; // ~100KB

export function toolResult(data: any): ToolResponse {
  const json = JSON.stringify(data, null, 2);
  if (json.length > MAX_RESPONSE_CHARS) {
    const truncated = json.slice(0, MAX_RESPONSE_CHARS);
    return {
      content: [{
        type: "text",
        text: truncated + `\n\n[TRUNCATED — Response was ${json.length.toLocaleString()} characters. Use pagination (page/pageSize) to get smaller result sets.]`
      }],
    };
  }
  return { content: [{ type: "text", text: json }] };
}
```

Also add a configurable env var:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ST_MAX_RESPONSE_CHARS` | No | `100000` | Maximum response size in characters before truncation |

---

### 4. Health Check Tool

Add a built-in `st_health_check` tool that verifies connectivity:

```typescript
// Registered in index.ts directly (not part of any domain)
registry.register({
  name: "st_health_check",
  domain: "_system",
  operation: "read",
  description: "Verify ServiceTitan API connectivity, authentication, and tenant access",
  schema: {},
  handler: async () => {
    const checks: Record<string, string> = {};

    // 1. Auth check — can we get a token?
    try {
      await client.ensureToken(); // Add this method to client — just triggers token refresh
      checks.authentication = "✅ OK";
    } catch (e: any) {
      checks.authentication = `❌ Failed: ${e.message}`;
    }

    // 2. Tenant check — can we hit a simple endpoint?
    try {
      await client.get(`/settings/v2/tenant/{tenant}/business-units`, { pageSize: 1 });
      checks.tenant_access = "✅ OK";
    } catch (e: any) {
      checks.tenant_access = `❌ Failed: ${e.message}`;
    }

    // 3. Server info
    checks.environment = config.environment;
    checks.readonly_mode = String(config.readonlyMode);
    checks.enabled_domains = config.enabledDomains?.join(", ") || "all";

    const stats = registry.getStats();
    checks.tools_registered = String(stats.registered);
    checks.tools_skipped = String(stats.skipped);

    return toolResult(checks);
  },
});
```

The `_system` domain is always enabled regardless of `ST_DOMAINS` filtering.

---

## Part B: Test Suite

### Test Infrastructure

- Framework: vitest (already in devDependencies from Spec 01)
- HTTP mocking: Use vitest's `vi.mock()` to mock the ServiceTitanClient
- No real API calls in tests

### Test Structure

```
tests/
├── setup.ts                    # Shared test setup, mock factories
├── core/
│   ├── client.test.ts          # From Spec 01 (keep/expand)
│   ├── config.test.ts          # From Spec 01 (keep/expand)
│   ├── utils.test.ts           # From Spec 01 (expand)
│   └── registry.test.ts        # From Spec 01 (expand)
├── safety/
│   ├── confirmation.test.ts    # Delete confirmation pattern
│   ├── audit.test.ts           # Audit logging
│   ├── truncation.test.ts      # Response size limiting
│   └── health-check.test.ts    # Health check tool
└── domains/
    ├── accounting.test.ts
    ├── crm.test.ts
    ├── dispatch.test.ts
    ├── payroll.test.ts
    ├── pricebook.test.ts
    ├── estimates.test.ts
    ├── memberships.test.ts
    ├── people.test.ts
    ├── marketing.test.ts
    ├── scheduling.test.ts
    ├── settings.test.ts
    ├── reporting.test.ts
    ├── inventory.test.ts
    └── export.test.ts
```

### `tests/setup.ts` — Shared Test Utilities

```typescript
import { vi } from "vitest";
import type { ServiceTitanClient } from "../src/client.js";
import type { ServiceTitanConfig } from "../src/config.js";

export function mockConfig(overrides?: Partial<ServiceTitanConfig>): ServiceTitanConfig {
  return {
    clientId: "test-client-id",
    clientSecret: "test-secret",
    appKey: "test-app-key",
    tenantId: "12345",
    environment: "integration",
    readonlyMode: false,
    enabledDomains: null,
    logLevel: "error", // Suppress logs in tests
    confirmWrites: false,
    maxResponseChars: 100_000,
    ...overrides,
  };
}

export function mockClient(): ServiceTitanClient {
  return {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    put: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    patch: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    delete: vi.fn().mockResolvedValue({}),
    ensureToken: vi.fn().mockResolvedValue(undefined),
  } as unknown as ServiceTitanClient;
}
```

### Domain Test Pattern

Each domain test file verifies:

1. **Tool registration** — Correct number of tools registered for the domain
2. **Naming convention** — All tool names match `{domain}_{resource}_{action}` pattern
3. **Operation tagging** — GET tools tagged `read`, POST/PUT/PATCH tagged `write`, DELETE tagged `delete`
4. **Handler behavior** — Calls correct client method with correct path and params
5. **Error handling** — Returns `toolError()` on client exception

Example:

```typescript
// tests/domains/crm.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolRegistry } from "../../src/registry.js";
import { Logger } from "../../src/logger.js";
import { loadCrmDomain } from "../../src/domains/crm/index.js";
import { mockConfig, mockClient } from "../setup.js";

describe("CRM Domain", () => {
  let registry: ToolRegistry;
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const config = mockConfig();
    const logger = new Logger("error");
    registry = new ToolRegistry(server, config, logger);
    client = mockClient();
    loadCrmDomain(client, registry);
  });

  it("registers expected number of tools", () => {
    const stats = registry.getStats();
    expect(stats.registered).toBeGreaterThan(0);
    expect(stats.byDomain["crm"]).toBeGreaterThan(0);
  });

  it("all tool names follow naming convention", () => {
    const tools = registry.getRegisteredTools(); // Add this method to registry
    for (const tool of tools) {
      if (tool.domain === "crm") {
        expect(tool.name).toMatch(/^crm_[a-z]+(_[a-z]+)*$/);
      }
    }
  });

  it("respects readonly mode", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const config = mockConfig({ readonlyMode: true });
    const logger = new Logger("error");
    const readonlyRegistry = new ToolRegistry(server, config, logger);
    loadCrmDomain(mockClient(), readonlyRegistry);

    const tools = readonlyRegistry.getRegisteredTools();
    for (const tool of tools) {
      expect(tool.operation).toBe("read");
    }
  });
});
```

### Safety Tests

#### `tests/safety/confirmation.test.ts`
- ✅ Delete tool WITHOUT `confirm=true` returns preview (not executed)
- ✅ Delete tool WITH `confirm=true` executes the delete
- ✅ Write tool with `ST_CONFIRM_WRITES=true` requires confirmation
- ✅ Write tool with `ST_CONFIRM_WRITES=false` executes immediately
- ✅ Preview response includes resource type and ID

#### `tests/safety/audit.test.ts`
- ✅ Write operations produce audit log entries
- ✅ Delete operations produce audit log entries (only on confirmed execution)
- ✅ Read operations do NOT produce audit entries
- ✅ Failed operations log with `success: false` and error message
- ✅ Params are sanitized (no fields named password/secret/token/key)
- ✅ Confirmation-preview calls do NOT produce audit entries

#### `tests/safety/truncation.test.ts`
- ✅ Small responses are not truncated
- ✅ Responses exceeding MAX_RESPONSE_CHARS are truncated with notice
- ✅ Truncation notice includes original size
- ✅ Truncation notice suggests pagination

#### `tests/safety/health-check.test.ts`
- ✅ Returns OK when auth and tenant access succeed
- ✅ Returns failure details when auth fails
- ✅ Returns failure details when tenant access fails
- ✅ Includes server configuration summary

### Expanded Core Tests

#### `tests/core/registry.test.ts` (expand from Spec 01)
- ✅ `getRegisteredTools()` returns all registered tool definitions
- ✅ `_system` domain is always enabled regardless of `ST_DOMAINS`
- ✅ Audit wrapper is applied to write/delete tools
- ✅ Audit wrapper is NOT applied to read tools
- ✅ Confirmation wrapper is applied to delete tools
- ✅ Confirmation wrapper respects `ST_CONFIRM_WRITES` for write tools

#### `tests/core/utils.test.ts` (expand from Spec 01)
- ✅ `toolResult` truncation at MAX_RESPONSE_CHARS
- ✅ `sanitizeParams` strips sensitive field names
- ✅ `sanitizeParams` preserves non-sensitive fields

---

## Updated Config (`src/config.ts`)

Add these new fields to the config interface and env var parsing:

```typescript
export interface ServiceTitanConfig {
  // ... existing fields from Spec 01 ...
  confirmWrites: boolean;       // ST_CONFIRM_WRITES
  maxResponseChars: number;     // ST_MAX_RESPONSE_CHARS
}
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ST_CONFIRM_WRITES` | No | `false` | Require confirmation for create/update operations |
| `ST_MAX_RESPONSE_CHARS` | No | `100000` | Max response characters before truncation |

---

## Acceptance Criteria

### Safety
- [ ] All delete tools require `confirm=true` to execute
- [ ] Delete tools return a descriptive preview when called without confirmation
- [ ] Write tools respect `ST_CONFIRM_WRITES` setting
- [ ] All write/delete operations produce structured audit log entries to stderr
- [ ] Audit entries never contain sensitive parameter values
- [ ] Responses exceeding the size limit are truncated with a pagination hint
- [ ] `st_health_check` reports auth status, tenant access, and server config

### Tests
- [ ] `npm test` passes all tests
- [ ] Every domain module has a corresponding test file
- [ ] Test coverage > 80% on core modules (client, config, registry, utils)
- [ ] Test coverage > 60% on domain modules (handler logic)
- [ ] All safety mechanisms have dedicated test files
- [ ] Tests use mocked HTTP — zero real API calls
- [ ] `npm run typecheck` still passes with all new code
