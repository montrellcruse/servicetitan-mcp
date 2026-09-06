import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { createMcpServer, loadConfig } from '../build/server.js';
import { captureDiscovery, configurations, digest } from './discovery-audit.mjs';

const corpus = JSON.parse(await readFile('docs/evaluation/selection-scenarios.json','utf8'));
const report = { schemaVersion:1, corpusHash:digest(corpus.cases.map(({id,configuration,prompt})=>({id,configuration,prompt}))),oracleHash:digest(corpus), method:'Two fresh version-blinded Codex gpt-5.6-sol agents at low effort; one synthetic selection pass each. Same 41 prompts and oracle, no access to answer keys, no ServiceTitan business calls. Catalog descriptions and schema inspection were available. This is a small planning exercise, not a statistical agent-success or live-invocation benchmark.', upstreamCalls:0, versions:{} };
const runtimes = {};
const definitions = { baseline:JSON.parse(await readFile('docs/evaluation/baseline-v3.0.0.json','utf8')).definitionHash, candidate:digest((await captureDiscovery()).configurations.default.tools) };
try {
  for (const [name, overrides] of Object.entries(configurations)) {
    const config = loadConfig({ST_CLIENT_ID:'fixture',ST_CLIENT_SECRET:'fixture',ST_APP_KEY:'fixture',ST_TENANT_ID:'7',ST_LOG_LEVEL:'error',...overrides});
    const forbidden = async () => { throw new Error('No business calls during selection validation'); };
    runtimes[name] = await createMcpServer(config,{client:{config,get:forbidden,post:forbidden,put:forbidden,patch:forbidden,delete:forbidden}});
  }
  for (const [label,file] of [['baseline','selection-baseline.json'],['candidate','selection-candidate.json']]) {
    const answers=JSON.parse(await readFile(`docs/evaluation/${file}`,'utf8'));
    assert.equal(answers.corpusHash,report.corpusHash,'Stale selection prompts');
    assert.equal(answers.definitionHash,definitions[label],'Stale selection catalog');
    assert.equal(answers.evaluator,'gpt-5.6-sol');
    assert.equal(answers.reasoningEffort,'low');
    assert.equal(answers.results.length,corpus.cases.length);
    assert.equal(new Set(answers.results.map(r=>r.id)).size,corpus.cases.length);
    const results=corpus.cases.map(scenario=>{
      const answer=answers.results.find(r=>r.id===scenario.id);assert(answer,scenario.id);
      const available=runtimes[scenario.configuration].registry.getRegisteredTools();
      const issues=[];
      // Validate the frozen oracle against the actual unchanged runtime constraints too.
      for(const name of scenario.acceptedTools){const tool=available.find(t=>t.name===name);assert(tool,`Oracle tool absent: ${name}`);z.object(tool.schema).parse(scenario.requiredArguments);}
      if(answer.action!==scenario.expectedAction)issues.push('wrong_action');
      if(scenario.expectedAction==='call'){
        if(answer.calls.length!==1)issues.push(answer.calls.length>1?'duplicate_or_extra_call':'missing_call');
        for(const call of answer.calls){
          const tool=available.find(t=>t.name===call.tool);
          if(!tool){issues.push('unavailable_tool');continue;}
          if(!scenario.acceptedTools.includes(call.tool))issues.push('wrong_tool');
          for(const [key,value] of Object.entries(call.arguments)) {
            if(key in scenario.requiredArguments)continue;
            if(!(key in (scenario.optionalArguments??{})) || JSON.stringify(value)!==JSON.stringify(scenario.optionalArguments[key]))issues.push(`unexpected_argument:${key}`);
          }
          const parsed=z.object(tool.schema).safeParse(call.arguments);
          if(!parsed.success)issues.push('invalid_arguments');
          for(const [key,value] of Object.entries(scenario.requiredArguments)){
            const actual=parsed.success?parsed.data[key]:call.arguments[key];
            if(JSON.stringify(actual)!==JSON.stringify(value))issues.push(`wrong_argument:${key}`);
          }
        }
      }else if(answer.calls.length)issues.push('unexpected_call');
      return {id:scenario.id,passed:issues.length===0,issues,action:answer.action,tools:answer.calls.map(c=>c.tool)};
    });
    report.versions[label]={cases:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed),invalidInputs:results.filter(r=>r.issues.includes('invalid_arguments')).length,duplicateFetches:results.filter(r=>r.issues.includes('duplicate_or_extra_call')).length,results};
  }
  report.regressions=report.versions.candidate.results.filter(r=>!r.passed&&report.versions.baseline.results.find(b=>b.id===r.id).passed).map(r=>r.id);
  if(process.argv.includes('--write-summary'))await writeFile('docs/evaluation/selection-summary.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,versions:Object.fromEntries(Object.entries(report.versions).map(([k,{results,...v}])=>[k,v]))}));
  // Judgments remain review evidence. Only structural/oracle validity is a CI invariant.
} finally {for(const runtime of Object.values(runtimes))await runtime.server.close();}
