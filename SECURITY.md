# Security Policy

## Supported Versions

| Version | Supported              |
|---------|------------------------|
| 2.1.x   | ✅ Current              |
| 2.0.x   | ⚠️ Security fixes only  |
| < 2.0   | ❌ Not supported        |

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

- Read-only mode is **enabled by default** (`ST_READONLY=true`) — all write and delete tools are suppressed until explicitly opted in
- Write operations require explicit opt-in via `ST_READONLY=false`
- Delete operations and write operations (when `ST_CONFIRM_WRITES=true`) require `confirm=true` in the tool call payload
- Audit logging records all write/delete operations with sensitive fields (passwords, tokens, secrets, keys) sanitized
- Tool responses never include raw credentials or tokens
