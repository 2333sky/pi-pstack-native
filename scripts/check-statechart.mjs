#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// The pinned upstream TypeScript suite skips its live-TLC lanes when TLA2TOOLS
// is absent. Do not convert those skips into a claim of real model checking.
const root = resolve('skills/statechart/scripts/test');
const files = readdirSync(root).filter(name => name.endsWith('.test.ts')).sort().map(name => resolve(root, name));
const args = ['--disable-warning=ExperimentalWarning', '--test', '--test-timeout=120000', ...process.argv.slice(2), ...files];
const result = spawnSync(process.execPath, args, { cwd: process.cwd(), stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
