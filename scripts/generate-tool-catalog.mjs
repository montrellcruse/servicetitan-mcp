import { writeFile } from 'node:fs/promises';
import { createMcpServer, loadConfig } from '../build/server.js';
// Registration only. Never authenticate or call an upstream tool.
const config=loadConfig({ST_CLIENT_ID:'catalog-fixture',ST_CLIENT_SECRET:'catalog-fixture',ST_APP_KEY:'catalog-fixture',ST_TENANT_ID:'1',ST_READONLY:'false',ST_LOG_LEVEL:'error'});
const {server,registry}=await createMcpServer(config);
try {
  const tools=registry.getRegisteredTools().sort((a,b)=>a.domain.localeCompare(b.domain)||a.name.localeCompare(b.name));
  let text='# V3 tool catalog\n\nGenerated from the actual supported registry. Readonly mode hides mutations; profiles and tool allowlists narrow this catalog further. Discovery does not grant ServiceTitan API scopes.\n\n';
  text+=`Supported tools: ${tools.length}; reads: ${tools.filter(t=>t.operation==='read').length}.\n\n`;
  let domain='';
  for(const tool of tools){
    if(tool.domain!==domain){domain=tool.domain;text+=`## ${domain}\n\n| Tool | Operation | Description |\n| --- | --- | --- |\n`;}
    text+=`| \`${tool.name}\` | ${tool.operation} | ${tool.description.split('\n')[0].replaceAll('|','\\|')} |\n`;
  }
  text+='\n## Removed undocumented operations\n\nThese tools are unavailable in v3.\n\n| Tool | Reason |\n| --- | --- |\n';
  for(const [name,reason]of Object.entries(registry.getUnavailableTools()).sort())text+=`| \`${name}\` | ${reason.replaceAll('|','\\|')} |\n`;
  await writeFile('TOOLS.md',text);
  console.log(JSON.stringify({tools:tools.length,reads:tools.filter(t=>t.operation==='read').length,excluded:Object.keys(registry.getUnavailableTools()).length}));
}finally{await server.close();}
