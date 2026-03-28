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
import { getErrorMessage } from "../intelligence/helpers.js";

const locationAddressSchema = z.object({
  street: z.string().optional().describe("Street"),
  unit: z.string().optional().describe("Unit"),
  city: z.string().optional().describe("City"),
  state: z.string().optional().describe("State"),
  zip: z.string().optional().describe("Zip code"),
  country: z.string().optional().describe("Country"),
  latitude: z.number().optional().describe("Latitude"),
  longitude: z.number().optional().describe("Longitude"),
});

const locationCustomFieldSchema = z.object({
  typeId: z.number().int().optional().describe("Custom field type ID"),
  name: z.string().optional().describe("Custom field name"),
  value: z.string().optional().describe("Custom field value"),
});

const locationExternalDataSchema = z.object({
  key: z.string().optional().describe("External data key"),
  value: z.string().optional().describe("External data value"),
});

const locationContactSchema = z.object({
  type: z.string().optional().describe("Contact type"),
  value: z.string().optional().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
});

const locationPhoneSettingsSchema = z.object({
  phoneNumber: z.string().optional().describe("Phone number"),
  doNotText: z.boolean().optional().describe("Do not text flag"),
});

const locationIdSchema = z.object({
  id: z.number().int().describe("Location ID"),
});

const locationNoteSchema = z.object({
  id: z.number().int().describe("Location ID"),
  noteId: z.number().int().describe("Note ID"),
});

const locationContactIdSchema = z.object({
  id: z.number().int().describe("Location ID"),
  contactId: z.number().int().describe("Contact ID"),
});

const locationTagSchema = z.object({
  id: z.number().int().describe("Location ID"),
  tagTypeId: z.number().int().describe("Tag type ID"),
});

const locationUpdatePayloadSchema = z.object({
  customerId: z.number().int().optional().describe("Customer ID"),
  active: z.boolean().optional().describe("Active flag"),
  name: z.string().optional().describe("Location name"),
  address: locationAddressSchema.optional().describe("Address"),
  customFields: z.array(locationCustomFieldSchema).optional().describe("Custom fields"),
  zoneId: z.number().int().optional().describe("Zone ID"),
  tagTypeIds: z.array(z.number().int()).optional().describe("Tag type IDs"),
  externalData: z.array(locationExternalDataSchema).optional().describe("External data entries"),
  taxZoneId: z.number().int().optional().describe("Tax zone ID"),
});

const locationUpdateSchema = z.object({
  id: z.number().int().describe("Location ID"),
  payload: locationUpdatePayloadSchema.optional().describe("Location patch payload"),
});

const locationCreateSchema = z.object({
  taxZoneId: z.number().int().optional().describe("Tax zone ID"),
  customerId: z.number().int().optional().describe("Customer ID"),
  active: z.boolean().optional().describe("Active flag"),
  name: z.string().optional().describe("Location name"),
  address: locationAddressSchema.optional().describe("Address"),
  customFields: z.array(locationCustomFieldSchema).optional().describe("Custom fields"),
  zoneId: z.number().int().optional().describe("Zone ID"),
  tagTypeIds: z.array(z.number().int()).optional().describe("Tag type IDs"),
  externalData: z.array(locationExternalDataSchema).optional().describe("External data entries"),
  contacts: z.array(locationContactSchema).optional().describe("Location contacts"),
});

const locationListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited location IDs"),
      name: z.string().optional().describe("Filter by location name"),
      customerId: z.number().int().optional().describe("Filter by customer ID"),
      street: z.string().optional().describe("Filter by street"),
      unit: z.string().optional().describe("Filter by unit"),
      city: z.string().optional().describe("Filter by city"),
      state: z.string().optional().describe("Filter by state"),
      zip: z.string().optional().describe("Filter by zip"),
      country: z.string().optional().describe("Filter by country"),
      latitude: z.number().optional().describe("Filter by latitude"),
      longitude: z.number().optional().describe("Filter by longitude"),
      ...activeFilterParam(),
      externalDataApplicationGuid: z
        .string()
        .uuid()
        .optional()
        .describe("External data application GUID"),
      externalDataKey: z.string().optional().describe("External data key"),
      externalDataValues: z.string().optional().describe("External data values"),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const locationNotesListSchema = dateFilterParams(
  paginationParams(
    z.object({
      id: z.number().int().describe("Location ID"),
    }),
  ),
);

const locationCreateNoteSchema = z.object({
  id: z.number().int().describe("Location ID"),
  text: z.string().describe("Note text"),
  isPinned: z.boolean().optional().describe("Pinned flag"),
});

const locationContactsListSchema = paginationParams(
  z.object({
    id: z.number().int().describe("Location ID"),
  }),
);

const locationCreateContactSchema = z.object({
  id: z.number().int().describe("Location ID"),
  type: z.string().describe("Contact type"),
  value: z.string().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
  phoneNumber: z.string().optional().describe("Phone number"),
  doNotText: z.boolean().optional().describe("Do not text flag"),
});

const locationUpdateContactSchema = z.object({
  id: z.number().int().describe("Location ID"),
  contactId: z.number().int().describe("Contact ID"),
  value: z.string().optional().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
  phoneNumber: z.string().optional().describe("Phone number"),
  doNotText: z.boolean().optional().describe("Do not text flag"),
});

const locationModifiedContactsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      locationIds: z.string().optional().describe("Comma-delimited location IDs"),
    }),
  ),
);

const locationCustomFieldTypesSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

