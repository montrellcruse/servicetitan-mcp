# Spec 04: Intelligence Layer — Composite Business Tools

**Objective:** Build high-value composite tools that combine multiple ServiceTitan API calls into actionable business intelligence. These are the tools that differentiate this server from a raw API wrapper.

**Depends on:** Spec 01 + Spec 02 + Spec 03

**Output:** A new `intelligence` domain with tools that business owners actually want to ask an AI about.

---

## Why This Matters

The 454 raw API tools from Spec 02 are plumbing. A business owner doesn't ask "GET me paginated invoices with modifiedOnOrAfter filter" — they ask:

- "How's the business doing this month?"
- "Which technicians are underperforming?"
- "Are we losing membership customers?"
- "What's our revenue pipeline look like?"
- "How are our campaigns performing?"

The intelligence layer translates those questions into multi-endpoint API orchestrations that return summarized, actionable data.

---

## Domain Structure

```
src/domains/intelligence/
├── index.ts                    # DomainLoader
├── revenue.ts                  # Revenue & financial summaries
├── technician-performance.ts   # Technician scorecards
├── membership-health.ts        # Membership retention & churn
├── pipeline.ts                 # Estimate pipeline analysis
├── campaign-roi.ts             # Marketing campaign performance
└── operational.ts              # Dispatch efficiency, scheduling
```

---

## Tool Definitions

### 1. `intel_revenue_summary`

**Description:** Revenue summary for a date range — total invoiced, total collected, outstanding, average ticket, top services by revenue.

**Schema:**
```typescript
{
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit"),
}
```

**Orchestration:**
1. `GET /tenant/{tenant}/invoices` — Filter by date range, paginate through all. Sum `total` field.
2. `GET /tenant/{tenant}/payments` — Filter by date range, sum `amount` field for collections.
3. Calculate: outstanding = invoiced - collected
4. From invoice items, aggregate revenue by service/material to find top 10.
5. Calculate average ticket = total invoiced / number of invoices.

**Response shape:**
```json
{
  "period": { "start": "2026-01-01", "end": "2026-01-31" },
  "totalInvoiced": 145230.00,
  "totalCollected": 128750.00,
  "outstanding": 16480.00,
  "invoiceCount": 312,
  "averageTicket": 465.48,
  "topServicesByRevenue": [
    { "name": "AC Repair", "revenue": 32100.00, "count": 48 },
    { "name": "Furnace Install", "revenue": 28500.00, "count": 12 }
  ]
}
```

---

### 2. `intel_technician_scorecard`

**Description:** Performance scorecard for one or all technicians — jobs completed, revenue generated, average ticket, membership conversion rate, estimate close rate.

**Schema:**
```typescript
{
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  technicianId: z.number().int().optional().describe("Single technician (omit for all)"),
  businessUnitId: z.number().int().optional().describe("Filter by business unit"),
}
```

**Orchestration:**
1. `GET /tenant/{tenant}/technicians` — Get technician list (or single).
2. For each technician:
   a. `GET /tenant/{tenant}/jobs` — Filter by technicianId + date range. Count completed jobs.
   b. `GET /tenant/{tenant}/invoices` — Filter by technicianId + date range. Sum revenue.
   c. `GET /tenant/{tenant}/estimates` — Filter by soldById (technician) + date range. Count total vs sold.
3. Calculate: avg ticket, estimate close rate (sold/total), jobs per day.

**Response shape:**
```json
{
  "period": { "start": "2026-01-01", "end": "2026-01-31" },
  "technicians": [
    {
      "id": 123,
      "name": "Mike Johnson",
      "jobsCompleted": 45,
      "revenue": 32150.00,
      "averageTicket": 714.44,
      "estimatesPresented": 38,
      "estimatesSold": 22,
      "closeRate": 0.579,
      "jobsPerDay": 2.14
    }
  ],
  "teamAverages": {
    "averageTicket": 580.00,
    "closeRate": 0.48,
    "jobsPerDay": 1.9
  }
}
```

---

### 3. `intel_membership_health`

**Description:** Membership program health — active count, new signups, cancellations, renewal rate, revenue from membership customers vs non-members.

**Schema:**
```typescript
{
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
}
```

