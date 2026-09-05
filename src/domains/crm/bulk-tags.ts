import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { officialRequestSchema } from "../../contracts/index.js";
import { toolError, toolResult } from "../../utils.js";
const bulkTagsAddSchema = officialRequestSchema("BulkTags_AddTags") as z.ZodObject<z.ZodRawShape>;


export function registerBulkTagTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "crm_bulk_tags_add_tags",
    domain: "crm",
    operation: "write",
    description: "Add bulk tags",
    schema: bulkTagsAddSchema.shape,
    handler: async (params) => {
      const input = bulkTagsAddSchema.parse(params);

      try {
        const data = await client.put("/tenant/{tenant}/tags", input);

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_bulk_tags_remove_tags",
    domain: "crm",
    operation: "delete",
    description: "Remove bulk tags",
    schema: {},
    handler: async () => {
      try {
        const data = await client.delete("/tenant/{tenant}/tags");
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
