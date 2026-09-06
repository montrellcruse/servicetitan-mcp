import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
// Rebuild so source contracts and runtime handlers always describe one candidate.
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });
const { createMcpServer, loadConfig } = await import('../build/server.js');
import { captureDiscovery, digest, validationSchema } from './discovery-audit.mjs';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);const {z}=require('zod');const {build}=require('esbuild');
const workdir = await mkdtemp(tmpdir() + '/st-overlap-');
await build({entryPoints:['src/contracts/resolve-route.ts','src/contracts/operations.ts'],bundle:true,format:'esm',platform:'node',outdir:workdir});
const {resolveServiceTitanPath}=await import(pathToFileURL(workdir+'/resolve-route.js'));const {findOfficialOperation}=await import(pathToFileURL(workdir+'/operations.js'));
const capture=await captureDiscovery();
const config=loadConfig({ST_CLIENT_ID:'fixture',ST_CLIENT_SECRET:'fixture',ST_APP_KEY:'fixture',ST_TENANT_ID:'7',ST_LOG_LEVEL:'error'});
let requests=[];const client={config};for(const method of ['get','post','put','patch','delete'])client[method]=async(path,...args)=>{const resolved=resolveServiceTitanPath(path,'7',method);const op=findOfficialOperation(method,resolved);requests.push({method,path,resolved,args,operation:op.id,fullPath:op.fullPath,document:op.document,scopes:op.scopes});return {data:[],hasMore:false,page:1,pageSize:50,totalCount:0};};
const runtime=await createMcpServer(config,{client});
function sample(s,k=''){if('default' in s)return s.default;if(s.enum)return s.enum[0];if(s.anyOf||s.oneOf)return sample((s.anyOf||s.oneOf).find(t=>t.type!=='null'),k);if(s.type==='object')return Object.fromEntries((s.required||[]).map(k=>[k,sample(s.properties[k],k)]));if(s.type==='array')return Array.from({length:s.minItems||1},()=>sample(s.items,k));if(s.type==='integer'||s.type==='number')return Math.max(s.minimum||1,42);if(s.type==='boolean')return true;if(s.format==='uuid')return '00000000-0000-4000-8000-000000000042';if(s.format==='date-time')return '2026-09-01T00:00:00Z';if(s.format==='date'||s.pattern?.includes('\\d{4}'))return /end|to/i.test(k)?'2026-09-02':'2026-09-01';return '42';}
const out=[];
for(const t of runtime.registry.getRegisteredTools().filter(t=>t.domain!=='intelligence'&&t.domain!=='_system')){requests=[];try{const definition=capture.configurations.default.tools.find(x=>x.name===t.name);const input=z.object(t.schema).parse('from' in definition.inputSchema.properties ? {from:'2026-09-01',includeRecentChanges:true} : sample(definition.inputSchema));const response=await t.handler(input);out.push({tool:t.name,input,requests,responseSignature:digest(response),responseError:response.isError||false,...(response.isError?{response}: {})});}catch(e){out.push({tool:t.name,error:e.message,requests});}}
await rm(workdir, { recursive: true, force: true });
assert.equal(out.length, 251);
assert.deepEqual(out.filter(t => t.error || t.responseError || t.requests.length !== 1), [], 'All direct read handlers must dispatch one mock request');
const byOperation = {};
for (const row of out) {
  const request = row.requests[0];
  (byOperation[`${request.method} ${request.fullPath}`] ??= []).push(row);
}
const equivalents = Object.values(byOperation).filter(rows => rows.length > 1).map(rows => {
  const definitions = rows.map(row => capture.configurations.default.tools.find(t => t.name === row.tool));
  for (let i = 1; i < rows.length; i++) {
    assert.deepEqual(rows[i].requests, rows[0].requests, 'Equivalent mock requests differ');
    assert.equal(rows[i].responseSignature, rows[0].responseSignature);
    assert.deepEqual(validationSchema(definitions[i].inputSchema), validationSchema(definitions[0].inputSchema));
    assert.deepEqual(definitions[i].annotations, definitions[0].annotations);
  }
  return { tools: rows.map(row => row.tool), classification: 'proven equivalent', optionalInputVariants: 4, operation: rows[0].requests[0], evidence: 'Same pinned method, resolved versioned path, scopes, validation schema and annotations; equal requests across empty/date/token inputs and both recent-change flags. Handler mappings also reviewed from source. The common canned mock response does not verify live result content. Both names retained.' };
});
const expectedPairs = [['export_employees','people_employees_export'],['export_activities','settings_activities_export'],['export_activity_codes','settings_activity_codes_export'],['export_tag_types','settings_tag_types_export']];
assert.deepEqual(equivalents.map(g => [...g.tools].sort()).sort(), expectedPairs.map(p => [...p].sort()).sort(), 'Re-review the exact duplicate pairs when the inventory changes');
for (const pair of expectedPairs) {
  for (const input of [{}, {from:'2026-09-01'}, {from:'continuation-fixture',includeRecentChanges:false}, {from:'continuation-fixture',includeRecentChanges:true}]) {
    const observed = [];
    for (const name of pair) {
      requests = [];
      const tool = runtime.registry.getRegisteredTools().find(t => t.name === name);
      const response = await tool.handler(z.object(tool.schema).parse(input));
      assert(!response.isError);
      observed.push(requests);
    }
    assert.deepEqual(observed[0], observed[1], 'Alias optional-input serialization differs');
  }
}
await runtime.server.close();
const authors = ['exports-people', 'crm-dispatch-marketing', 'other-intelligence'].flatMap(batch => {
  const file = `docs/evaluation/author-review-${batch}.json`;
  const content = JSON.parse(fs.readFileSync(file));
  return (content.tools ?? content.reviews).map(row => ({ ...row, evidenceFile: file }));
});
const inventory = capture.configurations.default.tools.map(tool => {
  const evidence = authors.find(row => row.tool === tool.name);
  assert(evidence, `Missing author inventory for ${tool.name}`);
  const direct = out.find(row => row.tool === tool.name);
  const pair = equivalents.find(group => group.tools.includes(tool.name));
  return { tool: tool.name, inputHash: digest(tool), source: evidence.source, evidenceFile: evidence.evidenceFile,
    classification: pair ? 'proven equivalent' : 'related but distinct',
    equivalentTools: pair?.tools.filter(name => name !== tool.name) ?? [],
    selectionGuidance: evidence.selectionGuidance ?? evidence.overlap?.selectionNote ?? evidence.overlapClassification,
    implementation: direct ?? { kind: tool.name.startsWith('intel_') ? 'multi-source intelligence; source-specific assembly reviewed in author evidence and independent report' : 'system implementation; reviewed independently', evidence: evidence.behaviorEvidence },
  };
});
const result = { schemaVersion: 1, version: capture.version, definitionHash: digest(capture.configurations.default.tools), method: '251 direct handlers dispatched against a recording client and resolved against pinned official contracts; 10 intelligence and 3 system implementations reviewed from source. No real ServiceTitan requests. Synthetic dispatch proves route and representative argument equality, not every possible input or live upstream result.', directReads: 251, intelligenceReads: 10, systemReads: 3, upstreamCalls: 0, unresolved: [], equivalents, inventory };
fs.writeFileSync('docs/evaluation/overlap-audit.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ directReads:251, inventory:inventory.length, equivalentPairs:equivalents.map(x=>x.tools), upstreamCalls:0 }));
