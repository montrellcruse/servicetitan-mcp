import type { DomainLoader } from "../../registry.js";

import { registerMarketingAttributionTools } from "./attributions.js";
import { registerMarketingCallTools } from "./calls.js";
import { registerMarketingCampaignCostTools } from "./campaign-costs.js";
import { registerMarketingCampaignTools } from "./campaigns.js";
import { registerMarketingOptInOutTools } from "./opt-in-out.js";
import { registerMarketingSuppressionTools } from "./suppressions.js";

export const loadMarketingDomain: DomainLoader = (client, registry) => {
  registerMarketingAttributionTools(client, registry);
  registerMarketingCampaignCostTools(client, registry);
  registerMarketingCampaignTools(client, registry);
  registerMarketingCallTools(client, registry);
  registerMarketingOptInOutTools(client, registry);
  registerMarketingSuppressionTools(client, registry);
};

export default loadMarketingDomain;
