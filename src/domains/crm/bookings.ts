import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";

const bookingIdSchema = z.object({
  id: z.number().int().describe("Booking ID"),
});

const bookingProviderScopedIdSchema = z.object({
  bookingProvider: z.number().int().describe("Booking provider ID"),
  id: z.number().int().describe("Booking ID"),
});

const bookingListFilterSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited booking IDs (max 50)"),
      externalId: z.string().optional().describe("External booking ID"),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const bookingBodySchema = z.object({
  externalId: z.string().optional().describe("External booking ID"),
  start: z.string().optional().describe("Booking start date-time"),
  end: z.string().optional().describe("Booking end date-time"),
  notes: z.string().optional().describe("Booking notes"),
  summary: z.string().optional().describe("Booking summary"),
  customerId: z.number().int().optional().describe("Customer ID"),
  locationId: z.number().int().optional().describe("Location ID"),
  leadId: z.number().int().optional().describe("Lead ID"),
  campaignId: z.number().int().optional().describe("Campaign ID"),
});

const bookingProviderUpdateSchema = z.object({
  bookingProvider: z.number().int().describe("Booking provider ID"),
  id: z.number().int().describe("Booking ID"),
  payload: bookingBodySchema.optional().describe("Booking patch payload"),
});

const bookingProviderCreateSchema = z.object({
  bookingProvider: z.number().int().describe("Booking provider ID"),
  body: bookingBodySchema.describe("Booking create payload"),
});

const bookingContactSchema = z.object({
  type: z.string().describe("Contact type"),
  value: z.string().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
});

const bookingCreateContactSchema = z.object({
  bookingProvider: z.number().int().describe("Booking provider ID"),
  id: z.number().int().describe("Booking ID"),
  type: z.string().describe("Contact type"),
  value: z.string().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
});

const bookingUpdateContactSchema = z.object({
  bookingProvider: z.number().int().describe("Booking provider ID"),
  id: z.number().int().describe("Booking ID"),
  contactId: z.number().int().describe("Contact ID"),
  type: z.string().describe("Contact type"),
  value: z.string().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
});

const bookingContactsListSchema = paginationParams(
  z.object({
    id: z.number().int().describe("Booking ID"),
  }),
);

const bookingProviderContactsListSchema = paginationParams(
  z.object({
    bookingProvider: z.number().int().describe("Booking provider ID"),
    id: z.number().int().describe("Booking ID"),
  }),
);

const bookingProviderListSchema = bookingListFilterSchema.extend({
  bookingProvider: z.number().int().describe("Booking provider ID"),
});


export function registerBookingTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "crm_bookings_get",
    domain: "crm",
    operation: "read",
    description: "Retrieve one tenant booking record by booking ID. Use crm_bookings_list to search when the ID is unknown, or the provider-scoped get when the booking provider must be part of the route.",
    schema: bookingIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/bookings/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_bookings_provider_get",
    domain: "crm",
    operation: "read",
    description: "Retrieve one booking record from a specified booking provider using both provider and booking IDs. Use crm_bookings_get for the tenant-wide ID route, or the provider list when the booking ID is unknown.",
    schema: bookingProviderScopedIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderScopedIdSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_bookings_contacts_list",
    domain: "crm",
    operation: "read",
    description: "List one page of contacts attached to a tenant booking. Supply the booking ID; use page and pageSize to continue through results.",
    schema: bookingContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingContactsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/bookings/${input.id}/contacts`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_bookings_list",
    domain: "crm",
    operation: "read",
    description: "Search tenant bookings by IDs, external ID, or created and modified ranges. Returns one page; use crm_bookings_get for a known booking ID.",
    schema: bookingListFilterSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingListFilterSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/bookings",
          buildParams({
            ids: input.ids,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            externalId: input.externalId,
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
    name: "crm_bookings_provider_update",
    domain: "crm",
    operation: "write",
    description: "Patch a provider-scoped booking",
    schema: bookingProviderUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderUpdateSchema>;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}`,
          input.payload,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_bookings_provider_create",
    domain: "crm",
    operation: "write",
    description: "Create a booking for a booking provider",
    schema: bookingProviderCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderCreateSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings`,
          input.body,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_bookings_provider_contacts_create",
    domain: "crm",
    operation: "write",
    description: "Create a contact on a provider-scoped booking",
    schema: bookingCreateContactSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingCreateContactSchema>;

      try {
        const body = bookingContactSchema.parse({
          type: input.type,
          value: input.value,
          memo: input.memo,
        });

        const data = await client.post(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}/contacts`,
          body,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_bookings_provider_list",
    domain: "crm",
    operation: "read",
    description: "Search one booking provider's bookings by IDs, external ID, or created and modified ranges. Returns one page and requires the provider ID.",
    schema: bookingProviderListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings`,
          buildParams({
            ids: input.ids,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            externalId: input.externalId,
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
    name: "crm_bookings_provider_contacts_list",
    domain: "crm",
    operation: "read",
    description: "List one page of contacts for a booking within a specified booking provider. Requires both provider and booking IDs.",
    schema: bookingProviderContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingProviderContactsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}/contacts`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "crm_bookings_provider_contacts_update",
    domain: "crm",
    operation: "write",
    description: "Patch a provider-scoped booking contact",
    schema: bookingUpdateContactSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof bookingUpdateContactSchema>;

      try {
        const body = bookingContactSchema.parse({
          type: input.type,
          value: input.value,
          memo: input.memo,
        });

        const data = await client.patch(
          `/tenant/{tenant}/booking-provider/${input.bookingProvider}/bookings/${input.id}/contacts/${input.contactId}`,
          body,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
