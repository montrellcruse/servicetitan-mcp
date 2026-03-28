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
import { equipmentPayloadSchema } from "./schemas.js";

const equipmentListSchema = dateFilterParams(
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
export function registerEquipmentTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "pricebook_equipment_list",
    domain: "pricebook",
    operation: "read",
    description: "List equipment pricebook items",
    schema: equipmentListSchema.shape,
    handler: async (params) => {
      const query = buildParams(params as Record<string, unknown>);

      try {
        const data = await client.get(`/tenant/{tenant}/equipment`, query);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_equipment_get",
    domain: "pricebook",
    operation: "read",
    description: "Get equipment item by ID",
    schema: {
      id: z.number().int().describe("Equipment ID"),
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
          `/tenant/{tenant}/equipment/${id}`,
          buildParams({ externalDataApplicationGuid }),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_equipment_update",
    domain: "pricebook",
    operation: "write",
    description: "Update equipment item",
    schema: {
      id: z.number().int().describe("Equipment ID"),
      body: equipmentPayloadSchema.partial().describe("Equipment update payload"),
    },
    handler: async (params) => {
      const { id, body } = params as {
        id: number;
        body: z.infer<typeof equipmentPayloadSchema>;
      };

      try {
        const data = await client.patch(`/tenant/{tenant}/equipment/${id}`, buildParams(body));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_equipment_delete",
    domain: "pricebook",
    operation: "delete",
    description: "Delete equipment item",
    schema: {
      id: z.number().int().describe("Equipment ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        await client.delete(`/tenant/{tenant}/equipment/${id}`);
        return toolResult({ success: true, message: "Equipment deleted successfully." });
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
