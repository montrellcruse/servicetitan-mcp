import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, toolError, toolResult } from "../../utils.js";
import { pricebookBulkPayloadSchema } from "./schemas.js";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

  registry.register({
    name: "pricebook_images_get",
    domain: "pricebook",
    operation: "read",
    description: "Get pricebook images by storage path",
    schema: {
      path: z.string().optional().describe("Storage path of the image"),
    },
    handler: async (params) => {
      const { path } = params as { path?: string };

      try {
        const data = await client.get(`/tenant/{tenant}/images`, buildParams({ path }));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_images_create",
    domain: "pricebook",
    operation: "write",
    description: "Create a new pricebook image placeholder",
    schema: {
      body: z
        .object({
          alias: z.string().optional().describe("Image alias"),
          fileName: z.string().optional().describe("Image file name"),
          url: z.string().optional().describe("Public image URL"),
        })
        .optional()
        .describe("Optional image payload"),
    },
    handler: async (params) => {
      const { body } = params as {
        body?: {
          alias?: string;
          fileName?: string;
          url?: string;
        };
      };

      try {
        const data = await client.post(`/tenant/{tenant}/images`, body ? buildParams(body) : undefined);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
