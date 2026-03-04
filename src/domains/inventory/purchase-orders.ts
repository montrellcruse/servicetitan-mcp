import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import {
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
} from "../../utils.js";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const purchaseOrderStatusEnum = z.enum([
  "Pending",
  "Sent",
  "PartiallyReceived",
  "Received",
  "Exported",
  "Canceled",
]);

const purchaseOrderRequestStatusEnum = z.enum([
  "PendingApproval",
  "Approved",
  "Rejected",
]);

const purchaseOrderAddressSchema = z.object({
  street: z.string().optional().describe("Street address line"),
  unit: z.string().optional().describe("Address unit/suite"),
  city: z.string().optional().describe("Address city"),
  state: z.string().optional().describe("Address state/province"),
  postalCode: z.string().optional().describe("Address postal code"),
  country: z.string().optional().describe("Address country"),
});

const purchaseOrderItemSchema = z.object({
  skuId: z.number().int().optional().describe("SKU ID for this purchase order line"),
  skuCode: z.string().optional().describe("SKU code for this purchase order line"),
  description: z.string().optional().describe("Line item description"),
  quantity: z.number().optional().describe("Line item quantity"),
  unitCost: z.number().optional().describe("Line item unit cost"),
  taxCodeId: z.number().int().optional().describe("Tax code ID for this line item"),
  inventoryLocationId: z
    .number()
    .int()
    .optional()
    .describe("Inventory location ID for this line item"),
});

const purchaseOrderExternalLinkSchema = z.object({
  name: z.string().optional().describe("External link label"),
  url: z.string().optional().describe("External link URL"),
});

const purchaseOrderPayloadSchema = z.object({
  vendorId: z.number().int().optional().describe("Vendor ID for the purchase order"),
  purchaseOrderTypeId: z
    .number()
    .int()
    .optional()
    .describe("Purchase order type ID"),
  number: z.string().optional().describe("Purchase order number"),
  status: purchaseOrderStatusEnum.optional().describe("Purchase order status"),
  date: z.string().optional().describe("Purchase order date"),
  sentOn: z.string().optional().describe("Date/time when PO was sent"),
  expectedDeliveryOn: z.string().optional().describe("Expected delivery date/time"),
  jobId: z.number().int().optional().describe("Job ID associated with the PO"),
  projectId: z.number().int().optional().describe("Project ID associated with the PO"),
  technicianId: z
    .number()
    .int()
    .optional()
    .describe("Technician ID associated with the PO"),
  businessUnitId: z
    .number()
    .int()
    .optional()
    .describe("Business unit ID associated with the PO"),
  inventoryLocationId: z
    .number()
    .int()
    .optional()
    .describe("Inventory location ID associated with the PO"),
  summary: z.string().optional().describe("Purchase order summary text"),
  memo: z.string().optional().describe("Purchase order memo text"),
  shipTo: purchaseOrderAddressSchema
    .optional()
    .describe("Shipping address for the purchase order"),
  billTo: purchaseOrderAddressSchema
    .optional()
    .describe("Billing address for the purchase order"),
  items: z
    .array(purchaseOrderItemSchema)
    .optional()
    .describe("Purchase order line items"),
  externalLinks: z
    .array(purchaseOrderExternalLinkSchema)
    .optional()
    .describe("External links associated with the PO"),
});

const purchaseOrderIdSchema = z.object({
  id: z.number().int().describe("Purchase order ID"),
});

const purchaseOrderUpdateSchema = purchaseOrderPayloadSchema.extend({
  id: z.number().int().describe("Purchase order ID"),
});

const purchaseOrderListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated purchase order IDs (maximum 50)"),
        status: purchaseOrderStatusEnum.optional().describe("Filter by purchase order status"),
        number: z.string().optional().describe("Filter by purchase order number"),
        jobId: z.number().int().optional().describe("Filter by job ID"),
        jobIds: z.string().optional().describe("Comma-separated job IDs"),
        technicianId: z.number().int().optional().describe("Filter by technician ID"),
        projectId: z.number().int().optional().describe("Filter by project ID"),
        dateOnOrAfter: z
          .string()
          .optional()
          .describe("Filter by purchase order date on or after this value"),
        dateBefore: z
          .string()
          .optional()
          .describe("Filter by purchase order date before this value"),
        sentOnOrAfter: z
          .string()
          .optional()
          .describe("Filter by sent-on date on or after this value"),
        sentBefore: z
          .string()
          .optional()
          .describe("Filter by sent-on date before this value"),
      })
      .extend(sortParam(["Id", "ModifiedOn", "CreatedOn"])),
  ),
);

const purchaseOrderRequestsListSchema = dateFilterParams(
  paginationParams(
    z
      .object({
        ids: z
          .string()
          .optional()
          .describe("Comma-separated purchase order request IDs (maximum 50)"),
        requestStatus: purchaseOrderRequestStatusEnum
          .optional()
          .describe("Filter by purchase order request status"),
        requestNumber: z
          .string()
          .optional()
          .describe("Filter by purchase order request number"),
        jobId: z.number().int().optional().describe("Filter by job ID"),
        jobIds: z.string().optional().describe("Comma-separated job IDs"),
        technicianId: z.number().int().optional().describe("Filter by technician ID"),
        projectId: z.number().int().optional().describe("Filter by project ID"),
        dateOnOrAfter: z
          .string()
          .optional()
          .describe("Filter by request date on or after this value"),
        dateBefore: z
          .string()
          .optional()
          .describe("Filter by request date before this value"),
      })
      .extend(sortParam(["Id", "ModifiedOn", "CreatedOn"])),
  ),
);

