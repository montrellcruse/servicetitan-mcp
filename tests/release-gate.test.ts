import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/check-release.mjs");
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const required = ["maintenance", "contracts", "analytics", "interface", "runtimeMatrix", "packageSmoke", "liveProduction", "latencyAndLoad"];
type Gate = { status: string; reason?: string; requiredFor?: string };
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "st-release-gate-")); directories.push(cwd);
  for (const dir of ["src", "tests", "scripts", "benchmarks", ".github/workflows", "docs/releases", "docs/contracts", "tests/fixtures"]) mkdirSync(join(cwd, dir), { recursive: true });
  writeFileSync(join(cwd, "glama.json"), '{"maintainers":["fixture"]}');
  writeFileSync(join(cwd, "tests/fixtures/discovery-v3.0.0.json"), '{"contracts":{}}\n');
  for (const file of ["package-lock.json", "tsconfig.json", "vitest.config.ts", "eslint.config.js", "README.md", "SECURITY.md", "CONTRIBUTING.md", "ARCHITECTURE.md", ".gitignore", ".dockerignore", "CHANGELOG.md", "TOOLS.md", "LICENSE", ".env.example", "Dockerfile", "fly.toml", "docs/MIGRATION-v3.md", "docs/contracts/README.md", "docs/releases/VALIDATION-v3.md", "docs/BENCHMARKS.md", "benchmarks/README.md", "benchmarks/protocol.mjs", "src/example.ts"]) writeFileSync(join(cwd, file), "fixture\n");
  writeFileSync(join(cwd, "package.json"), '{"version":"3.0.0"}');
  const gates: Record<string, Gate> = Object.fromEntries(required.map(key => [key, { status: "passed" }]));
  gates.liveIntegration = { status: "scoped_out", reason: "No integration access; writes remain experimental", requiredFor: "Stable writes" };
  gates.liveSecondCompany = { status: "scoped_out", reason: "Only one live company available", requiredFor: "Independent-company certification" };
  const record = {
    version: "3.0.0", sourceFingerprint: "pending", releaseDisposition: "stable-readonly",
    supportPolicy: { id: "readonly-v1", stableOperations: ["read"], experimentalOperations: ["write", "delete"], independentCompanyCertification: false, dashboardParity: false },
    gates,
  };
  const save = () => writeFileSync(join(cwd, "docs/releases/v3-acceptance.json"), JSON.stringify(record));
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  save(); record.sourceFingerprint = run("--fingerprint").stdout.trim(); save();
  return { cwd, record, save, run };
}
describe("release acceptance enforcement", () => {
  it("accepts scoped evidence only for the matching version and readonly support policy", () => {
    const f = fixture(); const result = f.run(); expect(result.status).toBe(0);
    expect(result.stdout).toContain("readonly-v1"); expect(result.stdout).toContain("scoped out, not verified");
    f.record.version = "2.6.4"; f.save();
    expect(f.run().stderr).toContain("version differs"); expect(f.run().status).toBe(1);
  });
  it("refuses pending or absent external evidence unless explicitly scoped out", () => {
    const f = fixture();
    f.record.gates.liveIntegration.status = "pending"; delete f.record.gates.liveSecondCompany; f.save();
    const result = f.run(); expect(result.status).toBe(1);
    expect(result.stderr).toContain("liveIntegration: pending"); expect(result.stderr).toContain("liveSecondCompany: missing");
    expect(result.stderr).not.toContain("fingerprint");
  });
  it("requires a rationale and excluded support commitment for every scoped-out gate", () => {
    const f = fixture();
    f.record.gates.liveIntegration.reason = " "; delete f.record.gates.liveSecondCompany.requiredFor; f.save();
    const result = f.run(); expect(result.status).toBe(1);
    expect(result.stderr).toContain("liveIntegration: scoped_out requires");
    expect(result.stderr).toContain("liveSecondCompany: scoped_out requires");
  });
  it.each(required)("cannot scope out the required %s gate", key => {
    const f = fixture(); f.record.gates[key] = { status: "scoped_out", reason: "Unavailable", requiredFor: "Anything" }; f.save();
    expect(f.run().status).toBe(1); expect(f.run().stderr).toContain(`${key}: scoped_out`);
  });
  it("rejects broader support claims even with all gates marked passed", () => {
    const f = fixture();
    f.record.gates.liveIntegration.status = "passed"; f.record.gates.liveSecondCompany.status = "passed"; f.save();
    expect(f.run().status).toBe(0);
    for (const key of ["stableOperations", "experimentalOperations", "independentCompanyCertification", "dashboardParity", "id"] as const) {
      const previous = f.record.supportPolicy[key];
      Object.assign(f.record.supportPolicy, { [key]: key.endsWith("Operations") ? ["read", "write", "delete"] : key === "id" ? "full" : true });
      f.save(); expect(f.run().status).toBe(1); expect(f.run().stderr).toContain("Support policy must match readonly-v1");
      Object.assign(f.record.supportPolicy, { [key]: previous });
    }
    f.record.releaseDisposition = "unrestricted-stable"; f.save(); expect(f.run().stderr).toContain("Release disposition");
  });
  it("invalidates evidence when credential exclusion rules or support guidance change", () => {
    const f = fixture();
    for (const file of [".dockerignore", ".gitignore", "SECURITY.md", "CONTRIBUTING.md", "ARCHITECTURE.md", "docs/contracts/README.md", "docs/releases/VALIDATION-v3.md", "docs/BENCHMARKS.md", "benchmarks/protocol.mjs", "glama.json", "tests/fixtures/discovery-v3.0.0.json"]) {
      writeFileSync(join(f.cwd, file), "changed policy\n");
      expect(f.run().stderr).toContain("source fingerprint");
      f.record.sourceFingerprint = f.run("--fingerprint").stdout.trim(); f.save(); expect(f.run().status).toBe(0);
    }
  });
  it("invalidates evidence when implementation or shipped catalog changes", () => {
    const f = fixture(); writeFileSync(join(f.cwd, "src/example.ts"), "changed\n");
    expect(f.run().stderr).toContain("source fingerprint");
    f.record.sourceFingerprint = f.run("--fingerprint").stdout.trim(); f.save(); expect(f.run().status).toBe(0);
    writeFileSync(join(f.cwd, "TOOLS.md"), "changed catalog\n"); expect(f.run().status).toBe(1);
  });
});
