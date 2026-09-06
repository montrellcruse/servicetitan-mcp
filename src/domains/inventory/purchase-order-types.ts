import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { officialRequestSchema } from "../../contracts/index.js";
import {
  activeFilterParam,
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
} from "../../utils.js";
const purchaseOrderTypePayloadSchema = officialRequestSchema("PurchaseOrderTypes_Create") as z.AnyZodObject;

const purchaseOrderTypeIdSchema = z.object({
  id: z.number().int().describe("Purchase order type ID"),
});

const purchaseOrderTypeUpdateSchema = (officialRequestSchema("PurchaseOrderTypes_Update") as z.AnyZodObject).extend({
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
          parsed,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
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
          payload,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_purchase_order_types_list",
    domain: "inventory",
    operation: "read",
    description: "List one requested page of purchase-order type definitions, with active-state and created or modified timestamp filters. Use this catalog to interpret order classifications; use inventory_purchase_orders_list for issued purchase-order records.",
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
        return toolError(error);
      }
    },
  });
}
