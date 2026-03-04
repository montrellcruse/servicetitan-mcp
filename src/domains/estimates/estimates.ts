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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const estimateItemSchema = z.object({
  skuAccount: z.string().optional().describe("SKU account code for the estimate item"),
  description: z.string().optional().describe("Description of the estimate item"),
  membershipTypeId: z
    .number()
    .int()
    .optional()
    .describe("Membership type ID associated with this item"),
  qty: z.number().optional().describe("Quantity for this estimate item"),
  unitRate: z.number().optional().describe("Unit sale rate for this estimate item"),
  unitCost: z.number().optional().describe("Unit cost for this estimate item"),
  itemGroupName: z.string().optional().describe("Item group display name"),
  itemGroupRootId: z
    .number()
    .int()
    .optional()
    .describe("Item group root ID for categorization"),
  chargeable: z.boolean().optional().describe("Whether this estimate item is chargeable"),
});

const externalLinkSchema = z.object({
  name: z.string().optional().describe("External link label"),
  url: z.string().optional().describe("External link URL"),
});

const estimateInputSchema = z.object({
  jobId: z.number().int().optional().describe("Job ID associated with the estimate"),
  projectId: z
    .number()
    .int()
    .optional()
    .describe("Project ID associated with the estimate"),
  locationId: z
    .number()
    .int()
    .optional()
    .describe("Location ID associated with the estimate"),
  customerId: z
    .number()
    .int()
    .optional()
    .describe("Customer ID associated with the estimate"),
  name: z.string().optional().describe("Human-readable estimate name"),
  jobNumber: z.string().optional().describe("Job number for estimate matching"),
  statusValue: z
    .number()
    .int()
    .optional()
    .describe("Estimate status numeric value"),
  summary: z.string().optional().describe("Short summary of the estimate"),
  soldOn: z.string().optional().describe("Date/time when the estimate was sold"),
  soldBy: z.number().int().optional().describe("User ID who sold the estimate"),
  active: z.boolean().optional().describe("Whether the estimate is active"),
  items: z
    .array(estimateItemSchema)
    .optional()
    .describe("Estimate line items to include"),
  externalLinks: z
    .array(externalLinkSchema)
    .optional()
    .describe("External links attached to the estimate"),
  subtotal: z.number().optional().describe("Subtotal amount before taxes"),
  tax: z.number().optional().describe("Tax amount for the estimate"),
  businessUnitId: z
    .number()
    .int()
    .optional()
    .describe("Business unit ID that owns the estimate"),
});

const estimateGetSchema = z.object({
  id: z.number().int().describe("Estimate ID"),
});

const estimateListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        jobId: z.number().int().optional().describe("Filter by job ID"),
        projectId: z.number().int().optional().describe("Filter by project ID"),
        jobNumber: z.string().optional().describe("Filter by job number"),
        totalGreater: z
          .number()
          .optional()
          .describe("Filter estimates with totals greater than this amount"),
        totalLess: z
          .number()
          .optional()
          .describe("Filter estimates with totals less than this amount"),
        soldById: z
          .number()
          .int()
          .optional()
          .describe("Filter by seller user ID"),
        soldByEmployeeId: z
          .number()
          .int()
          .optional()
          .describe("Filter by seller employee ID"),
        ids: z
          .string()
          .optional()
          .describe("Comma-separated estimate IDs (maximum 50)"),
        soldAfter: z
          .string()
          .datetime()
          .optional()
          .describe("Return estimates sold on or after this date/time (UTC)"),
        soldBefore: z
          .string()
          .datetime()
          .optional()
          .describe("Return estimates sold before this date/time (UTC)"),
        status: z.string().optional().describe("Filter by estimate status"),
        orderBy: z
          .string()
          .optional()
          .describe("Legacy order by field accepted by ServiceTitan API"),
        orderByDirection: z
          .string()
          .optional()
          .describe("Legacy order direction accepted by ServiceTitan API"),
        locationId: z
          .number()
          .int()
          .optional()
          .describe("Filter by location ID"),
      })
      .extend(activeFilterParam())
      .extend(sortParam(["Id", "CreatedOn", "ModifiedOn", "SoldOn", "Total"])),
  ),
);

