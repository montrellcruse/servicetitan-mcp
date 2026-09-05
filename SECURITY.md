# Security Policy

## Supported Versions

| Version | Supported              |
|---------|------------------------|
| 3.x     | ✅ Current              |
| 2.x     | ⚠️ Security fixes only  |
| < 2     | ❌ Not supported        |

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
- Token acquisition uses a separate bounded auth client, and simultaneous callers share one token acquisition

### Remote Deployment

- Streamable HTTP is the current remote transport; SSE remains available for legacy clients
- Remote clients authenticate with `ST_MCP_API_KEY` (bearer token via `Authorization: Bearer` or the `x-api-key` header)
- Browser origins require an exact `ST_CORS_ORIGIN`; native clients normally omit `Origin`
- Request body size is limited to 1MB (HTTP 413 on oversize payloads)
- The server handles graceful shutdown on `SIGTERM`/`SIGINT` with a 10-second force-exit fallback

### Data Safety

- Read-only mode is **enabled by default** (`ST_READONLY=true`) — write and delete tools are omitted from discovery
- Write and delete operations require explicit opt-in via `ST_READONLY=false`
- Delete operations require `confirm: true` in the tool call payload
- Write operations (when `ST_CONFIRM_WRITES=true`) require `_confirmed: true` in the tool call payload
- Audit logging records all write/delete operations with sensitive fields (including composite names such as `clientSecret`, `apiKey`, `accessToken`, and `authorization`) sanitized
- Tool responses never include raw credentials or tokens

## Authorization Model

This server is designed for a trusted operator or a separately authorized remote boundary. Confirmation prompts reduce accidental mutations; they are not access control.

Remote deployments still authenticate transport access with `ST_MCP_API_KEY`, but that only answers "can this client reach the server?" It does not implement per-caller authorization.

For the bundled HTTP transports, `ST_MCP_CLIENT_ID` names the server-controlled principal attached after successful shared-key authentication. `ST_ALLOWED_CALLERS` can restrict tool execution to that principal. Caller-supplied forwarding headers do not establish identity.

For multi-tenant or shared deployments, enforce authentication and authorization at the transport or proxy layer before requests reach this process. Examples include mTLS or OAuth/OIDC at the edge. Integrations that supply richer identities must attach authenticated `authInfo` in a trusted transport adapter rather than forwarding unverified request headers.
