import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { Logger } from "../logger.js";
import { type DomainLoader, type ToolRegistry } from "../registry.js";

export async function loadDomainModules(
  registry: ToolRegistry,
  logger: Logger,
): Promise<void> {
  const domainsDirectory = fileURLToPath(new URL(".", import.meta.url));
  const entries = await readdir(domainsDirectory, { withFileTypes: true });
  const domainDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const dirName of domainDirs) {
    const fileUrl = new URL(`./${dirName}/index.js`, import.meta.url).href;

    let module: { default?: DomainLoader; loadDomain?: DomainLoader };
    try {
      module = (await import(fileUrl)) as typeof module;
    } catch (error: unknown) {
      // Distinguish "index.js doesn't exist" (expected) from real import errors (bugs).
      // ERR_MODULE_NOT_FOUND can mean either:
      //   1. The domain's index.js doesn't exist (expected, skip silently)
      //   2. index.js exists but one of ITS imports is broken (bug, must surface)
      // We differentiate by checking if the error message references our exact file URL.
      const isModuleNotFound =
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND";
      const isDirectMissing =
        isModuleNotFound &&
        error instanceof Error &&
        error.message.includes(`./${dirName}/index.js`);
      if (isDirectMissing) {
        logger.debug("No index.js in domain directory", { domain: dirName });
      } else {
        logger.error("Failed to load domain module", {
          domain: dirName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    const loader = module.default ?? module.loadDomain;
    if (!loader) {
      logger.warn("Domain module missing loader export", { domain: dirName });
      continue;
    }

    registry.registerDomain(dirName, loader);
  }
}
