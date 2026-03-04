# Spec 01: Core Infrastructure & Project Scaffold

**Objective:** Create a new, properly structured ServiceTitan MCP server project from scratch. This is the foundation all subsequent specs build on.

**Input:** The original repo at https://github.com/JordanDalton/ServiceTitanMcpServer is reference only. Do NOT copy-paste from it. Build clean.

**Output:** A working MCP server that can authenticate with ServiceTitan, with zero tools registered (tools come in Spec 02).

---

## Project Structure

```
servicetitan-mcp/
├── src/
│   ├── index.ts                    # Entry point: env validation, domain loading, transport
│   ├── client.ts                   # ServiceTitanClient class (auth + HTTP methods)
│   ├── config.ts                   # Environment config parsing + validation
│   ├── utils.ts                    # Shared helpers (toolResult, toolError, pagination)
│   ├── logger.ts                   # Structured logger (JSON to stderr)
│   ├── types.ts                    # Shared TypeScript types
│   ├── registry.ts                 # Tool registration system with domain filtering + read/write tagging
│   └── domains/                    # Empty — populated in Spec 02
│       └── .gitkeep
├── tests/
│   ├── client.test.ts
│   ├── config.test.ts
│   ├── utils.test.ts
│   └── registry.test.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── eslint.config.js
├── vitest.config.ts
└── README.md
```

---

## 1. `src/config.ts` — Environment Configuration

Parse and validate all configuration from environment variables. Fail fast with clear error messages.

```typescript
export interface ServiceTitanConfig {
  clientId: string;
  clientSecret: string;
  appKey: string;
  tenantId: string;
  environment: 'integration' | 'production';
  readonlyMode: boolean;
  enabledDomains: string[] | null;  // null = all domains
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

**Environment variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ST_CLIENT_ID` | Yes | — | ServiceTitan OAuth client ID |
| `ST_CLIENT_SECRET` | Yes | — | ServiceTitan OAuth client secret |
| `ST_APP_KEY` | Yes | — | ServiceTitan application key |
| `ST_TENANT_ID` | Yes | — | ServiceTitan tenant ID |
| `ST_ENVIRONMENT` | No | `integration` | `integration` or `production` |
| `ST_READONLY` | No | `true` | Only register read tools when `true` |
| `ST_DOMAINS` | No | (all) | Comma-separated domain filter: `crm,pricebook,reporting` |
| `ST_LOG_LEVEL` | No | `info` | Log verbosity |

**Validation rules:**
- All 4 required vars must be non-empty strings. If any are missing, throw an error listing ALL missing vars (not just the first one).
- `ST_ENVIRONMENT` must be exactly `integration` or `production`.
- `ST_READONLY` accepts `true`, `false`, `1`, `0` (case-insensitive).
- `ST_DOMAINS` is split by comma, trimmed, lowercased. Empty string = all domains.

**Export a `loadConfig()` function** that returns `ServiceTitanConfig` or throws.

---

## 2. `src/client.ts` — ServiceTitan API Client

A clean HTTP client that handles OAuth token lifecycle.

### ServiceTitan API Environments

```typescript
const ENVIRONMENTS = {
  integration: {
    authUrl: 'https://auth-integration.servicetitan.io',
    apiUrl: 'https://api-integration.servicetitan.io',
  },
  production: {
    authUrl: 'https://auth.servicetitan.io',
    apiUrl: 'https://api.servicetitan.io',
  },
} as const;
```

### Class: `ServiceTitanClient`

```typescript
export class ServiceTitanClient {
  constructor(config: ServiceTitanConfig)

  // Core HTTP methods — tenant ID is injected automatically
  async get(path: string, params?: Record<string, any>): Promise<any>
  async post(path: string, body?: any, params?: Record<string, any>): Promise<any>
  async put(path: string, body?: any, params?: Record<string, any>): Promise<any>
  async patch(path: string, body?: any, params?: Record<string, any>): Promise<any>
  async delete(path: string, params?: Record<string, any>): Promise<any>
}
```

**Critical implementation details:**

1. **Token acquisition MUST use raw `axios.post()`** — NOT `this.get/post/etc`. The original repo has an infinite recursion bug because auth calls go through the same client that requires auth. The token endpoint call must use a standalone axios call.

2. **Token caching:** Store `accessToken` and `tokenExpiration` as instance fields. Refresh only when token is expired or within 60 seconds of expiry.

