import type { DomainLoader } from "../../registry.js";

import { registerDynamicValueSetTools } from "./dynamic-value-sets.js";
import { registerReportCategoryTools } from "./report-categories.js";
import { registerReportTools } from "./reports.js";

export const loadReportingDomain: DomainLoader = (client, registry) => {
  registerDynamicValueSetTools(client, registry);
  registerReportCategoryTools(client, registry);
  registerReportTools(client, registry);
};
export default loadReportingDomain;
