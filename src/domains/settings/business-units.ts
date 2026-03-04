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

const businessUnitUpdateSchema = z.object({
  name: z.string().optional().describe("Business unit name"),
  description: z.string().optional().describe("Business unit description"),
  active: z.boolean().optional().describe("Whether the business unit is active"),
  externalData: z
    .array(
      z
        .object({
          key: z.string().describe("External data key"),
          value: z.string().describe("External data value"),
        })
        .describe("External data entry"),
    )
    .optional()
    .describe("External data entries"),
});

const businessUnitListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...activeFilterParam(),
      ids: z.string().optional().describe("Comma-separated IDs (max 50)"),
      name: z.string().optional().describe("Business unit name filter"),
      externalDataApplicationGuid: z
        .string()
        .uuid()
        .optional()
        .describe("External data application GUID"),
    }),
  ),
);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerBusinessUnitTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "settings_business_units_get",
    domain: "settings",
    operation: "read",
    description: "Get a business unit by ID",
    schema: {
      id: z.number().int().describe("Business unit ID"),
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
          `/tenant/{tenant}/business-units/${id}`,
          buildParams({ externalDataApplicationGuid }),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_business_units_list",
    domain: "settings",
    operation: "read",
    description: "List business units",
    schema: businessUnitListSchema.shape,
    handler: async (params) => {
      const query = buildParams(params as Record<string, unknown>);

      try {
        const data = await client.get(`/tenant/{tenant}/business-units`, query);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_business_units_update",
    domain: "settings",
    operation: "write",
    description: "Update a business unit",
    schema: {
      id: z.number().int().describe("Business unit ID"),
      body: businessUnitUpdateSchema.describe("Business unit update payload"),
    },
    handler: async (params) => {
      const { id, body } = params as {
        id: number;
        body: z.infer<typeof businessUnitUpdateSchema>;
      };

      try {
        const data = await client.patch(`/tenant/{tenant}/business-units/${id}`, buildParams(body));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
