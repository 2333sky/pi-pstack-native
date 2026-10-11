#!/usr/bin/env node
/** Packs the real tarball, installs it into a clean consumer, and runs the installed-package smoke test. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const sdkPath = join(root, 'node_modules/@earendil-works/pi-coding-agent/package.json');
let sdk;
try { sdk = JSON.parse(readFileSync(sdkPath, 'utf8')); }
catch { throw new Error(`SMOKE_INSTALL_NEEDS_DEPENDENCIES: run npm install first, missing ${sdkPath}`); }
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmRun = (args, cwd) => execFileSync(npm, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const scratch = mkdtempSync(join(tmpdir(), 'pstack-install-smoke-'));
const packed = join(scratch, 'packed');
const consumer = join(scratch, 'consumer');
mkdirSync(packed);
mkdirSync(consumer);
try {
  const checked = ['dist/api.js', 'dist/runner/cli.mjs', 'src/extension.ts', 'test/smoke-installed-package.mjs'];
  const listed = new Set(JSON.parse(npmRun(['pack', '--dry-run', '--json', '--ignore-scripts'], root))[0].files.map((entry) => entry.path));
  for (const path of checked) if (!listed.has(path)) throw new Error(`SMOKE_INSTALL_PUBLISHED_FILE_MISSING: ${path} is not in the tarball for ${manifest.name}@${manifest.version}`);
  npmRun(['pack', '--ignore-scripts', '--dry-run=false', '--pack-destination', packed], root);
  const tarballs = readdirSync(packed).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error(`SMOKE_INSTALL_PACK_AMBIGUOUS: ${tarballs.join(', ') || 'no tarball'}`);
  const tarball = join(packed, tarballs[0]);
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({ name: 'pstack-consumer', private: true, type: 'module' }, null, 2)}\n`);
  npmRun(['install', '--no-audit', '--no-fund', '--dry-run=false', tarball, `@earendil-works/pi-coding-agent@${sdk.version}`], consumer);
  execFileSync(process.execPath, [join(consumer, 'node_modules', manifest.name, 'test/smoke-installed-package.mjs')], { cwd: consumer, stdio: 'inherit' });
  console.log(`install smoke PASS: ${tarballs[0]} (${Math.round(statSync(tarball).size / 1024)} KiB) installed with @earendil-works/pi-coding-agent@${sdk.version} on Node ${process.version}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