const purchaseOrderRequestActionSchema = z.object({
  id: z.number().int().describe("Purchase order request ID"),
});

export function registerPurchaseOrderTools(
  client: ServiceTitanClient,
  registry: ToolRegistry,
) {
  registry.register({
    name: "inventory_purchase_orders_create",
    domain: "inventory",
    operation: "write",
    description: "Create a purchase order",
    schema: purchaseOrderPayloadSchema.shape,
    handler: async (params) => {
      const parsed = purchaseOrderPayloadSchema.parse(params);

      try {
        const data = await client.post(
          "/tenant/{tenant}/purchase-orders",
          buildParams(parsed),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_get",
    domain: "inventory",
    operation: "read",
    description: "Get a purchase order by ID",
    schema: purchaseOrderIdSchema.shape,
    handler: async (params) => {
      const { id } = purchaseOrderIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/purchase-orders/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_list",
    domain: "inventory",
    operation: "read",
    description: "List purchase orders",
    schema: purchaseOrderListSchema.shape,
    handler: async (params) => {
      const parsed = purchaseOrderListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/purchase-orders",
          buildParams({
            ids: parsed.ids,
            status: parsed.status,
            number: parsed.number,
            jobId: parsed.jobId,
            jobIds: parsed.jobIds,
            technicianId: parsed.technicianId,
            projectId: parsed.projectId,
            createdOnOrAfter: parsed.createdOnOrAfter,
            createdBefore: parsed.createdBefore,
            modifiedOnOrAfter: parsed.modifiedOnOrAfter,
            modifiedBefore: parsed.modifiedBefore,
            dateOnOrAfter: parsed.dateOnOrAfter,
            dateBefore: parsed.dateBefore,
            sentOnOrAfter: parsed.sentOnOrAfter,
            sentBefore: parsed.sentBefore,
            page: parsed.page,
            pageSize: parsed.pageSize,
            includeTotal: parsed.includeTotal,
            sort: parsed.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_requests_list",
    domain: "inventory",
    operation: "read",
    description: "List purchase order requests",
    schema: purchaseOrderRequestsListSchema.shape,
    handler: async (params) => {
      const parsed = purchaseOrderRequestsListSchema.parse(params);

      try {
        const data = await client.get(
          "/tenant/{tenant}/purchase-orders/requests",
          buildParams({
            ids: parsed.ids,
            requestStatus: parsed.requestStatus,
            requestNumber: parsed.requestNumber,
            jobId: parsed.jobId,
            jobIds: parsed.jobIds,
            technicianId: parsed.technicianId,
            projectId: parsed.projectId,
            createdOnOrAfter: parsed.createdOnOrAfter,
            createdBefore: parsed.createdBefore,
            modifiedOnOrAfter: parsed.modifiedOnOrAfter,
            modifiedBefore: parsed.modifiedBefore,
            dateOnOrAfter: parsed.dateOnOrAfter,
            dateBefore: parsed.dateBefore,
            page: parsed.page,
            pageSize: parsed.pageSize,
            includeTotal: parsed.includeTotal,
            sort: parsed.sort,
          }),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_update",
    domain: "inventory",
    operation: "write",
    description: "Update a purchase order",
    schema: purchaseOrderUpdateSchema.shape,
    handler: async (params) => {
      const parsed = purchaseOrderUpdateSchema.parse(params);
      const { id, ...payload } = parsed;

      try {
        const data = await client.patch(
          `/tenant/{tenant}/purchase-orders/${id}`,
          buildParams(payload),
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_cancel",
    domain: "inventory",
    operation: "write",
    description: "Cancel a purchase order",
    schema: purchaseOrderIdSchema.shape,
    handler: async (params) => {
      const { id } = purchaseOrderIdSchema.parse(params);

      try {
        const data = await client.patch(`/tenant/{tenant}/purchase-orders/${id}/cancellation`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_approve_request",
    domain: "inventory",
    operation: "write",
    description: "Approve a purchase order request",
    schema: purchaseOrderRequestActionSchema.shape,
    handler: async (params) => {
      const { id } = purchaseOrderRequestActionSchema.parse(params);

      try {
        const data = await client.patch(
          `/tenant/{tenant}/purchase-orders/requests/${id}/approve`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_reject_request",
    domain: "inventory",
    operation: "write",
    description: "Reject a purchase order request",
    schema: purchaseOrderRequestActionSchema.shape,
    handler: async (params) => {
      const { id } = purchaseOrderRequestActionSchema.parse(params);

      try {
        const data = await client.patch(
          `/tenant/{tenant}/purchase-orders/requests/${id}/reject`,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(getErrorMessage(error));
      }
    },
  });
}
