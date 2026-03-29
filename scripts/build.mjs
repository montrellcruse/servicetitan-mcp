import { rm } from "node:fs/promises";

import { build } from "esbuild";

await rm("build", { recursive: true, force: true });

await build({
  entryPoints: [
    "src/index.ts",
    "src/sse.ts",
    "src/streamable-http.ts",
  ],
  outdir: "build",
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
