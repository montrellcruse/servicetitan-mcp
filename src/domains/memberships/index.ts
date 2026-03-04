import type { DomainLoader } from "../../registry.js";

import { registerMembershipTools } from "./memberships.js";
import { registerRecurringServiceTools } from "./recurring-services.js";
import { registerServiceAgreementTools } from "./service-agreements.js";
import { registerMembershipTypeTools } from "./types.js";

export const loadMembershipsDomain: DomainLoader = (client, registry) => {
  registerMembershipTools(client, registry);
  registerMembershipTypeTools(client, registry);
  registerRecurringServiceTools(client, registry);
  registerServiceAgreementTools(client, registry);
};
export default loadMembershipsDomain;