const locationLaborTypesListSchema = paginationParams(
  z
    .object({
      locationIds: z.string().optional().describe("Comma-delimited location IDs"),
      createdBefore: z.string().datetime().optional().describe("Created before timestamp"),
      createdOnOrAfter: z
        .string()
        .datetime()
        .optional()
        .describe("Created on or after timestamp"),
      sort: z
        .string()
        .optional()
        .describe("Sort: +Location/-Location or +CreatedOn/-CreatedOn"),
    })
    .extend(activeFilterParam()),
);


export function registerLocationTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "crm_locations_get",
    domain: "crm",
    operation: "read",
    description: "Get a location by ID",
    schema: locationIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/locations/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_update",
    domain: "crm",
    operation: "write",
    description: "Patch a location",
    schema: locationUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/locations/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_create",
    domain: "crm",
    operation: "write",
    description: "Create a location",
    schema: locationCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationCreateSchema>;

      try {
        const data = await client.post(
          "/tenant/{tenant}/locations",
          buildParams({
            taxZoneId: input.taxZoneId,
            customerId: input.customerId,
            active: input.active,
            name: input.name,
            address: input.address,
            customFields: input.customFields,
            zoneId: input.zoneId,
            tagTypeIds: input.tagTypeIds,
            externalData: input.externalData,
            contacts: input.contacts,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_list",
    domain: "crm",
    operation: "read",
    description: "List locations",
    schema: locationListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/locations",
          buildParams({
            ids: input.ids,
            name: input.name,
            customerId: input.customerId,
            street: input.street,
            unit: input.unit,
            city: input.city,
            state: input.state,
            zip: input.zip,
            country: input.country,
            latitude: input.latitude,
            longitude: input.longitude,
            active: input.active,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            sort: input.sort,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            externalDataApplicationGuid: input.externalDataApplicationGuid,
            externalDataKey: input.externalDataKey,
            externalDataValues: input.externalDataValues,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_notes_list",
    domain: "crm",
    operation: "read",
    description: "List notes for a location",
    schema: locationNotesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationNotesListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/locations/${input.id}/notes`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_notes_create",
    domain: "crm",
    operation: "write",
    description: "Create a note for a location",
    schema: locationCreateNoteSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationCreateNoteSchema>;

      try {
        const data = await client.post(`/tenant/{tenant}/locations/${input.id}/notes`, {
          text: input.text,
          isPinned: input.isPinned ?? false,
        });

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_notes_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a location note",
    schema: locationNoteSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationNoteSchema>;

      try {
        await client.delete(`/tenant/{tenant}/locations/${input.id}/notes/${input.noteId}`);
        return toolResult({
          success: true,
          message: "Location note deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_contacts_list",
    domain: "crm",
    operation: "read",
    description: "List contacts for a location",
    schema: locationContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationContactsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/locations/${input.id}/contacts`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_contacts_create",
    domain: "crm",
    operation: "write",
    description: "Create a contact for a location",
    schema: locationCreateContactSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationCreateContactSchema>;

      try {
        const phoneSettings =
          input.phoneNumber !== undefined || input.doNotText !== undefined
            ? locationPhoneSettingsSchema.parse({
                phoneNumber: input.phoneNumber,
                doNotText: input.doNotText,
              })
            : undefined;

        const data = await client.post(
          `/tenant/{tenant}/locations/${input.id}/contacts`,
          buildParams({
            type: input.type,
            value: input.value,
            memo: input.memo,
            phoneSettings,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_contacts_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a location contact",
    schema: locationContactIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationContactIdSchema>;

      try {
        await client.delete(`/tenant/{tenant}/locations/${input.id}/contacts/${input.contactId}`);
        return toolResult({
          success: true,
          message: "Location contact deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_contacts_update",
    domain: "crm",
    operation: "write",
    description: "Patch a location contact",
    schema: locationUpdateContactSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationUpdateContactSchema>;

      try {
        const phoneSettings =
          input.phoneNumber !== undefined || input.doNotText !== undefined
            ? locationPhoneSettingsSchema.parse({
                phoneNumber: input.phoneNumber,
                doNotText: input.doNotText,
              })
            : undefined;

        const data = await client.patch(
          `/tenant/{tenant}/locations/${input.id}/contacts/${input.contactId}`,
          buildParams({
            value: input.value,
            memo: input.memo,
            phoneSettings,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_contacts_modified_list",
    domain: "crm",
    operation: "read",
    description: "List location contacts modified in a time range",
    schema: locationModifiedContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationModifiedContactsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/locations/contacts",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            locationIds: input.locationIds,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_tags_create",
    domain: "crm",
    operation: "write",
    description: "Create a tag assignment for a location",
    schema: locationTagSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationTagSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/locations/${input.id}/tags/${input.tagTypeId}`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_tags_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a tag assignment from a location",
    schema: locationTagSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationTagSchema>;

      try {
        await client.delete(`/tenant/{tenant}/locations/${input.id}/tags/${input.tagTypeId}`);
        return toolResult({
          success: true,
          message: "Location tag deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_locations_custom_field_types_list",
    domain: "crm",
    operation: "read",
    description: "List location custom field types",
    schema: locationCustomFieldTypesSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationCustomFieldTypesSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/locations/custom-fields",
          buildParams({
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
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_location_labor_types_list",
    domain: "crm",
    operation: "read",
    description: "List location labor types by locations",
    schema: locationLaborTypesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof locationLaborTypesListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/locations/rates",
          buildParams({
            locationIds: input.locationIds,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
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
}
