import type { DomainLoader } from "../../registry.js";

import { registerBulkTools } from "./bulk.js";
import { registerCategoryTools } from "./categories.js";
import { registerDiscountAndFeeTools } from "./discounts-fees.js";
import { registerEquipmentTools } from "./equipment.js";
import { registerMaterialTools } from "./materials.js";
import { registerServiceTools } from "./services.js";

export const loadPricebookDomain: DomainLoader = (client, registry) => {
  registerCategoryTools(client, registry);
  registerDiscountAndFeeTools(client, registry);
  registerEquipmentTools(client, registry);
  registerMaterialTools(client, registry);
  registerServiceTools(client, registry);
  registerBulkTools(client, registry);
};
export default loadPricebookDomain;
