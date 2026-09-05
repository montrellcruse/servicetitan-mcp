import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, loadConfig } from "../src/server.js";
import type { ServiceTitanClient } from "../src/client.js";

const env={ST_CLIENT_ID:"fixture",ST_CLIENT_SECRET:"fixture",ST_APP_KEY:"fixture",ST_TENANT_ID:"123",ST_LOG_LEVEL:"error"};

describe("v3 real SDK integration",()=>{
  it("round trips large results and enforces output schemas over the MCP wire",async()=>{
    const payload={id:1,name:'Quote " slash \\ and 😀 '.repeat(150)};
    const runtime=await createMcpServer(loadConfig({...env,ST_TOOL_PROFILE:"crm",ST_MAX_RESPONSE_CHARS:"1024"}),{client:{get:vi.fn(async()=>payload)} as unknown as ServiceTitanClient});
    const client=new Client({name:"fixture",version:"1"});const [ct,st]=InMemoryTransport.createLinkedPair();
    try {
      await runtime.server.connect(st);await client.connect(ct);
      const tools=await client.listTools();expect(tools.tools.every(t=>!!t.outputSchema)).toBe(true);
      expect(tools.tools.some(t=>t.name==="crm_customers_update")).toBe(false);
      const result=await client.callTool({name:"crm_customers_get",arguments:{id:1}});
      expect(result.isError).not.toBe(true);const meta=result.structuredContent as any;
      expect(meta.retrievalTool).toBe("st_result_read");
      let offset=0,text="";
      do {
        const page=await client.callTool({name:"st_result_read",arguments:{resultId:meta.resultId,offset}});
        expect(JSON.stringify(page).length).toBeLessThanOrEqual(1024);
        expect(page.isError).not.toBe(true);
        const chunk=page.structuredContent as any;text+=chunk.text;
        if(chunk.nextOffset===null)break;offset=chunk.nextOffset;
      }while(true);
      expect(JSON.parse(text)).toEqual(payload);
    }finally{await client.close();await runtime.server.close();}
  });

  it("keeps oversized labor-cost handles session-owned when two SDK servers share the same API client", async () => {
    const budget = 1024;
    const fields = ["EmployeeName", "Date", "RegularHours", "OvertimeHours", "DoubleOvertimeHours", "GrossPay"].map(name => ({ name }));
    const definition = { id: 166, name: "Synthetic labor report", parameters: [{ name: "From", dataType: "Date" }, { name: "To", dataType: "Date" }], fields };
    const employeeNames = ['Fixture employee A "quoted" \\ 😀 '.repeat(24).trim(), 'Fixture employee B "quoted" \\ 😀 '.repeat(24).trim()];
    const reportPath = "/tenant/{tenant}/report-category/accounting/reports/166";
    const get = vi.fn(async (path: string) => {
      if (path === reportPath) return definition;
      throw new Error(`Unexpected synthetic GET: ${path}`);
    });
    const post = vi.fn(async (path: string, body: unknown, params: unknown) => {
      expect(path).toBe(`${reportPath}/data`);
      expect(body).toEqual({ parameters: [{ name: "From", value: "2026-09-04" }, { name: "To", value: "2026-09-05" }] });
      expect(params).toMatchObject({ page: 1, includeTotal: true });
      return { fields, data: [[employeeNames[0], "2026-09-04", 8, 1, 0, 200], [employeeNames[1], "2026-09-04", 7, 0, 0, 150]], page: 1, pageSize: 1000, totalCount: 2, hasMore: false };
    });
    // One object is deliberately reused: client-based cache namespacing alone
    // cannot distinguish these two registries and their private result stores.
    const sharedApiClient = { get, post } as unknown as ServiceTitanClient;
    const config = loadConfig({ ...env, ST_TOOL_PROFILE: "analytics", ST_TOOLS: "intel_labor_cost", ST_TIMEZONE: "UTC", ST_MAX_RESPONSE_CHARS: String(budget) });
    const runtimes = await Promise.all([createMcpServer(config, { client: sharedApiClient }), createMcpServer(config, { client: sharedApiClient })]);
    const clients = [new Client({ name: "labor-session-a", version: "1" }), new Client({ name: "labor-session-b", version: "1" })];

    async function readOwnedResult(client: Client, resultId: string): Promise<Record<string, unknown>> {
      let offset = 0;
      let text = "";
      for (let page = 0; page < 500; page++) {
        const result = await client.callTool({ name: "st_result_read", arguments: { resultId, offset } });
        expect(result.isError).not.toBe(true);
        expect(JSON.stringify(result).length).toBeLessThanOrEqual(budget);
        const chunk = result.structuredContent as { text: string; nextOffset: number | null };
        expect(result.content[0]).toMatchObject({ type: "text" });
        expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(chunk);
        expect(typeof chunk.text).toBe("string");
        text += chunk.text;
        if (chunk.nextOffset === null) return JSON.parse(text) as Record<string, unknown>;
        expect(chunk.nextOffset).toBe(offset + chunk.text.length);
        expect(chunk.nextOffset).toBeGreaterThan(offset);
        offset = chunk.nextOffset;
      }
      throw new Error("Stored result did not finish within the bounded fixture page count");
    }

    try {
      await Promise.all(runtimes.map(async (runtime, index) => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await runtime.server.connect(serverTransport);
        await clients[index].connect(clientTransport);
      }));
      const request = { name: "intel_labor_cost", arguments: { startDate: "2026-09-04", endDate: "2026-09-05" } };
      const results = await Promise.all(clients.map(client => client.callTool(request)));
      const handles = results.map(result => {
        expect(result.isError).not.toBe(true);
        expect(JSON.stringify(result).length).toBeLessThanOrEqual(budget);
        expect(result.structuredContent).toMatchObject({ retrievalTool: "st_result_read", delivery: "stored", complete: false });
        const handle = (result.structuredContent as { resultId: string }).resultId;
        expect(handle).toMatch(/^[0-9a-f-]{36}$/);
        return handle;
      });
      expect(handles[0]).not.toBe(handles[1]);

      const foreignResults = await Promise.all(clients.map((client, index) => client.callTool({ name: "st_result_read", arguments: { resultId: handles[1 - index], offset: 0 } })));
      for (const foreign of foreignResults) {
        expect(foreign.isError).toBe(true);
        expect(foreign.structuredContent).toMatchObject({ error: { code: "REQUEST_FAILED", message: expect.stringMatching(/unavailable or expired/) } });
        expect(JSON.stringify(foreign)).not.toContain(employeeNames[0]);
        expect(JSON.stringify(foreign)).not.toContain(employeeNames[1]);
      }

      const payloads = await Promise.all(clients.map((client, index) => readOwnedResult(client, handles[index])));
      expect(payloads[0]).toEqual(payloads[1]);
      for (const payload of payloads) {
        expect(payload).toMatchObject({ totalHours: 16, regularHours: 15, overtimeHours: 1, totalGrossPay: 350, costAvailability: { available: true } });
        expect((payload.employees as Array<{ name: string }>).map(employee => employee.name)).toEqual(employeeNames);
      }

      // A later identical invocation must not reuse either stored handle from
      // a completed-response cache, even after both initial calls have settled.
      const repeated = await clients[1].callTool(request);
      const repeatedId = (repeated.structuredContent as { resultId: string }).resultId;
      expect(repeated.isError).not.toBe(true);
      expect(repeatedId).toBeTypeOf("string");
      expect(handles).not.toContain(repeatedId);
      expect(await readOwnedResult(clients[1], repeatedId)).toEqual(payloads[1]);
      const forbidden = await clients[0].callTool({ name: "st_result_read", arguments: { resultId: repeatedId } });
      expect(forbidden.isError).toBe(true);
      expect(post).toHaveBeenCalled();
    } finally {
      await Promise.allSettled(clients.map(client => client.close()));
      await Promise.allSettled(runtimes.map(runtime => runtime.server.close()));
    }
  });
});
