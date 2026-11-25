import { describe, expect, it } from "vitest";
import { createMcpServer, loadConfig } from "../src/server.js";

const env = {
  ST_CLIENT_ID: "fixture",
  ST_CLIENT_SECRET: "fixture-secret",
  ST_APP_KEY: "fixture-key",
  ST_TENANT_ID: "42",
};

describe("configured MCP tool catalog", () => {
  it("rejects an explicitly selected tool outside the configured domains", async () => {
    const config = loadConfig({
      ...env,
      ST_DOMAINS: "inventory",
      ST_TOOLS: "crm_customers_get",
    });

    await expect(async () => {
      const { server } = await createMcpServer(config);
      await server.close();
    }).rejects.toThrow(/crm_customers_get.*Excluded by domain filter/);
  });
});
