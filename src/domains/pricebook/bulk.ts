import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, toolError, toolResult, getErrorMessage } from "../../utils.js";
import { pricebookBulkPayloadSchema } from "./schemas.js";
export function registerBulkTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "pricebook_bulk_create",
    domain: "pricebook",
    operation: "write",
    description: "Create or import bulk pricebook operations",
    schema: {
      body: pricebookBulkPayloadSchema.describe("Bulk create payload"),
    },
    handler: async (params) => {
      const { body } = params as { body: z.infer<typeof pricebookBulkPayloadSchema> };

      try {
        const data = await client.post(`/tenant/{tenant}/pricebook`, body);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_bulk_update",
    domain: "pricebook",
    operation: "write",
    description: "Update pricebook records in bulk",
    schema: {
      body: pricebookBulkPayloadSchema.optional().describe("Bulk update payload"),
    },
    handler: async (params) => {
      const { body } = params as { body?: z.infer<typeof pricebookBulkPayloadSchema> };

      try {
        const data = await client.patch(`/tenant/{tenant}/pricebook`, body);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

}
