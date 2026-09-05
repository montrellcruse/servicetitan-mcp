import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { allowedOrigin, authenticated, requestUrl, safeCompare } from "../src/http-policy.js";
import { loadConfig } from "../src/config.js";
import { ToolRegistry } from "../src/registry.js";
import { ResultStore } from "../src/result-store.js";
import { toolResult } from "../src/utils.js";
import { getRequestContext } from "../src/request-context.js";

const env = { ST_CLIENT_ID: "fixture", ST_CLIENT_SECRET: "secret", ST_APP_KEY: "key", ST_TENANT_ID: "123" };
const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
const req = (headers: Record<string,string> = {}, url = "/mcp") => ({ headers, url }) as IncomingMessage;
afterEach(() => vi.useRealTimers());

describe("v3 HTTP trust boundaries", () => {
  it("requires exact browser Origin and allows native clients without Origin", () => {
    expect(allowedOrigin(req(), "")).toBe(true);
    expect(allowedOrigin(req({origin:"https://evil.example"}), "")).toBe(false);
    expect(allowedOrigin(req({origin:"null"}), "https://app.example")).toBe(false);
    expect(allowedOrigin(req({origin:"https://app.example.evil.example"}), "https://app.example")).toBe(false);
    expect(allowedOrigin(req({origin:"https://app.example"}), "https://app.example")).toBe(true);
  });
  it.each(["[", "evil/path", "user@host", "host#fragment", "host\\path", "host?query", "a b"])("rejects malformed Host %s", host => {
    expect(() => requestUrl(req({host}))).toThrow();
  });
  it.each(["https://evil.example/mcp", "//evil.example/mcp", "/\\evil"])("rejects nonlocal request target %s", url => {
    expect(() => requestUrl(req({host:"localhost"},url))).toThrow();
  });
  it("handles multibyte credentials without throwing or prefix acceptance", () => {
    expect(safeCompare("é", "aa")).toBe(false);
    expect(safeCompare("é", "é")).toBe(true);
    expect(authenticated(req({"x-api-key":"secret-extra"}),"secret")).toBe(false);
    expect(authenticated(req({authorization:"Bearer secret"}),"secret")).toBe(true);
  });
});

describe("v3 configuration and discovery", () => {
  it.each(["*","null","https://example.com/path","https://user:pass@example.com","file:///tmp/a"])("rejects invalid configured origin %s",origin=>{
    expect(()=>loadConfig({...env,ST_CORS_ORIGIN:origin})).toThrow(/ST_CORS_ORIGIN/);
  });
  it("validates custom report bindings and limits", () => {
    expect(loadConfig({...env,ST_REPORT_BINDINGS:'{"166":{"category":"accounting","reportId":900166}}'}).reportBindings?.["166"].reportId).toBe(900166);
    for (const json of ['[]','{"166":{"reportId":5}}','{"166":{"category":"../crm","reportId":5}}','{"166":{"category":"accounting","reportId":0}}']) {
      expect(()=>loadConfig({...env,ST_REPORT_BINDINGS:json})).toThrow(/ST_REPORT_BINDINGS/);
    }
    expect(()=>loadConfig({...env,ST_MAX_RESPONSE_CHARS:"255"})).toThrow(/at least 256/);
    expect(()=>loadConfig({...env,ST_TOOL_PROFILE:"typo"})).toThrow(/ST_TOOL_PROFILE/);
  });
  it("publishes only available readonly tools and rejects unknown selection", () => {
    const server={registerTool:vi.fn()};
    const registry=new ToolRegistry(server as any,loadConfig({...env,ST_TOOL_PROFILE:"crm"}),logger as any);
    for(const [name,domain,operation] of [["crm_customers_get","crm","read"],["crm_customers_update","crm","write"],["intel_labor_cost","intelligence","read"],["marketing_suppressions_list","marketing","read"]] as const) {
      registry.register({name,domain,operation,schema:{},description:name,handler:async()=>toolResult({ok:true})});
    }
    expect(registry.getRegisteredTools().map(t=>t.name)).toEqual(["crm_customers_get"]);
    const invalid=new ToolRegistry(server as any,loadConfig({...env,ST_TOOLS:"typo"}),logger as any);
    expect(()=>invalid.validateSelection()).toThrow(/unknown tools/);
  });
  it("cannot spoof allowlisted identity via a real MCP metadata call", async () => {
    const server=new McpServer({name:"identity-test",version:"1"});
    const registry=new ToolRegistry(server,loadConfig({...env,ST_ALLOWED_CALLERS:"alice@example.com"}),logger as any);
    const handler=vi.fn(async()=>toolResult({ok:true}));
    registry.register({name:"protected_read",domain:"_system",operation:"read",description:"protected",schema:{},handler});
    const [ct,st]=InMemoryTransport.createLinkedPair();
    const client=new Client({name:"attacker",version:"1"});
    try {
      await server.connect(st);await client.connect(ct);
      const result=await client.callTool({name:"protected_read",arguments:{},_meta:{caller:"alice@example.com",email:"alice@example.com"}});
      expect(result.isError).toBe(true);expect(handler).not.toHaveBeenCalled();
    } finally {await client.close();await server.close();}
  });
  it("propagates cancellation and keeps concurrent timezone contexts independent", async () => {
    const server={registerTool:vi.fn()};
    const registryA=new ToolRegistry(server as any,loadConfig({...env,ST_TIMEZONE:"America/Phoenix"}),logger as any);
    const registryB=new ToolRegistry(server as any,loadConfig({...env,ST_TIMEZONE:"America/New_York"}),logger as any);
    const definition={name:"context_read",domain:"_system",operation:"read" as const,description:"context",schema:{},handler:async()=>{
      await new Promise(resolve=>setTimeout(resolve,1));return toolResult({zone:getRequestContext().timezone});
    }};
    registryA.register(definition);registryB.register(definition);
    const [a,b]=await Promise.all([registryA.getRegisteredTools()[0].handler({}),registryB.getRegisteredTools()[0].handler({})]);
    expect(a.structuredContent).toMatchObject({zone:"America/Phoenix"});expect(b.structuredContent).toMatchObject({zone:"America/New_York"});
    const abort=new AbortController();abort.abort();
    expect((await registryA.getRegisteredTools()[0].handler({}, {signal:abort.signal})).isError).toBe(true);
  });
  it("bounds active tool calls and releases the slot after errors", async () => {
    const registry=new ToolRegistry({registerTool:vi.fn()} as any,loadConfig({...env,ST_MAX_CONCURRENT_TOOLS:"1"}),logger as any);
    let reject!: (reason:Error)=>void;
    registry.register({name:"slow_read",domain:"_system",operation:"read",description:"slow",schema:{},handler:()=>new Promise((_,r)=>{reject=r;})});
    const tool=registry.getRegisteredTools()[0];
    const pending=tool.handler({});await Promise.resolve();
    expect((await tool.handler({})).isError).toBe(true);
    reject(new Error("fixture error"));expect((await pending).isError).toBe(true);
    const next=tool.handler({});await Promise.resolve();reject(new Error("next error"));expect((await next).isError).toBe(true);
  });
});

