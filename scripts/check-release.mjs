import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const record = JSON.parse(await readFile('docs/releases/v3-acceptance.json', 'utf8'));
// The policy is fixed in reviewed code, not weakened by editing the evidence record.
const required = ['maintenance', 'contracts', 'analytics', 'interface', 'runtimeMatrix', 'packageSmoke', 'liveProduction', 'latencyAndLoad'];
const scoped = ['liveIntegration', 'liveSecondCompany'];
const failures = required.filter(key => record.gates?.[key]?.status !== 'passed')
  .map(key => `${key}: ${record.gates?.[key]?.status ?? 'missing'}`);
const policy = record.supportPolicy;
if (policy?.id !== 'readonly-v1'
  || JSON.stringify(policy.stableOperations) !== JSON.stringify(['read'])
  || JSON.stringify(policy.experimentalOperations) !== JSON.stringify(['write', 'delete'])
  || policy.independentCompanyCertification !== false
  || policy.dashboardParity !== false) {
  failures.push('Support policy must match readonly-v1: stable reads, experimental mutations, no independent-company or dashboard certification');
}
for (const key of scoped) {
  const gate = record.gates?.[key];
  if (gate?.status === 'passed') continue;
  if (gate?.status !== 'scoped_out') {
    failures.push(`${key}: ${gate?.status ?? 'missing'} (must be verified passed or explicitly scoped_out)`);
  } else if (typeof gate.reason !== 'string' || !gate.reason.trim()
    || typeof gate.requiredFor !== 'string' || !gate.requiredFor.trim()) {
    failures.push(`${key}: scoped_out requires a reason and the support commitment it would validate (requiredFor)`);
  }
}
if (record.releaseDisposition !== 'stable-readonly') failures.push('Release disposition must be stable-readonly');
if (record.version !== pkg.version) failures.push('Acceptance record version differs from package');
async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(file)); else out.push(file);
  }
  return out;
}
const sourceFiles = [
  ...await files('src'), ...await files('tests'), ...await files('scripts'), ...await files('.github/workflows'),
  'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts', 'eslint.config.js',
  'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'ARCHITECTURE.md', '.gitignore', '.dockerignore',
  'CHANGELOG.md', 'TOOLS.md', 'LICENSE', '.env.example', 'Dockerfile', 'fly.toml',
  'docs/MIGRATION-v3.md', 'docs/contracts/README.md', 'docs/releases/VALIDATION-v3.md', 'docs/BENCHMARKS.md', 'benchmarks/README.md',
  ...(await readdir('benchmarks')).filter(name => name.endsWith('.mjs')).map(name => path.join('benchmarks', name)),
].sort();
const hash = createHash('sha256');
for (const file of sourceFiles) {
  hash.update(file + '\0'); hash.update(await readFile(file)); hash.update('\0');
}
const sourceFingerprint = hash.digest('hex');
if (process.argv.includes('--fingerprint')) { console.log(sourceFingerprint); process.exit(0); }
if (record.sourceFingerprint !== sourceFingerprint) failures.push('Acceptance evidence does not match the current source fingerprint');
if (failures.length) {
  console.error('Release gates pending or failed:\n' + failures.map(x => ' - ' + x).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Release gates satisfied for ${pkg.version} under readonly-v1 (stable reads; experimental mutations)`);
  for (const key of scoped) {
    if (record.gates[key].status === 'scoped_out') console.log(` - ${key}: scoped out, not verified`);
  }
}
