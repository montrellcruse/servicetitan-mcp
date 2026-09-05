import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { officialRequestSchema } from "../../contracts/index.js";
import {
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
} from "../../utils.js";
const transferUpdateSchema = (officialRequestSchema("Transfers_Update") as z.AnyZodObject).extend({
  id: z.number().int().describe("Transfer ID"),
});

const transfersListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated transfer IDs (maximum 50)"),
        statuses: z.string().optional().describe("Comma-separated transfer statuses"),
        number: z.string().optional().describe("Transfer number filter"),
        referenceNumber: z.string().optional().describe("Reference number filter"),
        batchId: z.number().int().optional().describe("Batch ID filter"),
        transferTypeIds: z
          .string()
          .optional()
          .describe("Comma-separated transfer type IDs"),
        fromLocationIds: z
          .string()
          .optional()
          .describe("Comma-separated from-location IDs"),
        toLocationIds: z
          .string()
          .optional()
          .describe("Comma-separated to-location IDs"),
        syncStatuses: z.string().optional().describe("Comma-separated sync statuses"),
        customFieldsFields: z
          .record(z.string())
          .optional()
          .describe("Custom field name/value filters"),
        customFieldsOperator: z
          .enum(["And", "Or"])
          .optional()
          .describe("Operator for custom field filters"),
        dateOnOrAfter: z
          .string()
          .datetime()
          .optional()
          .describe("Transfer date on or after this UTC timestamp"),
        dateBefore: z
          .string()
          .datetime()
          .optional()
          .describe("Transfer date before this UTC timestamp"),
        externalDataApplicationGuid: z
          .string()
          .uuid()
          .optional()
          .describe("External data application GUID"),
        externalDataKey: z.string().optional().describe("External data key"),
        externalDataValues: z.string().optional().describe("External data values"),
      })
      .extend(sortParam(["Id", "ModifiedOn", "CreatedOn"])),
  ),
);

const updateCustomFieldsSchema = officialRequestSchema("Transfers_UpdateCustomFields") as z.AnyZodObject;

export function registerTransferTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "inventory_transfers_update_custom_fields",
    domain: "inventory",
    operation: "write",
    description: "Update transfer custom fields",
    schema: updateCustomFieldsSchema.shape,
    handler: async (params) => {
      const input = updateCustomFieldsSchema.parse(params);

      try {
        const data = await client.patch(
          "/tenant/{tenant}/transfers/custom-fields",
          input,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_transfers_update",
    domain: "inventory",
    operation: "write",
    description: "Update a transfer",
    schema: transferUpdateSchema.shape,
    handler: async (params) => {
      const parsed = transferUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/transfers/${id}`,
          payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_transfers_list",
    domain: "inventory",
    operation: "read",
    description: "List transfers",
    schema: transfersListSchema.shape,
    handler: async (params) => {
      const input = transfersListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/transfers",
          buildParams({
            ids: input.ids,
            statuses: input.statuses,
            number: input.number,
            referenceNumber: input.referenceNumber,
            batchId: input.batchId,
            transferTypeIds: input.transferTypeIds,
            fromLocationIds: input.fromLocationIds,
            toLocationIds: input.toLocationIds,
            syncStatuses: input.syncStatuses,
            "customFields.Fields": input.customFieldsFields,
            "customFields.Operator": input.customFieldsOperator,
            dateOnOrAfter: input.dateOnOrAfter,
            dateBefore: input.dateBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            createdBefore: input.createdBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            externalDataApplicationGuid: input.externalDataApplicationGuid,
            externalDataKey: input.externalDataKey,
            externalDataValues: input.externalDataValues,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            sort: input.sort,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
