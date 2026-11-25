import { ExperimentalWritesDisabledError } from "./config.js";
import { ToolSelectionError } from "./tool-catalog.js";

export function startupErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ExperimentalWritesDisabledError || error instanceof ToolSelectionError) {
    return error.message;
  }
  return fallback;
}
