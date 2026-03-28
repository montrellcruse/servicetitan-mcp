# Intelligence Audit

Date: 2026-03-28

Scope reviewed:
- `src/domains/intelligence/campaign-roi.ts`
- `src/domains/intelligence/csr-performance.ts`
- `src/domains/intelligence/helpers.ts`
- `src/domains/intelligence/index.ts`
- `src/domains/intelligence/invoice-tracking.ts`
- `src/domains/intelligence/labor-cost.ts`
- `src/domains/intelligence/lookup.ts`
- `src/domains/intelligence/membership-health.ts`
- `src/domains/intelligence/operational.ts`
- `src/domains/intelligence/pipeline.ts`
- `src/domains/intelligence/resolvers.ts`
- `src/domains/intelligence/revenue.ts`
- `src/domains/intelligence/technician-performance.ts`
- `tests/domains/intelligence-revenue-validation.test.ts`
- `tests/domains/intelligence.test.ts`

Checks run:
- `npm test -- --runInBand tests/domains/intelligence*.ts` ❌
  - Vitest in this repo rejects `--runInBand` (`CACError: Unknown option --runInBand`).
- `npm test -- tests/domains/intelligence*.ts` ✅
  - Result: 2 test files passed, 31 tests passed.

Summary:
- 5 findings in this slice.
- Highest risk: local-date math is performed in UTC calendar days, so non-UTC tenants get incorrect `jobsPerDay`, estimate aging, and close-speed metrics, with DST making the drift more visible.
- The current tests are strong on happy-path arithmetic and empty datasets, but they do not cover non-UTC timezone math, pagination truncation/partial-page failures, degraded-result caching, or CSR date-type semantics.

## Findings

### High: local-date metrics use UTC day boundaries, so non-UTC and DST tenants get wrong technician and pipeline calculations

References:
- `src/domains/intelligence/helpers.ts:547-570`
- `src/domains/intelligence/technician-performance.ts:657-659`
- `src/domains/intelligence/technician-performance.ts:890-891`
- `src/domains/intelligence/pipeline.ts:194-197`
- `src/domains/intelligence/pipeline.ts:227-241`
- `tests/domains/intelligence.test.ts:541-957`
- `tests/domains/intelligence.test.ts:1181-1452`

Details:
- `countWeekdaysInclusive()` and `dayDiff()` both normalize to UTC calendar dates, but the surrounding tools build `start`/`end` and `referenceDate` from tenant-local date boundaries.
- That means the same local day can span two different UTC dates. Reproduction from this audit: a Phoenix-local single weekday (`2026-01-05T07:00:00.000Z` to `2026-01-06T06:59:59.999Z`) produces `countWeekdaysInclusive(...) === 2`, not `1`.
- `intel_technician_scorecard` divides completed jobs by that inflated weekday count, so `jobsPerDay` is wrong for any non-UTC tenant, not just DST transitions.
- `intel_estimate_pipeline` uses the same UTC-date math for `daysOld` and `averageDaysToClose`, so estimates created earlier on the same tenant-local day can age by `1` day instead of `0`, shifting bucket placement and stale-estimate thresholds.
- None of the tests exercise non-UTC registry timezones or DST transition dates, so these errors currently pass the suite.

### High: pagination can silently return incomplete data without surfacing a user-visible warning

References:
- `src/domains/intelligence/helpers.ts:152-196`
- `src/domains/intelligence/helpers.ts:242-273`
- `src/domains/intelligence/revenue.ts:581-620`
- `src/domains/intelligence/membership-health.ts:162-194`
- `src/domains/intelligence/campaign-roi.ts:171-239`
- `tests/domains/intelligence.test.ts:230-266`

Details:
- `fetchAllPagesParallel()` converts per-page failures into empty arrays and only calls `console.warn(...)`. The calling tools never see a rejection, so `fetchWithWarning(...)` cannot attach `_warnings` to the response.
- As a result, revenue collections, membership invoice totals, and campaign call/booking counts can undercount silently when only one later page fails.
- The sequential helper has a second issue: when the loop stops because it exhausted `maxPages` with `hasMore === true`, `page` has already been incremented to `maxPages + 1`, so the truncation check at `if (page === maxPages)` never runs.
- Even when truncation is detected, `fetchAllPages()` drops the `_truncated` marker from `fetchAllPagesWithTotal()`, so the tools still do not expose that incompleteness to the caller.
- The existing test coverage only checks the happy-path 3-page traversal. It does not cover partial-page failures, max-page truncation, or warning propagation.

### Medium: the intelligence cache stores degraded partial results, extending transient outages into stale analytics

References:
- `src/domains/intelligence/index.ts:22-57`
- `src/domains/intelligence/helpers.ts:37-68`
- `src/domains/intelligence/revenue.ts:576-620`
- `src/domains/intelligence/membership-health.ts:162-194`
- `src/domains/intelligence/campaign-roi.ts:171-239`
- `tests/domains/intelligence.test.ts:276-290`

Details:
- The cache wrapper stores every successful tool response for the TTL, regardless of whether the payload only succeeded by falling back through `fetchWithWarning(...)`.
- In this domain, many handlers intentionally return partial results with `_warnings` instead of throwing when a report or endpoint is unavailable.
- A transient outage therefore gets cached as if it were a healthy response, and callers continue receiving stale zeroed or partial metrics until the cache expires.
- The cache tests only validate TTL behavior; there is no coverage asserting that warning-bearing degraded responses bypass the cache.

### Medium: Report 175/177/179 schema guards are disabled whenever the report has zero rows

References:
- `src/domains/intelligence/revenue.ts:242-268`
- `src/domains/intelligence/revenue.ts:294-318`
- `tests/domains/intelligence-revenue-validation.test.ts:71-149`
- `tests/domains/intelligence.test.ts:522-539`

Details:
- `buildReportResponseSchema(...).superRefine(...)` returns immediately when `response.data.length === 0`.
- That means field-order/name validation for Reports 175, 177, and 179 only runs when there is at least one data row.
- If ServiceTitan changes a report schema during a zero-row period, the handler will quietly accept the changed payload and emit zeroed metrics instead of failing fast.
- The suite covers a changed Report 175 schema only when rows are present, and separately treats empty reports as valid without checking field metadata.

### Medium: the CSR tool claims booking performance, but it filters the source report by completion date

References:
- `src/domains/intelligence/csr-performance.ts:158-160`
- `src/domains/intelligence/csr-performance.ts:177-180`
- `tests/domains/intelligence.test.ts:2035-2057`

Details:
- The tool description and returned metrics are framed around CSR booking performance: `jobsBooked`, `booked jobs`, and "Which CSR is booking the most revenue".
- The report request hard-codes `DateType = "Job Completion Date"`.
- That measures jobs completed in the period, not jobs booked in the period, and it can exclude recently booked open jobs or defer them into a later window when they complete.
- The current tests only verify empty-output null-safety for this tool, so the semantic mismatch is not exercised anywhere in the suite.
