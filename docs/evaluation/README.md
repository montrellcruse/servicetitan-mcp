# Tool-definition evaluation for v3.0.1

This patch preserves the complete default discovery surface: 264 reads, or 458 tools with experimental mutations explicitly enabled. Full remains the default. CRM (33), dispatch (75), and analytics (34) are explicit choices for smaller catalogs.

## Evidence and interpretation

The target is overall Glama A and definition-quality A on the released full catalog. Local scores are independent Codex rubric reviews, not Glama results or a guarantee of model performance. The [published TDQS rubric](https://github.com/glama-ai/tool-definition-quality-score/tree/b9881b0cfec88969e42672c92544487ca191a992) was pinned before evaluation. Authors do not score their own batches. Every review includes the exact public definition hash, six integer dimension scores, rationale, and source/contract evidence. All rounds are retained; changed definitions require fresh independent review.

The [repository evidence directory](https://github.com/montrellcruse/servicetitan-mcp/tree/v3.0.1/docs/evaluation) contains the v3.0.0 compatibility baseline, source-behavior baseline, exact candidate definition snapshots, author inventories, independent reviews, quality rollup, overlap inventory, fixed synthetic selection cases, and outcomes. Raw evidence is excluded from the npm archive; this maintained guide ships with it.

Final local TDQS is 4.4114 mean, 4.0 minimum, and 4.2 description quality. Holding coherence at 2.5 gives a rounded overall projection of 3.7 (A); the conservative unrounded projection is 3.7165. All 264 definitions have passed independent accuracy review.

The fixed 41-case selection exercise passed 41/41 for both v3.0.0 and v3.0.1, with zero invalid inputs, duplicate equivalent fetches, or observed regressions. It demonstrates preserved selection on these prompts; it does not demonstrate a measured improvement because the baseline also passed. Two fresh agents received version-blinded catalogs and no answer key, with identical model/effort settings.

CI checks coverage, valid inputs, exact definition hashes, resolved review status, and compatibility. Numeric model scores and selection judgments are review evidence, not deterministic quality guarantees. `node scripts/check-evaluation.mjs --require-target` additionally checks the release's local mean/minimum targets during acceptance. The projection holds pre-patch coherence at 2.5 and follows the pinned half-up rounding rule; an unrounded conservative estimate is recorded too. External A remains pending until the released definitions are visibly evaluated by Glama.

## Overlap and compatibility

All 251 direct API read handlers are invoked against a recording mock client and resolved against pinned official routes. Ten intelligence tools and three system tools receive source-specific reviews. Exactly four direct-operation pairs are equivalent: employee, activity, activity-code, and tag-type exports. The inventory checks the exact pair sets, matching schemas/scopes/annotations, and empty/date/token inputs with both recent-change flags. Both names remain available with reciprocal selection guidance. Mock responses do not establish live result equivalence; contract and handler review supplies that evidence.

Related operations remain distinct: provider/tenant bookings, relationship links/contact records, parent-specific/cross-parent contacts, catalog/known-ID cancellation reasons, one/multiple-job splits and timesheets, broad/campaign-specific costs, Calls v2/v3, forms/submissions, and get/list/export workflows. Intelligence aggregates and direct source reads serve different purposes. See the full inventory and descriptions for selection boundaries.

`discovery:check` compares nine actual SDK catalogs with v3.0.0 and strips only schema annotations, preserving validation and instance data. A separate TypeScript source check ignores literal registration/Zod description text and comments, then compares all 133 source files with the original release. Runtime expressions, handlers, routes, defaults, safety behavior and dependency locks remain unchanged. This guard is scoped to this patch; a later behavioral release must deliberately replace it and its baseline.

## Reproduction

From the source checkout, after `npm ci`:

```sh
npm run build
npm run discovery:check
npm run evaluation:check
node scripts/overlap-audit.mjs
node scripts/check-evaluation.mjs --write-summary --require-target
```

The overlap command rebuilds before collecting evidence. The discovery command can retain a capture with `node scripts/discovery-audit.mjs --capture /tmp/st-discovery.json`. All reproduction inputs are public tool definitions or synthetic fixtures; no ServiceTitan credentials or business requests are needed.

## Separate behavior follow-up

The recording and voicemail API operations return `audio/mpeg` streams, while the existing wrapper uses its ordinary client-decoded JSON/text response path. Byte-preserving media delivery is not implemented or verified by this description patch. The image API documents a redirect, and the installed-equipment attachment operation leaves its response body unspecified. Their revised descriptions state these boundaries. A separate behavior change should define MCP media delivery, preserve binary bytes, test redirects/content types and response limits, and assess compatibility before promising downloadable media.
