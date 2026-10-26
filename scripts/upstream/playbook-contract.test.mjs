import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readJSON } from './core.mjs';
import { buildContracts, contractPath, readContracts, validateContracts } from './playbooks.mjs';

const root = resolve('.');
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;

test('every registry playbook has one contract with ordered steps and real roles', () => {
  const document = readContracts(root);
  const parity = readJSON(join(root, 'PARITY.json'));
  assert.deepEqual(document.contracts.map((contract) => contract.name).sort(), Object.keys(parity.playbooks).sort());
  assert.equal(document.contracts.length, 23);
  for (const contract of document.contracts) {
    assert.ok(contract.requiredSteps.length >= 1, `${contract.name} keeps its numbered steps`);
    assert.deepEqual(contract.requiredSteps.map((step) => step.order), contract.requiredSteps.map((_, index) => index + 1));
    assert.ok(contract.observe.length > 0 && contract.mustReject.length > 0, `${contract.name} states what to observe and what to refuse`);
    assert.equal(contract.parentOnly, contract.roles.length === 0);
    assert.equal(contract.evidence.status, 'not_run', `${contract.name} claims no evidence`);
    assert.deepEqual(contract.evidence.refs, []);
    for (const step of contract.requiredSteps) assert.ok(step.text.length > 10, `${contract.name} step ${step.order} carries text`);
  }
  assert.equal(document.contracts.find((contract) => contract.name === 'bug-fix').roles.includes('architect'), true);
  assert.equal(document.contracts.find((contract) => contract.name === 'worktree-cleanup').parentOnly, true);
  assert.equal(document.contracts.every((contract) => contract.manualOnly), true, 'poteto-mode is a manual-entry skill, so its playbooks are too');
});

test('the committed contract file matches a fresh build', () => {
  const committed = readFileSync(join(root, contractPath), 'utf8');
  assert.equal(committed, serialize(buildContracts({ root })));
});

test('contracts follow the playbook text, not a parallel copy', () => {
  const document = readContracts(root);
  const bugFix = document.contracts.find((contract) => contract.name === 'bug-fix');
  assert.deepEqual(bugFix.roles, ['architect']);
  assert.deepEqual(bugFix.tools, ['bash', 'edit', 'find', 'grep', 'ls', 'pstack_agents', 'pstack_graph', 'pstack_workflow', 'pstack_worktrees', 'read', 'write']);
  assert.match(bugFix.requiredSteps[0].text, /Reproduce it yourself/);
});

const rejections = [
  ['unknown evidence state', (document) => { document.contracts[0].evidence.status = 'unknown'; }, /CONTRACT_EVIDENCE_STATE/],
  ['passed evidence without references', (document) => { document.contracts[0].evidence = { status: 'passed', refs: [] }; }, /CONTRACT_EVIDENCE_UNSUPPORTED/],
  ['not-run evidence carrying references', (document) => { document.contracts[0].evidence.refs = ['docs/log.txt']; }, /CONTRACT_EVIDENCE_STALE_REF/],
  ['unknown role', (document) => { document.contracts[0].roles = ['ghost']; }, /CONTRACT_ROLES_MISMATCH/],
  ['missing step', (document) => { document.contracts[0].requiredSteps.pop(); }, /CONTRACT_STEPS_MISMATCH/],
  ['blank step text', (document) => { document.contracts[0].requiredSteps[0].text = '  '; }, /CONTRACT_STEP_EMPTY/],
  ['duplicate contract', (document) => { document.contracts.push(structuredClone(document.contracts[0])); }, /CONTRACT_COUNT_MISMATCH/],
  ['missing contract', (document) => { document.contracts.pop(); }, /CONTRACT_COUNT_MISMATCH/],
  ['empty observe', (document) => { document.contracts[0].observe = []; }, /CONTRACT_OBSERVE_EMPTY/],
  ['empty refusal', (document) => { document.contracts[0].mustReject = []; }, /CONTRACT_REJECT_EMPTY/],
  ['wrong manual-only flag', (document) => { document.contracts[0].manualOnly = false; }, /CONTRACT_MANUAL_ONLY_MISMATCH/],
  ['parent-only lie', (document) => { document.contracts.find((contract) => contract.name === 'bug-fix').parentOnly = true; }, /CONTRACT_PARENT_ONLY_MISMATCH/],
  ['wrong schema', (document) => { document.schemaVersion = 2; }, /CONTRACT_SCHEMA_VERSION/],
];

for (const [name, mutate, pattern] of rejections) {
  test(`contracts reject ${name}`, () => {
    const document = readContracts(root);
    const changed = structuredClone(document);
    mutate(changed);
    assert.throws(() => validateContracts(changed, { root }), pattern);
  });
}

test('a new playbook file without a contract is refused', () => {
  const box = mkdtempSync(join(tmpdir(), 'playbook-contract-'));
  try {
    cpSync(join(root, 'skills/poteto-mode/playbooks'), join(box, 'skills/poteto-mode/playbooks'), { recursive: true });
    cpSync(join(root, 'skills/poteto-mode/SKILL.md'), join(box, 'skills/poteto-mode/SKILL.md'));
    writeFileSync(join(box, 'skills/poteto-mode/playbooks/uncontracted.md'), '# Uncontracted\n\n## Steps\n\n1. Do nothing.\n');
    assert.throws(() => buildContracts({ root: box }), /PLAYBOOK_CONTRACT_MISSING: uncontracted/);
    mkdirSync(join(box, 'skills/poteto-mode'), { recursive: true });
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
});
