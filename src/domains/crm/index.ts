import type { DomainLoader } from "../../registry.js";

import { registerBookingProviderTagTools } from "./booking-provider-tags.js";
import { registerBookingTools } from "./bookings.js";
import { registerBulkTagTools } from "./bulk-tags.js";
import { registerContactMethodTools } from "./contact-methods.js";
import { registerContactTools } from "./contacts.js";
import { registerCustomerMembershipTools } from "./customer-memberships.js";
import { registerCustomerTools } from "./customers.js";
import { registerLeadTools } from "./leads.js";
import { registerLocationRecurringTools } from "./location-recurring.js";
import { registerLocationTools } from "./locations.js";

export const loadCrmDomain: DomainLoader = (client, registry) => {
  registerBookingTools(client, registry);
  registerBookingProviderTagTools(client, registry);
  registerBulkTagTools(client, registry);
  registerContactMethodTools(client, registry);
  registerContactTools(client, registry);
  registerCustomerMembershipTools(client, registry);
  registerCustomerTools(client, registry);
  registerLeadTools(client, registry);
  registerLocationRecurringTools(client, registry);
  registerLocationTools(client, registry);
};

export default loadCrmDomain;
