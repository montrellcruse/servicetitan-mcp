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

const activityCodeIdSchema = z.object({
  id: z.number().int().describe("Activity code ID"),
});

const activityCategoryIdSchema = z.object({
  id: z.number().int().describe("Activity category ID"),
});

const activityTypeIdSchema = z.object({
  id: z.number().int().describe("Activity type ID"),
});

const activityListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const activityCategoryListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const activityTypeListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const exportSchema = z.object({
  from: z
    .string()
    .optional()
    .describe("Continuation token from previous response or custom start date"),
  includeRecentChanges: z
    .boolean()
    .optional()
    .describe("Prioritize recent changes in the export stream"),
});
export function registerActivityTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "settings_activity_codes_get",
    domain: "settings",
    operation: "read",
    description: "Retrieve one payroll activity code by its required ID. Use settings_activity_codes_list to search when the ID is unknown.",
    schema: activityCodeIdSchema.shape,
    handler: async (params) => {
      const { id } = activityCodeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/activities/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "settings_activity_codes_list",
    domain: "settings",
    operation: "read",
    description: "List one requested page of payroll activity codes with active-state, date, and sort controls. Use the get tool for one known code or the export feed for synchronization.",
    schema: activityListSchema.shape,
    handler: async (params) => {
      const input = activityListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/activities",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            active: input.active,
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
    name: "settings_activity_codes_export",
    domain: "settings",
    operation: "read",
    description: "Read the incremental activity-code export feed for Settings workflows. This is the same feed as export_activity_codes; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records.",
    schema: exportSchema.shape,
    handler: async (params) => {
      const input = exportSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/export/activity-codes",
          buildParams({
            from: input.from,
            includeRecentChanges: input.includeRecentChanges,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "settings_activity_categories_get",
    domain: "settings",
    operation: "read",
    description: "Retrieve one timesheet activity category by its required ID. Use settings_activity_categories_list to search when the ID is unknown.",
    schema: activityCategoryIdSchema.shape,
    handler: async (params) => {
      const { id } = activityCategoryIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/activity-categories/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "settings_activity_categories_list",
    domain: "settings",
    operation: "read",
    description: "List one requested page of timesheet activity categories with active-state, date, and sort controls. Use the get tool for one known category or the export feed for synchronization.",
    schema: activityCategoryListSchema.shape,
    handler: async (params) => {
      const input = activityCategoryListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/activity-categories",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            active: input.active,
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
    name: "settings_activity_categories_export",
    domain: "settings",
    operation: "read",
    description: "Read the incremental activity-category export feed for Settings synchronization. Use the list or get tools for filtered browsing or a known ID. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records.",
    schema: exportSchema.shape,
    handler: async (params) => {
      const input = exportSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/export/activity-categories",
          buildParams({
            from: input.from,
            includeRecentChanges: input.includeRecentChanges,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "settings_activity_types_get",
    domain: "settings",
    operation: "read",
    description: "Retrieve one timesheet activity type by its required ID. Use settings_activity_types_list to search when the ID is unknown.",
    schema: activityTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = activityTypeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/activity-types/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "settings_activity_types_list",
    domain: "settings",
    operation: "read",
    description: "List one requested page of timesheet activity types with active-state, date, and sort controls. Use the get tool for one known type ID.",
    schema: activityTypeListSchema.shape,
    handler: async (params) => {
      const input = activityTypeListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/activity-types",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            active: input.active,
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
    name: "settings_activities_export",
    domain: "settings",
    operation: "read",
    description: "Read the incremental timesheet-activity export feed for Settings workflows. This is the same feed as export_activities; use whichever name is available and do not fetch both. Continue immediately with continueFrom while hasMore is true; when false, retain it and wait before polling again. includeRecentChanges may repeat records.",
    schema: exportSchema.shape,
    handler: async (params) => {
      const input = exportSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/export/activities",
          buildParams({
            from: input.from,
            includeRecentChanges: input.includeRecentChanges,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
