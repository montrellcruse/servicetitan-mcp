import type { DomainLoader } from "../../registry.js";

import { registerExportTools } from "./exporters.js";

export const loadExportDomain: DomainLoader = (client, registry) => {
  registerExportTools(client, registry);
};

export default loadExportDomain;
