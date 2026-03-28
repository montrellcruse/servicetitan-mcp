import { z } from "zod";

export const externalDataEntrySchema = z.object({
  key: z.string().describe("External data key"),
  value: z.string().describe("External data value"),
});

export const assetSchema = z.object({
  alias: z.string().optional().describe("Asset alias"),
  fileName: z.string().optional().describe("Asset file name"),
  isDefault: z.boolean().optional().describe("Whether the asset is default"),
  type: z.string().optional().describe("Asset type"),
  url: z.string().optional().describe("Asset URL"),
});

export const categoryPayloadSchema = z.object({
  name: z.string().describe("Category name"),
  categoryType: z
    .enum(["Services", "Materials"])
    .describe("Category type for the pricebook item"),
  active: z.boolean().optional().describe("Whether the category is active"),
});

export const discountAndFeePayloadSchema = z.object({
  type: z.string().optional().describe("Discount or fee type"),
  code: z.string().describe("Discount or fee code"),
  displayName: z.string().describe("Discount or fee display name"),
  description: z.string().optional().describe("Discount or fee description"),
  amountType: z.string().optional().describe("Discount or fee amount type"),
  amount: z.number().describe("Discount or fee amount"),
  limit: z.number().optional().describe("Discount or fee limit"),
  taxable: z.boolean().optional().describe("Whether the discount or fee is taxable"),
  categories: z
    .array(z.number().int().describe("Category ID"))
    .optional()
    .describe("Category IDs attached to this discount or fee"),
  hours: z.number().optional().describe("Labor hours for the discount or fee"),
  assets: z
    .array(assetSchema.describe("Discount or fee asset"))
    .optional()
    .describe("Assets attached to this discount or fee"),
  account: z.string().optional().describe("Accounting account"),
  crossSaleGroup: z.string().optional().describe("Cross-sale group"),
  active: z.boolean().optional().describe("Whether the discount or fee is active"),
  bonus: z.number().optional().describe("Bonus amount"),
  commissionBonus: z.number().optional().describe("Commission bonus amount"),
  paysCommission: z.boolean().optional().describe("Whether this item pays commission"),
  excludeFromPayroll: z
    .boolean()
    .optional()
    .describe("Whether this item is excluded from payroll"),
  externalData: z
    .array(externalDataEntrySchema.describe("External data entry"))
    .optional()
    .describe("External data entries"),
});

const vendorSubAccountSchema = z.object({
  cost: z.number().optional().describe("Vendor subaccount cost"),
  accountName: z.string().optional().describe("Vendor subaccount name"),
});

const vendorSchema = z.object({
  vendorName: z.string().optional().describe("Vendor name"),
  vendorId: z.number().int().optional().describe("Vendor ID"),
  memo: z.string().optional().describe("Vendor memo"),
  vendorPart: z.string().optional().describe("Vendor part number"),
  cost: z.number().optional().describe("Vendor cost"),
  active: z.boolean().optional().describe("Whether the vendor link is active"),
  primarySubAccount: vendorSubAccountSchema
    .optional()
    .describe("Primary vendor subaccount"),
  otherSubAccounts: z
    .array(vendorSubAccountSchema.describe("Additional vendor subaccount"))
    .optional()
    .describe("Additional vendor subaccounts"),
});