**Orchestration:**
1. `GET /tenant/{tenant}/membership-types` — Get all membership types.
2. `GET /tenant/{tenant}/customers` — Get customers with membership status.
3. `GET /tenant/{tenant}/service-agreements` — Filter by date range. Count by status (Activated, Canceled, Expired, AutoRenew).
4. `GET /tenant/{tenant}/invoices` — Compare revenue from membership vs non-membership customers.

**Response shape:**
```json
{
  "period": { "start": "2026-01-01", "end": "2026-01-31" },
  "activeMemberships": 234,
  "newSignups": 18,
  "cancellations": 7,
  "expirations": 3,
  "renewals": 12,
  "retentionRate": 0.957,
  "memberRevenue": 89400.00,
  "nonMemberRevenue": 55830.00,
  "memberAverageTicket": 720.00,
  "nonMemberAverageTicket": 410.00,
  "membershipTypes": [
    { "name": "Gold Plan", "active": 145, "revenue": 52000.00 },
    { "name": "Silver Plan", "active": 89, "revenue": 37400.00 }
  ]
}
```

---

### 4. `intel_estimate_pipeline`

**Description:** Estimate pipeline analysis — open estimates by age, value, and status. Shows conversion funnel and identifies stale opportunities.

**Schema:**
```typescript
{
  startDate: z.string().optional().describe("Filter estimates created after this date"),
  endDate: z.string().optional().describe("Filter estimates created before this date"),
  soldById: z.number().int().optional().describe("Filter by salesperson/technician"),
}
```

**Orchestration:**
1. `GET /tenant/{tenant}/estimates` — Paginate through all estimates in date range.
2. Group by status (Open, Sold, Dismissed).
3. For open estimates, calculate age buckets (0-7 days, 8-14, 15-30, 30+).
4. Sum total pipeline value for open estimates.

**Response shape:**
```json
{
  "totalEstimates": 156,
  "pipeline": {
    "open": { "count": 42, "value": 187500.00 },
    "sold": { "count": 89, "value": 412300.00 },
    "dismissed": { "count": 25, "value": 67800.00 }
  },
  "conversionRate": 0.571,
  "averageDaysToClose": 4.2,
  "openByAge": [
    { "bucket": "0-7 days", "count": 15, "value": 72000.00 },
    { "bucket": "8-14 days", "count": 12, "value": 54000.00 },
    { "bucket": "15-30 days", "count": 9, "value": 38000.00 },
    { "bucket": "30+ days", "count": 6, "value": 23500.00 }
  ],
  "staleEstimates": [
    { "id": 4521, "customer": "Smith Residence", "value": 8500.00, "daysOld": 45 },
    { "id": 4488, "customer": "Jones Office", "value": 12000.00, "daysOld": 38 }
  ]
}
```

---

### 5. `intel_campaign_performance`

**Description:** Marketing campaign ROI — calls generated, bookings, conversion rate, cost per lead (if campaign cost data is available).

**Schema:**
```typescript
{
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  campaignId: z.number().int().optional().describe("Single campaign (omit for all)"),
}
```

**Orchestration:**
1. `GET /tenant/{tenant}/campaigns` — Get campaign list.
2. For each campaign:
   a. `GET /v3/tenant/{tenant}/calls` — Filter by campaignId + date range. Count inbound calls.
   b. `GET /tenant/{tenant}/bookings` — Filter by campaignId + date range. Count bookings.
3. Calculate: call-to-booking rate, cost per lead (if budget available).

**Response shape:**
```json
{
  "period": { "start": "2026-01-01", "end": "2026-01-31" },
  "campaigns": [
    {
      "id": 1,
      "name": "Google Ads - AC Repair",
      "calls": 87,
      "bookings": 34,
      "conversionRate": 0.391,
      "revenue": 24500.00,
      "revenuePerCall": 281.61
    }
  ],
  "totals": {
    "calls": 245,
    "bookings": 98,
    "conversionRate": 0.400,
    "revenue": 68900.00
  }
}
```

---

### 6. `intel_daily_snapshot`

**Description:** Quick daily operational snapshot — today's appointments, jobs in progress, revenue so far, outstanding callbacks.

**Schema:**
```typescript
{
  date: z.string().optional().describe("Date to snapshot (YYYY-MM-DD, defaults to today)"),
}
```

