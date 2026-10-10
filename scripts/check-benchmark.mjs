#!/usr/bin/env node
/** Offline verification of the packaged benchmark entrypoint (no model calls). */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const benchmark = readFileSync(resolve(root, 'scripts/benchmark.mjs'), 'utf8');
const imports = [...benchmark.matchAll(/from ['"](\.\.\/dist\/[^'"\s]+)['"]/g)].map(m => m[1]);
if (imports.length !== 4) throw new Error(`Expected 4 compiled runtime imports, received ${imports.length}`);
for (const specifier of imports) {
  if (!specifier.endsWith('.js')) throw new Error(`Not a compiled JS import: ${specifier}`);
  const filepath = resolve(root, 'scripts', specifier);
  if (!existsSync(filepath)) throw new Error(`Missing built benchmark dependency: ${filepath}`);
}
const cases = JSON.parse(readFileSync(resolve(root, 'benchmarks/cases.json'), 'utf8'));
if (!Array.isArray(cases) || !cases.length) throw new Error('No benchmark cases');
const ids = new Set();
for (const c of cases) {
  if (typeof c.id !== 'string' || !c.id || ids.has(c.id)) throw new Error('Duplicate/invalid benchmark id');
  ids.add(c.id);
  if (!c.goal || !c.params || !Array.isArray(c.assertions) || !c.assertions.length) throw new Error(`Incomplete case: ${c.id}`);
}
console.log(`Benchmark entry imports validated: ${imports.length}; fixtures: ${cases.length}. No external model was called.`);