export const equipmentPayloadSchema = z.object({
  code: z.string().optional().describe("Equipment code"),
  displayName: z.string().optional().describe("Equipment display name"),
  description: z.string().optional().describe("Equipment description"),
  cost: z.number().optional().describe("Equipment cost"),
  active: z.boolean().optional().describe("Whether equipment is active"),
  price: z.number().optional().describe("Equipment price"),
  memberPrice: z.number().optional().describe("Equipment member price"),
  addOnPrice: z.number().optional().describe("Equipment add-on price"),
  addOnMemberPrice: z.number().optional().describe("Equipment add-on member price"),
  hours: z.number().optional().describe("Labor hours for the equipment"),
  bonus: z.number().optional().describe("Bonus amount"),
  commissionBonus: z.number().optional().describe("Commission bonus amount"),
  paysCommission: z.boolean().optional().describe("Whether the equipment pays commission"),
  account: z.string().optional().describe("Accounting account"),
  taxable: z.boolean().optional().describe("Whether equipment is taxable"),
  primaryVendor: vendorSchema.optional().describe("Primary vendor"),
  otherVendors: z
    .array(vendorSchema.describe("Additional vendor"))
    .optional()
    .describe("Additional vendors"),
  categories: z
    .array(z.number().int().describe("Category ID"))
    .optional()
    .describe("Category IDs"),
  assets: z
    .array(assetSchema.describe("Equipment asset"))
    .optional()
    .describe("Equipment assets"),
  source: z.string().optional().describe("Equipment source"),
  externalId: z.string().optional().describe("External equipment ID"),
  externalData: z
    .array(externalDataEntrySchema.describe("External data entry"))
    .optional()
    .describe("External data entries"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
});

export const serviceCreateInputSchema = z.object({
  code: z.string().describe("Service code"),
  displayName: z.string().describe("Service display name"),
  description: z.string().optional().describe("Service description"),
  warrantyDuration: z.number().int().optional().describe("Warranty duration"),
  warrantyDescription: z.string().optional().describe("Warranty description"),
  categoryIds: z
    .array(z.number().int().describe("Category ID"))
    .optional()
    .describe("Category IDs"),
  price: z.number().optional().describe("Service price"),
  memberPrice: z.number().optional().describe("Service member price"),
  addOnPrice: z.number().optional().describe("Service add-on price"),
  addOnMemberPrice: z.number().optional().describe("Service add-on member price"),
  taxable: z.boolean().optional().describe("Whether the service is taxable"),
  account: z.string().optional().describe("Accounting account"),
  hours: z.number().optional().describe("Labor hours"),
  isLabor: z.boolean().optional().describe("Whether this is a labor service"),
  recommendationIds: z
    .array(z.number().int().describe("Recommendation ID"))
    .optional()
    .describe("Recommendation IDs"),
  upgradeIds: z
    .array(z.number().int().describe("Upgrade ID"))
    .optional()
    .describe("Upgrade IDs"),
  active: z.boolean().optional().describe("Whether the service is active"),
  crossSaleGroup: z.string().optional().describe("Cross-sale group"),
  paysCommission: z.boolean().optional().describe("Whether the service pays commission"),
  bonus: z.number().optional().describe("Bonus amount"),
  commissionBonus: z.number().optional().describe("Commission bonus amount"),
  source: z.string().optional().describe("Service source"),
  externalId: z.string().optional().describe("External service ID"),
  externalData: z
    .array(externalDataEntrySchema.describe("External data entry"))
    .optional()
    .describe("External data entries"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  cost: z.number().optional().describe("Service cost"),
  soldByCommission: z.number().optional().describe("Sales commission percentage"),
});

export const serviceUpdateInputSchema = serviceCreateInputSchema
  .partial()
  .describe("Service update payload");

export const materialCreateInputSchema = z.object({
  code: z.string().describe("Material code"),
  displayName: z.string().describe("Material display name"),
  description: z.string().optional().describe("Material description"),
  cost: z.number().optional().describe("Material cost"),
  active: z.boolean().optional().describe("Whether the material is active"),
  price: z.number().optional().describe("Material price"),
  memberPrice: z.number().optional().describe("Material member price"),
  addOnPrice: z.number().optional().describe("Material add-on price"),
  addOnMemberPrice: z.number().optional().describe("Material add-on member price"),
  hours: z.number().optional().describe("Labor hours"),
  taxable: z.boolean().optional().describe("Whether the material is taxable"),
  categories: z
    .array(z.number().int().describe("Category ID"))
    .optional()
    .describe("Category IDs"),
  assets: z
    .array(assetSchema.describe("Material asset"))
    .optional()
    .describe("Material assets"),
  source: z.string().optional().describe("Material source"),
  externalId: z.string().optional().describe("External material ID"),
  externalData: z
    .array(externalDataEntrySchema.describe("External data entry"))
    .optional()
    .describe("External data entries"),
  businessUnitId: z.number().int().optional().describe("Business unit ID"),
  isOtherDirectCost: z.boolean().optional().describe("Whether material is an other direct cost"),
  costTypeId: z.number().int().optional().describe("Cost type ID"),
});

export const materialUpdateInputSchema = materialCreateInputSchema
  .extend({
    bonus: z.number().optional().describe("Bonus amount"),
    commissionBonus: z.number().optional().describe("Commission bonus amount"),
    paysCommission: z.boolean().optional().describe("Whether material pays commission"),
    deductAsJobCost: z.boolean().optional().describe("Whether to deduct as job cost"),
    unitOfMeasure: z.string().optional().describe("Unit of measure"),
    isInventory: z.boolean().optional().describe("Whether material is inventory"),
    account: z.string().optional().describe("Accounting account"),
    costOfSaleAccount: z.string().optional().describe("Cost of sale account"),
    assetAccount: z.string().optional().describe("Asset account"),
    primaryVendor: vendorSchema.optional().describe("Primary vendor"),
    otherVendors: z
      .array(vendorSchema.describe("Additional vendor"))
      .optional()
      .describe("Additional vendors"),
    isConfigurableMaterial: z
      .boolean()
      .optional()
      .describe("Whether material is configurable"),
    chargeableByDefault: z
      .boolean()
      .optional()
      .describe("Whether material is chargeable by default"),
    variationsOrConfigurableMaterials: z
      .array(z.number().int().describe("Variation material ID"))
      .optional()
      .describe("Variation or configurable material IDs"),
    generalLedgerAccountId: z
      .number()
      .int()
      .optional()
      .describe("General ledger account ID"),
    displayInAmount: z
      .boolean()
      .optional()
      .describe("Whether the material displays in amount mode"),
  })
  .describe("Material update payload");

export const pricebookBulkOperationSchema = z.object({
  operation: z
    .enum(["create", "update", "delete"])
    .describe("Bulk operation type"),
  entityType: z
    .enum(["services", "materials", "equipment", "categories", "discounts-and-fees"])
    .describe("Pricebook entity type"),
  id: z.number().int().optional().describe("Entity ID for update/delete operations"),
  externalId: z.string().optional().describe("External identifier for the entity"),
  service: serviceUpdateInputSchema.optional().describe("Service payload"),
  material: materialUpdateInputSchema.optional().describe("Material payload"),
  equipment: equipmentPayloadSchema.optional().describe("Equipment payload"),
  category: categoryPayloadSchema.partial().optional().describe("Category payload"),
  discountAndFee: discountAndFeePayloadSchema
    .partial()
    .optional()
    .describe("Discount and fee payload"),
});

export const pricebookBulkPayloadSchema = z.object({
  operations: z
    .array(pricebookBulkOperationSchema.describe("Bulk operation"))
    .min(1)
    .describe("Bulk operations to process"),
});
