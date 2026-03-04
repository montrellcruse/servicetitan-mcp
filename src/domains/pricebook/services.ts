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
import { serviceCreateInputSchema, serviceUpdateInputSchema } from "./schemas.js";

const servicesListSchema = dateFilterParams(
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerServiceTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "pricebook_services_get",
    domain: "pricebook",
    operation: "read",
    description: "Get a service by ID",
    schema: {
      id: z.number().int().describe("Service ID"),
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
          `/tenant/{tenant}/services/${id}`,
          buildParams({ externalDataApplicationGuid }),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_services_list",
    domain: "pricebook",
    operation: "read",
    description: "List service pricebook items",
    schema: servicesListSchema.shape,
    handler: async (params) => {
      const query = buildParams(params as Record<string, unknown>);

      try {
        const data = await client.get(`/tenant/{tenant}/services`, query);
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_services_create",
    domain: "pricebook",
    operation: "write",
    description: "Create a service pricebook item",
    schema: serviceCreateInputSchema.shape,
    handler: async (params) => {
      const body = params as z.infer<typeof serviceCreateInputSchema>;

      try {
        const data = await client.post(`/tenant/{tenant}/services`, {
          code: body.code,
          displayName: body.displayName,
          description: body.description,
          warranty:
            body.warrantyDuration !== undefined || body.warrantyDescription !== undefined
              ? {
                  duration: body.warrantyDuration,
                  description: body.warrantyDescription,
                }
              : undefined,
          categories: body.categoryIds?.map((id) => ({ id })),
          price: body.price,
          memberPrice: body.memberPrice,
          addOnPrice: body.addOnPrice,
          addOnMemberPrice: body.addOnMemberPrice,
          taxable: body.taxable,
          account: body.account,
          hours: body.hours,
          isLabor: body.isLabor,
          recommendations: body.recommendationIds,
          upgrades: body.upgradeIds,
          active: body.active,
          crossSaleGroup: body.crossSaleGroup,
          paysCommission: body.paysCommission,
          bonus: body.bonus,
          commissionBonus: body.commissionBonus,
          source: body.source,
          externalId: body.externalId,
          externalData: body.externalData,
          businessUnitId: body.businessUnitId,
          cost: body.cost,
          soldByCommission: body.soldByCommission,
        });
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_services_update",
    domain: "pricebook",
    operation: "write",
    description: "Update a service pricebook item",
    schema: {
      id: z.number().int().describe("Service ID"),
      body: serviceUpdateInputSchema,
    },
    handler: async (params) => {
      const { id, body } = params as {
        id: number;
        body: z.infer<typeof serviceUpdateInputSchema>;
      };

      try {
        const data = await client.patch(`/tenant/{tenant}/services/${id}`, {
          code: body.code,
          displayName: body.displayName,
          description: body.description,
          warranty:
            body.warrantyDuration !== undefined || body.warrantyDescription !== undefined
              ? {
                  duration: body.warrantyDuration,
                  description: body.warrantyDescription,
                }
              : undefined,
          categories: body.categoryIds?.map((categoryId) => ({ id: categoryId })),
          price: body.price,
          memberPrice: body.memberPrice,
          addOnPrice: body.addOnPrice,
          addOnMemberPrice: body.addOnMemberPrice,
          taxable: body.taxable,
          account: body.account,
          hours: body.hours,
          isLabor: body.isLabor,
          recommendations: body.recommendationIds,
          upgrades: body.upgradeIds,
          active: body.active,
          crossSaleGroup: body.crossSaleGroup,
          paysCommission: body.paysCommission,
          bonus: body.bonus,
          commissionBonus: body.commissionBonus,
          source: body.source,
          externalId: body.externalId,
          externalData: body.externalData,
          businessUnitId: body.businessUnitId,
          cost: body.cost,
          soldByCommission: body.soldByCommission,
        });
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "pricebook_services_delete",
    domain: "pricebook",
    operation: "delete",
    description: "Delete a service pricebook item",
    schema: {
      id: z.number().int().describe("Service ID"),
    },
    handler: async (params) => {
      const { id } = params as { id: number };

      try {
        await client.delete(`/tenant/{tenant}/services/${id}`);
        return toolResult({ success: true, message: "Service deleted successfully." });
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
