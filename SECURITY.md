# Security Policy

## Supported Versions

| Version | Supported              |
|---------|------------------------|
| 3.0     | Stable readonly support; preparing publication |
| 2.x     | Stable line; security fixes only |
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
- Experimental write and delete adapters require both `ST_READONLY=false` and `ST_EXPERIMENTAL_WRITES=true`; they are outside the stable v3 operational-compatibility commitment but remain covered by this security policy
- Delete operations require `confirm: true` in the tool call payload
- Write operations (when `ST_CONFIRM_WRITES=true`) require `_confirmed: true` in the tool call payload
- Audit logging records all write/delete operations with sensitive fields (including composite names such as `clientSecret`, `apiKey`, `accessToken`, and `authorization`) sanitized
- Authentication failures are sanitized before becoming tool errors; successful business responses can contain customer data and require appropriate access controls

### Credentials and local validation

Keep ServiceTitan client secrets, app keys, access tokens, and `ST_MCP_API_KEY` out of source, URLs, shell arguments, issue reports, and public logs. Supply credentials through protected environment files or your deployment's secret store. On Unix systems, use owner-only permissions (`600`) for credential files and `700` for directories holding live-test output. Git ignore rules do not protect permissions or Docker build contexts.

The repository excludes `.env` and its environment-specific variants from Git and Docker contexts. npm uses an explicit package file list; only the placeholder `.env.example` belongs in the package. Build inputs must never contain live output, credential files, or private review archives. Provide runtime secrets when starting a container rather than baking them into its image.

Built-in diagnostics redact configured secrets and common credential forms; HTTP request logs omit query strings. Redaction is a safeguard, not a reason to put secrets or customer records into log messages. Protect MCP client transcripts, retrieved result chunks, and intentionally captured business output. Delete temporary live captures when they are no longer needed; an ignored file, a local Git commit, or a backup can still retain sensitive data.

If a credential is disclosed, revoke or rotate it using ServiceTitan's [credential-management guidance](https://developer.servicetitan.io/docs/get-going-manage-client-id-and-secret/) and review where it was copied. Deleting it from the latest commit does not remove earlier commits, artifacts, or logs. Report a suspected disclosure privately using the channel above.

## Authorization Model

This server is designed for a trusted operator or a separately authorized remote boundary. Confirmation prompts reduce accidental mutations; they are not access control.

Remote deployments still authenticate transport access with `ST_MCP_API_KEY`, but that only answers "can this client reach the server?" It does not implement per-caller authorization.

For the bundled HTTP transports, `ST_MCP_CLIENT_ID` names the server-controlled principal attached after successful shared-key authentication. `ST_ALLOWED_CALLERS` can restrict tool execution to that principal. Caller-supplied forwarding headers do not establish identity.

For multi-tenant or shared deployments, enforce authentication and authorization at the transport or proxy layer before requests reach this process. Examples include mTLS or OAuth/OIDC at the edge. Integrations that supply richer identities must attach authenticated `authInfo` in a trusted transport adapter rather than forwarding unverified request headers.
