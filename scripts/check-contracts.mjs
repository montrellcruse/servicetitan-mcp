#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const archive = path.join(root, "docs/contracts/official-openapi-2026-09-04.tar.gz");
const names = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n").filter((name) => name.endsWith(".json"));
const operations = [];
let requestBodies = 0;
for (const name of names) {
  const spec = JSON.parse(execFileSync("tar", ["-xOzf", archive, name], { encoding: "utf8", maxBuffer: 20_000_000 }));
  for (const [apiPath, item] of Object.entries(spec.paths ?? {})) for (const method of ["get", "post", "put", "patch", "delete"]) if (item[method]) {
    operations.push({ method, path: apiPath });
    if (Object.keys(item[method].requestBody?.content ?? {}).length) requestBodies += 1;
  }
}
const unsupportedSource = fs.readFileSync(path.join(root, "src/contracts/unsupported-tools.ts"), "utf8");
const archiveSha256 = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
for (const generated of ["official-operations.generated.ts", "official-routes.generated.ts"]) {
  const source = fs.readFileSync(path.join(root, "src/contracts", generated), "utf8");
  if (!source.includes(`Archive SHA-256: ${archiveSha256}`)) {
    console.error(`${generated} is stale; run npm run contracts:generate`);
    process.exit(1);
  }
}
const unsupported = new Set([...unsupportedSource.matchAll(/^\s{2}([a-z][a-z0-9_]+):\s*\{/gm)].map((match) => match[1]));
const normalize = (value) => value.replace(/\$\{[^}]+\}/g, "{x}").replace(/\{[^}]+\}/g, "{x}").replace(/^\/[a-z-]+\/v\d+(?=\/tenant\/)/, "").replace(/^\/v\d+(?=\/tenant\/)/, "");
function matchesTemplate(template, candidate) {
  const normalized = normalize(template);
  const expression = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\{x\\}", "[^/]+");
  return new RegExp(`^${expression}$`).test(normalize(candidate));
}
const records = [];
const domains = path.join(root, "src/domains");
for (const directory of fs.readdirSync(domains)) {
  const dir = path.join(domains, directory); if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    const calls = /client\.(get|post|put|patch|delete|deleteWithBody)\s*\(\s*([`'"])(.*?)\2/gs; let call;
    while ((call = calls.exec(source))) {
      const before = source.slice(0, call.index); const toolNames = [...before.matchAll(/name:\s*"([^"]+)"/g)];
      records.push({ tool: toolNames.at(-1)?.[1], method: call[1] === "deleteWithBody" ? "delete" : call[1], path: call[3], file: path.relative(root, path.join(dir, file)) });
    }
  }
}
// Expand the two intentional dynamic factories.
const attribution = fs.readFileSync(path.join(domains, "marketing/attributions.ts"), "utf8");
for (const match of attribution.matchAll(/name:\s*"(marketing_[^"]+_create)"[\s\S]*?path:\s*"([^"]+)"/g)) records.push({ tool: match[1], method: "post", path: match[2], file: "src/domains/marketing/attributions.ts" });
const exporters = fs.readFileSync(path.join(domains, "export/exporters.ts"), "utf8");
for (const match of exporters.matchAll(/registerExportTool\([^\n]+?"(export_[^"]+)"\s*,\s*"[^"]+"\s*,\s*"([^"]+)"/g)) records.push({ tool: match[1], method: "get", path: match[2], file: "src/domains/export/exporters.ts" });

const failures = [];
for (const record of records) {
  const exists = operations.some((operation) => operation.method === record.method && matchesTemplate(operation.path, record.path));
  if (!exists && !unsupported.has(record.tool)) failures.push({ ...record, error: "supported tool has no official operation" });
  if (exists && unsupported.has(record.tool)) failures.push({ ...record, error: "unsupported exclusion is stale because an official operation now exists" });
}
for (const tool of unsupported) if (!records.some((record) => record.tool === tool)) failures.push({ tool, error: "unsupported tool is not present in source inventory" });
if (unsupported.size !== 27) failures.push({ error: `expected 27 unsupported tools, found ${unsupported.size}` });
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exit(1); }
console.log(JSON.stringify({ officialOperations: operations.length, officialRequestBodies: requestBodies, handlerOperations: records.length, unsupportedTools: unsupported.size, status: "ok" }));
