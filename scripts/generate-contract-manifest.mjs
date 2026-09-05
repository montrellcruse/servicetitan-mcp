#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const repo = resolve(new URL("..", import.meta.url).pathname);
const archive = join(repo, "docs/contracts/official-openapi-2026-09-04.tar.gz");
const output = join(repo, "src/contracts/official-operations.generated.ts");
const routeOutput = join(repo, "src/contracts/official-routes.generated.ts");
const sourceDirectory = process.argv[2];

function readDocuments() {
  if (sourceDirectory) {
    return readdirSync(sourceDirectory)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => [name, JSON.parse(readFileSync(join(sourceDirectory, name), "utf8"))]);
  }
  const names = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .trim().split("\n").filter((name) => name.endsWith(".json")).sort();
  return names.map((name) => [basename(name), JSON.parse(execFileSync("tar", ["-xOzf", archive, name], { encoding: "utf8", maxBuffer: 20_000_000 }))]);
}

function dereference(schema, components) {
  if (!schema || typeof schema !== "object") return schema ?? null;
  if (typeof schema.$ref === "string") {
    const name = schema.$ref.replace("#/components/schemas/", "");
    if (!components[name]) throw new Error(`Unresolved OpenAPI schema reference: ${schema.$ref}`);
    return { ref: name, schema: expandSchema(components[name], components, new Set([name])) };
  }
  return expandSchema(schema, components, new Set());
}

function expandSchema(value, components, seen) {
  if (Array.isArray(value)) return value.map((item) => expandSchema(item, components, seen));
  if (!value || typeof value !== "object") return value;
  if (typeof value.$ref === "string") {
    const name = value.$ref.replace("#/components/schemas/", "");
    if (!components[name]) throw new Error(`Unresolved OpenAPI schema reference: ${value.$ref}`);
    if (seen.has(name)) return { $ref: value.$ref };
    const nextSeen = new Set(seen); nextSeen.add(name);
    return expandSchema(components[name], components, nextSeen);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandSchema(item, components, seen)]));
}

function contentContracts(content, components) {
  return Object.entries(content ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([mediaType, value]) => ({
    mediaType,
    schema: dereference(value.schema, components),
  }));
}

const operations = [];
for (const [document, spec] of readDocuments()) {
  const serverPath = new URL(spec.servers[0].url).pathname.replace(/\/$/, "");
  const components = spec.components?.schemas ?? {};
  for (const apiPath of Object.keys(spec.paths).sort()) {
    const pathItem = spec.paths[apiPath];
    for (const method of ["delete", "get", "patch", "post", "put"]) {
      const operation = pathItem[method];
      if (!operation) continue;
      const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
      const success = Object.entries(operation.responses ?? {}).find(([status]) => /^2/.test(status));
      operations.push({
        id: operation.operationId,
        document,
        method: method.toUpperCase(),
        moduleBasePath: serverPath,
        path: apiPath,
        fullPath: `${serverPath}${apiPath}`,
        scopes: [...new Set((operation.security ?? []).flatMap((entry) => entry.oauth ?? []))].sort(),
        parameters: parameters.map((parameter) => ({
          name: parameter.name,
          in: parameter.in,
          required: parameter.required === true,
          description: parameter.description ?? null,
          schema: dereference(parameter.schema, components),
        })),
        request: contentContracts(operation.requestBody?.content, components),
        successStatus: success?.[0] ?? null,
        response: contentContracts(success?.[1]?.content, components),
      });
    }
  }
}
operations.sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method) || a.document.localeCompare(b.document));
const hasReference = (value) => value && typeof value === "object" && (typeof value.$ref === "string" || Object.values(value).some(hasReference));
const unresolvedRequestRefs = operations.flatMap((operation) => operation.request.filter(({ schema }) => hasReference(schema)).map(() => operation.id));
if (unresolvedRequestRefs.length) throw new Error(`Request schemas contain unresolved references: ${unresolvedRequestRefs.join(", ")}`);

const archiveSha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
const header = `// Generated from docs/contracts/official-openapi-2026-09-04.tar.gz.\n// Archive SHA-256: ${archiveSha256}\n// Run: node scripts/generate-contract-manifest.mjs\nimport type { OfficialOperationContract } from "./types.js";\n\n`;
mkdirSync(join(repo, "src/contracts"), { recursive: true });
writeFileSync(output, `${header}export const OFFICIAL_OPERATIONS: readonly OfficialOperationContract[] = Object.freeze(${JSON.stringify(operations, null, 2)});\n`);
const routes = [...new Map(operations.map(({ document, moduleBasePath, path }) => [`${moduleBasePath}\u0000${path}`, { document, moduleBasePath, path }])).values()]
  .sort((a, b) => b.path.length - a.path.length || a.moduleBasePath.localeCompare(b.moduleBasePath));
writeFileSync(routeOutput, `// Generated from the pinned official OpenAPI archive.\n// Archive SHA-256: ${archiveSha256}\nexport const OFFICIAL_ROUTES = ${JSON.stringify(routes, null, 2)} as const;\n`);
console.log(`Generated ${operations.length} official operations and ${routes.length} routes`);
