import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/check-release.mjs");
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "st-release-gate-")); directories.push(cwd);
  for (const dir of ["src", "tests", "scripts", ".github/workflows", "docs/releases"]) mkdirSync(join(cwd, dir), { recursive: true });
  for (const file of ["package-lock.json", "tsconfig.json", "vitest.config.ts", "eslint.config.js", "README.md", "CHANGELOG.md", "TOOLS.md", "LICENSE", ".env.example", "Dockerfile", "fly.toml", "docs/MIGRATION-v3.md", "src/example.ts"]) writeFileSync(join(cwd, file), "fixture\n");
  writeFileSync(join(cwd, "package.json"), '{"version":"3.0.0-rc.1"}');
  const record = { version: "3.0.0-rc.1", sourceFingerprint: "pending", gates: Object.fromEntries(["maintenance", "contracts", "analytics", "interface", "runtimeMatrix", "packageSmoke", "liveProduction", "liveIntegration", "liveSecondCompany"].map(key => [key, { status: "passed" }])) };
  const save = () => writeFileSync(join(cwd, "docs/releases/v3-acceptance.json"), JSON.stringify(record));
  const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  save(); record.sourceFingerprint = run("--fingerprint").stdout.trim(); save();
  return { cwd, record, save, run };
}
describe("release acceptance enforcement", () => {
  it("accepts only matching-version evidence for the current source and every gate", () => {
    const f = fixture(); expect(f.run().status).toBe(0);
    f.record.version = "2.6.4"; f.save();
    expect(f.run().stderr).toContain("version differs"); expect(f.run().status).toBe(1);
  });
  it("refuses pending external gates even when all local evidence matches", () => {
    const f = fixture();
    f.record.gates.liveIntegration.status = "pending"; f.record.gates.liveSecondCompany.status = "pending"; f.save();
    const result = f.run(); expect(result.status).toBe(1);
    expect(result.stderr).toContain("liveIntegration: pending"); expect(result.stderr).toContain("liveSecondCompany: pending");
    expect(result.stderr).not.toContain("fingerprint");
  });
  it("invalidates evidence when implementation or shipped documentation changes", () => {
    const f = fixture(); writeFileSync(join(f.cwd, "src/example.ts"), "changed\n");
    expect(f.run().stderr).toContain("source fingerprint");
    f.record.sourceFingerprint = f.run("--fingerprint").stdout.trim(); f.save(); expect(f.run().status).toBe(0);
    writeFileSync(join(f.cwd, "TOOLS.md"), "changed catalog\n"); expect(f.run().status).toBe(1);
  });
});
