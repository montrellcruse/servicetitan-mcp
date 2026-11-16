import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearCaches, parseForESLint } from "@typescript-eslint/parser";

// Exercise the actual parser consumer of minimatch: the project-service
// allowDefaultProject boundary, including its intentional dot-file matching.
describe("parser default-project filename admission", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "mcp-toolchain-"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { strict: true, target: "ES2022" }, include: ["src/**/*.ts"],
    }));
    writeFileSync(join(root, "src/anchor.ts"), "export const anchor = 1;\n");
    for (const name of ["tool.config.ts", ".hidden.ts", "nested/outside.ts"])
      writeFileSync(join(root, name), "export const value: number = 42;\n");
  });
  afterAll(() => { clearCaches(); rmSync(root, { recursive: true, force: true }); });
  function parse(name: string) {
    return parseForESLint("export const value: number = 42;\n", {
      filePath: join(root, name), tsconfigRootDir: root,
      projectService: { allowDefaultProject: ["*.ts"] },
    });
  }
  it("allows a top-level config and dotfile with usable type information", () => {
    for (const name of ["tool.config.ts", ".hidden.ts"]) {
      const result = parse(name);
      expect(result.services.program?.getSourceFile(join(root, name))).toBeDefined();
      expect(result.services.program?.getTypeChecker()).toBeDefined();
    }
  });
  it("does not let a top-level wildcard admit a nested out-of-project file", () => {
    expect(() => parse("nested/outside.ts")).toThrow(/not found by the project service/);
  });
});
