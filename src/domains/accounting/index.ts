import type { DomainLoader } from "../../registry.js";

import { registerApCreditTools } from "./ap-credits.js";
import { registerApPaymentTools } from "./ap-payments.js";
import { registerGlAccountTools } from "./gl-accounts.js";
import { registerInvoiceTools } from "./invoices.js";
import { registerJournalEntryTools } from "./journal-entries.js";
import { registerPaymentTermTools } from "./payment-terms.js";
import { registerPaymentTypeTools } from "./payment-types.js";
import { registerPaymentTools } from "./payments.js";
import { registerTaxZoneTools } from "./tax-zones.js";

export const loadAccountingDomain: DomainLoader = (client, registry) => {
  registerApCreditTools(client, registry);
  registerApPaymentTools(client, registry);
  registerGlAccountTools(client, registry);
  registerInvoiceTools(client, registry);
  registerJournalEntryTools(client, registry);
  registerPaymentTools(client, registry);
  registerPaymentTypeTools(client, registry);
  registerPaymentTermTools(client, registry);
  registerTaxZoneTools(client, registry);
};

export default loadAccountingDomain;
