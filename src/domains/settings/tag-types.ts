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

const externalDataEntrySchema = z
  .object({
    key: z.string().describe("External data key"),
    value: z.string().describe("External data value"),
  })
  .describe("External data entry");

const tagTypeIdSchema = z.object({
  id: z.number().int().describe("Tag type ID"),
});

const tagTypeCreatePayloadSchema = z.object({
  name: z.string().describe("Tag type name"),
  description: z.string().optional().describe("Tag type description"),
  active: z.boolean().optional().describe("Whether the tag type is active"),
  color: z.string().optional().describe("Tag type color value"),
  displayOrder: z.number().int().optional().describe("Display order for this tag type"),
  externalData: z
    .array(externalDataEntrySchema)
    .optional()
    .describe("External data entries"),
});

const tagTypeUpdatePayloadSchema = tagTypeCreatePayloadSchema.partial();

const tagTypeCreateSchema = z.object({
  body: tagTypeCreatePayloadSchema.describe("Tag type create payload"),
});

const tagTypeUpdateSchema = tagTypeIdSchema.extend({
  body: tagTypeUpdatePayloadSchema.describe("Tag type update payload"),
});

const tagTypeListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const tagTypeExportSchema = z.object({
  from: z
    .string()
    .optional()
    .describe("Continuation token from previous response or custom start date"),
  includeRecentChanges: z
    .boolean()
    .optional()
    .describe("Prioritize recent changes in the export stream"),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerTagTypeTools(client: ServiceTitanClient, registry: ToolRegistry): void {
  registry.register({
    name: "settings_tag_types_get",
    domain: "settings",
    operation: "read",
    description: "Get a tag type by ID",
    schema: tagTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = tagTypeIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/tag-types/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_tag_types_list",
    domain: "settings",
    operation: "read",
    description: "List tag types",
    schema: tagTypeListSchema.shape,
    handler: async (params) => {
      const input = tagTypeListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/tag-types",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            active: input.active,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
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
    name: "settings_tag_types_create",
    domain: "settings",
    operation: "write",
    description: "Create a tag type",
    schema: tagTypeCreateSchema.shape,
    handler: async (params) => {
      const input = tagTypeCreateSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/tag-types", buildParams(input.body));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_tag_types_update",
    domain: "settings",
    operation: "write",
    description: "Update a tag type",
    schema: tagTypeUpdateSchema.shape,
    handler: async (params) => {
      const { id, body } = tagTypeUpdateSchema.parse(params);

      try {
        const data = await client.patch(`/tenant/{tenant}/tag-types/${id}`, buildParams(body));
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_tag_types_delete",
    domain: "settings",
    operation: "delete",
    description: "Delete a tag type",
    schema: tagTypeIdSchema.shape,
    handler: async (params) => {
      const { id } = tagTypeIdSchema.parse(params);

      try {
        await client.delete(`/tenant/{tenant}/tag-types/${id}`);
        return toolResult({ success: true, message: "Tag type deleted" });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "settings_tag_types_export",
    domain: "settings",
    operation: "read",
    description: "Export tag types",
    schema: tagTypeExportSchema.shape,
    handler: async (params) => {
      const input = tagTypeExportSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/export/tag-types",
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