const estimateCreateSchema = estimateInputSchema;

const estimateUpdateSchema = estimateInputSchema.extend({
  id: z.number().int().describe("Estimate ID"),
});

const estimateActionSchema = z.object({
  id: z.number().int().describe("Estimate ID"),
});

export function registerEstimateTools(client: ServiceTitanClient, registry: ToolRegistry) {
  registry.register({
    name: "estimates_get",
    domain: "estimates",
    operation: "read",
    description: "Get a single estimate by ID",
    schema: estimateGetSchema.shape,
    handler: async (params) => {
      const { id } = estimateGetSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/estimates/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_list",
    domain: "estimates",
    operation: "read",
    description: "List estimates with filters",
    schema: estimateListSchema.shape,
    handler: async (params) => {
      const parsed = estimateListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/estimates",
          buildParams({
            jobId: parsed.jobId,
            projectId: parsed.projectId,
            jobNumber: parsed.jobNumber,
            totalGreater: parsed.totalGreater,
            totalLess: parsed.totalLess,
            soldById: parsed.soldById,
            soldByEmployeeId: parsed.soldByEmployeeId,
            ids: parsed.ids,
            page: parsed.page,
            pageSize: parsed.pageSize,
            includeTotal: parsed.includeTotal,
            soldAfter: parsed.soldAfter,
            soldBefore: parsed.soldBefore,
            status: parsed.status,
            active: parsed.active,
            orderBy: parsed.orderBy,
            orderByDirection: parsed.orderByDirection,
            createdBefore: parsed.createdBefore,
            createdOnOrAfter: parsed.createdOnOrAfter,
            modifiedBefore: parsed.modifiedBefore,
            modifiedOnOrAfter: parsed.modifiedOnOrAfter,
            locationId: parsed.locationId,
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
    name: "estimates_create",
    domain: "estimates",
    operation: "write",
    description: "Create a new estimate",
    schema: estimateCreateSchema.shape,
    handler: async (params) => {
      const parsed = estimateCreateSchema.parse(params);
      const { statusValue, ...rest } = parsed;

      try {
        const payload = buildParams({
          ...rest,
          status: statusValue === undefined ? undefined : { value: statusValue },
        });

        const data = await client.post("/tenant/{tenant}/estimates", payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_update",
    domain: "estimates",
    operation: "write",
    description: "Update an existing estimate",
    schema: estimateUpdateSchema.shape,
    handler: async (params) => {
      const parsed = estimateUpdateSchema.parse(params);
      const { id, statusValue, ...rest } = parsed;

      try {
        const payload = buildParams({
          ...rest,
          status: statusValue === undefined ? undefined : { value: statusValue },
        });

        const data = await client.put(`/tenant/{tenant}/estimates/${id}`, payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_sell",
    domain: "estimates",
    operation: "write",
    description: "Mark an estimate as sold",
    schema: estimateActionSchema.shape,
    handler: async (params) => {
      const { id } = estimateActionSchema.parse(params);

      try {
        const data = await client.put(`/tenant/{tenant}/estimates/${id}/sell`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_unsell",
    domain: "estimates",
    operation: "write",
    description: "Revert an estimate from sold status",
    schema: estimateActionSchema.shape,
    handler: async (params) => {
      const { id } = estimateActionSchema.parse(params);

      try {
        const data = await client.put(`/tenant/{tenant}/estimates/${id}/unsell`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "estimates_dismiss",
    domain: "estimates",
    operation: "write",
    description: "Dismiss an estimate",
    schema: estimateActionSchema.shape,
    handler: async (params) => {
      const { id } = estimateActionSchema.parse(params);

      try {
        const data = await client.put(`/tenant/{tenant}/estimates/${id}/dismiss`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
