import type { DomainLoader } from "../../registry.js";

import { registerEstimateTools } from "./estimates.js";
import { registerEstimateItemTools } from "./items.js";

export const loadEstimatesDomain: DomainLoader = (client, registry) => {
  registerEstimateTools(client, registry);
  registerEstimateItemTools(client, registry);
};
export default loadEstimatesDomain;