**Orchestration:**
1. `GET /tenant/{tenant}/appointments` — Filter by date. Count total, completed, in-progress.
2. `GET /tenant/{tenant}/jobs` — Filter by date. Count by status.
3. `GET /tenant/{tenant}/invoices` — Filter by date. Sum revenue.
4. `GET /tenant/{tenant}/estimates` — Sold today. Sum value.
5. `GET /tenant/{tenant}/calls` — Today's call count.

**Response shape:**
```json
{
  "date": "2026-03-04",
  "appointments": { "total": 24, "completed": 14, "inProgress": 6, "pending": 4 },
  "jobs": { "total": 22, "completed": 12, "inProgress": 8, "canceled": 2 },
  "revenue": {
    "invoiced": 18450.00,
    "collected": 12300.00,
    "estimatesSold": 34200.00
  },
  "calls": { "total": 67, "booked": 28, "missed": 4 },
  "highlights": [
    "14 of 24 appointments completed (58%)",
    "4 missed calls today — may need follow-up",
    "$34,200 in estimates sold"
  ]
}
```

The `highlights` array contains plain-English observations that an LLM can relay directly to the user.

---

## Implementation Notes

### Pagination Handling

Intelligence tools MUST paginate through all results, not just the first page. Create a helper in `src/domains/intelligence/helpers.ts`:

```typescript
export async function fetchAllPages<T>(
  client: ServiceTitanClient,
  path: string,
  params: Record<string, any>,
  maxPages: number = 20 // Safety limit
): Promise<T[]> {
  const allData: T[] = [];
  let page = 1;

  while (page <= maxPages) {
    const response = await client.get(path, { ...params, page, pageSize: 500, includeTotal: true });
    const items = response.data || response;
    if (Array.isArray(items)) {
      allData.push(...items);
    }
    if (!response.hasMore || items.length === 0) break;
    page++;
  }

  return allData;
}
```

### Error Resilience

Intelligence tools call multiple endpoints. If one fails, the tool should still return partial results with a note about what failed:

```typescript
const results: any = {};
const errors: string[] = [];

try {
  results.invoices = await fetchAllPages(client, "...", params);
} catch (e: any) {
  errors.push(`Invoice data unavailable: ${e.message}`);
}

try {
  results.payments = await fetchAllPages(client, "...", params);
} catch (e: any) {
  errors.push(`Payment data unavailable: ${e.message}`);
}

if (errors.length > 0) {
  results._warnings = errors;
}

return toolResult(results);
```

### Operation Tagging

All intelligence tools are tagged as `read` operations. They never create, update, or delete data. They are always available regardless of `ST_READONLY` setting.

### Domain Filtering

The intelligence domain name is `intelligence`. It can be enabled/disabled via `ST_DOMAINS` like any other domain. However, it's recommended to always include it since it's read-only.

---

## Tests

### `tests/domains/intelligence.test.ts`

For each intelligence tool:

1. **Happy path** — Mock all API calls, verify the response shape and calculations
2. **Partial failure** — Mock one endpoint to fail, verify partial results with `_warnings`
3. **Empty data** — Mock empty responses, verify zero-value results (not errors)
4. **Pagination** — Mock multi-page responses, verify all pages are fetched
5. **Date handling** — Verify date params are passed correctly to API calls

### Calculation Tests

Test specific business logic:
- ✅ Average ticket = total revenue / invoice count
- ✅ Close rate = sold estimates / total estimates
- ✅ Retention rate = (active - cancellations) / active
- ✅ Age bucket assignment for stale estimates
- ✅ Jobs per day = jobs completed / working days in period
- ✅ Member vs non-member revenue split

---

## Acceptance Criteria

- [ ] All 6 intelligence tools are implemented and registered
- [ ] Each tool combines data from 2+ ServiceTitan API endpoints
- [ ] Partial failures return results with `_warnings` (not errors)
- [ ] All tools paginate through full result sets (not just first page)
- [ ] Safety limit prevents infinite pagination (max 20 pages × 500 = 10,000 records)
- [ ] All tools tagged as `read` operation
- [ ] Response shapes match the documented JSON structures above
- [ ] `highlights` array in daily snapshot contains plain-English observations
- [ ] All tests pass with mocked API responses
- [ ] `npm run build && npm run typecheck` succeed
