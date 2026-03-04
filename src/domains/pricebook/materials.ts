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
import { materialCreateInputSchema, materialUpdateInputSchema } from "./schemas.js";

const materialsListSchema = dateFilterParams(
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
      isOtherDirectCost: z
        .boolean()
        .optional()
        .describe("Filter by other direct cost materials"),
      costTypeIds: z.string().optional().describe("Comma-separated cost type IDs"),
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

const materialsMarkupListSchema = paginationParams(
  z.object({
    sort: z
      .string()
      .optional()
      .describe("Sort expression for markups (+Field or -Field)"),
  }),
);

const materialsMarkupCreateSchema = z.object({
  from: z.number().describe("Start value for the markup range"),
  to: z.number().describe("End value for the markup range"),
  percent: z.number().describe("Markup percentage"),
});

const materialsMarkupUpdateSchema = z.object({
  from: z.number().optional().describe("Start value for the markup range"),
  to: z.number().optional().describe("End value for the markup range"),
  percent: z.number().optional().describe("Markup percentage"),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerMaterialTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "pricebook_materials_create",
    domain: "pricebook",
    operation: "write",
    description: "Create a material pricebook item",
    schema: {
      body: materialCreateInputSchema.describe("Material create payload"),
    },
    handler: async (params) => {
      const { body } = params as { body: z.infer<typeof materialCreateInputSchema> };

      try {
        const data = await client.post(`/tenant/{tenant}/materials`, buildParams(body));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_materials_get",
    domain: "pricebook",
    operation: "read",
    description: "Get a material by ID",
    schema: {
      id: z.number().int().describe("Material ID"),
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
          `/tenant/{tenant}/materials/${id}`,
          buildParams({ externalDataApplicationGuid }),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_materials_list",
    domain: "pricebook",
    operation: "read",
    description: "List material pricebook items",
    schema: materialsListSchema.shape,
    handler: async (params) => {
      const query = buildParams(params as Record<string, unknown>);

      try {
        const data = await client.get(`/tenant/{tenant}/materials`, query);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_materials_delete",
    domain: "pricebook",
    operation: "delete",
    description: "Delete a material by ID",
    schema: {
      id: z.number().int().describe("Material ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        await client.delete(`/tenant/{tenant}/materials/${id}`);
        return toolResult({ success: true, message: "Material deleted successfully." });
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_materials_cost_types_list",
    domain: "pricebook",
    operation: "read",
    description: "List material cost types",
    schema: {},
    handler: async () => {
      try {
        const data = await client.get(`/tenant/{tenant}/materials/costtypes`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_materials_markup_list",
    domain: "pricebook",
    operation: "read",
    description: "List material markup ranges",
    schema: materialsMarkupListSchema.shape,
    handler: async (params) => {
      const query = buildParams(params as Record<string, unknown>);

      try {
        const data = await client.get(`/tenant/{tenant}/materialsmarkup`, query);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_materials_markup_create",
    domain: "pricebook",
    operation: "write",
    description: "Create a material markup range",
    schema: {
      body: materialsMarkupCreateSchema.describe("Material markup create payload"),
    },
    handler: async (params) => {
      const { body } = params as { body: z.infer<typeof materialsMarkupCreateSchema> };

      try {
        const data = await client.post(`/tenant/{tenant}/materialsmarkup`, buildParams(body));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_materials_markup_get",
    domain: "pricebook",
    operation: "read",
    description: "Get a material markup range by ID",
    schema: {
      id: z.number().int().describe("Material markup ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        const data = await client.get(`/tenant/{tenant}/materialsmarkup/${id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_materials_markup_update",
    domain: "pricebook",
    operation: "write",
    description: "Update a material markup range",
    schema: {
      id: z.number().int().describe("Material markup ID"),
      body: materialsMarkupUpdateSchema.describe("Material markup update payload"),
    },
    handler: async (params) => {
      const { id, body } = params as {
        id: number;
        body: z.infer<typeof materialsMarkupUpdateSchema>;
      };

      try {
        const data = await client.put(`/tenant/{tenant}/materialsmarkup/${id}`, buildParams(body));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_materials_update",
    domain: "pricebook",
    operation: "write",
    description: "Update a material pricebook item",
    schema: {
      id: z.number().int().describe("Material ID"),
      body: materialUpdateInputSchema.describe("Material update payload"),
    },
    handler: async (params) => {
      const { id, body } = params as {
        id: number;
        body: z.infer<typeof materialUpdateInputSchema>;
      };

      try {
        const data = await client.patch(`/tenant/{tenant}/materials/${id}`, buildParams(body));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
