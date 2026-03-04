import type { DomainLoader } from "../../registry.js";

import { registerActivityTools } from "./activities.js";
import { registerBusinessUnitTools } from "./business-units.js";
import { registerTagTypeTools } from "./tag-types.js";
import { registerTaskTools } from "./tasks.js";
import { registerUserRoleTools } from "./user-roles.js";

export const loadSettingsDomain: DomainLoader = (client, registry) => {
  registerBusinessUnitTools(client, registry);
  registerTagTypeTools(client, registry);
  registerActivityTools(client, registry);
  registerTaskTools(client, registry);
  registerUserRoleTools(client, registry);
};

export default loadSettingsDomain;
