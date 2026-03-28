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
    } catch {
      logger.debug("No index.js in domain directory", { domain: dirName });
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
