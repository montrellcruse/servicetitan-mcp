import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const pkg=JSON.parse(await readFile('package.json','utf8'));
const record=JSON.parse(await readFile('docs/releases/v3-acceptance.json','utf8'));
const required=['maintenance','contracts','analytics','interface','runtimeMatrix','packageSmoke','liveProduction','liveIntegration','liveSecondCompany'];
const failures=required.filter(key=>record.gates?.[key]?.status!=='passed').map(key=>`${key}: ${record.gates?.[key]?.status??'missing'}`);
if(record.version!==pkg.version)failures.push('Acceptance record version differs from package');
async function files(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())out.push(...await files(file));else out.push(file);}return out;}
const sourceFiles=[...await files('src'),...await files('tests'),...await files('scripts'),...await files('.github/workflows'),'package.json','package-lock.json','tsconfig.json','vitest.config.ts','eslint.config.js','README.md','SECURITY.md','.gitignore','.dockerignore','CHANGELOG.md','TOOLS.md','LICENSE','.env.example','Dockerfile','fly.toml','docs/MIGRATION-v3.md'].sort();
const hash=createHash('sha256');
for(const file of sourceFiles){hash.update(file+'\0');hash.update(await readFile(file));hash.update('\0');}
const sourceFingerprint=hash.digest('hex');
if(process.argv.includes('--fingerprint')){console.log(sourceFingerprint);process.exit(0);}
if(record.sourceFingerprint!==sourceFingerprint)failures.push('Acceptance evidence does not match the current source fingerprint');
if(failures.length){console.error('Release gates pending or failed:\n'+failures.map(x=>' - '+x).join('\n'));process.exitCode=1;}
else console.log(`All release gates passed for ${pkg.version}`);
