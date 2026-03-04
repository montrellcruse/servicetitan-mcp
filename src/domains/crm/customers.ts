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

const customerAddressSchema = z.object({
  street: z.string().optional().describe("Street"),
  unit: z.string().optional().describe("Unit"),
  city: z.string().optional().describe("City"),
  state: z.string().optional().describe("State"),
  zip: z.string().optional().describe("Zip code"),
  country: z.string().optional().describe("Country"),
  latitude: z.number().optional().describe("Latitude"),
  longitude: z.number().optional().describe("Longitude"),
});

const customerCustomFieldSchema = z.object({
  typeId: z.number().int().optional().describe("Custom field type ID"),
  name: z.string().optional().describe("Custom field name"),
  value: z.string().optional().describe("Custom field value"),
});

const externalDataSchema = z.object({
  key: z.string().optional().describe("External data key"),
  value: z.string().optional().describe("External data value"),
});

const phoneSettingsSchema = z.object({
  phoneNumber: z.string().optional().describe("Phone number"),
  doNotText: z.boolean().optional().describe("Do not text flag"),
});

const customerContactSchema = z.object({
  id: z.number().int().optional().describe("Contact ID"),
  type: z.string().optional().describe("Contact type"),
  value: z.string().optional().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
  phoneSettings: phoneSettingsSchema.optional().describe("Phone settings"),
});

const customerLocationSchema = z.object({
  taxZoneId: z.number().int().optional().describe("Tax zone ID"),
  id: z.number().int().optional().describe("Location ID"),
  customerId: z.number().int().optional().describe("Customer ID"),
  active: z.boolean().optional().describe("Active flag"),
  name: z.string().optional().describe("Location name"),
  address: customerAddressSchema.optional().describe("Location address"),
  customFields: z.array(customerCustomFieldSchema).optional().describe("Custom fields"),
  zoneId: z.number().int().optional().describe("Zone ID"),
  tagTypeIds: z.array(z.number().int()).optional().describe("Tag type IDs"),
  externalData: z.array(externalDataSchema).optional().describe("External data entries"),
  contacts: z.array(customerContactSchema).optional().describe("Location contacts"),
});

const customerIdSchema = z.object({
  id: z.number().int().describe("Customer ID"),
});

const customerNoteIdSchema = z.object({
  id: z.number().int().describe("Customer ID"),
  noteId: z.number().int().describe("Note ID"),
});

const customerContactIdSchema = z.object({
  id: z.number().int().describe("Customer ID"),
  contactId: z.number().int().describe("Contact ID"),
});

const customerTagSchema = z.object({
  id: z.number().int().describe("Customer ID"),
  tagTypeId: z.number().int().describe("Tag type ID"),
});

const customerUpdatePayloadSchema = z.object({
  active: z.boolean().optional().describe("Customer active flag"),
  name: z.string().optional().describe("Customer name"),
  type: z.string().optional().describe("Customer type"),
  address: customerAddressSchema.optional().describe("Customer address"),
  customFields: z.array(customerCustomFieldSchema).optional().describe("Custom fields"),
  balance: z.number().optional().describe("Customer balance"),
  tagTypeIds: z.array(z.number().int()).optional().describe("Tag type IDs"),
  doNotMail: z.boolean().optional().describe("Do not mail flag"),
  doNotService: z.boolean().optional().describe("Do not service flag"),
  mergedToId: z.number().int().optional().describe("Merged-to customer ID"),
  externalData: z.array(externalDataSchema).optional().describe("External data entries"),
});

const customerUpdateSchema = z.object({
  id: z.number().int().describe("Customer ID"),
  payload: customerUpdatePayloadSchema.optional().describe("Customer patch payload"),
});

