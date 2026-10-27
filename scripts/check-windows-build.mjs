import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const path of ['dist/agent/grep-worker.mjs', 'dist/verification/process.mjs', 'dist/runner/cli.mjs']) {
  if (!existsSync(path)) throw new Error(`Missing built file: ${path}`);
}
for (const path of ['src/agent/grep-worker.mj', 'src/verification/process.mj', 'src/runner/cli.mj']) {
  if (existsSync(path)) throw new Error(`Build created an unexpected source path: ${path}`);
}
if (/\.ts['"]/.test(readFileSync('dist/runner/cli.mjs', 'utf8'))) throw new Error('Built CLI still imports TypeScript');
const cli = spawnSync(process.execPath, ['dist/runner/cli.mjs'], { encoding: 'utf8' });
if (cli.status !== 1 || !cli.stderr.includes('Usage: pstack-runner')) throw new Error(`CLI failed to load: ${cli.stderr}`);
console.log('Windows build artifacts and CLI import: PASS');
