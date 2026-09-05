import { OFFICIAL_OPERATIONS } from "./official-operations.generated.js";
import type { OfficialOperationContract } from "./types.js";

function operationRegex(fullPath: string): RegExp {
  const escaped = fullPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\{[^}]+\\\}/g, "[^/]+")}$`);
}

const CONTRACT_INDEX = OFFICIAL_OPERATIONS.map((contract) => ({
  contract,
  regex: operationRegex(contract.fullPath),
}));

/** Look up authoritative scope, parameter, request, and response semantics for a resolved API call. */
export function findOfficialOperation(
  method: string,
  resolvedFullPath: string,
): OfficialOperationContract | undefined {
  const normalizedMethod = method.toUpperCase();
  return CONTRACT_INDEX.find(({ contract, regex }) =>
    contract.method === normalizedMethod && regex.test(resolvedFullPath)
  )?.contract;
}
