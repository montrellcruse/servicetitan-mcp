import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, loadConfig } from "../src/server.js";
import type { ServiceTitanClient } from "../src/client.js";
import { Logger } from "../src/logger.js";

const env={ST_CLIENT_ID:"fixture",ST_CLIENT_SECRET:"fixture",ST_APP_KEY:"fixture",ST_TENANT_ID:"123",ST_LOG_LEVEL:"error"};

describe("v3 real SDK integration",()=>{
  it("round trips exact published JSON at a constrained budget in a non-UTC timezone", async () => {
    const budget = 500;
    const original = {
      prefix: "p".repeat(15),
      startUtc: "2026-01-01T00:00:00Z",
      data: 'Quote " slash \\ newline \n and 😀 '.repeat(150),
      createdAt: "2026-01-01T00:00:00.1234567Z",
    };
    const expected = { ...original, createdAt: "2025-12-31T17:00:00.1234567-07:00" };
    const runtime = await createMcpServer(loadConfig({
      ...env, ST_TOOL_PROFILE: "crm", ST_MAX_RESPONSE_CHARS: String(budget), ST_TIMEZONE: "America/Phoenix",
    }), { client: { get: vi.fn(async () => original) } as unknown as ServiceTitanClient });
    const client = new Client({ name: "fixture", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await runtime.server.connect(serverTransport);
      await client.connect(clientTransport);
      const tools = await client.listTools();
      expect(tools.tools.every(tool => !!tool.outputSchema)).toBe(true);
      expect(tools.tools.some(tool => tool.name === "crm_customers_update")).toBe(false);

      const result = await client.callTool({ name: "crm_customers_get", arguments: { id: 1 } });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(budget);
      const handle = result.structuredContent as { retrievalTool: string; resultId: string; totalChars: number };
      expect(handle.retrievalTool).toBe("st_result_read");
      expect(handle.totalChars).toBe(JSON.stringify(expected).length);

      let offset: number | null = 0;
      let text = "";
      for (let page = 0; page < 500 && offset !== null; page++) {
        const result = await client.callTool({ name: "st_result_read", arguments: { resultId: handle.resultId, offset } });
        expect(result.isError).not.toBe(true);
        expect(JSON.stringify(result).length).toBeLessThanOrEqual(budget);
        const chunk = result.structuredContent as { text: string; nextOffset: number | null };
        expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(chunk);
        expect(chunk.text.length).toBeGreaterThan(0);
        if (chunk.nextOffset !== null) expect(chunk.nextOffset).toBe(offset + chunk.text.length);
        text += chunk.text;
        offset = chunk.nextOffset;
      }
      expect(offset).toBeNull();
      expect(text).toBe(JSON.stringify(expected));
    } finally {
      await client.close();
      await runtime.server.close();
    }
  });

  it("preserves all readable handles when a completed mutation cannot publish its result", async () => {
    const budget = 500;
    const get = vi.fn(async () => ({ data: "x".repeat(4000) }));
    const patch = vi.fn(async () => ({ data: "y".repeat(4000) }));
    const logger = new Logger("error");
    const audit = vi.spyOn(logger, "audit").mockImplementation(() => {});
    const runtime = await createMcpServer(loadConfig({
      ...env,
      ST_TOOL_PROFILE: "crm",
      ST_MAX_RESPONSE_CHARS: String(budget),
      ST_READONLY: "false",
      ST_EXPERIMENTAL_WRITES: "true",
      ST_CONFIRM_WRITES: "true",
    }), { client: { get, patch } as unknown as ServiceTitanClient, logger });
    const client = new Client({ name: "fixture", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await runtime.server.connect(serverTransport);
      await client.connect(clientTransport);

      const handles: string[] = [];
      for (let id = 1; id <= 4; id++) {
        const result = await client.callTool({ name: "crm_customers_get", arguments: { id } });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ delivery: "stored", resultId: expect.any(String) });
        handles.push((result.structuredContent as { resultId: string }).resultId);
      }

      const mutation = await client.callTool({
        name: "crm_customers_update",
        arguments: { id: 5, payload: { name: "Synthetic" }, _confirmed: true },
      });
      expect(mutation.isError).toBe(true);
      expect(JSON.stringify(mutation).length).toBeLessThanOrEqual(budget);
      expect(mutation.structuredContent).toMatchObject({
        error: { code: "RESPONSE_TOO_LARGE", mutationCompleted: true, retryable: false },
      });
      expect(JSON.parse((mutation.content[0] as { text: string }).text)).toEqual(mutation.structuredContent);
      expect(patch).toHaveBeenCalledTimes(1);
      expect(audit).toHaveBeenCalledExactlyOnceWith("[AUDIT] WRITE crm_customers_update", expect.objectContaining({
        success: true, deliveryError: "RESPONSE_TOO_LARGE",
      }));

      for (const resultId of handles) {
        const result = await client.callTool({ name: "st_result_read", arguments: { resultId } });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ text: expect.stringMatching(/^{"data":"x+/) });
      }

      const fifth = await client.callTool({ name: "crm_customers_get", arguments: { id: 5 } });
      expect(fifth.structuredContent).toMatchObject({ delivery: "stored" });
      const evicted = await client.callTool({ name: "st_result_read", arguments: { resultId: handles[0] } });
      expect(evicted.isError).toBe(true);
      expect(evicted.structuredContent).toMatchObject({ error: { message: expect.stringMatching(/unavailable or expired/) } });
    } finally {
      await client.close();
      await runtime.server.close();
    }
  });

  it("evicts by total UTF-8 bytes and validates retrieval offsets", async () => {
    const runtime = await createMcpServer(loadConfig({ ...env, ST_TOOL_PROFILE: "crm" }), {
      client: { get: vi.fn(async () => ({ data: "é".repeat(999_994) })) } as unknown as ServiceTitanClient,
    });
    const client = new Client({ name: "fixture", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await runtime.server.connect(serverTransport);
      await client.connect(clientTransport);

      async function publish(id: number) {
        const result = await client.callTool({ name: "crm_customers_get", arguments: { id } });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ delivery: "stored" });
        return result.structuredContent as { resultId: string; totalChars: number };
      }

      // Each stored JSON object occupies 1,999,999 UTF-8 bytes.
      const first = await publish(1);
      const second = await publish(2);
      const read = (resultId: string, offset = 0) => client.callTool({ name: "st_result_read", arguments: { resultId, offset } });
      expect((await read(first.resultId)).isError).not.toBe(true);
      const third = await publish(3);
      expect((await read(first.resultId)).isError).toBe(true);
      expect((await read(second.resultId)).isError).not.toBe(true);
      expect((await read(third.resultId, third.totalChars)).structuredContent).toEqual({ text: "", nextOffset: null });
      expect((await read(third.resultId, third.totalChars + 1)).structuredContent).toMatchObject({
        error: { message: "Invalid result offset" },
      });
    } finally {
      await client.close();
      await runtime.server.close();
    }
  });

  it("clears result handles when the transport closes and serves a fresh connection", async () => {
    const budget = 500;
    const runtime = await createMcpServer(loadConfig({
      ...env, ST_TOOL_PROFILE: "crm", ST_MAX_RESPONSE_CHARS: String(budget),
    }), { client: { get: vi.fn(async () => ({ data: "x".repeat(4000) })) } as unknown as ServiceTitanClient });
    const clients = [new Client({ name: "original", version: "1" }), new Client({ name: "reconnected", version: "1" })];
    let oldHandle = "";
    try {
      for (const client of clients) {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await runtime.server.connect(serverTransport);
        await client.connect(clientTransport);
        if (oldHandle) {
          const oldResult = await client.callTool({ name: "st_result_read", arguments: { resultId: oldHandle } });
          expect(oldResult.isError).toBe(true);
          expect(oldResult.structuredContent).toMatchObject({ error: { message: expect.stringMatching(/unavailable or expired/) } });
        }
        const fresh = await client.callTool({ name: "crm_customers_get", arguments: { id: 1 } });
        expect(fresh.isError).not.toBe(true);
        expect(fresh.structuredContent).toMatchObject({ delivery: "stored", resultId: expect.any(String) });
        oldHandle = (fresh.structuredContent as { resultId: string }).resultId;
        await client.close();
      }
    } finally {
      await Promise.allSettled(clients.map(client => client.close()));
      await runtime.server.close();
    }
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
