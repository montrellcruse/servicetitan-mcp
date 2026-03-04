import type { DomainLoader } from "../../registry.js";

import { registerPurchaseOrderMarkupTools } from "./purchase-order-markups.js";
import { registerPurchaseOrderTools } from "./purchase-orders.js";
import { registerPurchaseOrderTypeTools } from "./purchase-order-types.js";
import { registerReceiptTools } from "./receipts.js";
import { registerReturnTools } from "./returns.js";
import { registerTransferTools } from "./transfers.js";
import { registerVendorTools } from "./vendors.js";
import { registerWarehouseTools } from "./warehouses.js";

export const loadInventoryDomain: DomainLoader = (client, registry) => {
  registerPurchaseOrderTools(client, registry);
  registerPurchaseOrderTypeTools(client, registry);
  registerPurchaseOrderMarkupTools(client, registry);
  registerReturnTools(client, registry);
  registerTransferTools(client, registry);
  registerVendorTools(client, registry);
  registerWarehouseTools(client, registry);
  registerReceiptTools(client, registry);
};
export default loadInventoryDomain;
