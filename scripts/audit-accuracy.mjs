#!/usr/bin/env node
/**
 * Accuracy audit: calls each intelligence tool through Streamable HTTP.
 * This prints business results; direct output to an appropriately protected file.
 * Required: ST_MCP_API_KEY, AUDIT_START_DATE, AUDIT_END_DATE, AUDIT_SNAPSHOT_DATE
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.MCP_URL ?? "https://your-instance.example/mcp";
const API_KEY = process.env.ST_MCP_API_KEY;
const START_DATE = process.env.AUDIT_START_DATE;
const END_DATE = process.env.AUDIT_END_DATE;
const SNAPSHOT_DATE = process.env.AUDIT_SNAPSHOT_DATE;
if (!API_KEY || !START_DATE || !END_DATE || !SNAPSHOT_DATE) {
  console.error("Set ST_MCP_API_KEY, AUDIT_START_DATE, AUDIT_END_DATE, and AUDIT_SNAPSHOT_DATE");
  process.exit(1);
}
for (const [name, value] of [["AUDIT_START_DATE", START_DATE], ["AUDIT_END_DATE", END_DATE], ["AUDIT_SNAPSHOT_DATE", SNAPSHOT_DATE]]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must use YYYY-MM-DD`);
}

const TOOLS = [
  { name: "intel_revenue_summary", args: { startDate: START_DATE, endDate: END_DATE } },
  { name: "intel_technician_scorecard", args: { startDate: START_DATE, endDate: END_DATE } },
  { name: "intel_membership_health", args: { startDate: START_DATE, endDate: END_DATE } },
  { name: "intel_estimate_pipeline", args: { startDate: START_DATE, endDate: END_DATE } },
  { name: "intel_campaign_performance", args: { startDate: START_DATE, endDate: END_DATE, limit: 5 } },
  { name: "intel_daily_snapshot", args: { date: SNAPSHOT_DATE } },
  { name: "intel_csr_performance", args: { startDate: START_DATE, endDate: END_DATE } },
  { name: "intel_labor_cost", args: { startDate: START_DATE, endDate: END_DATE } },
  { name: "intel_invoice_tracking", args: { startDate: START_DATE, endDate: END_DATE } },
];

async function main() {
  console.log("Connecting to MCP server...");
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { "x-api-key": API_KEY } },
    reconnectionOptions: { maxRetries: 0 },
  });
  const client = new Client({ name: "audit-script", version: "1.0.0" });
  await client.connect(transport);
  console.log("Connected.\n");

  for (const tool of TOOLS) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`TOOL: ${tool.name}`);
    console.log(`ARGS: ${JSON.stringify(tool.args)}`);
    console.log("=".repeat(60));
    try {
      const result = await client.callTool({ name: tool.name, arguments: tool.args });
      const text = result.content?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        console.log("No text content:", JSON.stringify(result));
      }
    } catch (err) {
      console.error(`ERROR: ${err.message}`);
    }
  }

  try { await transport.terminateSession(); } finally { await client.close(); }
  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
