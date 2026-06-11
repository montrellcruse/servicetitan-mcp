import type { DomainLoader } from "../../registry.js";

import { registerEstimateTools } from "./estimates.js";
import { registerEstimateItemTools } from "./items.js";
import {
  registerEstimateTemplateTools,
  registerProposalTemplateTools,
  registerProposalTypeTools,
} from "./templates.js";

export const loadEstimatesDomain: DomainLoader = (client, registry) => {
  registerEstimateTools(client, registry);
  registerEstimateItemTools(client, registry);
  registerEstimateTemplateTools(client, registry);
  registerProposalTemplateTools(client, registry);
  registerProposalTypeTools(client, registry);
};
export default loadEstimatesDomain;
