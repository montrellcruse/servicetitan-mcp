import { z } from "zod";

import type { ServiceTitanClient } from "../../client.js";
import type { ToolRegistry } from "../../registry.js";
import { officialRequestSchema } from "../../contracts/index.js";
import {
  buildParams,
  dateFilterParams,
  paginationParams,
  sortParam,
  toolError,
  toolResult,
} from "../../utils.js";
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

const purchaseOrderPayloadSchema = officialRequestSchema("PurchaseOrders_Create") as z.AnyZodObject;

const purchaseOrderIdSchema = z.object({
  id: z.number().int().describe("Purchase order ID"),
});

const purchaseOrderUpdateSchema = (officialRequestSchema("PurchaseOrders_Update") as z.AnyZodObject).extend({
  id: z.number().int().describe("Purchase order ID"),
});

const purchaseOrderCancelSchema = (officialRequestSchema("PurchaseOrders_Cancel") as z.AnyZodObject).extend({
  id: z.number().int().describe("Purchase order ID"),
});
const purchaseOrderRejectSchema = (officialRequestSchema("PurchaseOrders_RejectRequest") as z.AnyZodObject).extend({
  id: z.number().int().describe("Purchase order request ID"),
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
          parsed,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_get",
    domain: "inventory",
    operation: "read",
    description: "Retrieve a purchase order by its ServiceTitan ID. Returns the single upstream record without pagination; use inventory_purchase_orders_list to search when the ID is unknown.",
    schema: purchaseOrderIdSchema.shape,
    handler: async (params) => {
      const { id } = purchaseOrderIdSchema.parse(params);

      try {
        const data = await client.get(`/tenant/{tenant}/purchase-orders/${id}`);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_list",
    domain: "inventory",
    operation: "read",
    description: "List one requested page of issued purchase orders using IDs, number, status, technician, job, project, and order or sent-date filters. Use inventory_purchase_orders_get for one known order and inventory_purchase_orders_requests_list for requests that precede issued orders.",
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_requests_list",
    domain: "inventory",
    operation: "read",
    description: "Search purchase-order requests with the exposed identifiers, status, date, technician, job, and paging filters. These are requests that may precede a purchase order; use inventory_purchase_orders_list for issued purchase orders.",
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
        return toolError(error);
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
          payload,
        );

        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_cancel",
    domain: "inventory",
    operation: "write",
    description: "Cancel a purchase order",
    schema: purchaseOrderCancelSchema.shape,
    handler: async (params) => {
      const { id, ...payload } = purchaseOrderCancelSchema.parse(params);

      try {
        const data = await client.patch(`/tenant/{tenant}/purchase-orders/${id}/cancellation`, payload);
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
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
        return toolError(error);
      }
    },
  });

  registry.register({
    name: "inventory_purchase_orders_reject_request",
    domain: "inventory",
    operation: "write",
    description: "Reject a purchase order request",
    schema: purchaseOrderRejectSchema.shape,
    handler: async (params) => {
      const { id, ...payload } = purchaseOrderRejectSchema.parse(params);

      try {
        const data = await client.patch(
          `/tenant/{tenant}/purchase-orders/requests/${id}/reject`,
          payload,
        );
        return toolResult(data);
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  });
}