3. **Automatic tenant ID injection:** All path strings use a literal path like `/crm/v2/tenant/${tenantId}/customers`. The client reads `tenantId` from config. Tool handlers should NOT pass tenant ID — they pass paths with `{tenantId}` placeholder and the client replaces it. Actually, simpler: the `get/post/put/patch/delete` methods accept a path like `/crm/v2/tenant/{tenant}/customers` and the client replaces `{tenant}` with `config.tenantId` before making the request.

   Wait — even simpler. Tools will pass paths like `/customers` and the client prefixes with the base URL + tenant segment. But ServiceTitan's API paths vary by module (`/crm/v2/tenant/{id}/...`, `/accounting/v2/tenant/{id}/...`, `/jpm/v2/tenant/{id}/...`). So the cleanest pattern is:

   **Tools pass the full path segment after the base URL**, e.g. `/crm/v2/tenant/{tenant}/customers/{id}`. The client:
   - Prepends the environment's `apiUrl`
   - Replaces `{tenant}` with `config.tenantId`
   - Adds auth headers

4. **Request/response interceptors:**
   - Request: Add `Authorization: Bearer {token}` and `ST-App-Key: {appKey}` headers
   - Response: On 401, refresh token once and retry. On 429, respect `Retry-After` header.

5. **Error sanitization:** Never return raw error objects. Strip any headers that might contain tokens. Return only: HTTP status code, ServiceTitan error message (if present), and request path.

### Token Flow

```
POST {authUrl}/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={clientId}
&client_secret={clientSecret}

Response: { access_token, expires_in (seconds) }
```

---

## 3. `src/utils.ts` — Shared Helpers

### `toolResult(data: any): ToolResponse`

Wraps any data into the MCP tool response format:
```typescript
{ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
```

### `toolError(message: string): ToolResponse`

Wraps an error message:
```typescript
{ content: [{ type: "text", text: `Error: ${message}` }], isError: true }
```

### `paginationParams(schema: ZodObject)`

Returns a reusable Zod schema fragment for pagination params that most ST endpoints accept:
```typescript
{
  page: z.number().int().optional().describe("Page number (starts at 1)"),
  pageSize: z.number().int().min(1).max(5000).optional().describe("Records per page (default 50)"),
  includeTotal: z.boolean().optional().describe("Include total count in response"),
}
```

### `dateFilterParams(schema: ZodObject)`

Returns reusable date filter params:
```typescript
{
  createdBefore: z.string().datetime().optional(),
  createdOnOrAfter: z.string().datetime().optional(),
  modifiedBefore: z.string().datetime().optional(),
  modifiedOnOrAfter: z.string().datetime().optional(),
}
```

### `activeFilterParam()`

Returns the common active filter:
```typescript
{
  active: z.enum(["True", "Any", "False"]).optional().default("True").describe("Filter by active status"),
}
```

### `sortParam(fields: string[])`

Returns a sort param with documented available fields:
```typescript
{
  sort: z.string().optional().describe(`Sort: +Field (asc) or -Field (desc). Fields: ${fields.join(", ")}`),
}
```

### `buildParams(obj: Record<string, any>): Record<string, any>`

Strips `undefined` and `null` values from a params object before passing to the client. This replaces the repetitive `if (x) params.x = x` pattern in the original code.

---

## 4. `src/registry.ts` — Tool Registration System

This is the key architectural piece that enables domain filtering and read/write separation.

```typescript
export type ToolOperation = 'read' | 'write' | 'delete';

export interface ToolDefinition {
  name: string;
  domain: string;
  operation: ToolOperation;
  schema: Record<string, ZodType>;
  handler: (params: any) => Promise<ToolResponse>;
  description?: string;
}

export class ToolRegistry {
  constructor(
    private server: McpServer,
    private config: ServiceTitanConfig,
    private logger: Logger
  )

  /**
   * Register a tool definition. The registry decides whether to actually
   * register it with the MCP server based on:
   * - config.enabledDomains (domain filter)
   * - config.readonlyMode (skip write/delete tools)
   */
  register(tool: ToolDefinition): void

  /**
   * Bulk register from a domain module.
   * Each domain module exports a function: (client, registry) => void
   */
  registerDomain(name: string, loader: DomainLoader): void

  /** Get stats about registered vs skipped tools */
  getStats(): { registered: number; skipped: number; byDomain: Record<string, number> }
}
```

**Behavior:**
- If `config.enabledDomains` is set and the tool's domain is not in the list → skip (log at debug level)
- If `config.readonlyMode` is true and the tool's operation is `write` or `delete` → skip (log at info level)
- Otherwise, call `server.tool(name, schema, handler)`
- After all domains are loaded, log a summary: "Registered X tools (Y skipped: Z readonly-filtered, W domain-filtered)"

### Domain Loader Interface

Each domain module exports a single function:

```typescript
export type DomainLoader = (client: ServiceTitanClient, registry: ToolRegistry) => void;
```

---

## 5. `src/logger.ts` — Structured Logger

Simple structured logger that writes JSON to stderr (MCP uses stdout for protocol messages).

