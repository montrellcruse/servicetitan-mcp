import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";

const bookingProviderTagGetSchema = z.object({
  id: z.number().int().describe("Booking provider tag ID"),
});

const bookingProviderTagCreateSchema = z.object({
  tagName: z.string().optional().describe("Booking provider tag name"),
  description: z.string().optional().describe("Booking provider tag description"),
});

const bookingProviderTagUpdateSchema = z.object({
  id: z.number().int().describe("Booking provider tag ID"),
  tagName: z.string().optional().describe("Booking provider tag name"),
  description: z.string().optional().describe("Booking provider tag description"),
});

const bookingProviderTagListSchema = dateFilterParams(
  paginationParams(
    z.object({
      name: z.string().optional().describe("Booking provider tag name"),
      ids: z.string().optional().describe("Comma-delimited booking provider tag IDs"),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerBookingProviderTagTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "crm_booking_provider_tags_create",
    domain: "crm",
    operation: "write",
    description: "Create a booking provider tag",
    schema: bookingProviderTagCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderTagCreateSchema>;

      try {
        const data = await client.post("/tenant/{tenant}/booking-provider-tags", input);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_booking_provider_tags_get",
    domain: "crm",
    operation: "read",
    description: "Get a booking provider tag by ID",
    schema: bookingProviderTagGetSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderTagGetSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/booking-provider-tags/${input.id}`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_booking_provider_tags_update",
    domain: "crm",
    operation: "write",
    description: "Patch a booking provider tag",
    schema: bookingProviderTagUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderTagUpdateSchema>;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/booking-provider-tags/${input.id}`,
          buildParams({
            tagName: input.tagName,
            description: input.description,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_booking_provider_tags_list",
    domain: "crm",
    operation: "read",
    description: "List booking provider tags",
    schema: bookingProviderTagListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderTagListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/booking-provider-tags",
          buildParams({
            name: input.name,
            ids: input.ids,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            sort: input.sort,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });
}