const customerListSchema = dateFilterParams(
  paginationParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited customer IDs"),
      excludeAccountingChangesFromModifiedDateRange: z
        .boolean()
        .optional()
        .describe("Exclude accounting-only changes from modified date filters"),
      name: z.string().optional().describe("Filter by name"),
      street: z.string().optional().describe("Filter by street"),
      unit: z.string().optional().describe("Filter by unit"),
      city: z.string().optional().describe("Filter by city"),
      state: z.string().optional().describe("Filter by state"),
      zip: z.string().optional().describe("Filter by zip"),
      country: z.string().optional().describe("Filter by country"),
      latitude: z.number().optional().describe("Filter by latitude"),
      longitude: z.number().optional().describe("Filter by longitude"),
      phone: z.string().optional().describe("Filter by contact phone"),
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

const customerNotesListSchema = dateFilterParams(
  paginationParams(
    z.object({
      id: z.number().int().describe("Customer ID"),
    }),
  ),
);

const customerCreateNoteSchema = z.object({
  id: z.number().int().describe("Customer ID"),
  text: z.string().describe("Note text"),
  isPinned: z.boolean().optional().describe("Pinned flag"),
  createdById: z.number().int().optional().describe("Created by user ID"),
});

const customerCreateSchema = z.object({
  name: z.string().describe("Customer name"),
  type: z.string().optional().describe("Customer type"),
  address: customerAddressSchema.optional().describe("Customer address"),
  customFields: z.array(customerCustomFieldSchema).optional().describe("Custom fields"),
  balance: z.number().optional().describe("Customer balance"),
  tagTypeIds: z.array(z.number().int()).optional().describe("Tag type IDs"),
  doNotMail: z.boolean().optional().describe("Do not mail flag"),
  doNotService: z.boolean().optional().describe("Do not service flag"),
  externalData: z.array(externalDataSchema).optional().describe("External data entries"),
  locations: z.array(customerLocationSchema).optional().describe("Locations"),
  contacts: z.array(customerContactSchema).optional().describe("Contacts"),
});

const customerContactsListSchema = paginationParams(
  z.object({
    id: z.number().int().describe("Customer ID"),
  }),
);

const customerCreateContactSchema = z.object({
  id: z.number().int().describe("Customer ID"),
  type: z.string().optional().describe("Contact type"),
  value: z.string().optional().describe("Contact value"),
  memo: z.string().optional().describe("Contact memo"),
  phoneSettings: phoneSettingsSchema.optional().describe("Phone settings"),
});

const customerModifiedContactsListSchema = dateFilterParams(
  paginationParams(
    z.object({
      customerIds: z.string().optional().describe("Comma-delimited customer IDs"),
    }),
  ),
);

const customerCustomFieldTypesSchema = dateFilterParams(
  paginationParams(
    z.object({
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
    }),
  ),
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerCustomerTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "crm_customers_get",
    domain: "crm",
    operation: "read",
    description: "Get a customer by ID",
    schema: customerIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerIdSchema>;

      try {
        const data = await client.get(`/tenant/{tenant}/customers/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_update",
    domain: "crm",
    operation: "write",
    description: "Patch a customer",
    schema: customerUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerUpdateSchema>;

      try {
        const data = await client.patch(`/tenant/{tenant}/customers/${input.id}`, input.payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_list",
    domain: "crm",
    operation: "read",
    description: "List customers",
    schema: customerListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/customers",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            sort: input.sort,
            ids: input.ids,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            excludeAccountingChangesFromModifiedDateRange:
              input.excludeAccountingChangesFromModifiedDateRange,
            name: input.name,
            street: input.street,
            unit: input.unit,
            city: input.city,
            state: input.state,
            zip: input.zip,
            country: input.country,
            latitude: input.latitude,
            longitude: input.longitude,
            phone: input.phone,
            active: input.active,
            externalDataApplicationGuid: input.externalDataApplicationGuid,
            externalDataKey: input.externalDataKey,
            externalDataValues: input.externalDataValues,
          }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_notes_list",
    domain: "crm",
    operation: "read",
    description: "List notes for a customer",
    schema: customerNotesListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerNotesListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/customers/${input.id}/notes`,
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
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_notes_create",
    domain: "crm",
    operation: "write",
    description: "Create a note for a customer",
    schema: customerCreateNoteSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerCreateNoteSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/customers/${input.id}/notes`,
          buildParams({
            text: input.text,
            isPinned: input.isPinned,
            createdById: input.createdById,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_create",
    domain: "crm",
    operation: "write",
    description: "Create a customer",
    schema: customerCreateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerCreateSchema>;

      try {
        const data = await client.post(
          "/tenant/{tenant}/customers",
          buildParams({
            name: input.name,
            type: input.type,
            address: input.address,
            customFields: input.customFields,
            balance: input.balance,
            tagTypeIds: input.tagTypeIds,
            doNotMail: input.doNotMail,
            doNotService: input.doNotService,
            externalData: input.externalData,
            locations: input.locations,
            contacts: input.contacts,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_notes_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a customer note",
    schema: customerNoteIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerNoteIdSchema>;

      try {
        await client.delete(`/tenant/{tenant}/customers/${input.id}/notes/${input.noteId}`);
        return toolResult({
          success: true,
          message: "Customer note deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_delete_note",
    domain: "crm",
    operation: "delete",
    description: "Delete a customer note (legacy naming)",
    schema: customerNoteIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerNoteIdSchema>;

      try {
        await client.delete(`/tenant/{tenant}/customers/${input.id}/notes/${input.noteId}`);
        return toolResult({
          success: true,
          message: "Customer note deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_contacts_list",
    domain: "crm",
    operation: "read",
    description: "List customer contacts",
    schema: customerContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerContactsListSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/customers/${input.id}/contacts`,
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_contacts_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a customer contact",
    schema: customerContactIdSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerContactIdSchema>;

      try {
        await client.delete(`/tenant/{tenant}/customers/${input.id}/contacts/${input.contactId}`);
        return toolResult({
          success: true,
          message: "Customer contact deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_contacts_create",
    domain: "crm",
    operation: "write",
    description: "Create a customer contact",
    schema: customerCreateContactSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerCreateContactSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/customers/${input.id}/contacts`,
          buildParams({
            type: input.type,
            value: input.value,
            memo: input.memo,
            phoneSettings: input.phoneSettings
              ? buildParams({
                  phoneNumber: input.phoneSettings.phoneNumber,
                  doNotText: input.phoneSettings.doNotText,
                })
              : undefined,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_tags_create",
    domain: "crm",
    operation: "write",
    description: "Create a tag assignment for a customer",
    schema: customerTagSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerTagSchema>;

      try {
        const data = await client.post(
          `/tenant/{tenant}/customers/${input.id}/tags/${input.tagTypeId}`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_contacts_modified_list",
    domain: "crm",
    operation: "read",
    description: "List customer contacts modified in a time range",
    schema: customerModifiedContactsListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerModifiedContactsListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/customers/contacts",
          buildParams({
            page: input.page,
            pageSize: input.pageSize,
            includeTotal: input.includeTotal,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            customerIds: input.customerIds,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_tags_delete",
    domain: "crm",
    operation: "delete",
    description: "Delete a tag assignment from a customer",
    schema: customerTagSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerTagSchema>;

      try {
        await client.delete(`/tenant/{tenant}/customers/${input.id}/tags/${input.tagTypeId}`);
        return toolResult({
          success: true,
          message: "Customer tag deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_delete_tag",
    domain: "crm",
    operation: "delete",
    description: "Delete a tag assignment from a customer (legacy naming)",
    schema: customerTagSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerTagSchema>;

      try {
        await client.delete(`/tenant/{tenant}/customers/${input.id}/tags/${input.tagTypeId}`);
        return toolResult({
          success: true,
          message: "Customer tag deleted successfully",
        });
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "crm_customers_custom_field_types_list",
    domain: "crm",
    operation: "read",
    description: "List customer custom field types",
    schema: customerCustomFieldTypesSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof customerCustomFieldTypesSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/customers/custom-fields",
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
        return toolError(errorMessage(error));
      }
    },
  });
}
