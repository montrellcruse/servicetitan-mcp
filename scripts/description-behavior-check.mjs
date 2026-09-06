import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { digest } from './discovery-audit.mjs';

// A patch-specific guard: erase only literal tool prose and Zod descriptions,
// then compare every source AST with the v3.0.0 baseline. Runtime expressions,
// request paths, parameters, defaults, handlers and annotations remain visible.
export function normalize(source, file) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const literal = node => ts.isStringLiteralLike(node)
    || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && literal(node.left) && literal(node.right));
  const transformed = ts.transform(tree, [context => {
    const visit = node => {
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'describe' && node.arguments.length === 1 && literal(node.arguments[0])) return ts.visitNode(expr.expression, visit);
        if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'register' && node.arguments.length === 1 && ts.isObjectLiteralExpression(node.arguments[0])) {
          const object = node.arguments[0];
          const properties = object.properties.map(prop => ts.isPropertyAssignment(prop) && prop.name.getText(tree) === 'description' && literal(prop.initializer)
            ? ts.factory.updatePropertyAssignment(prop, prop.name, ts.factory.createStringLiteral('TOOL_DESCRIPTION')) : prop);
          return ts.visitEachChild(ts.factory.updateCallExpression(node, expr, node.typeArguments, [ts.factory.updateObjectLiteralExpression(object, properties)]), visit, context);
        }
        if (ts.isIdentifier(expr) && ((expr.text === 'registerExportTool' && node.arguments.length === 5) || (['registerCampaignCostListTool', 'registerOptOutListTool'].includes(expr.text) && node.arguments.length === 4)) && literal(node.arguments[3])) {
          const args = [...node.arguments]; args[3] = ts.factory.createStringLiteral('TOOL_DESCRIPTION');
          return ts.visitEachChild(ts.factory.updateCallExpression(node, expr, node.typeArguments, args), visit, context);
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return root => ts.visitNode(root, visit);
  }]);
  try {
    const printed = ts.createPrinter({ removeComments: true }).printFile(transformed.transformed[0]);
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, printed);
    const tokens = [];
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) tokens.push([kind, scanner.getTokenText()]);
    return tokens.filter(([kind], index) => !(kind === ts.SyntaxKind.CommaToken && tokens[index + 1]?.[0] === ts.SyntaxKind.CloseBraceToken));
  }
  finally { transformed.dispose(); }
}
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await files(file)); else result.push(file);
  }
  return result.sort();
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
const baselineFile = 'docs/evaluation/behavior-baseline-v3.0.0.json';
const baselineCommit = 'bb8bdd1b31b1cdbcad1bf4935fd71cfda9c2d85b';
const initialize = process.argv.includes('--initialize-baseline');
const names = initialize ? execFileSync('git', ['ls-tree', '-r', '--name-only', baselineCommit, '--', 'src'], { encoding: 'utf8' }).trim().split('\n') : await files('src');
const hashes = {};
for (const file of names) {
  const content = initialize ? execFileSync('git', ['show', `${baselineCommit}:${file}`], { encoding: 'utf8', maxBuffer: 20_000_000 }) : await readFile(file, 'utf8');
  hashes[file] = digest(file.endsWith('.ts') ? normalize(content, file) : content);
}
if (initialize) await writeFile(baselineFile, JSON.stringify({ sourceCommit: baselineCommit, normalization: 'literal registration descriptions and literal Zod describe annotations only; comments ignored', files: hashes }, null, 2) + '\n');
else {
  const baseline = JSON.parse(await readFile(baselineFile, 'utf8'));
  assert.deepEqual(Object.keys(hashes), Object.keys(baseline.files), 'Source file inventory changed');
  const changed = Object.keys(hashes).filter(file => hashes[file] !== baseline.files[file]);
  assert.deepEqual(changed, [], 'Executable source differs from v3.0.0 beyond allowed literal descriptions');
  console.log(`Description-only source compatibility passed: ${names.length} files; baseline ${baseline.sourceCommit}`);
}
}
