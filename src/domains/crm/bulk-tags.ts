import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { toolError, toolResult } from "../../utils.js";

const bulkTagsAddSchema = z.object({
  tags: z.array(z.string()).describe("Tags to add"),
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerBulkTagTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "crm_bulk_tags_add_tags",
    domain: "crm",
    operation: "write",
    description: "Add bulk tags",
    schema: bulkTagsAddSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bulkTagsAddSchema>;

      try {
        const data = await client.put("/tenant/{tenant}/tags", {
          tags: input.tags,
        });

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
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
        return toolError(errorMessage(error));
      }
    },
  });
}
