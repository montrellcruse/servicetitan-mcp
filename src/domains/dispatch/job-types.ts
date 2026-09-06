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

const externalDataEntrySchema = z.object({
  key: z.string().describe("External data key"),
  value: z.string().describe("External data value"),
});

const jobTypePayloadSchema = z.object({
  name: z.string().optional().describe("Job type name"),
  businessUnitIds: z
    .array(z.number().int())
    .optional()
    .describe("Business unit IDs associated to this job type"),
  skills: z.array(z.string()).optional().describe("Skill labels associated to this job type"),
  tagTypeIds: z.array(z.number().int()).optional().describe("Tag type IDs"),
  priority: z.string().optional().describe("Default priority"),
  duration: z.number().optional().describe("Default duration in seconds"),
  soldThreshold: z.number().optional().describe("Sold threshold value"),
  class: z.string().optional().describe("Job class"),
  summary: z.string().optional().describe("Job type summary"),
  defaultEstimateSoldAction: z
    .string()
    .optional()
    .describe("Default action when an estimate is sold for this job type"),
  customFieldTypeIds: z
    .array(z.number().int())
    .optional()
    .describe("Custom field type IDs assigned to this job type"),
  noCharge: z.boolean().optional().describe("Whether this job type is no-charge"),
  enforceRecurringServiceEventSelection: z
    .boolean()
    .optional()
    .describe("Require recurring service event selection"),
  invoiceSignaturesRequired: z
    .boolean()
    .optional()
    .describe("Whether signatures are required for invoices"),
  externalData: z.array(externalDataEntrySchema).optional().describe("External data entries"),
  active: z.boolean().optional().describe("Whether this job type is active"),
});

const jobTypeCreateSchema = jobTypePayloadSchema.extend({
  name: z.string().describe("Job type name"),
});

const jobTypeIdSchema = z.object({
  id: z.number().int().describe("Job type ID"),
});

const jobTypeGetSchema = jobTypeIdSchema.extend({
  externalDataApplicationGuid: z
    .string()
    .uuid()
    .optional()
    .describe("External data application GUID"),
});

const jobTypeUpdateSchema = jobTypeIdSchema.extend({
  ...jobTypePayloadSchema.shape,
  customFieldsUpdateMode: z
    .enum(["Replace", "Merge"])
    .optional()
    .describe("How to apply customFieldTypeIds. Replace is the ST default and removes assignments not included in customFieldTypeIds; Merge preserves existing assignments and adds new ones."),
});

function withDescribedDateFilters<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return dateFilterParams(schema).extend({
    createdBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return items created before this UTC timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return items created on or after this UTC timestamp"),
    modifiedBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return items modified before this UTC timestamp"),
    modifiedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return items modified on or after this UTC timestamp"),
  });
}

const jobTypesListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
      name: z.string().optional().describe("Filter by job type name"),
      minDuration: z.number().int().optional().describe("Minimum duration in seconds"),
      maxDuration: z.number().int().optional().describe("Maximum duration in seconds"),
      priority: z.string().optional().describe("Priority filter"),
      ids: z.string().optional().describe("Comma-separated job type IDs (maximum 50)"),
      orderBy: z.string().optional().describe("Order by field"),
      orderByDirection: z
        .string()
        .optional()
        .describe("Order direction (asc/descending)") ,
      externalDataApplicationGuid: z
        .string()
        .uuid()
        .optional()
        .describe("External data application GUID"),
    }),
  ),
);
export function registerDispatchJobTypeTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "dispatch_job_types_get",
    domain: "dispatch",
    operation: "read",
    description: "Retrieve one job-type definition by ID, optionally scoped to an external-data application. Returns the configured defaults and associations for that type; use dispatch_job_types_list to search the catalog.",
    schema: jobTypeGetSchema.shape,
    handler: async (params) => {
      const input = jobTypeGetSchema.parse(params);

      try {
        const data = await client.get(
          `/tenant/{tenant}/job-types/${input.id}`,
          buildParams({
            externalDataApplicationGuid: input.externalDataApplicationGuid,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "dispatch_job_types_list",
    domain: "dispatch",
    operation: "read",
    description: "Search job-type definitions by IDs, name, priority, duration, active state, external-data application, or date ranges. Returns one page of configured job types; use dispatch_job_types_get for a known ID.",
    schema: jobTypesListSchema.shape,
    handler: async (params) => {
      const input = jobTypesListSchema.parse(params);

      try {
        const data = await client.get("/tenant/{tenant}/job-types", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "dispatch_job_types_create",
    domain: "dispatch",
    operation: "write",
    description: "Create a job type",
    schema: jobTypeCreateSchema.shape,
    handler: async (params) => {
      const input = jobTypeCreateSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/job-types", buildParams(input));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "dispatch_job_types_update",
    domain: "dispatch",
    operation: "write",
    description: "Update a job type. Warning: customFieldTypeIds uses ST replace semantics unless customFieldsUpdateMode is Merge.",
    schema: jobTypeUpdateSchema.shape,
    handler: async (params) => {
      const input = jobTypeUpdateSchema.parse(params);
      const { id, ...body } = input;

      try {
        const payload = buildParams(body);
        const data = await client.patch(
          `/tenant/{tenant}/job-types/${id}`,
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "dispatch_job_types_delete",
    domain: "dispatch",
    operation: "delete",
    description: "Delete a job type",
    schema: jobTypeIdSchema.shape,
    handler: async (params) => {
      const input = jobTypeIdSchema.parse(params);

      try {
        const data = await client.delete(`/tenant/{tenant}/job-types/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
