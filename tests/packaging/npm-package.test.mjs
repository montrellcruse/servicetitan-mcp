import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const publicDocumentation = [
  "README.md", "CHANGELOG.md", "TOOLS.md", "CONTRIBUTING.md",
  "docs/MIGRATION-v3.md", "docs/contracts/README.md", "docs/BENCHMARKS.md",
  "docs/releases/VALIDATION-v3.md", "docs/releases/v3-acceptance.json", "benchmarks/README.md", "docs/evaluation/README.md",
];

async function put(root, path, contents = "fixture\n") {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
}

test("npm package includes public runtime files and excludes private evidence", async t => {
  const temporary = await mkdtemp(join(tmpdir(), "servicetitan-packlist-"));
  const environment = Object.fromEntries(["PATH", "HOME", "SystemRoot", "WINDIR", "TMPDIR", "TEMP", "TMP", "LANG"]
    .filter(key => typeof process.env[key] === "string").map(key => [key, process.env[key]]));
  try {
    let command = "npm";
    let prefix = [];
    if (process.env.npm_execpath) {
      try {
        await access(process.env.npm_execpath);
        command = process.execPath;
        prefix = [process.env.npm_execpath];
      } catch { /* Fall back to npm on PATH. */ }
    }
    try {
      await execute(command, [...prefix, "--version"], { timeout: 5_000, env: environment });
    } catch (error) {
      if (error?.code === "ENOENT") return t.skip("npm CLI is unavailable");
      throw error;
    }

    const original = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
    const metadata = Object.fromEntries([
      "name", "version", "description", "license", "type", "main", "bin", "files", "types", "exports",
    ].filter(key => original[key] !== undefined).map(key => [key, original[key]]));
    await put(temporary, "package.json", `${JSON.stringify(metadata, null, 2)}\n`);

    for (const file of [
      "build/server.js", "build/index.js", "build/sse.js", "build/streamable-http.js",
      "build/readiness-cli.js", "build/types/server.d.ts", "LICENSE", ".env.example",
    ]) await put(temporary, file);
    for (const file of publicDocumentation) {
      await put(temporary, file, await readFile(join(repo, file), "utf8"));
    }

    const excluded = [
      ".env", ".env.integration", ".env.secondary", "docs/reviews/live.json",
      "docs/releases/private.json", "audit/live.json", "benchmarks/run.mjs", "benchmarks/results/live.json",
      "private-review.tar", "private-package.tgz", "docs/evaluation/selection-candidate.json", "docs/evaluation/round3-tools.json",
      "docs/contracts/official-openapi-2026-09-04.tar.gz", "scripts/private.mjs", "tests/private.test.mjs",
    ];
    for (const file of excluded) await put(temporary, file, "PRIVATE_CANARY\n");

    const cache = join(temporary, ".npm-cache");
    const userConfig = join(temporary, ".npmrc");
    await mkdir(cache);
    await writeFile(userConfig, "audit=false\nfund=false\nupdate-notifier=false\noffline=true\n");
    const { stdout } = await execute(command, [
      ...prefix, "pack", "--dry-run", "--json", "--ignore-scripts", "--offline",
      "--userconfig", userConfig, "--cache", cache,
    ], {
      cwd: temporary,
      timeout: 20_000,
      maxBuffer: 2_000_000,
      env: { ...environment, npm_config_cache: cache, npm_config_userconfig: userConfig },
    });
    const parsed = JSON.parse(stdout);
    const report = Array.isArray(parsed) ? parsed : Array.isArray(parsed.files) ? [parsed] : Object.values(parsed);
    assert.equal(report.length, 1);
    assert(Array.isArray(report[0].files), "npm pack JSON did not include a file list");
    const packed = new Set(report[0].files.map(entry => entry.path));

    for (const file of [
      "package.json", "build/server.js", "build/index.js", "build/sse.js",
      "build/streamable-http.js", "build/readiness-cli.js", "build/types/server.d.ts",
      "LICENSE", ".env.example", ...publicDocumentation,
    ]) assert(packed.has(file), `expected npm package entry: ${file}`);
    for (const file of excluded) assert(!packed.has(file), `private canary entered npm package: ${file}`);
    assert([...packed].every(path =>
      path !== ".npmrc"
      && !path.startsWith(".npm-cache/")
      && !path.startsWith("docs/reviews/")
      && !path.startsWith("audit/")
      && (path === "benchmarks/README.md" || !path.startsWith("benchmarks/"))
      && !path.startsWith("scripts/")
      && !path.startsWith("tests/")
      && (path === ".env.example" || !path.startsWith(".env"))
      && !/\.(?:tar|tar\.gz|tgz)$/.test(path)
    ));

    for (const source of publicDocumentation.filter(path => path.endsWith(".md"))) {
      const contents = await readFile(join(temporary, source), "utf8");
      for (const match of contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
        const destination = match[1].trim().replace(/^<|>$/g, "");
        if (!destination || destination.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(destination)) continue;
        const relativePath = decodeURIComponent(destination.split("#", 1)[0].split("?", 1)[0]);
        const target = normalize(join(dirname(source), relativePath));
        assert(!target.startsWith("../"), `${source} links outside the package: ${destination}`);
        assert(packed.has(target), `${source} links to missing package entry: ${destination}`);
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
