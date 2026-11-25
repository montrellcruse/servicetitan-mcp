import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { InternalAxiosRequestConfig } from "axios";

import { ServiceTitanClient } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { isUnsupportedTool, UNSUPPORTED_TOOLS } from "../src/contracts/index.js";
import type { OfficialOperationContract } from "../src/contracts/types.js";
import { prepareMcpDeployment } from "../src/server.js";

type PinnedOperation = Pick<OfficialOperationContract, "id" | "method" | "fullPath">;
type CapturedRequest = { method: string; path: string };

function fixtureResponse(config: InternalAxiosRequestConfig, data: unknown) {
  return { config, data, headers: {}, status: 200, statusText: "OK" };
}

/** Check requests at the ServiceTitan HTTP boundary using an in-memory MCP client. */
export async function checkExportContracts(operations: readonly PinnedOperation[]) {
  const config = loadConfig({
    ST_CLIENT_ID: "fixture",
    ST_CLIENT_SECRET: "fixture",
    ST_APP_KEY: "fixture",
    ST_TENANT_ID: "42",
    ST_DOMAINS: "export",
    ST_LOG_LEVEL: "error",
  });
  const requests: CapturedRequest[] = [];
  const api = new ServiceTitanClient(config, {
    authAdapter: async request => fixtureResponse(request, { access_token: "fixture-token", expires_in: 900 }),
    adapter: async request => {
      if (!request.url || !request.method) throw new Error("Invalid export fixture request");
      requests.push({ method: request.method.toUpperCase(), path: new URL(request.url, request.baseURL).pathname });
      return fixtureResponse(request, { data: [], hasMore: false, continueFrom: "fixture-cursor" });
    },
  });

  const deployment = await prepareMcpDeployment(config, { client: api });
  const inventory = deployment.catalog.getInventory().filter(({ tool }) => tool.domain === "export");
  if (inventory.length === 0) throw new Error("The tool catalog has no export registrations");

  const { server } = deployment.createServer();
  const client = new Client({ name: "export-contract-check", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const excluded: Array<CapturedRequest & { tool: string }> = [];
  let verified = 0;
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    for (const { tool, exclusionReason } of inventory) {
      const { name, apiContract } = tool;
      if (!apiContract) throw new Error(`${name} has no export contract declaration`);
      if ("unsupportedRequest" in apiContract) {
        if (!isUnsupportedTool(name) || exclusionReason !== UNSUPPORTED_TOOLS[name].reason) {
          throw new Error(`${name} has no documented export contract exclusion`);
        }
        excluded.push({ tool: name, ...apiContract.unsupportedRequest });
        continue;
      }
      if (exclusionReason) throw new Error(`${name} is unavailable in the export fixture: ${exclusionReason}`);

      const { operationId } = apiContract;
      const matches = operations.filter(({ id }) => id === operationId);
      if (matches.length !== 1) {
        throw new Error(`${name} must identify one pinned operation ${operationId}. Found ${matches.length}.`);
      }
      const [operation] = matches;
      const method = operation.method.toUpperCase();
      const path = operation.fullPath.replaceAll("{tenant}", config.tenantId);

      const result = await client.callTool({ name, arguments: {} });
      const captured = requests.splice(0);
      if (captured.length !== 1 || captured[0].method !== method || captured[0].path !== path) {
        const observed = captured.map(request => `${request.method} ${request.path}`).join(", ") || "none";
        throw new Error(`${name} (${operationId}): expected ${method} ${path}, captured ${observed}`);
      }
      if (result.isError) throw new Error(`${name} (${operationId}) returned an error for the export fixture`);
      verified += 1;
    }
  } finally {
    await client.close();
    await server.close();
  }
  return { verified, excluded };
}
