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
  getErrorMessage,
} from "../../utils.js";
import { discountAndFeePayloadSchema } from "./schemas.js";

const discountAndFeeUpdateSchema = discountAndFeePayloadSchema
  .partial()
  .describe("Discount and fee update payload");

const discountAndFeeListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...sortParam([
        "Id",
        "Code",
        "DisplayName",
        "CreatedOn",
        "ModifiedOn",
        "Price",
        "MemberPrice",
        "AddOnPrice",
        "AddOnMemberPrice",
        "MaterialsCost",
        "PrimaryVendor",
        "Cost",
        "Manufacturer",
        "Priority",
      ]),
      ...activeFilterParam(),
      ids: z.string().optional().describe("Comma-separated IDs (max 50)"),
      externalDataApplicationGuid: z
        .string()
        .uuid()
        .optional()
        .describe("External data application GUID"),
      externalDataKey: z.string().optional().describe("External data key filter"),
      externalDataValues: z.string().optional().describe("External data values filter"),
    }),
  ),
);
export function registerDiscountAndFeeTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "pricebook_discounts_fees_get",
    domain: "pricebook",
    operation: "read",
    description: "Get a discount or fee by ID",
    schema: {
      id: z.number().int().describe("Discount/Fee ID"),
      externalDataApplicationGuid: z
        .string()
        .uuid()
        .optional()
        .describe("External data application GUID"),
    },
    handler: async (params) => {
      const { id, externalDataApplicationGuid } = params as {
        id: number;
        externalDataApplicationGuid?: string;
      };

      try {
        const data = await client.get(
          `/tenant/{tenant}/discounts-and-fees/${id}`,
          buildParams({ externalDataApplicationGuid }),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_discounts_fees_list",
    domain: "pricebook",
    operation: "read",
    description: "List discounts and fees",
    schema: discountAndFeeListSchema.shape,
    handler: async (params) => {
      const query = buildParams(params as Record<string, unknown>);

      try {
        const data = await client.get(`/tenant/{tenant}/discounts-and-fees`, query);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_discounts_fees_create",
    domain: "pricebook",
    operation: "write",
    description: "Create a discount or fee",
    schema: {
      body: discountAndFeePayloadSchema.describe("Discount and fee create payload"),
    },
    handler: async (params) => {
      const { body } = params as { body: z.infer<typeof discountAndFeePayloadSchema> };

      try {
        const data = await client.post(`/tenant/{tenant}/discounts-and-fees`, buildParams(body));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_discounts_fees_update",
    domain: "pricebook",
    operation: "write",
    description: "Update a discount or fee",
    schema: {
      id: z.number().int().describe("Discount/Fee ID"),
      body: discountAndFeeUpdateSchema,
    },
    handler: async (params) => {
      const { id, body } = params as {
        id: number;
        body: z.infer<typeof discountAndFeeUpdateSchema>;
      };

      try {
        const data = await client.patch(
          `/tenant/{tenant}/discounts-and-fees/${id}`,
          buildParams(body),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_discounts_fees_delete",
    domain: "pricebook",
    operation: "delete",
    description: "Delete a discount or fee",
    schema: {
      id: z.number().int().describe("Discount/Fee ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        await client.delete(`/tenant/{tenant}/discounts-and-fees/${id}`);
        return toolResult({ success: true, message: "Discount and fee deleted successfully." });
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
