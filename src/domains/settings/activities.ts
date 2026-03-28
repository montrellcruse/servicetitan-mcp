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
    description: "Get an activity code by ID",
    schema: activityCodeIdSchema.shape,
    handler: async (params) => {
      const { id } = activityCodeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/activities/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_activity_codes_list",
    domain: "settings",
    operation: "read",
    description: "List activity codes",
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_activity_codes_export",
    domain: "settings",
    operation: "read",
    description: "Export activity codes",
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_activity_categories_get",
    domain: "settings",
    operation: "read",
    description: "Get an activity category by ID",
    schema: activityCategoryIdSchema.shape,
    handler: async (params) => {
      const { id } = activityCategoryIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/activity-categories/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_activity_categories_list",
    domain: "settings",
    operation: "read",
    description: "List activity categories",
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_activity_categories_export",
    domain: "settings",
    operation: "read",
    description: "Export activity categories",
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_activity_types_get",
    domain: "settings",
    operation: "read",
    description: "Get an activity type by ID",
    schema: activityTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = activityTypeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/activity-types/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_activity_types_list",
    domain: "settings",
    operation: "read",
    description: "List activity types",
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_activities_export",
    domain: "settings",
    operation: "read",
    description: "Export activities",
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
        return toolError(getErrorMessage(error));
      }
    },
  });
}
