#!/usr/bin/env node
/**
 * Accuracy audit: calls each intel tool via deployed MCP and captures output.
 * Usage: ST_MCP_API_KEY=<key> node scripts/audit-accuracy.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const MCP_URL = process.env.MCP_URL ?? "https://your-instance.fly.dev/sse";
const API_KEY = process.env.ST_MCP_API_KEY;
if (!API_KEY) {
  console.error("Set ST_MCP_API_KEY env var");
  process.exit(1);
}

const TOOLS = [
  { name: "intel_revenue_summary", args: { startDate: "2026-02-01", endDate: "2026-02-28" } },
  { name: "intel_technician_scorecard", args: { startDate: "2026-02-01", endDate: "2026-02-28" } },
  { name: "intel_membership_health", args: { startDate: "2026-02-01", endDate: "2026-02-28" } },
  { name: "intel_estimate_pipeline", args: { startDate: "2026-02-01", endDate: "2026-02-28" } },
  { name: "intel_campaign_performance", args: { startDate: "2026-02-01", endDate: "2026-02-28", limit: 5 } },
  { name: "intel_daily_snapshot", args: { date: "2026-03-04" } },
];

async function main() {
  console.log("Connecting to MCP server...");
  const transport = new SSEClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { "x-api-key": API_KEY } },
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

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
