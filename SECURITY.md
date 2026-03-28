# Security Policy

## Supported Versions

| Version | Supported              |
|---------|------------------------|
| 2.3.x   | ✅ Current              |
| 2.2.x   | ⚠️ Security fixes only  |
| < 2.2   | ❌ Not supported        |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email **montrell@rowvyn.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

You should receive an acknowledgment within 48 hours.

## Security Model

### Authentication

- The server authenticates to ServiceTitan using OAuth 2.0 client credentials
- Credentials are loaded from environment variables, never hardcoded
- Access tokens are cached in memory with a 60-second expiry buffer
- Token acquisition uses a dedicated `axios.post()` call outside the interceptor chain to avoid recursive auth loops

### Remote Deployment (SSE Mode)

- Remote clients authenticate with `ST_MCP_API_KEY` (bearer token via `Authorization: Bearer` header or `x-api-key` header)
- CORS headers are configurable; the default allows all origins
- Request body size is limited to 1MB (HTTP 413 on oversize payloads)
- The server handles graceful shutdown on `SIGTERM`/`SIGINT` with a 10-second force-exit fallback
- `uncaughtException` and `unhandledRejection` handlers prevent silent crashes

### Data Safety

- Read-only mode is **enabled by default** (`ST_READONLY=true`) — write and delete tools remain visible, but execution is blocked with `Readonly mode: operation not permitted` until explicitly opted in
- Write and delete operations require explicit opt-in via `ST_READONLY=false`
- Delete operations require `confirm: true` in the tool call payload
- Write operations (when `ST_CONFIRM_WRITES=true`) require `_confirmed: true` in the tool call payload
- Audit logging records all write/delete operations with sensitive fields (including composite names such as `clientSecret`, `apiKey`, `accessToken`, and `authorization`) sanitized
- Tool responses never include raw credentials or tokens

## Authorization Model

This server is designed for single-operator use. The confirmation prompts for writes and deletes are safety UX to reduce accidental mutations; they are not a substitute for access control.

Remote deployments still authenticate transport access with `ST_MCP_API_KEY`, but that only answers "can this client reach the server?" It does not implement per-caller authorization.

If you need a lightweight caller allowlist, set `ST_ALLOWED_CALLERS` to a comma-separated list of permitted caller identities. When configured, the registry checks the MCP request context for caller identity data in `authInfo` or common proxy-forwarded headers such as `x-user-email`, `x-user-id`, `x-caller-id`, or `x-forwarded-user`. Requests are rejected when the caller is missing from the allowlist or when no caller identity is available.

For multi-tenant or shared deployments, enforce authentication and authorization at the transport or proxy layer before requests reach this process. Examples include mTLS, OAuth/OIDC at the edge, or a reverse proxy that validates identity and forwards an explicit caller header consumed by `ST_ALLOWED_CALLERS`.
