import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
  getErrorMessage,
} from "../../utils.js";
const purchaseOrderMarkupPayloadSchema = z.object({
  from: z.number().optional().describe("Starting value for this markup range"),
  to: z.number().optional().describe("Ending value for this markup range"),
  percent: z.number().optional().describe("Markup percentage for this range"),
  createdOn: z.string().optional().describe("Created timestamp for this markup"),
  modifiedOn: z.string().optional().describe("Modified timestamp for this markup"),
});

const purchaseOrderMarkupIdSchema = z.object({
  id: z.number().int().describe("Purchase order markup ID"),
});

const purchaseOrderMarkupUpdateSchema = purchaseOrderMarkupPayloadSchema.extend({
  id: z.number().int().describe("Purchase order markup ID"),
});

const purchaseOrderMarkupsListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated purchase order markup IDs (maximum 50)"),
      })
      .extend(sortParam(["Id", "From", "To", "Percent"])),
  ),
);

export function registerPurchaseOrderMarkupTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
) {
  registry.register({
    name: "inventory_purchase_order_markups_create",
    domain: "inventory",
    operation: "write",
    description: "Create a purchase order markup",
    schema: purchaseOrderMarkupPayloadSchema.shape,
    handler: async (params) => {
      const parsed = purchaseOrderMarkupPayloadSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/purchase-order-markups",
          buildParams(parsed),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_order_markups_get",
    domain: "inventory",
    operation: "read",
    description: "Get a purchase order markup by ID",
    schema: purchaseOrderMarkupIdSchema.shape,
    handler: async (params) => {
      const { id } = purchaseOrderMarkupIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/purchase-order-markups/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_order_markups_list",
    domain: "inventory",
    operation: "read",
    description: "List purchase order markups",
    schema: purchaseOrderMarkupsListSchema.shape,
    handler: async (params) => {
      const parsed = purchaseOrderMarkupsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/purchase-order-markups",
          buildParams({
            ids: parsed.ids,
            createdBefore: parsed.createdBefore,
            createdOnOrAfter: parsed.createdOnOrAfter,
            modifiedBefore: parsed.modifiedBefore,
            modifiedOnOrAfter: parsed.modifiedOnOrAfter,
            page: parsed.page,
            pageSize: parsed.pageSize,
            includeTotal: parsed.includeTotal,
            sort: parsed.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_order_markups_update",
    domain: "inventory",
    operation: "write",
    description: "Update a purchase order markup",
    schema: purchaseOrderMarkupUpdateSchema.shape,
    handler: async (params) => {
      const parsed = purchaseOrderMarkupUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/purchase-order-markups/${id}`,
          buildParams(payload),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_order_markups_delete",
    domain: "inventory",
    operation: "delete",
    description: "Delete a purchase order markup",
    schema: purchaseOrderMarkupIdSchema.shape,
    handler: async (params) => {
      const { id } = purchaseOrderMarkupIdSchema.parse(params);

      try {
        await client.delete(`/tenant/{tenant}/purchase-order-markups/${id}`);
        return toolResult({ success: true, message: "Purchase order markup deleted" });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
