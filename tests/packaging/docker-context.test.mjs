import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function tarNames(payload) {
  const archive = payload[0] === 0x1f && payload[1] === 0x8b ? gunzipSync(payload) : payload;
  const names = [];
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const text = (start, length) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");
    const name = [text(345, 155), text(0, 100)].filter(Boolean).join("/").replace(/^\.\//, "").replace(/\/$/, "");
    const sizeText = text(124, 12).trim();
    const size = sizeText ? Number.parseInt(sizeText, 8) : 0;
    assert.ok(Number.isSafeInteger(size) && size >= 0, `Invalid tar size for ${name}`);
    if (name) names.push(name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}

function collectRequest(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > limit) req.destroy(new Error("Synthetic Docker context exceeded limit"));
      else chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

test("Docker legacy builder excludes private and work-session artifacts from context", { timeout: 30_000 }, async t => {
  const available = spawnSync("docker", ["--version"], { encoding: "utf8" });
  if (available.error?.code === "ENOENT") return t.skip("Docker CLI is not installed");
  assert.equal(available.status, 0, `Docker CLI probe failed: ${available.stderr}`);

  const temporary = await mkdtemp(join(tmpdir(), "st-docker-context-test-"));
  const context = join(temporary, "context");
  const dockerConfig = join(temporary, "docker-config");
  let capturedContext;
  let dockerChild;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://docker.test");
      if ((req.method === "GET" || req.method === "HEAD") && url.pathname.endsWith("/_ping")) {
        res.writeHead(200, { "Content-Type": "text/plain", "API-Version": "1.51", "Docker-Experimental": "false" });
        res.end("OK");
      } else if (req.method === "GET" && url.pathname.endsWith("/version")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ApiVersion: "1.51", MinAPIVersion: "1.24", Version: "29.0.0", Os: "linux", Arch: "amd64" }));
      } else if (req.method === "GET" && url.pathname.endsWith("/info")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ OSType: "linux", Architecture: "amd64", ServerVersion: "29.0.0", Containers: 0, Images: 0 }));
      } else if (req.method === "POST" && url.pathname.endsWith("/build")) {
        capturedContext = await collectRequest(req);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"stream":"Successfully built synthetic-context-test\\n"}\n');
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end('{"message":"Unsupported fake Docker API route"}');
      }
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: error instanceof Error ? error.message : "fake engine failure" }));
    }
  });

  try {
    await mkdir(join(context, "src"), { recursive: true });
    await mkdir(join(context, "scripts"), { recursive: true });
    await mkdir(dockerConfig, { recursive: true });
    await cp(join(ROOT, ".dockerignore"), join(context, ".dockerignore"));
    await writeFile(join(context, "Dockerfile"), "FROM scratch\nCOPY package.json package-lock.json tsconfig.json ./\nCOPY src ./src\nCOPY scripts ./scripts\n");
    await writeFile(join(context, "package.json"), '{"name":"synthetic-context","version":"1.0.0"}\n');
    await writeFile(join(context, "package-lock.json"), '{"name":"synthetic-context","lockfileVersion":3}\n');
    await writeFile(join(context, "tsconfig.json"), '{"compilerOptions":{}}\n');
    await writeFile(join(context, "src/index.ts"), "export const synthetic = true;\n");
    await writeFile(join(context, "scripts/build.mjs"), "export const syntheticBuild = true;\n");

    const excluded = [
      ".env", ".env.example", ".env.integration", ".env.secondary", "nested/.env", "nested/.env.canary",
      "audit/finding.txt", "benchmarks/results/raw.json", "docs/reviews/private.md",
      ".tmp-compiler/output.js", "candidate.tgz", "review.tar", "archive.tar.gz", "tests/private.test.js", "notes.md",
    ];
    for (const relative of excluded) {
      const target = join(context, relative);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, "SYNTHETIC_CANARY_ONLY\n");
    }

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");
    dockerChild = spawn("docker", ["build", "--pull=false", "--no-cache", "-t", "synthetic-context-test:latest", context], {
      env: {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: temporary,
        TMPDIR: temporary,
        LANG: "C",
        LC_ALL: "C",
        DOCKER_API_VERSION: "1.51",
        DOCKER_BUILDKIT: "0",
        DOCKER_CONFIG: dockerConfig,
        DOCKER_HOST: `tcp://127.0.0.1:${address.port}`,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        ALL_PROXY: "",
        NO_PROXY: "127.0.0.1,localhost",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [], stderr = [];
    dockerChild.stdout.on("data", chunk => stdout.push(chunk));
    dockerChild.stderr.on("data", chunk => stderr.push(chunk));
    const watchdog = setTimeout(() => dockerChild?.kill("SIGKILL"), 20_000);
    watchdog.unref();
    const [status] = await new Promise((resolveExit, rejectExit) => {
      dockerChild.once("exit", (code, signal) => resolveExit([code, signal]));
      dockerChild.once("error", rejectExit);
    });
    clearTimeout(watchdog);
    assert.equal(status, 0, `Docker build failed\nstdout: ${Buffer.concat(stdout)}\nstderr: ${Buffer.concat(stderr)}`);
    assert.ok(capturedContext, "Fake Docker engine did not receive a build context");

    const names = new Set(tarNames(capturedContext));
    for (const required of ["Dockerfile", ".dockerignore", "package.json", "package-lock.json", "tsconfig.json", "src", "src/index.ts", "scripts", "scripts/build.mjs"]) {
      assert.ok(names.has(required), `Build input missing from Docker context: ${required}`);
    }
    for (const privatePath of excluded) {
      assert.ok(!names.has(privatePath), `Private canary entered Docker context: ${privatePath}`);
    }
  } finally {
    if (dockerChild?.exitCode === null && dockerChild.signalCode === null) {
      dockerChild.kill("SIGKILL");
      await once(dockerChild, "exit").catch(() => {});
    }
    server.closeAllConnections();
    if (server.listening) await new Promise(resolveClose => server.close(resolveClose));
    await rm(temporary, { recursive: true, force: true });
  }
});
