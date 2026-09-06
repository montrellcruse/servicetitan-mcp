import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  toolError,
  toolResult,
} from "../../utils.js";
import {
  estimateItemRequestSchema,
  normalizeEstimateItemRequest,
} from "./item-request.js";

const estimateItemPayloadSchema = estimateItemRequestSchema.omit({ id: true });

const estimateItemsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      estimateId: z.number().int().optional().describe("Filter by estimate ID"),
      ids: z
        .string()
        .optional()
        .describe("Comma-separated estimate item IDs (maximum 50)"),
    }).extend(activeFilterParam()),
  ),
);

const estimateItemUpdateSchema = estimateItemPayloadSchema.extend({
  estimateId: z.number().int().optional().describe("Estimate ID"),
  id: z
    .number()
    .int()
    .optional()
    .describe("Legacy estimate ID alias. Prefer estimateId."),
  itemId: z
    .number()
    .int()
    .optional()
    .describe("Existing estimate item ID to update; omit to add a new line item"),
});

const estimateItemDeleteSchema = z.object({
  id: z.number().int().describe("Estimate ID"),
  itemId: z.number().int().describe("Estimate item ID"),
});

export function registerEstimateItemTools(client: ServiceTitanClient, registry: ToolRegistry) {
  registry.register({
    name: "estimates_items_list",
    domain: "estimates",
    operation: "read",
    description: "Search one requested page of estimate line items by estimate ID, item IDs, active state, or creation and modification dates. Each result represents an item attached to an estimate, rather than an estimate header returned by estimates_list.",
    schema: estimateItemsListSchema.shape,
    handler: async (params) => {
      const parsed = estimateItemsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/estimates/items",
          buildParams({
            estimateId: parsed.estimateId,
            ids: parsed.ids,
            active: parsed.active,
            createdBefore: parsed.createdBefore,
            createdOnOrAfter: parsed.createdOnOrAfter,
            modifiedBefore: parsed.modifiedBefore,
            modifiedOnOrAfter: parsed.modifiedOnOrAfter,
            page: parsed.page,
            pageSize: parsed.pageSize,
            includeTotal: parsed.includeTotal,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "estimates_items_update",
    domain: "estimates",
    operation: "write",
    description: "Add a new SKU line or update an existing item on an estimate",
    schema: estimateItemUpdateSchema.shape,
    handler: async (params) => {
      const parsed = estimateItemUpdateSchema.parse(params);
      const { estimateId, id, itemId, ...item } = parsed;
      const resolvedEstimateId = estimateId ?? id;

      if (resolvedEstimateId === undefined) {
        return toolError("estimateId is required");
      }

      try {
        const data = await client.put(
          `/tenant/{tenant}/estimates/${resolvedEstimateId}/items`,
          normalizeEstimateItemRequest({
            id: itemId,
            ...item,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "estimates_items_delete",
    domain: "estimates",
    operation: "delete",
    description: "Delete a single item from an estimate",
    schema: estimateItemDeleteSchema.shape,
    handler: async (params) => {
      const { id, itemId } = estimateItemDeleteSchema.parse(params);

      try {
        await client.delete(`/tenant/{tenant}/estimates/${id}/items/${itemId}`);
        return toolResult({ success: true, message: "Estimate item deleted" });
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
