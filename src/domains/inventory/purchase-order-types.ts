import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
} from "../../utils.js";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const purchaseOrderTypePayloadSchema = z.object({
  name: z.string().optional().describe("Purchase order type name"),
  active: z.boolean().optional().describe("Whether the purchase order type is active"),
  color: z.string().optional().describe("Color code used for this purchase order type"),
  memo: z.string().optional().describe("Internal note for this purchase order type"),
  createdOn: z.string().optional().describe("Created timestamp for this purchase order type"),
  modifiedOn: z.string().optional().describe("Modified timestamp for this purchase order type"),
});

const purchaseOrderTypeIdSchema = z.object({
  id: z.number().int().describe("Purchase order type ID"),
});

const purchaseOrderTypeUpdateSchema = purchaseOrderTypePayloadSchema.extend({
  id: z.number().int().describe("Purchase order type ID"),
});

const purchaseOrderTypesListSchema = dateFilterParams(
  paginationParams(
    z
      .object({})
      .extend(activeFilterParam())
      .extend(sortParam(["Id", "ModifiedOn", "CreatedOn"])),
  ),
);

export function registerPurchaseOrderTypeTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
) {
  registry.register({
    name: "inventory_purchase_order_types_create",
    domain: "inventory",
    operation: "write",
    description: "Create a purchase order type",
    schema: purchaseOrderTypePayloadSchema.shape,
    handler: async (params) => {
      const parsed = purchaseOrderTypePayloadSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/purchase-order-types",
          buildParams(parsed),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_order_types_update",
    domain: "inventory",
    operation: "write",
    description: "Update a purchase order type",
    schema: purchaseOrderTypeUpdateSchema.shape,
    handler: async (params) => {
      const parsed = purchaseOrderTypeUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/purchase-order-types/${id}`,
          buildParams(payload),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_order_types_list",
    domain: "inventory",
    operation: "read",
    description: "List purchase order types",
    schema: purchaseOrderTypesListSchema.shape,
    handler: async (params) => {
      const parsed = purchaseOrderTypesListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/purchase-order-types",
          buildParams({
            active: parsed.active,
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
}