describe("v3 large-result retrieval", () => {
  it("reassembles exact Unicode/escaped JSON without leaking results across stores", () => {
    const a=new ResultStore(), b=new ResultStore();const payload={text:'a"\\\n😀'.repeat(1000),data:[1,2,3]};
    const meta=a.put(payload);let offset=0,text="";
    do {const page=a.read(String(meta.resultId),offset,37);text+=page.text;if(page.nextOffset===null)break;offset=Number(page.nextOffset);}while(true);
    expect(JSON.parse(text)).toEqual(payload);
    expect(()=>b.read(String(meta.resultId),0,37)).toThrow(/unavailable/);
  });
  it("expires and bounds memory; rejects invalid offsets", () => {
    let now=0;const store=new ResultStore(80,100,()=>now);const first=store.put({value:"x".repeat(30)});
    store.put({value:"y".repeat(30)});expect(()=>store.read(String(first.resultId),0,10)).toThrow(/unavailable/);
    const current=store.put({value:"z"});expect(()=>store.read(String(current.resultId),-1,10)).toThrow(/offset/);
    now=101;expect(()=>store.read(String(current.resultId),0,10)).toThrow(/expired/);
    expect(()=>store.put("x".repeat(100))).toThrow(/storage limit/);
  });
  it("returns retrievable handles within the actual response budget", async () => {
    const registry=new ToolRegistry({registerTool:vi.fn()} as any,loadConfig({...env,ST_MAX_RESPONSE_CHARS:"1024"}),logger as any);
    const payload={_warnings:["partial fixture"],data:[{note:'"\\😀'.repeat(1000)}]};
    registry.register({name:"large_read",domain:"_system",operation:"read",description:"large",schema:{},handler:async()=>toolResult(payload)});
    const result=await registry.getRegisteredTools()[0].handler({});
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1024);
    const meta=result.structuredContent as Record<string,unknown>;expect(meta.retrievalTool).toBe("st_result_read");
    let offset=0,text="";
    do {const page=registry.readResult(String(meta.resultId),offset);text+=page.text;if(page.nextOffset===null)break;offset=Number(page.nextOffset);}while(true);
    expect(JSON.parse(text)).toEqual(payload);
  });
});