```typescript
export class Logger {
  constructor(level: 'debug' | 'info' | 'warn' | 'error')

  debug(msg: string, data?: Record<string, any>): void
  info(msg: string, data?: Record<string, any>): void
  warn(msg: string, data?: Record<string, any>): void
  error(msg: string, data?: Record<string, any>): void
}
```

Output format (one JSON object per line to stderr):
```json
{"level":"info","ts":"2026-03-04T20:15:00.000Z","msg":"Registered 127 tools","registered":127,"skipped":327}
```

---

## 6. `src/index.ts` — Entry Point

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ServiceTitanClient } from "./client.js";
import { ToolRegistry } from "./registry.js";
import { Logger } from "./logger.js";

// 1. Load and validate config (throws on missing vars)
const config = loadConfig();

// 2. Initialize logger
const logger = new Logger(config.logLevel);

// 3. Create MCP server
const server = new McpServer({
  name: "ServiceTitan",
  version: "2.0.0",
});

// 4. Create API client
const client = new ServiceTitanClient(config);

// 5. Create tool registry
const registry = new ToolRegistry(server, config, logger);

// 6. Load domain modules (dynamic imports from ./domains/)
// For now (Spec 01), no domains exist yet. This is the hook point.
// In Spec 02, this will dynamically import all domain modules.

// 7. Log summary
const stats = registry.getStats();
logger.info("Server ready", stats);

// 8. Connect transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 7. `src/types.ts` — Shared Types

```typescript
import type { z } from "zod";

/** Standard MCP tool response */
export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** ServiceTitan paginated response envelope */
export interface PaginatedResponse<T> {
  page: number;
  pageSize: number;
  totalCount?: number;
  hasMore: boolean;
  data: T[];
  continueFrom?: string;
}
```

---

## 8. Configuration Files

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "tests", "build"]
}
```

### `package.json`
```json
{
  "name": "servicetitan-mcp-server",
  "version": "2.0.0",
  "type": "module",
  "main": "build/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node build/index.js",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.8.0",
    "axios": "^1.8.4",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "eslint": "^9.0.0",
    "typescript": "^5.8.3",
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0"
  }
}
```

### `.env.example`
```bash
# Required
ST_CLIENT_ID=your-client-id
ST_CLIENT_SECRET=your-client-secret
ST_APP_KEY=your-app-key
ST_TENANT_ID=your-tenant-id

# Optional
ST_ENVIRONMENT=integration          # integration | production
ST_READONLY=true                     # true | false (default: true)
ST_DOMAINS=                          # comma-separated: crm,pricebook,reporting (empty = all)
ST_LOG_LEVEL=info                    # debug | info | warn | error
```

### `.gitignore`
```
node_modules/
build/
.env
*.tgz
coverage/
```

---

## 9. Tests

Write tests using vitest for:

### `tests/config.test.ts`
- ✅ Valid config with all required vars
- ✅ Missing single required var → error lists missing var
- ✅ Missing multiple required vars → error lists ALL missing vars
- ✅ Invalid environment value → clear error
- ✅ ST_READONLY defaults to true
- ✅ ST_READONLY accepts "true", "false", "1", "0" (case-insensitive)
- ✅ ST_DOMAINS parsing (comma-separated, trimmed, lowercased)
- ✅ Empty ST_DOMAINS → null (all domains)

### `tests/client.test.ts`
- ✅ Token acquisition uses correct auth URL for each environment
- ✅ Token is cached and reused when not expired
- ✅ Token is refreshed when expired
- ✅ `{tenant}` placeholder is replaced in paths
- ✅ Auth headers are set correctly (Bearer token + ST-App-Key)
- ✅ Error responses are sanitized (no token leakage)
- Mock axios for all HTTP calls.

### `tests/utils.test.ts`
- ✅ `toolResult` wraps data correctly
- ✅ `toolError` wraps with isError flag
- ✅ `buildParams` strips undefined/null values
- ✅ `buildParams` preserves valid falsy values (0, false, empty string)

### `tests/registry.test.ts`
- ✅ Tool is registered when domain matches and mode allows
- ✅ Tool is skipped when domain is filtered out
- ✅ Write tool is skipped in readonly mode
- ✅ Delete tool is skipped in readonly mode
- ✅ Read tool is registered in readonly mode
- ✅ Stats correctly count registered vs skipped

---

## Acceptance Criteria

- [ ] `npm install && npm run build` succeeds with zero errors
- [ ] `npm run typecheck` passes with strict mode
- [ ] `npm run lint` passes
- [ ] `npm test` — all tests pass
- [ ] Server starts and connects via stdio (with valid env vars)
- [ ] Server fails fast with clear error listing all missing env vars
- [ ] No tools are registered yet (that's Spec 02) — server logs "Registered 0 tools"
- [ ] Auth token is acquired on first API call using raw axios (not through the client wrapper)
- [ ] `{tenant}` replacement works in client paths
