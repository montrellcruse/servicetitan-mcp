import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ROOT, API_KEY, assertBuild, childEnvironment, launchHttp } from "./helpers.mjs";

const overrides = { ST_TOOL_PROFILE: "full" };

for (const kind of ["stdio", "http", "sse"]) {
  test(`built ${kind} rejects oversized bounded arrays and remains responsive`, { timeout: 20000 }, async () => {
    await assertBuild();
    const runtime = kind === "stdio" ? undefined : await launchHttp(overrides, kind === "sse" ? "sse.js" : "streamable-http.js");
    const headers = { "x-api-key": API_KEY };
    const transport = kind === "stdio"
      ? new StdioClientTransport({ command: process.execPath, args: [resolve(ROOT, "build/index.js")], cwd: ROOT, env: childEnvironment(overrides), stderr: "pipe" })
      : kind === "http"
        ? new StreamableHTTPClientTransport(new URL(`${runtime.url}/mcp`), { requestInit: { headers }, reconnectionOptions: { maxRetries: 0 } })
        : new SSEClientTransport(new URL(`${runtime.url}/sse`), { requestInit: { headers }, fetch: (url, init) => fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers } }) });
    if (kind === "stdio") transport.stderr.on("data", () => {});
    const client = new Client({ name: `bounded-${kind}`, version: "1" });
    try {
      await client.connect(transport, { timeout: 10000 });
      for (const field of ["statuses", "syncStatuses", "transactionTypes"]) {
        // All inputs fit inside the unchanged 1MiB remote transport cap.
        // Invalid arguments stop before the business handler or upstream OAuth.
        const result = await client.callTool({ name: "accounting_journal_entries_list", arguments: { [field]: new Array(1000).fill({ invalid: true }) } });
        assert.equal(result.isError, true);
        assert.match(result.content[0]?.text ?? "", /Input validation error/);
        assert.match(result.content[0]?.text ?? "", /at most 50 element/);
        assert.match(result.content[0]?.text ?? "", new RegExp(`at ${field}`));
        assert(JSON.stringify(result).length < 2048);
        assert.doesNotMatch(JSON.stringify(result), /wire-fixture-secret|wire-fixture-app-key/);
      }
      // This is a valid local-only call after the attack; it requires no API.
      const valid = await client.callTool({ name: "st_result_read", arguments: { resultId: "00000000-0000-0000-0000-000000000001" } });
      assert.equal(valid.isError, true);
      assert.match(valid.content[0]?.text ?? "", /unavailable or expired/);
      assert.doesNotMatch(valid.content[0]?.text ?? "", /Input validation error/);
      const tools = await client.listTools();
      assert.equal(tools.tools.length, 264);
    } finally {
      try { if (kind === "http") await transport.terminateSession(); }
      finally {
        try { await client.close(); await transport.close(); }
        finally { if (runtime) await runtime.stop(); }
      }
    }
  });
}
