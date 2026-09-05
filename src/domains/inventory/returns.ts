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
const returnPayloadSchema = officialRequestSchema("Returns_CreateReturn") as z.AnyZodObject;

const returnIdSchema = z.object({
  id: z.number().int().describe("Return ID"),
});

const returnUpdateSchema = (officialRequestSchema("Returns_Update") as z.AnyZodObject).extend({
  id: z.number().int().describe("Return ID"),
});

const returnCancelSchema = (officialRequestSchema("Returns_Cancel") as z.AnyZodObject).extend({ id: z.number().int().describe("Return ID") });

const returnsListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated return IDs (maximum 50)"),
        number: z.string().optional().describe("Return number filter"),
        referenceNumber: z.string().optional().describe("Reference number filter"),
        jobId: z.number().int().optional().describe("Job ID filter"),
        purchaseOrderId: z.number().int().optional().describe("Purchase order ID filter"),
        batchId: z.number().int().optional().describe("Batch ID filter"),
        vendorIds: z.string().optional().describe("Comma-separated vendor IDs"),
        businessUnitIds: z
          .string()
          .optional()
          .describe("Comma-separated business unit IDs"),
        inventoryLocationIds: z
          .string()
          .optional()
          .describe("Comma-separated inventory location IDs"),
        syncStatuses: z.string().optional().describe("Comma-separated sync statuses"),
        customFieldsFields: z
          .record(z.string())
          .optional()
          .describe("Custom field name/value filters"),
        customFieldsOperator: z
          .enum(["And", "Or"])
          .optional()
          .describe("Operator for custom field filters"),
        returnDateOnOrAfter: z
          .string()
          .datetime()
          .optional()
          .describe("Return date on or after this UTC timestamp"),
        returnDateBefore: z
          .string()
          .datetime()
          .optional()
          .describe("Return date before this UTC timestamp"),
        externalDataApplicationGuid: z
          .string()
          .uuid()
          .optional()
          .describe("External data application GUID"),
        externalDataKey: z.string().optional().describe("External data key"),
        externalDataValues: z.string().optional().describe("External data values"),
      })
      .extend(activeFilterParam())
      .extend(sortParam(["Id", "ModifiedOn", "CreatedOn"])),
  ),
);

const updateCustomFieldsSchema = officialRequestSchema("Returns_UpdateCustomFields") as z.AnyZodObject;

const returnTypePayloadSchema = officialRequestSchema("ReturnTypes_Create") as z.AnyZodObject;
const returnTypeUpdateSchema = officialRequestSchema("ReturnTypes_Update") as z.AnyZodObject;

const returnTypesListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        activeOnly: z
          .boolean()
          .optional()
          .describe("When true, return only active return types"),
        name: z.string().optional().describe("Return type name filter"),
      })
      .extend(sortParam(["Id", "ModifiedOn", "CreatedOn"])),
  ),
);

export function registerReturnTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "inventory_returns_create",
    domain: "inventory",
    operation: "write",
    description: "Create a return",
    schema: returnPayloadSchema.shape,
    handler: async (params) => {
      const input = returnPayloadSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/returns", input);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_returns_update_custom_fields",
    domain: "inventory",
    operation: "write",
    description: "Update return custom fields",
    schema: updateCustomFieldsSchema.shape,
    handler: async (params) => {
      const input = updateCustomFieldsSchema.parse(params);

      try {
        const data = await client.patch(
          "/tenant/{tenant}/returns/custom-fields",
          input,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_returns_update",
    domain: "inventory",
    operation: "write",
    description: "Update a return",
    schema: returnUpdateSchema.shape,
    handler: async (params) => {
      const parsed = returnUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(`/tenant/{tenant}/returns/${id}`, payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_returns_cancel",
    domain: "inventory",
    operation: "write",
    description: "Cancel a return",
    schema: returnCancelSchema.shape,
    handler: async (params) => {
      const { id, ...payload } = returnCancelSchema.parse(params);

      try {
        const data = await client.patch(`/tenant/{tenant}/returns/${id}/cancellation`, payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_returns_list",
    domain: "inventory",
    operation: "read",
    description: "List returns",
    schema: returnsListSchema.shape,
    handler: async (params) => {
      const input = returnsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/returns",
          buildParams({
            ids: input.ids,
            active: input.active,
            number: input.number,
            referenceNumber: input.referenceNumber,
            jobId: input.jobId,
            purchaseOrderId: input.purchaseOrderId,
            batchId: input.batchId,
            vendorIds: input.vendorIds,
            businessUnitIds: input.businessUnitIds,
            inventoryLocationIds: input.inventoryLocationIds,
            syncStatuses: input.syncStatuses,
            "customFields.Fields": input.customFieldsFields,
            "customFields.Operator": input.customFieldsOperator,
            returnDateOnOrAfter: input.returnDateOnOrAfter,
            returnDateBefore: input.returnDateBefore,
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

  registry.register({
    name: "inventory_return_types_create",
    domain: "inventory",
    operation: "write",
    description: "Create a return type",
    schema: returnTypePayloadSchema.shape,
    handler: async (params) => {
      const input = returnTypePayloadSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/return-types", input);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_return_types_update",
    domain: "inventory",
    operation: "write",
    description: "Update a return type",
    schema: returnTypeUpdateSchema.shape,
    handler: async (params) => {
      const parsed = returnTypeUpdateSchema.parse(params);

      try {
        const data = await client.patch(
          `/tenant/{tenant}/return-types/${parsed.id}`,
          parsed,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_return_types_list",
    domain: "inventory",
    operation: "read",
    description: "List return types",
    schema: returnTypesListSchema.shape,
    handler: async (params) => {
      const input = returnTypesListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/return-types",
          buildParams({
            activeOnly: input.activeOnly,
            name: input.name,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
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
