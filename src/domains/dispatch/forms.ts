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

function withDescribedDateFilters<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return dateFilterParams(schema).extend({
    createdBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return forms created before this UTC timestamp"),
    createdOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return forms created on or after this UTC timestamp"),
    modifiedBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return forms modified before this UTC timestamp"),
    modifiedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return forms modified on or after this UTC timestamp"),
  });
}
const formListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "CreatedOn", "ModifiedOn", "Name"]),
      hasConditionalLogic: z
        .boolean()
        .optional()
        .describe("Filter forms by conditional logic usage"),
      hasTriggers: z.boolean().optional().describe("Filter forms by trigger usage"),
      name: z.string().optional().describe("Filter by form name"),
      status: z
        .enum(["Any", "Published", "Unpublished"])
        .optional()
        .describe("Filter by form publication status"),
      ids: z.string().optional().describe("Comma-separated form IDs (maximum 50)"),
    }),
  ),
);

const submissionListSchema = paginationParams(
  z.object({
    ...activeFilterParam(),
    ...sortParam(["Id", "SubmittedOn", "CreatedBy"]),
    formIds: z.string().optional().describe("Comma-separated form IDs"),
    createdById: z.number().int().optional().describe("Creator user ID"),
    status: z
      .enum(["Started", "Completed", "Any"])
      .optional()
      .describe("Submission status filter"),
    submittedOnOrAfter: z
      .string()
      .datetime()
      .optional()
      .describe("Return submissions submitted on or after this UTC timestamp"),
    submittedBefore: z
      .string()
      .datetime()
      .optional()
      .describe("Return submissions submitted before this UTC timestamp"),
    ownerType: z
      .enum([
        "Job",
        "Call",
        "Customer",
        "Location",
        "Equipment",
        "Technician",
        "JobAppointment",
        "Membership",
        "Truck",
      ])
      .optional()
      .describe("Owner type filter"),
    owners: z
      .string()
      .optional()
      .describe("Owner query expression used by ServiceTitan submissions endpoint"),
  }),
);

export function registerDispatchFormTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "dispatch_forms_list",
    domain: "dispatch",
    operation: "read",
    description: "List forms",
    schema: formListSchema.shape,
    handler: async (params) => {
      const typed = params as z.infer<typeof formListSchema>;

      try {
        const data = await client.get("/tenant/{tenant}/forms", buildParams(typed));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_form_submissions_list",
    domain: "dispatch",
    operation: "read",
    description: "List form submissions",
    schema: submissionListSchema.shape,
    handler: async (params) => {
      const typed = params as z.infer<typeof submissionListSchema>;

      try {
        const data = await client.get("/tenant/{tenant}/submissions", buildParams(typed));
        return toolResult(data);
      } catch (error) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
