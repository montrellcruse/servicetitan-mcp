import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { buildParams, dateFilterParams, paginationParams, sortParam, toolError, toolResult } from "../../utils.js";

const journalEntryIdSchema = z.object({
  id: z.string().uuid().describe("Journal entry UUID"),
});

const journalEntryPagingSchema = paginationParams(journalEntryIdSchema);

const journalEntryListSchema = paginationParams(
  dateFilterParams(
    z.object({
      ids: z.string().optional().describe("Comma-delimited journal entry IDs (max 50)"),
      exportedFrom: z
        .string()
        .datetime()
        .optional()
        .describe("Exported on or after UTC timestamp"),
      exportedTo: z
        .string()
        .datetime()
        .optional()
        .describe("Exported on or before UTC timestamp"),
      postedFrom: z
        .string()
        .datetime()
        .optional()
        .describe("Posted on or after UTC timestamp"),
      postedTo: z
        .string()
        .datetime()
        .optional()
        .describe("Posted on or before UTC timestamp"),
      exportedBy: z
        .string()
        .optional()
        .describe("Comma-delimited user IDs who exported entries"),
      name: z.string().max(255).optional().describe("Journal entry name contains"),
      numberFrom: z.number().int().optional().describe("Entry number lower bound"),
      numberTo: z.number().int().optional().describe("Entry number upper bound"),
      statuses: z.array(z.string()).max(50).optional().describe("Entry statuses"),
      syncStatuses: z.array(z.string()).max(50).optional().describe("Sync statuses"),
      transactionPostedFrom: z
        .string()
        .datetime()
        .optional()
        .describe("Contains transaction posted on or after UTC timestamp"),
      transactionPostedTo: z
        .string()
        .datetime()
        .optional()
        .describe("Contains transaction posted on or before UTC timestamp"),
      businessUnitIds: z
        .string()
        .optional()
        .describe("Comma-delimited business unit IDs (max 50)"),
      serviceAgreementIds: z
        .string()
        .optional()
        .describe("Comma-delimited service agreement IDs (max 50)"),
      customerName: z
        .string()
        .max(255)
        .optional()
        .describe("Customer name contains"),
      locationName: z
        .string()
        .max(255)
        .optional()
        .describe("Location name contains"),
      vendorName: z.string().max(255).optional().describe("Vendor name contains"),
      inventoryLocationName: z
        .string()
        .max(255)
        .optional()
        .describe("Inventory location name contains"),
      refNumber: z
        .string()
        .max(255)
        .optional()
        .describe("Transaction reference number contains"),
      transactionTypes: z
        .array(z.string())
        .max(50)
        .optional()
        .describe("Transaction types"),
      customField: z
        .record(z.string())
        .optional()
        .describe("Custom field name/value filters"),
      ...sortParam([
        "Id",
        "Number",
        "Name",
        "Status",
        "CreatedOn",
        "ExportedOn",
        "ExportedBy",
        "PostDate",
      ]),
    }),
  ),
);

const journalEntryUpdatePayloadSchema = z
  .object({
    name: z.string().optional().describe("Journal entry name"),
    status: z
      .enum(["Open", "Closed", "Draft"])
      .optional()
      .describe("Journal entry status"),
    customFields: z
      .array(
        z.object({
          name: z.string().describe("Custom field name"),
          value: z.string().describe("Custom field value"),
        }),
      )
      .optional()
      .describe("Custom fields"),
  })
  .partial();

const journalEntryUpdateSchema = z.object({
  id: z.string().uuid().describe("Journal entry UUID"),
  payload: journalEntryUpdatePayloadSchema
    .optional()
    .describe("Journal entry patch payload"),
});

const journalEntrySyncSchema = z.object({
  id: z.string().uuid().describe("Journal entry UUID"),
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function customFieldParams(customField?: Record<string, string>): Record<string, string> {
  if (!customField) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(customField).map(([key, value]) => [`customField.${key}`, value]),
  );
}

export function registerJournalEntryTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
): void {
  registry.register({
    name: "accounting_journal_entries_get_summary",
    domain: "accounting",
    operation: "read",
    description: "Get journal entry summary rows",
    schema: journalEntryPagingSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof journalEntryPagingSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/journal-entries/${input.id}/summary`,
          buildParams({
            pageSize: input.pageSize,
            page: input.page,
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
    name: "accounting_journal_entries_get_details",
    domain: "accounting",
    operation: "read",
    description: "Get journal entry detail rows",
    schema: journalEntryPagingSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof journalEntryPagingSchema>;

      try {
        const data = await client.get(
          `/tenant/{tenant}/journal-entries/${input.id}/details`,
          buildParams({
            pageSize: input.pageSize,
            page: input.page,
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
    name: "accounting_journal_entries_list",
    domain: "accounting",
    operation: "read",
    description: "List journal entries",
    schema: journalEntryListSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof journalEntryListSchema>;

      try {
        const data = await client.get(
          "/tenant/{tenant}/journal-entries",
          buildParams({
            ids: input.ids,
            exportedFrom: input.exportedFrom,
            exportedTo: input.exportedTo,
            postedFrom: input.postedFrom,
            postedTo: input.postedTo,
            modifiedBefore: input.modifiedBefore,
            modifiedOnOrAfter: input.modifiedOnOrAfter,
            createdBefore: input.createdBefore,
            createdOnOrAfter: input.createdOnOrAfter,
            exportedBy: input.exportedBy,
            name: input.name,
            numberFrom: input.numberFrom,
            numberTo: input.numberTo,
            statuses: input.statuses,
            syncStatuses: input.syncStatuses,
            transactionPostedFrom: input.transactionPostedFrom,
            transactionPostedTo: input.transactionPostedTo,
            businessUnitIds: input.businessUnitIds,
            serviceAgreementIds: input.serviceAgreementIds,
            customerName: input.customerName,
            locationName: input.locationName,
            vendorName: input.vendorName,
            inventoryLocationName: input.inventoryLocationName,
            refNumber: input.refNumber,
            transactionTypes: input.transactionTypes,
            ...customFieldParams(input.customField),
            sort: input.sort,
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
    name: "accounting_journal_entries_update",
    domain: "accounting",
    operation: "write",
    description: "Patch a journal entry",
    schema: journalEntryUpdateSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof journalEntryUpdateSchema>;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/journal-entries/${input.id}`,
          input.payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });

  registry.register({
    name: "accounting_journal_entries_sync_update",
    domain: "accounting",
    operation: "write",
    description: "Trigger journal entry sync update",
    schema: journalEntrySyncSchema.shape,
    handler: async (params) => {
      const input = params as z.infer<typeof journalEntrySyncSchema>;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/journal-entries/${input.id}/sync`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(errorMessage(error));
      }
    },
  });
}
