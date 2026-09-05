import { rm, readFile } from "node:fs/promises";

import { build } from "esbuild";
import { execFileSync } from "node:child_process";

await rm("build", { recursive: true, force: true });

await build({
  entryPoints: [
    "src/index.ts",
    "src/server.ts",
    "src/readiness-cli.ts",
    "src/sse.ts",
    "src/streamable-http.ts",
  ],
  outdir: "build",
  define: { __PACKAGE_VERSION__: JSON.stringify(JSON.parse(await readFile("package.json", "utf8")).version) },
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "external",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  chunkNames: "chunks/[name]-[hash]",
  logLevel: "info",
});

// Publish library declarations alongside the bundled import entrypoint.
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--emitDeclarationOnly", "--outDir", "build/types"], { stdio: "inherit" });
