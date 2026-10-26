#!/usr/bin/env node
import { constants, accessSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { findTlc } from '../skills/statechart/scripts/tlc-tools.mjs';

function executable(command) {
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')] : [''];
  const candidates = isAbsolute(command) || command.includes('/') || command.includes('\\')
    ? [resolve(command)]
    : (process.env.PATH ?? '').split(delimiter).filter(Boolean).flatMap(dir => extensions.map(ext => resolve(dir, command + ext)));
  for (const path of candidates) {
    try {
      if (!statSync(path).isFile()) continue;
      accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return path;
    } catch { /* Try the next PATH entry. */ }
  }
  throw new Error(`STATECHART_JAVA_UNAVAILABLE: cannot resolve ${command} to an executable file`);
}

try {
  const tools = findTlc();
  // The upstream async fixture forwards JAVA into a different cwd; a bare "java" then fails its file check.
  const env = { ...process.env, JAVA: executable(tools.java), ...(process.env.TLA2TOOLS ? { TLA2TOOLS: resolve(tools.jar) } : {}) };
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = spawnSync(process.execPath, ['--test', '--test-timeout=120000', ...process.argv.slice(2), join(root, 'skills/statechart/scripts/test/statechart.test.mjs')], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
