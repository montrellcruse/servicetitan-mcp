import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

// Supply the isolated install directory, never an environment/credential file.
// Usage: node scripts/package-smoke.mjs INSTALL_DIRECTORY [--output FILE]
const { values, positionals } = parseArgs({ options: { output: { type: 'string' } }, allowPositionals: true });
assert.equal(positionals.length, 1, 'Usage: node scripts/package-smoke.mjs INSTALL_DIRECTORY [--output FILE]');
assert(values.output === undefined || values.output.length > 0, '--output requires a file path');
const directory = resolve(positionals[0]);
const require = createRequire(resolve(directory, 'package.json'));
const consumer = resolve(directory, 'smoke-runtime.mjs');
await writeFile(consumer, `export * from '@rowvyn/servicetitan-mcp';\nexport { Client } from '@modelcontextprotocol/sdk/client/index.js';\nexport { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';\nexport { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';\n`);
const { createMcpServer, loadConfig, VERSION, Client, StdioClientTransport, InMemoryTransport } = await import(pathToFileURL(consumer));
const pkg = require('@rowvyn/servicetitan-mcp/package.json');
assert.equal(VERSION, pkg.version);
const fixtureEnv = { ST_CLIENT_ID: 'package-fixture', ST_CLIENT_SECRET: 'package-secret', ST_APP_KEY: 'package-key', ST_TENANT_ID: '7', ST_LOG_LEVEL: 'error' };
assert.throws(() => loadConfig({ ...fixtureEnv, ST_READONLY: 'false' }), /ST_EXPERIMENTAL_WRITES=true/);
const results = [];
for (const profile of ['full', 'crm', 'dispatch', 'analytics', 'full-write']) {
  const started = performance.now();
  const config = loadConfig({ ...fixtureEnv, ST_TOOL_PROFILE: profile === 'full-write' ? 'full' : profile, ST_READONLY: profile === 'full-write' ? 'false' : 'true', ST_EXPERIMENTAL_WRITES: profile === 'full-write' ? 'true' : 'false', ST_CONFIRM_WRITES: 'true' });
  let calls = 0;
  const forbidden = async () => { calls++; throw new Error('Upstream access is forbidden'); };
  const fakeClient = { config, ensureToken: forbidden, get: forbidden, post: forbidden, put: forbidden, patch: forbidden, delete: forbidden };
  const runtime = await createMcpServer(config, { client: fakeClient });
  const client = new Client({ name: 'installed-package-smoke', version: '1' });
  const [left, right] = InMemoryTransport.createLinkedPair();
  try {
    await runtime.server.connect(right); await client.connect(left);
    const catalog = await client.listTools();
    assert(catalog.tools.length > 3); assert(catalog.tools.every(t => t.outputSchema?.type === 'object'));
    if (profile !== 'full-write') assert(catalog.tools.every(t => t.annotations.readOnlyHint));
    const mutations = catalog.tools.filter(tool => tool.annotations.readOnlyHint === false);
    assert(mutations.every(tool => tool.description.startsWith('EXPERIMENTAL:') && tool.description.includes('live ServiceTitan Integration')));
    if (profile === 'full') assert.equal(catalog.tools.length, 264);
    if (profile === 'full-write') {
      assert.equal(mutations.length, 194);
      assert.equal(catalog.tools.length - mutations.length, 264);
      const confirmation = await client.callTool({ name: 'crm_customers_update', arguments: { id: 7 } });
      assert(confirmation.isError);
      assert.match(confirmation.structuredContent.error.message, /Write confirmation required/);
      const preview = await client.callTool({ name: 'crm_contacts_delete', arguments: { id: '00000000-0000-4000-8000-000000000007' } });
      assert(!preview.isError);
      assert.equal(preview.structuredContent.action, 'DELETE');
      assert.match(preview.structuredContent.confirm, /confirm=true/);
    }
    const result = await client.callTool({ name: 'st_result_read', arguments: { resultId: '00000000-0000-4000-8000-000000000000' } });
    assert(result.isError); assert.deepEqual(result.structuredContent, JSON.parse(result.content[0].text));
    assert.equal(calls, 0);
    results.push({ profile, tools: catalog.tools.length, readonlySupported: catalog.tools.length - mutations.length, experimentalMutations: mutations.length, catalogBytes: Buffer.byteLength(JSON.stringify(catalog)), registrationAndDiscoveryMs: Math.round(performance.now() - started) });
  } finally { await client.close(); await runtime.server.close(); }
}
const wire = new Client({ name: 'installed-cli-smoke', version: '1' });
const stdio = new StdioClientTransport({ command: process.execPath, args: [resolve(dirname(require.resolve('@rowvyn/servicetitan-mcp/package.json')), pkg.bin['servicetitan-mcp'])], stderr: 'pipe', env: {
  ST_CLIENT_ID: 'package-fixture', ST_CLIENT_SECRET: 'package-secret', ST_APP_KEY: 'package-key', ST_TENANT_ID: '7', ST_READONLY: 'true', ST_TOOL_PROFILE: 'crm', ST_LOG_LEVEL: 'error', HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1'
} });
try {
  await wire.connect(stdio); stdio.stderr?.on('data', () => {});
  assert.equal(wire.getServerVersion().version, VERSION);
  assert.equal((await wire.listTools()).tools.length, 33);
  const response = await wire.callTool({ name: 'st_result_read', arguments: { resultId: '00000000-0000-4000-8000-000000000000' } });
  assert(response.isError); assert.deepEqual(response.structuredContent, JSON.parse(response.content[0].text));
} finally { await wire.close(); await stdio.close(); }
const evidence = { version: VERSION, node: process.version, platform: process.platform, architecture: process.arch, installedPackageImport: 'passed', installedCliStdio: 'passed', outputSchemaAndToolExecution: 'passed', upstreamCalls: 0, profiles: results };
if (values.output !== undefined) {
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
}
console.log(JSON.stringify(evidence));
