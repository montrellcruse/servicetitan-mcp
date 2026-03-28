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

const installedEquipmentIdSchema = z.object({
  id: z.number().int().describe("Installed equipment ID"),
});

const installedEquipmentAttachmentCreateSchema = z.object({
  file: z.string().describe("Base64-encoded attachment file"),
});

const installedEquipmentAttachmentsGetSchema = z.object({
  path: z.string().optional().describe("Storage path for a previously-uploaded attachment"),
});

const installedEquipmentPayloadSchema = z.object({
  active: z.boolean().optional().describe("Whether the installed equipment is active"),
  equipmentId: z.number().int().optional().describe("Equipment catalog ID"),
  locationId: z.number().int().optional().describe("Location ID"),
  customerId: z.number().int().optional().describe("Customer ID"),
  invoiceItemId: z.number().int().optional().describe("Invoice item ID"),
  name: z.string().optional().describe("Installed equipment display name"),
  installedOn: z.string().optional().describe("Installed date/time in RFC3339 format"),
  serialNumber: z.string().optional().describe("Serial number"),
  barcodeId: z.string().optional().describe("Barcode ID"),
  memo: z.string().optional().describe("Equipment memo"),
  manufacturer: z.string().optional().describe("Manufacturer name"),
  model: z.string().optional().describe("Model identifier"),
  cost: z.number().optional().describe("Acquisition cost"),
  manufacturerWarrantyStart: z
    .string()
    .optional()
    .describe("Manufacturer warranty start date/time in RFC3339 format"),
  manufacturerWarrantyEnd: z
    .string()
    .optional()
    .describe("Manufacturer warranty end date/time in RFC3339 format"),
  serviceProviderWarrantyStart: z
    .string()
    .optional()
    .describe("Service provider warranty start date/time in RFC3339 format"),
  serviceProviderWarrantyEnd: z
    .string()
    .optional()
    .describe("Service provider warranty end date/time in RFC3339 format"),
  actualReplacementDate: z
    .string()
    .optional()
    .describe("Actual replacement date/time in RFC3339 format"),
  predictedReplacementMonths: z
    .number()
    .int()
    .optional()
    .describe("Predicted replacement cadence in months"),
  predictedReplacementDate: z
    .string()
    .optional()
    .describe("Predicted replacement date/time in RFC3339 format"),
});

const installedEquipmentCreateSchema = installedEquipmentPayloadSchema.extend({
  equipmentId: z.number().int().describe("Equipment catalog ID"),
  locationId: z.number().int().describe("Location ID"),
  customerId: z.number().int().describe("Customer ID"),
  name: z.string().describe("Installed equipment display name"),
  installedOn: z.string().describe("Installed date/time in RFC3339 format"),
});

const installedEquipmentUpdateSchema = installedEquipmentIdSchema.extend(
  installedEquipmentPayloadSchema.shape,
);

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

const installedEquipmentListSchema = paginationParams(
  withDescribedDateFilters(
    z.object({
      ...activeFilterParam(),
      ...sortParam(["Id", "ModifiedOn", "CreatedOn"]),
      locationIds: z
        .string()
        .optional()
        .describe("Comma-separated location IDs to include"),
      ids: z
        .string()
        .optional()
        .describe("Comma-separated installed equipment IDs (maximum 50)"),
    }),
  ),
);
export function registerDispatchInstalledEquipmentTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "dispatch_installed_equipment_get",
    domain: "dispatch",
    operation: "read",
    description: "Get installed equipment by ID",
    schema: installedEquipmentIdSchema.shape,
    handler: async (params) => {
      const input = installedEquipmentIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/installed-equipment/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_installed_equipment_list",
    domain: "dispatch",
    operation: "read",
    description: "List installed equipment",
    schema: installedEquipmentListSchema.shape,
    handler: async (params) => {
      const input = installedEquipmentListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/installed-equipment",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_installed_equipment_create",
    domain: "dispatch",
    operation: "write",
    description: "Create installed equipment",
    schema: installedEquipmentCreateSchema.shape,
    handler: async (params) => {
      const input = installedEquipmentCreateSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/installed-equipment",
          buildParams(input),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_installed_equipment_update",
    domain: "dispatch",
    operation: "write",
    description: "Update installed equipment",
    schema: installedEquipmentUpdateSchema.shape,
    handler: async (params) => {
      const input = installedEquipmentUpdateSchema.parse(params);
      const { id, ...body } = input;

      try {
        const payload = buildParams(body);
        const data = await client.patch(
          `/tenant/{tenant}/installed-equipment/${id}`,
          Object.keys(payload).length > 0 ? payload : undefined,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_installed_equipment_delete",
    domain: "dispatch",
    operation: "delete",
    description: "Delete installed equipment",
    schema: installedEquipmentIdSchema.shape,
    handler: async (params) => {
      const input = installedEquipmentIdSchema.parse(params);

      try {
        const data = await client.delete(`/tenant/{tenant}/installed-equipment/${input.id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_installed_equipment_attachments_create",
    domain: "dispatch",
    operation: "write",
    description: "Upload an installed equipment attachment",
    schema: installedEquipmentAttachmentCreateSchema.shape,
    handler: async (params) => {
      const input = installedEquipmentAttachmentCreateSchema.parse(params);

      try {
        const data = await client.post("/tenant/{tenant}/installed-equipment/attachments", {
          file: input.file,
        });
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "dispatch_installed_equipment_attachments_get",
    domain: "dispatch",
    operation: "read",
    description: "Get installed equipment attachment metadata by storage path",
    schema: installedEquipmentAttachmentsGetSchema.shape,
    handler: async (params) => {
      const input = installedEquipmentAttachmentsGetSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/installed-equipment/attachments",
          buildParams({ path: input.path }),
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
