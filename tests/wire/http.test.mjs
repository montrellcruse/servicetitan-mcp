import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { API_KEY, allTools, assertCatalog, assertSafeError, launchHttp, malformedHost, rawMcp } from "./helpers.mjs";

async function sdkClient(url, headers = {}) {
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { authorization: `bEaReR ${API_KEY}`, ...headers } }, reconnectionOptions: { maxRetries: 0 } });
  const client = new Client({ name: "built-http-wire-test", version: "1" });
  try { await client.connect(transport, { timeout: 10000 }); }
  catch (error) { await client.close(); throw error; }
  return { client, transport, close: async () => { try { await transport.terminateSession(); } finally { await client.close(); } } };
}

test("built HTTP rejects invalid boundaries and supports SDK session deletion/reconnection", { timeout: 30000 }, async () => {
  const runtime = await launchHttp({ ST_CORS_ORIGIN: "https://operator.example" });
  try {
    assert.equal((await rawMcp(runtime.url, { headers: { "x-api-key": "wrong" } })).status, 401);
    assert.equal((await rawMcp(runtime.url, { headers: { origin: "https://malicious.example" } })).status, 403);
    assert.equal(await malformedHost(runtime.port), 400);
    const first = await sdkClient(runtime.url, { origin: "https://operator.example" });
    const firstId = first.transport.sessionId;
    try {
      assert(firstId);
      assert.equal(first.client.getServerVersion()?.name, "ServiceTitan");
      assertCatalog(await allTools(first.client));
      assertSafeError(await first.client.callTool({ name: "st_result_read", arguments: { resultId: randomUUID() } }));
    } finally { await first.close(); }
    assert.equal((await rawMcp(runtime.url, { headers: { "mcp-session-id": firstId } })).status, 404);
    const second = await sdkClient(runtime.url);
    try { assert.notEqual(second.transport.sessionId, firstId); assertCatalog(await allTools(second.client)); }
    finally { await second.close(); }
  } finally { await runtime.stop(); }
  await assert.rejects(fetch(`${runtime.url}/health`, { signal: AbortSignal.timeout(1000) }));
});

test("parallel built HTTP initializations obey the session cap and DELETE releases capacity repeatedly", { timeout: 30000 }, async () => {
  const runtime = await launchHttp({ ST_MAX_SESSIONS: "2" });
  try {
    for (let round = 0; round < 2; round++) {
      const outcomes = await Promise.all(Array.from({ length: 6 }, () => rawMcp(runtime.url)));
      assert.equal(outcomes.filter(result => result.status === 200).length, 2);
      assert.equal(outcomes.filter(result => result.status === 503).length, 4);
      const sessions = outcomes.filter(result => result.status === 200).map(result => result.sessionId);
      assert.equal(new Set(sessions).size, 2);
      for (const sessionId of sessions) {
        assert(sessionId);
        assert.equal((await rawMcp(runtime.url, { method: "DELETE", headers: { "mcp-session-id": sessionId } })).status, 200);
        assert.equal((await rawMcp(runtime.url, { headers: { "mcp-session-id": sessionId } })).status, 404);
      }
    }
    // Leave a session active to prove SIGTERM closes it instead of hanging.
    assert.equal((await rawMcp(runtime.url)).status, 200);
  } finally { await runtime.stop(); }
});

test("built HTTP derives caller identity from its credential and rejects self-asserted MCP metadata", { timeout: 20000 }, async () => {
  const runtime = await launchHttp({ ST_MCP_CLIENT_ID: "actual-principal", ST_ALLOWED_CALLERS: "allowlisted-principal" });
  let connection;
  try {
    connection = await sdkClient(runtime.url);
    assertSafeError(await connection.client.callTool({
      name: "st_result_read", arguments: { resultId: randomUUID() },
      _meta: { caller: "allowlisted-principal", clientId: "allowlisted-principal", email: "allowlisted-principal" },
    }), /caller not permitted/);
  } finally {
    try { if (connection) await connection.close(); }
    finally { await runtime.stop(); }
  }
});
