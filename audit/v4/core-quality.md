# Core Quality Audit

Date: 2026-03-28

Scope reviewed:
- `src/registry.ts`
- `src/config.ts`
- `src/utils.ts`
- `src/types.ts`
- `src/audit.ts`
- `src/logger.ts`
- `src/response-shaping.ts`
- `src/cache.ts`

Corresponding tests reviewed:
- `tests/registry.test.ts`
- `tests/config.test.ts`
- `tests/utils.test.ts`
- `tests/response-shaping.test.ts`
- `tests/cache.test.ts`
- `tests/safety/audit.test.ts`
- `tests/safety/confirmation.test.ts`
- `tests/safety/write-middleware.test.ts`

Checks run:
- `npm test` ✅
  - Result: 18 test files passed, 249 tests passed

Summary:
- 4 findings in this slice.
- Highest risk: response shaping is enabled by default and mutates semantic fields for every `toolResult()`, not just intelligence summaries.
- No concrete defects stood out in `src/config.ts` or `src/cache.ts` beyond the items below.
- There are no dedicated unit tests for `src/logger.ts` or `src/types.ts`; I did not find a release-grade bug there in this pass.

## Findings

### High: default response shaping mutates raw tool payloads across all domains

References:
- `src/utils.ts:18-19`
- `src/response-shaping.ts:9-47`
- `src/response-shaping.ts:59-76`
- `src/response-shaping.ts:114-123`
- `src/response-shaping.ts:216-261`
- `src/domains/marketing/campaigns.ts:86-97`
- `tests/response-shaping.test.ts:46-84`
- `tests/response-shaping.test.ts:137-155`

Details:
- `toolResult()` always serializes `shapeResponse(data)`, and shaping is enabled unless `ST_RESPONSE_SHAPING=false`.
- The shaping rules are global, not intelligence-scoped. They remove semantic fields like `sales`, `membershipTypes`, and `invoices`; rename fields like `customerName -> customer` and `businessUnit -> bu`; and strip time-of-day from `scheduledDate`, `dueDate`, and `expirationDate`.
- Most domain handlers return raw API payloads through `toolResult(data)`, so this is not a cosmetic intelligence-only transform. It changes the observable schema of ordinary CRM, marketing, accounting, and other read tools by default.
- The current tests lock in the shaping behavior itself, but there is no coverage asserting that non-intelligence tool responses preserve their ServiceTitan field names and timestamp precision.

### Medium: audit redaction still leaks common phone-number fields from write tools

References:
- `src/audit.ts:27-47`
- `src/audit.ts:65-87`
- `src/registry.ts:369-385`
- `src/domains/marketing/opt-in-out.ts:7-12`
- `src/domains/marketing/opt-in-out.ts:69-110`
- `src/domains/marketing/campaigns.ts:16-26`
- `src/domains/marketing/campaigns.ts:68-84`
- `src/domains/marketing/calls.ts:20-23`
- `src/domains/marketing/calls.ts:142-157`
- `tests/safety/audit.test.ts:136-164`

Details:
- `sanitizeParams()` only redacts exact key names in `PII_FIELDS`.
- That catches `email`, `firstName`, `lastName`, and `phoneNumber`, but it does not catch common variants already used by registered write tools such as `contactNumbers`, `campaignPhoneNumbers`, `phoneNumberCalled`, or `callerPhoneNumber`.
- Because `ToolRegistry` audits every successful or failed write/delete, these values will be written to logs even though they are plainly phone-number PII.
- The audit tests only exercise secret-like keys and a nested `credentialType`; they do not cover the phone-number aliases that exist in the real write schemas.

### Medium: truncated tool responses are no longer valid JSON

References:
- `src/utils.ts:18-29`
- `tests/utils.test.ts:34-41`
- `tests/registry.test.ts:169-176`

Details:
- The normal success path returns `JSON.stringify(...)`.
- The truncation path slices that serialized string at an arbitrary character boundary and appends a human note.
- That makes oversized success responses malformed JSON at the exact point where machine consumers most need a stable format.
- The current truncation test only checks for the warning text, not that the response remains parseable. Elsewhere in the suite, success payloads are treated as JSON strings and parsed directly.

### Low: `sortParam()` accepts a format its own docs say is invalid

References:
- `src/utils.ts:95-110`
- `tests/utils.test.ts:121-129`

Details:
- The regex uses `[+-]?`, so bare field names like `CreatedOn` are accepted.
- The validation message and description both say the format is `+Field` or `-Field`.
- The test suite explicitly accepts the unsigned form, so the implementation and documentation are currently out of sync.
