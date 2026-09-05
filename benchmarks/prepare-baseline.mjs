import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const source = resolve(process.argv[2] ?? '.');
const revision = 'f6becd5';
const root = await mkdtemp(join(tmpdir(), 'st-benchmark-v2-'));
const archive = join(root, 'baseline.tar');
await writeFile(archive, execFileSync('git', ['archive', revision], { cwd: source, maxBuffer: 32 * 1024 * 1024 }));
execFileSync('tar', ['-xf', archive, '-C', root]);
const previous = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const current = JSON.parse(await readFile(join(source, 'package-lock.json'), 'utf8'));
previous.version = current.version; previous.packages[''].version = current.packages[''].version;
assert.deepEqual(previous, current, 'Dependency lock changed; baseline must have an independently pinned installation');
await symlink(join(source, 'node_modules'), join(root, 'node_modules'), 'dir');
execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
console.log(root);
