#!/usr/bin/env node
/**
 * Runs one verification tier file by file and binds each result to the file that really ran it.
 * A custom reporter emits the path and name of every top level test, so a deleted file, an emptied
 * file, an imported substitute, a renamed test, a skipped test, a duplicate or a symlink alias
 * cannot make the tier report success. Whether a body asserts anything is outside what a test
 * runner can prove, because the test files are part of the repository.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tiers = {
  playbooks: {
    files: [{
      file: 'docs/parity.test.mjs',
      tests: ['ketchup loads with valid Pi frontmatter and required sections', 'opening and babysit document ready stacked PRs and deferred handoff', 'ready child targets its parent and waits for phase completion', 'reject a draft PR', 'reject a child with the wrong base', 'reject premature babysit', 'reject missing Scope or Verification', 'reject empty sections and headings inside fenced code', 'reject malformed snapshots instead of treating strings as authorization', 'PR body CLI validates the sample file'].map((name) => ({ name, state: 'pass' })),
    }],
  },
  offline: {
    files: [
      {
        file: 'test/e2e/offline.test.ts',
        tests: ['[offline] the credentialed live tier never runs without an explicit operator target', '[offline] the live tier is skipped by default when its own file runs', '[offline] every refused live-tier environment runs no external command and enters no write path', '[offline] every test in the live tier consults only the guard gate', '[offline] GitHubCLI rejects invalid repository and pull request inputs before it touches gh', '[offline] the GitHub provider refuses a merge whose expected head is stale', '[offline] a disposable fixture repository never carries credentials in captured output'].map((name) => ({ name, state: 'pass' })),
      },
      {
        file: 'test/e2e/reported-defects.test.ts',
        tests: ['[offline] reported src defect: read-only child profiles receive no read-only tools', '[offline] reported src defect: a captured evidence log leaks a credential embedded in a URL'].map((name) => ({ name, state: 'pass' })),
      },
    ],
  },
  fake: {
    files: [
      {
        file: 'test/e2e/shipping.test.ts',
        tests: ['[fake-provider] a verified commit opens a pull request and its base, head, CI and review state are read back', '[fake-provider] a stale head SHA blocks the merge', '[fake-provider] a crash before the external side effect replays exactly once and never double-merges', '[fake-provider] a crash after the external side effect is at most once because recovery reads the remote first'].map((name) => ({ name, state: 'pass' })),
      },
      {
        file: 'test/e2e/workflow.test.ts',
        tests: ['[fake-provider] a strict workflow runs two worktrees, an integrator and deterministic verification', '[fake-provider] a workflow resumes after SIGKILL without replaying completed calls or external effects', '[fake-provider] malformed task reports expose diagnostics and stay blocked'].map((name) => ({ name, state: 'pass' })),
      },
    ],
  },
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tier = process.argv[2];
const spec = tiers[tier];
if (!spec) throw new Error(`TIER_UNKNOWN: ${tier ?? '(none)'}; expected one of ${Object.keys(tiers).join(', ')}`);
const listed = spec.files.map((entry) => entry.file);
if (new Set(listed).size !== listed.length) throw new Error(`TIER_MANIFEST_DUPLICATE: ${listed.join(', ')}`);

let passed = 0;
let todo = 0;
for (const entry of spec.files) {
  const path = resolve(root, entry.file);
  if (!existsSync(path)) throw new Error(`TIER_FILE_MISSING: ${entry.file}`);
  const expected = new Map(entry.tests.map((test) => [test.name, test.state]));
  const events = join(mkdtempSync(join(tmpdir(), 'e2e-events-')), 'events.jsonl');
  let observed;
  try {
    execFileSync(process.execPath, ['--experimental-strip-types', '--test', '--test-reporter=./scripts/e2e-reporter.mjs', entry.file], { cwd: root, env: { ...process.env, E2E_EVENTS: events }, stdio: ['ignore', 'pipe', 'inherit'] });
    observed = readFileSync(events, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } finally {
    rmSync(dirname(events), { recursive: true, force: true });
  }
  const self = realpathSync(path);
  const seen = new Map();
  for (const event of observed) {
    const state = event.todo ? 'todo' : event.status === 'pass' ? 'pass' : 'fail';
    if (seen.has(event.name)) throw new Error(`TIER_DUPLICATE_TEST: ${entry.file} reported ${event.name} twice`);
    seen.set(event.name, { state, file: realpathSync(event.file) });
  }
  for (const [name, found] of seen) {
    if (found.file !== self) throw new Error(`TIER_FOREIGN_TEST: ${entry.file} ran a test owned by ${found.file}: ${name}`);
    if (!expected.has(name)) throw new Error(`TIER_UNEXPECTED_TEST: ${entry.file} ran ${name}`);
    if (expected.get(name) !== found.state) throw new Error(`TIER_TEST_STATE: ${entry.file} ${name} was ${found.state}, expected ${expected.get(name)}`);
    if (found.state === 'pass') passed += 1;
    if (found.state === 'todo') todo += 1;
  }
  for (const name of expected.keys()) if (!seen.has(name)) throw new Error(`TIER_MISSING_TEST: ${entry.file} never ran ${name}`);
  console.log(`${entry.file} ok: ${seen.size} tests, ${['pass', 'todo', 'fail'].map((state) => `${[...seen.values()].filter((found) => found.state === state).length} ${state}`).join(', ')}`);
}
console.log(`${tier} tier ok: ${spec.files.length} files, ${passed} pass, ${todo} todo`);
