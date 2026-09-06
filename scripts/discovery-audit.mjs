import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const configurations = {
  default: {}, full: { ST_TOOL_PROFILE: 'full' }, crm: { ST_TOOL_PROFILE: 'crm' },
  dispatch: { ST_TOOL_PROFILE: 'dispatch' }, analytics: { ST_TOOL_PROFILE: 'analytics' },
  exports: { ST_DOMAINS: 'export' },
  explicit: { ST_TOOLS: 'export_employees,people_employees_export' },
  filtered: { ST_TOOL_PROFILE: 'dispatch', ST_DOMAINS: 'settings,people', ST_TOOLS: 'people_employees_export,settings_activities_export' },
  experimental: { ST_READONLY: 'false', ST_EXPERIMENTAL_WRITES: 'true' },
};

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// Traverse schema locations, not arbitrary instance data. A property actually named
// "description", or a description key within default/const/enum data, must survive.
export function validationSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const result = {};
  const maps = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']);
  const single = new Set(['items', 'additionalItems', 'additionalProperties', 'contains', 'not', 'if', 'then', 'else', 'propertyNames', 'unevaluatedItems', 'unevaluatedProperties']);
  for (const [key, value] of Object.entries(schema)) {
    if (['description', 'title', 'examples', '$comment'].includes(key)) continue;
    if (maps.has(key) && value && typeof value === 'object') result[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, validationSchema(child)]));
    else if (['allOf', 'anyOf', 'oneOf', 'prefixItems'].includes(key) && Array.isArray(value)) result[key] = value.map(validationSchema);
    else if (single.has(key)) result[key] = Array.isArray(value) ? value.map(validationSchema) : validationSchema(value);
    else result[key] = value;
  }
  return result;
}
export const contract = tool => ({ name: tool.name, inputSchema: validationSchema(tool.inputSchema), outputSchema: validationSchema(tool.outputSchema), annotations: tool.annotations });

export function summarize(capture) {
  const contracts = {};
  const profiles = {};
  for (const [name, entry] of Object.entries(capture.configurations)) {
    const tools = entry.tools;
    profiles[name] = { env: entry.env, names: tools.map(t => t.name).sort(), count: tools.length,
      discoveryBytes: Buffer.byteLength(JSON.stringify(tools)), descriptionBytes: tools.reduce((sum, t) => sum + Buffer.byteLength(t.description ?? ''), 0) };
    for (const tool of tools) {
      const hash = digest(contract(tool));
      assert(!contracts[tool.name] || contracts[tool.name] === hash, `Inconsistent contract for ${tool.name}`);
      contracts[tool.name] = hash;
    }
  }
  return { version: capture.version, definitionHash: digest(capture.configurations.default.tools), profiles, contracts };
}

export function compare(baseline, candidate) {
  assert.deepEqual(Object.keys(candidate.profiles).sort(), Object.keys(baseline.profiles).sort(), 'Discovery configuration coverage changed');
  for (const [name, profile] of Object.entries(baseline.profiles)) {
    assert.deepEqual(candidate.profiles[name].env, profile.env, `${name} configuration changed`);
    assert.deepEqual(candidate.profiles[name].names, profile.names, `${name} tool membership changed`);
  }
  assert.deepEqual(candidate.contracts, baseline.contracts, 'A tool name, validation schema, output contract, or annotation changed');
}

export async function captureDiscovery() {
  const { createMcpServer, loadConfig, VERSION } = await import('../build/server.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const capture = { version: VERSION, configurations: {} };
  for (const [name, overrides] of Object.entries(configurations)) {
    const config = loadConfig({ ST_CLIENT_ID: 'discovery-fixture', ST_CLIENT_SECRET: 'discovery-fixture', ST_APP_KEY: 'discovery-fixture', ST_TENANT_ID: '1', ST_LOG_LEVEL: 'error', ...overrides });
    let calls = 0;
    const forbidden = async () => { calls++; throw new Error('Discovery must not access upstream'); };
    const runtime = await createMcpServer(config, { client: { config, ensureToken: forbidden, get: forbidden, post: forbidden, put: forbidden, patch: forbidden, delete: forbidden } });
    const client = new Client({ name: 'discovery-audit', version: '1' });
    const [left, right] = InMemoryTransport.createLinkedPair();
    try {
      await runtime.server.connect(right); await client.connect(left);
      const tools = []; let cursor;
      do { const page = await client.listTools({ cursor }); tools.push(...page.tools); cursor = page.nextCursor; } while (cursor);
      capture.configurations[name] = { env: overrides, tools };
      assert.equal(calls, 0);
    } finally { await client.close(); await runtime.server.close(); }
  }
  return capture;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { capture: { type: 'string' }, output: { type: 'string' }, baseline: { type: 'string', default: 'tests/fixtures/discovery-v3.0.0.json' } } });
  const capture = await captureDiscovery();
  const summary = summarize(capture);
  compare(JSON.parse(await readFile(values.baseline, 'utf8')), summary);
  if (values.capture) await writeFile(values.capture, JSON.stringify(capture, null, 2) + '\n');
  if (values.output) await writeFile(values.output, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ version: summary.version, definitionHash: summary.definitionHash, compatibility: 'passed', upstreamCalls: 0,
    profiles: Object.fromEntries(Object.entries(summary.profiles).map(([name, p]) => [name, { tools: p.count, discoveryBytes: p.discoveryBytes, descriptionBytes: p.descriptionBytes }])) }));
}
