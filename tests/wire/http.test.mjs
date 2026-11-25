import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { API_KEY, ROOT, allTools, assertCatalog, assertSafeError, launchHttp, malformedHost, rawMcp } from "./helpers.mjs";

async function sdkClient(url, headers = {}) {
  const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { authorization: `bEaReR ${API_KEY}`, ...headers } }, reconnectionOptions: { maxRetries: 0 } });
  const client = new Client({ name: "built-http-wire-test", version: "1" });
  try { await client.connect(transport, { timeout: 10000 }); }
  catch (error) { await client.close(); throw error; }
  return { client, transport, close: async () => { try { await transport.terminateSession(); } finally { await client.close(); } } };
}

test("built HTTP rejects a tool selection outside its domain filter before listening", { timeout: 20000 }, async () => {
  await assert.rejects(async () => {
    const runtime = await launchHttp({
      ST_DOMAINS: "inventory",
      ST_TOOLS: "crm_customers_get",
    });
    await runtime.stop();
  }, /crm_customers_get.*Excluded by domain filter/);
});

test("built HTTP rejects invalid boundaries and supports SDK session deletion/reconnection", { timeout: 30000 }, async () => {
  const runtime = await launchHttp({ ST_CORS_ORIGIN: "https://operator.example" });
  try {
    const health = await fetch(`${runtime.url}/health`, { signal: AbortSignal.timeout(5000) });
    assert.equal((await health.json()).tools, 33);
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

function toolCall(id, name, args) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

function toolResult(response) {
  assert.equal(response.status, 200);
  const line = response.text.split("\n").find(value => value.startsWith("data: "));
  assert(line, "Expected a tool result on the response stream");
  const result = JSON.parse(line.slice("data: ".length)).result;
  assert(result && !result.isError, line);
  return result.structuredContent;
}

const drainFixture = resolve(ROOT, "tests/fixtures/wire-http-drain.mjs");

function idleStream(url, headers) {
  return fetch(`${url}/mcp`, {
    headers: { ...headers, "x-api-key": API_KEY, accept: "text/event-stream" },
    signal: AbortSignal.timeout(5000),
  });
}

test("built HTTP drains admitted work and keeps both existing and newly published handles readable", { timeout: 20000 }, async () => {
  const runtime = await launchHttp({ ST_TOOL_TIMEOUT_MS: "15000" }, "streamable-http.js", drainFixture);
  try {
    const { sessionId } = await rawMcp(runtime.url);
    assert(sessionId);
    const headers = { "mcp-session-id": sessionId };
    const call = body => rawMcp(runtime.url, { headers, body });
    const earlier = toolResult(await call(toolCall(2, "crm_customers_get", { id: 7 })));
    assert.equal(earlier.delivery, "stored");

    const idle = await idleStream(runtime.url, headers);
    assert.equal(idle.status, 200);

    const started = once(runtime.child, "message", { signal: AbortSignal.timeout(5000) });
    const admitted = call(toolCall(3, "crm_customers_get", { id: 8 }));
    void admitted.catch(() => {});
    const [upstream] = await started;
    assert.deepEqual(upstream, { upstreamStarted: 8 });
    runtime.child.kill("SIGTERM");
    await idle.text();
    if (runtime.child.connected) runtime.child.send("release-customer", () => {});
    const finished = toolResult(await admitted);
    assert.equal(finished.delivery, "stored");

    assert.equal((await rawMcp(runtime.url)).status, 503);
    assert.equal((await call(toolCall(4, "crm_customers_get", { id: 9 }))).status, 503);
    assert.equal((await rawMcp(runtime.url, { method: "GET", headers })).status, 503);

    let requestId = 5;
    for (const [handle, customerId] of [[earlier, 7], [finished, 8]]) {
      let text = "";
      let offset = 0;
      do {
        const chunk = toolResult(await call(toolCall(requestId++, "st_result_read", { resultId: handle.resultId, offset })));
        assert(chunk.nextOffset === null || chunk.nextOffset > offset);
        text += chunk.text;
        offset = chunk.nextOffset;
      } while (offset !== null);
      assert.deepEqual(JSON.parse(text), { id: customerId, name: "x".repeat(2000) });
    }
    assert.equal((await rawMcp(runtime.url, { method: "DELETE", headers })).status, 200);
  } finally {
    await runtime.stop();
  }
});

test("built HTTP aborts unfinished work at the first signal's ten-second deadline", { timeout: 20000 }, async () => {
  const runtime = await launchHttp({ ST_TOOL_TIMEOUT_MS: "15000" }, "streamable-http.js", drainFixture);
  const { child } = runtime;
  const message = () => once(child, "message", { signal: AbortSignal.timeout(5000) });
  async function command(value) {
    const reply = message();
    child.send(value);
    return (await reply)[0];
  }
  try {
    const { sessionId } = await rawMcp(runtime.url);
    assert(sessionId);
    const headers = { "mcp-session-id": sessionId };
    const idle = await idleStream(runtime.url, headers);
    assert.equal(idle.status, 200);

    const started = message();
    const admitted = rawMcp(runtime.url, { headers, body: toolCall(2, "crm_customers_get", { id: 8 }) });
    const completion = admitted.then(response => response.text, () => "");
    assert.deepEqual((await started)[0], { upstreamStarted: 8 });
    assert.equal(await command("freeze-clock"), "clock-frozen");
    child.kill("SIGTERM");
    await idle.text();

    assert.equal(await command(5000), "clock-advanced");
    const interrupted = message();
    child.kill("SIGINT");
    assert.equal((await interrupted)[0], "interrupt-seen");

    assert.equal(await command(4999), "clock-advanced");
    assert.equal((await rawMcp(runtime.url)).status, 503);
    const exited = once(child, "exit", { signal: AbortSignal.timeout(5000) });
    assert.deepEqual(await command(1), { upstreamAborted: 8 });
    assert.deepEqual(await exited, [0, null]);
    assert.equal(await completion, "");
    await assert.rejects(fetch(`${runtime.url}/health`, { signal: AbortSignal.timeout(1000) }));
  } finally {
    await runtime.stop();
  }
});
