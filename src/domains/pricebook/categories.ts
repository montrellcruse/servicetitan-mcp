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
import { categoryPayloadSchema } from "./schemas.js";

const categoryListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...sortParam(["Id", "Name"]),
      ...activeFilterParam(),
      categoryType: z
        .enum(["Services", "Materials"])
        .optional()
        .describe("Category type filter"),
    }),
  ),
);

const categoryUpdateSchema = categoryPayloadSchema.partial().describe("Category update payload");
export function registerCategoryTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "pricebook_categories_create",
    domain: "pricebook",
    operation: "write",
    description: "Create a pricebook category",
    schema: {
      body: categoryPayloadSchema.describe("Category create payload"),
    },
    handler: async (params) => {
      const { body } = params as { body: z.infer<typeof categoryPayloadSchema> };

      try {
        const data = await client.post(`/tenant/{tenant}/categories`, buildParams(body));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "pricebook_categories_get",
    domain: "pricebook",
    operation: "read",
    description: "Retrieve a pricebook category by its ServiceTitan ID. Returns the single upstream record without pagination; use pricebook_categories_list to search when the ID is unknown.",
    schema: {
      id: z.number().int().describe("Category ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/categories/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "pricebook_categories_list",
    domain: "pricebook",
    operation: "read",
    description: "List one requested page of pricebook categories using category type, active state, and created or modified timestamps. Use pricebook_categories_get for one known category ID; use the service, material, or equipment list tool for sellable items.",
    schema: categoryListSchema.shape,
    handler: async (params) => {
      const query = buildParams(params as Record<string, unknown>);

      try {
        const data = await client.get(`/tenant/{tenant}/categories`, query);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "pricebook_categories_update",
    domain: "pricebook",
    operation: "write",
    description: "Update a pricebook category",
    schema: {
      id: z.number().int().describe("Category ID"),
      body: categoryUpdateSchema,
    },
    handler: async (params) => {
      const { id, body } = params as {
        id: number;
        body: z.infer<typeof categoryUpdateSchema>;
      };

      try {
        const data = await client.patch(`/tenant/{tenant}/categories/${id}`, buildParams(body));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "pricebook_categories_delete",
    domain: "pricebook",
    operation: "delete",
    description: "Delete a pricebook category",
    schema: {
      id: z.number().int().describe("Category ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        await client.delete(`/tenant/{tenant}/categories/${id}`);
        return toolResult({ success: true, message: "Category deleted successfully." });
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
