#!/usr/bin/env node
/** Offline verification of the packaged benchmark entrypoint (no model calls). */
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(process.env.PSTACK_BENCHMARK_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const benchmark = readFileSync(resolve(root, 'scripts/benchmark.mjs'), 'utf8');
const imports = [...benchmark.matchAll(/from ['"](\.\.\/dist\/[^'"\s]+)['"]/g)].map(m => m[1]);
if (imports.length !== 4) throw new Error(`Expected 4 compiled runtime imports, received ${imports.length}`);
for (const specifier of imports) {
  if (!specifier.endsWith('.js')) throw new Error(`Not a compiled JS import: ${specifier}`);
  const filepath = resolve(root, 'scripts', specifier);
  if (!existsSync(filepath)) throw new Error(`Missing built benchmark dependency: ${filepath}`);
}
const entry = pathToFileURL(resolve(root, 'scripts/benchmark.mjs')).href;
const linked = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(entry)}).then(() => {}, error => { console.error(error.message); process.exit(1); })`], { cwd: root, encoding: 'utf8' });
if (linked.status !== 0) throw new Error(`Benchmark entry failed to link: ${`${linked.stderr}${linked.stdout}`.trim()}`);
const cases = JSON.parse(readFileSync(resolve(root, 'benchmarks/cases.json'), 'utf8'));
if (!Array.isArray(cases) || !cases.length) throw new Error('No benchmark cases');
const ids = new Set();
for (const c of cases) {
  if (typeof c.id !== 'string' || !c.id || ids.has(c.id)) throw new Error('Duplicate/invalid benchmark id');
  ids.add(c.id);
  if (!c.goal || !c.params || !Array.isArray(c.assertions) || !c.assertions.length) throw new Error(`Incomplete case: ${c.id}`);
}
const lib = (name) => import(pathToFileURL(join(root, 'benchmarks/lib', name)).href);
const { loadTasks, buildWorkspace, KINDS, verificationPolicy } = await lib('tasks.mjs');
const { loadTaxonomy, loadBaselines, validateReport } = await lib('report.mjs');
const tasks = loadTasks(join(root, 'benchmarks/tasks'));
if (tasks.length !== KINDS.length) throw new Error(`Expected ${KINDS.length} task sets, received ${tasks.length}`);
const taxonomy = loadTaxonomy(join(root, 'benchmarks/taxonomy.json'));
const baselines = loadBaselines(join(root, 'benchmarks/baselines.json'));
const taxonomyIds = new Set(taxonomy.categories.map((category) => category.id));
for (const task of tasks) {
  for (const mode of [...task.failureModes, ...Object.values(task.fixture.mutants ?? {}).map((mutant) => mutant.category)]) {
    if (!taxonomyIds.has(mode)) throw new Error(`Unknown failure mode: ${task.id}/${mode}`);
  }
}
const scratch = mkdtempSync(join(tmpdir(), 'pstack-benchmark-smoke-'));
try {
  for (const task of tasks) {
    const first = buildWorkspace(task, join(scratch, task.id, 'one'));
    const second = buildWorkspace(task, join(scratch, task.id, 'two'));
    if (first.workspaceDigest !== second.workspaceDigest || first.treeSha !== second.treeSha) throw new Error(`Non-deterministic fixture: ${task.id}`);
    if (task.fixture.contextBytesMin && first.contextBytes < task.fixture.contextBytesMin) throw new Error(`Fixture below the declared context volume: ${task.id}`);
  }
  const policy = verificationPolicy(tasks);
  if (!policy.commands.length) throw new Error('No artifact test commands declared');
  const offline = (plan, only) => spawnSync(process.execPath, [resolve(root, 'scripts/benchmark.mjs'), '--set', 'tasks', '--provider', 'fake', '--plan', plan, ...(only ? ['--only', only] : []), '--output', join(scratch, 'out', plan)], { cwd: root, encoding: 'utf8' });
  const run = offline('reference');
  if (run.status !== 0) throw new Error(`Offline fake run failed: ${`${run.stdout}${run.stderr}`.trim().slice(-2000)}`);
  const report = validateReport(JSON.parse(readFileSync(join(scratch, 'out', 'reference', 'report.json'), 'utf8')));
  if (report.tasks.length !== tasks.length || report.aggregate.verified !== tasks.length) throw new Error(`Offline fake run verified ${report.aggregate.verified} of ${tasks.length}`);
  if (report.measurement.credentialedCalls !== 0 || report.aggregate.tokens.value !== null || report.aggregate.costUsd.value !== null) throw new Error('Offline fake run claimed provider usage');
  const mutant = offline('integration-intent-lost', 'integration-conflict');
  if (mutant.status === 0) throw new Error('A mutant plan exited green');
  const mutantReport = validateReport(JSON.parse(readFileSync(join(scratch, 'out', 'integration-intent-lost', 'report.json'), 'utf8')));
  if (mutantReport.tasks[0].failureCategory !== 'integration-intent-lost') throw new Error(`Mutant reported ${mutantReport.tasks[0].failureCategory}`);
  console.log(`Benchmark entry imports validated: ${imports.length}; link: ok; fixtures: ${cases.length}; task sets: ${tasks.length}; offline fake run: ${report.aggregate.verified}/${tasks.length} verified; mutant control: ${mutantReport.tasks[0].failureCategory}; baselines: not run. No external model was called.`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
