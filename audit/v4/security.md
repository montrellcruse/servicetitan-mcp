# Final Security Verification Audit

## Executive Summary

Scope reviewed:
- All files under `src/domains/`
- Cross-referenced `src/registry.ts`, `src/audit.ts`, `src/utils.ts`, `src/client.ts`

Test status:
- `npm test -- tests/safety tests/domains/path-validation.test.ts tests/client.test.ts tests/registry.test.ts tests/utils.test.ts` ✅
- `npm test` ✅ (`18` files, `249` tests passed)

Result:
- `3` findings total
- `2` Medium
- `1` Low

No hardcoded credentials or direct token leaks were found in source. The existing token-handling tests are passing, and the current audit-param redaction logic does remove many secret and PII fields from logged request params. The remaining issues are authorization trust, unvalidated path interpolation in a few tools, and raw upstream error propagation.

## Findings

### SEC-001 Medium: `ST_ALLOWED_CALLERS` can be bypassed by spoofed request headers

Impact:
If a deployment relies on `ST_ALLOWED_CALLERS` for caller-level authorization, any client that can connect to the MCP transport can present an allowlisted identity through raw request headers and satisfy the check.

Evidence:
- `src/registry.ts:270` enables the allowlist check only by comparing a derived caller string.
- `src/registry.ts:287` to `src/registry.ts:309` accepts caller identity from untrusted request metadata, including `x-user-email`, `x-forwarded-user`, `x-auth-request-email`, and similar headers.
- `tests/registry.test.ts:350` to `tests/registry.test.ts:369` confirms that a supplied `x-user-email` header is treated as authoritative for allowlist decisions.

Why this matters:
The code comment in `src/registry.ts:182` correctly states that authorization should be enforced at the transport or proxy layer, but the implementation still exposes an application-level allowlist feature that trusts caller identity from request headers. On direct HTTP transports, those headers are client-controlled unless a trusted proxy strips and re-injects them.

Recommendation:
- Only accept caller identity from transport-authenticated metadata, not raw request headers.
- If header-based identity must be supported, gate it behind an explicit “trusted proxy” mode and document the required header-stripping behavior at the edge.

### SEC-002 Medium: A few domain tools still interpolate raw strings into URL path segments

Impact:
Crafted inputs can alter downstream ServiceTitan request paths and defeat the intended tool/resource scoping for those endpoints.

Evidence:
- `src/domains/people/gps.ts:34` accepts `gpsProvider` as an unconstrained `z.string()`.
- `src/domains/people/gps.ts:47` to `src/domains/people/gps.ts:49` interpolates `gpsProvider` directly into `/gps-provider/${gpsProvider}/gps-pings`.
- `src/domains/reporting/reports.ts:9`, `src/domains/reporting/reports.ts:19`, `src/domains/reporting/reports.ts:52`, `src/domains/reporting/reports.ts:79`, and `src/domains/reporting/reports.ts:102` accept `reportCategory` as an unconstrained string and splice it into three reporting paths.
- `src/domains/reporting/dynamic-value-sets.ts:9` to `src/domains/reporting/dynamic-value-sets.ts:11` accepts `dynamicSetId` as an unconstrained string.
- `src/domains/reporting/dynamic-value-sets.ts:33` to `src/domains/reporting/dynamic-value-sets.ts:35` interpolates `dynamicSetId` directly into the request path.

Cross-reference:
- The repo already uses the safer pattern elsewhere:
  - `src/domains/marketing/attributions.ts:16` defines `safePathSegmentSchema`
  - `src/domains/marketing/attributions.ts:360` and `src/domains/marketing/attributions.ts:386` URL-encode the scheduler ID
  - `src/domains/crm/contacts.ts:15`, `src/domains/crm/contacts.ts:67`, and `src/domains/crm/contacts.ts:284` apply the same hardening for relationship type slugs
- Current safety coverage only verifies the CRM and marketing cases:
  - `tests/domains/path-validation.test.ts:69`
  - `tests/domains/path-validation.test.ts:91`
  - `tests/domains/path-validation.test.ts:112`

Recommendation:
- Apply the same `safePathSegmentSchema` plus `encodeURIComponent()` pattern to `gpsProvider`, `reportCategory`, and `dynamicSetId`.
- Add regression tests mirroring `tests/domains/path-validation.test.ts` for these three inputs.

### SEC-003 Low: Raw upstream error text is returned to callers and written to audit logs

Impact:
Verbose ServiceTitan error bodies can expose upstream diagnostics or echoed user data to MCP callers and internal audit logs.

Evidence:
- `src/client.ts:527` to `src/client.ts:559` turns upstream response strings and message fields directly into `ServiceTitanApiError.message`.
- `src/utils.ts:114` to `src/utils.ts:124` returns raw `error.message` for non-Zod errors.
- Domain handlers across `src/domains/` catch and return `toolError(getErrorMessage(error))`, which makes the upstream message caller-visible.
- `src/registry.ts:221` to `src/registry.ts:236` records result and thrown error text in audit entries for write/delete tools.
- `src/audit.ts:119` to `src/audit.ts:128` logs `entry.error` verbatim without redaction, even though params are sanitized.

Why this matters:
The code correctly avoids serializing full Axios errors and has tests covering token non-leakage, but it still trusts upstream message text as safe to surface. If ServiceTitan returns a verbose HTML/string body, validation echo, or operational detail, that text is preserved.

Recommendation:
- Replace raw upstream messages with a small allowlisted error surface for callers.
- Redact or suppress audit `error` text unless the message has been sanitized.
- Keep detailed upstream error text only in guarded debug logs if operationally necessary.

## Notes

- I did not find hardcoded credentials, direct secret exfiltration, or obvious unsafe local code execution paths in `src/domains/`.
- Mutation tools are consistently registered as `write` or `delete`, so the confirmation and audit wrapper in `src/registry.ts` is broadly applied as intended.
