import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { captureDiscovery, digest } from './discovery-audit.mjs';

const round = Number(process.argv.find(x => x.startsWith('--round='))?.split('=')[1] ?? 3);
assert(Number.isInteger(round) && round > 0);
const capture = await captureDiscovery();
const tools = capture.configurations.default.tools;
const batches = ['crm-dispatch-marketing', 'exports-people', 'other-intelligence'];
const assignments = { 'crm-dispatch-marketing':['descriptions_crm_dispatch_marketing','descriptions_exports_people',87], 'exports-people':['descriptions_exports_people','descriptions_other_intelligence',83], 'other-intelligence':['descriptions_other_intelligence','descriptions_crm_dispatch_marketing',94] };
const reviews = (await Promise.all(batches.map(async batch => {
  const review = JSON.parse(await readFile(`docs/evaluation/review-${batch}-round${round}.json`, 'utf8'));
  const [author, reviewer, count] = assignments[batch];
  assert.equal(review.schemaVersion, 1);
  assert.equal(review.reviewer, 'gpt-5.6-sol');
  assert.equal(review.reasoningEffort, 'low');
  assert.equal(review.rubricRevision, 'b9881b0cfec88969e42672c92544487ca191a992');
  assert(review.method.startsWith('independent Codex rubric review; not Glama hosted evaluation'));
  assert.deepEqual(review.provenance, {authorTasks:['/root/'+author,'/root'],reviewerTask:'/root/'+reviewer,batch,expectedCount:count});
  assert(!review.provenance.authorTasks.includes(review.provenance.reviewerTask));
  assert.equal(review.reviews.length, count);
  return review;
}))).flatMap(r => r.reviews);
const weights = { purpose_clarity:25, usage_guidelines:20, behavioral_transparency:20, parameter_semantics:15, conciseness_structure:10, contextual_completeness:10 };
const round1 = (p, q) => Math.floor((20 * p + q) / (2 * q)) / 10;
assert.equal(tools.length, 264);
assert.equal(reviews.length, tools.length);
assert.equal(new Set(reviews.map(r => r.tool)).size, tools.length);
const scores = tools.map(tool => {
  const review = reviews.find(r => r.tool === tool.name);
  assert(review, `Missing review: ${tool.name}`);
  assert.equal(review.inputHash, digest(tool), `Stale review: ${tool.name}`);
  assert.equal(review.accuracy.status, 'passed', `Accuracy review unresolved: ${tool.name}`);
  assert.equal(review.annotation_contradiction, false, `Contradictory annotations: ${tool.name}`);
  assert.equal(review.accuracy.issues.length, 0, `Unresolved issues: ${tool.name}`);
  assert(review.accuracy.evidence.length > 0, `Missing evidence: ${tool.name}`);
  let hundredths = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const dimension = review.scores[key];
    assert(Number.isInteger(dimension?.score) && dimension.score >= 1 && dimension.score <= 5, `${tool.name}: invalid ${key}`);
    assert(dimension.justification?.trim(), `${tool.name}: missing ${key} reasoning`);
    hundredths += dimension.score * weight;
  }
  return { tool: tool.name, raw: hundredths / 100, tdqs: round1(hundredths, 100) };
});
const sumTenths = scores.reduce((sum, score) => sum + Math.round(score.tdqs * 10), 0);
const minTenths = Math.min(...scores.map(score => Math.round(score.tdqs * 10)));
const mean = sumTenths / (10 * scores.length);
const minimum = minTenths / 10;
const descriptionQuality = round1(6 * sumTenths + 4 * scores.length * minTenths, 100 * scores.length);
const coherenceAssumption = 2.5; // Observed pre-patch Glama value; no speculative coherence lift.
const projectedOverall = round1(7 * Math.round(descriptionQuality * 10) + 3 * Math.round(coherenceAssumption * 10), 100);
const rawMean = scores.reduce((sum, score) => sum + score.raw, 0) / scores.length;
const rawMinimum = Math.min(...scores.map(score => score.raw));
const conservativeUnroundedOverall = .7 * (.6 * rawMean + .4 * rawMinimum) + .3 * coherenceAssumption;
const result = { schemaVersion:1, version:capture.version, round, definitionHash:digest(tools), rubricRevision:'b9881b0cfec88969e42672c92544487ca191a992', evaluator:'Independent cross-review by Codex gpt-5.6-sol at low effort; authors do not score their own batches. This is a local rubric estimate, not Glama hosted scoring or a statistical performance estimate.', reviewed:tools.length, accuracyPassed:reviews.length, mean, minimum, descriptionQuality, coherenceAssumption, projectedOverall, rawMean, rawMinimum, conservativeUnroundedOverall, targetPassed:mean >= 4.3 && minimum >= 4 && conservativeUnroundedOverall >= 3.5, scores };
if (process.argv.includes('--write-summary')) await writeFile('docs/evaluation/quality-summary.json', JSON.stringify(result,null,2) + '\n');
console.log(JSON.stringify({ ...result, scores:undefined }));
if (process.argv.includes('--require-target')) assert(result.targetPassed, 'Quality targets are unmet; revise weak definitions and obtain independent scores for changed hashes');
