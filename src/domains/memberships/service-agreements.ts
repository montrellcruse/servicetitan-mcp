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
} from "../../utils.js";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const serviceAgreementStatusEnum = z.enum([
  "Draft",
  "Sent",
  "Rejected",
  "Accepted",
  "Activated",
  "Canceled",
  "Expired",
  "AutoRenew",
]);

const serviceAgreementIdSchema = z.object({
  id: z.number().int().describe("Service agreement ID"),
});

const serviceAgreementListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated service agreement IDs (maximum 50)"),
        customerIds: z.string().optional().describe("Comma-separated customer IDs"),
        businessUnitIds: z
          .string()
          .optional()
          .describe("Comma-separated business unit IDs"),
        status: serviceAgreementStatusEnum
          .optional()
          .describe("Filter by service agreement status"),
      })
      .extend(sortParam(["Id", "Name", "CreatedOn", "ModifiedOn", "StartDate", "EndDate"])),
  ),
);

export function registerServiceAgreementTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
) {
  registry.register({
    name: "memberships_service_agreements_list",
    domain: "memberships",
    operation: "read",
    description: "List service agreements",
    schema: serviceAgreementListSchema.shape,
    handler: async (params) => {
      const parsed = serviceAgreementListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/service-agreements",
          buildParams({
            ids: parsed.ids,
            customerIds: parsed.customerIds,
            businessUnitIds: parsed.businessUnitIds,
            status: parsed.status,
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
    name: "memberships_service_agreements_get",
    domain: "memberships",
    operation: "read",
    description: "Get a service agreement by ID",
    schema: serviceAgreementIdSchema.shape,
    handler: async (params) => {
      const { id } = serviceAgreementIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/service-agreements/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
