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
  getErrorMessage,
} from "../../utils.js";
const estimateItemPayloadSchema = z.object({
  skuAccount: z.string().optional().describe("SKU account code for the estimate item"),
  description: z.string().optional().describe("Description of the estimate item"),
  membershipTypeId: z
    .number()
    .int()
    .optional()
    .describe("Membership type ID associated with this item"),
  qty: z.number().optional().describe("Quantity for the estimate item"),
  unitRate: z.number().optional().describe("Unit sale rate for the estimate item"),
  unitCost: z.number().optional().describe("Unit cost for the estimate item"),
  itemGroupName: z.string().optional().describe("Item group display name"),
  itemGroupRootId: z
    .number()
    .int()
    .optional()
    .describe("Item group root ID for categorization"),
  chargeable: z.boolean().optional().describe("Whether this item is chargeable"),
});

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
  id: z.number().int().describe("Estimate ID"),
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
    description: "List estimate items with optional filters",
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_get_items",
    domain: "estimates",
    operation: "read",
    description: "List estimate items with optional filters",
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_items_update",
    domain: "estimates",
    operation: "write",
    description: "Add or replace an item collection on an estimate",
    schema: estimateItemUpdateSchema.shape,
    handler: async (params) => {
      const parsed = estimateItemUpdateSchema.parse(params);
      const { id, ...item } = parsed;

      try {
        const data = await client.put(
          `/tenant/{tenant}/estimates/${id}/items`,
          buildParams(item),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_put_item",
    domain: "estimates",
    operation: "write",
    description: "Add or replace an item collection on an estimate",
    schema: estimateItemUpdateSchema.shape,
    handler: async (params) => {
      const parsed = estimateItemUpdateSchema.parse(params);
      const { id, ...item } = parsed;

      try {
        const data = await client.put(
          `/tenant/{tenant}/estimates/${id}/items`,
          buildParams(item),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_delete_item",
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
        return toolError(getErrorMessage(error));
      }
    },
  });
}
