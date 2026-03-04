import type { DomainLoader } from "../../registry.js";

import { registerMarketingCallTools } from "./calls.js";
import { registerMarketingCampaignTools } from "./campaigns.js";

export const loadMarketingDomain: DomainLoader = (client, registry) => {
  registerMarketingCampaignTools(client, registry);
  registerMarketingCallTools(client, registry);
};

export default loadMarketingDomain;
