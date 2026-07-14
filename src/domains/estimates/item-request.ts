import { z } from "zod";

import { buildParams } from "../../utils.js";

export const estimateItemRequestSchema = z.object({
  id: z.number().int().optional().describe("Existing estimate item ID"),
  skuId: z.number().int().optional().describe("Pricebook SKU ID for the estimate item"),
  skuName: z.string().optional().describe("Pricebook SKU display name"),
  parentItemId: z.number().int().optional().describe("Parent estimate item ID"),
  description: z.string().optional().describe("Description of the estimate item"),
  isAddOn: z.boolean().optional().describe("Whether this item is an add-on"),
  quantity: z.number().optional().describe("Quantity for this estimate item"),
  unitPrice: z.number().optional().describe("Unit sale price for this estimate item"),
  unitCost: z.number().optional().describe("Unit cost for this estimate item"),
  skipUpdatingMembershipPrices: z
    .boolean()
    .optional()
    .describe("Skip updating membership prices from this item"),
  itemGroupName: z.string().optional().describe("Item group display name"),
  itemGroupRootId: z
    .number()
    .int()
    .optional()
    .describe("Item group root ID for categorization"),
  chargeable: z.boolean().optional().describe("Whether this estimate item is chargeable"),
  useDefaultProjectLabels: z
    .boolean()
    .optional()
    .describe("Use default project labels for this item"),
  budgetCodeId: z.number().int().optional().describe("Budget code ID for this item"),
  membershipDurationBillingId: z
    .number()
    .int()
    .optional()
    .describe("Membership duration/billing option ID"),
  qty: z
    .number()
    .optional()
    .describe("Legacy alias for quantity. Prefer quantity."),
  unitRate: z
    .number()
    .optional()
    .describe("Legacy alias for unitPrice. Prefer unitPrice."),
});

export type EstimateItemRequestInput = z.infer<typeof estimateItemRequestSchema>;

export function normalizeEstimateItemRequest(
  item: EstimateItemRequestInput,
): Record<string, unknown> {
  const { qty, unitRate, quantity, unitPrice, ...rest } = item;

  return buildParams({
    ...rest,
    quantity: quantity ?? qty,
    unitPrice: unitPrice ?? unitRate,
  });
}
