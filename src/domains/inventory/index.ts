import type { DomainLoader } from "../../registry.js";

import { registerPurchaseOrderMarkupTools } from "./purchase-order-markups.js";
import { registerPurchaseOrderTools } from "./purchase-orders.js";
import { registerPurchaseOrderTypeTools } from "./purchase-order-types.js";
import { registerVendorTools } from "./vendors.js";

export const loadInventoryDomain: DomainLoader = (client, registry) => {
  registerPurchaseOrderTools(client, registry);
  registerPurchaseOrderTypeTools(client, registry);
  registerPurchaseOrderMarkupTools(client, registry);
  registerVendorTools(client, registry);
};
export default loadInventoryDomain;
