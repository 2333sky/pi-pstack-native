import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { checkRecords } from '../check-records.mjs';
import { readJSON } from './core.mjs';
import { buildRecords, recordsPath, validateRecords } from './records.mjs';

const root = resolve('.');
const serialize = document => `${JSON.stringify(document, null, 2)}\n`;
const committed = () => readJSON(join(root, recordsPath));
const find = (document, kind, name) => document.records.find(record => record.kind === kind && record.name === name);

test('the pinned snapshot yields one record per registry name', () => {
  const document = checkRecords(root);
  const parity = readJSON(join(root, 'PARITY.json'));
  assert.equal(document.records.length, 81);
  assert.equal(document.records.filter(record => record.kind === 'skill').length, 58);
  assert.equal(document.records.filter(record => record.kind === 'playbook').length, 23);
  assert.deepEqual(document.records.map(record => record.name).sort(), [...Object.keys(parity.skills), ...Object.keys(parity.playbooks)].sort());
  assert.deepEqual(document.target, { commit: 'c742dd61706fbacc1b95f1a20b7b988cf096ce6c', version: '0.15.36', snapshotDigest: '44d926c3b018434eb9ae6ab24354bda5fd158a7eda1565401fe75de4acddce9f' });
});

test('the committed record file matches a fresh build byte for byte', () => {
  assert.equal(readFileSync(join(root, recordsPath), 'utf8'), serialize(buildRecords({ root })));
});

test('every adapted record points at a local file that exists', () => {
  const adapted = committed().records.filter(record => record.port.handling === 'adapted');
  assert.equal(adapted.length, 80);
  for (const record of adapted) assert.ok(existsSync(join(root, record.port.path)), `${record.name} has ${record.port.path}`);
});

test('every record claims no evidence and records no differences or requirements', () => {
  for (const record of committed().records) {
    assert.equal(record.evidence.status, 'not_run');
    assert.deepEqual(record.evidence.refs, []);
    assert.deepEqual(record.requirements, { status: 'not_recorded' });
    assert.deepEqual(record.port.differences, { status: 'not_recorded' });
    assert.equal(record.port.ruleVersion, 1);
  }
});

test('a cursor-only record keeps its source and drops the local path', () => {
  const record = find(committed(), 'skill', 'make-bot-ui');
  assert.equal(record.port.handling, 'cursor-only');
  assert.equal(record.port.path, undefined);
  assert.equal(record.source.path, 'skills/make-bot-ui/SKILL.md');
});

test('a playbook cites its own contract and a skill cites none', () => {
  assert.deepEqual(find(committed(), 'playbook', 'babysit').contracts.ids, ['babysit']);
  assert.deepEqual(find(committed(), 'skill', 'architect').contracts.ids, []);
});

const rejections = [
  ['wrong schema version', document => { document.schemaVersion = 2; }, /RECORDS_SCHEMA_VERSION/],
  ['target mismatch', document => { document.target.version = '0.15.31'; }, /RECORDS_TARGET_MISMATCH/],
  ['a record with no name', document => { delete document.records[0].name; }, /RECORDS_NAME:/],
  ['a duplicate name', document => { document.records[1].name = document.records[0].name; }, /RECORDS_NAME_DUPLICATE/],
  ['a wrong kind', document => { find(document, 'skill', 'architect').kind = 'playbook'; }, /RECORDS_KIND/],
  ['a record absent from PARITY.json', document => { find(document, 'skill', 'architect').name = 'ghost'; }, /RECORDS_NOT_IN_PARITY/],
  ['a parity name with no record', document => { document.records.pop(); }, /RECORDS_MISSING_RECORD/],
  ['a source path that is not the expected one', document => { find(document, 'skill', 'architect').source.path = 'skills/arena/SKILL.md'; }, /RECORDS_SOURCE_PATH/],
  ['a blob that is not 40 hex', document => { find(document, 'skill', 'architect').source.blob = 'abc'; }, /RECORDS_SOURCE_BLOB/],
  ['a blob that is not the snapshot blob', document => { find(document, 'skill', 'architect').source.blob = '0'.repeat(40); }, /RECORDS_SOURCE_BLOB/],
  ['an unknown handling', document => { find(document, 'skill', 'architect').port.handling = 'vendored'; }, /RECORDS_PORT_HANDLING/],
  ['handling that disagrees with the registry', document => { find(document, 'skill', 'make-bot-ui').port.handling = 'adapted'; }, /RECORDS_PORT_STATUS_MISMATCH/],
  ['an adapted record with no port path', document => { delete find(document, 'skill', 'architect').port.path; }, /RECORDS_PORT_PATH_MISSING/],
  ['an adapted port path with no file', document => { find(document, 'skill', 'architect').port.path = 'skills/ghost/SKILL.md'; }, /RECORDS_PORT_PATH_ABSENT/],
  ['an adapted port path that differs from the inventory', document => { find(document, 'skill', 'architect').port.path = 'skills/arena/SKILL.md'; }, /RECORDS_PORT_PATH_MISMATCH/],
  ['a cursor-only record carrying a path', document => { find(document, 'skill', 'make-bot-ui').port.path = 'skills/make-bot-ui/SKILL.md'; }, /RECORDS_PORT_PATH_UNEXPECTED/],
  ['requirements that are not not_recorded', document => { find(document, 'skill', 'architect').requirements.status = 'recorded'; }, /RECORDS_REQUIREMENTS_STATUS/],
  ['contracts.ids that is not an array', document => { find(document, 'skill', 'architect').contracts.ids = 'architect'; }, /RECORDS_CONTRACTS_IDS/],
  ['contracts.ids with a blank entry', document => { find(document, 'skill', 'architect').contracts.ids = ['  ']; }, /RECORDS_CONTRACTS_IDS/],
  ['playbook ids that are not its own name', document => { find(document, 'playbook', 'babysit').contracts.ids = ['shipping']; }, /RECORDS_CONTRACTS_PLAYBOOK_ID/],
  ['a playbook citing two ids', document => { find(document, 'playbook', 'babysit').contracts.ids = ['babysit', 'shipping']; }, /RECORDS_CONTRACTS_PLAYBOOK_ID/],
  ['a skill claiming a contract id', document => { find(document, 'skill', 'architect').contracts.ids = ['architect']; }, /RECORDS_CONTRACTS_SKILL_ID/],
  ['an unknown evidence state', document => { find(document, 'skill', 'architect').evidence.status = 'unknown'; }, /RECORDS_EVIDENCE_STATUS/],
  ['evidence refs that are not strings', document => { find(document, 'skill', 'architect').evidence.refs = [7]; }, /RECORDS_EVIDENCE_REFS/],
  ['a passed claim with no references', document => { find(document, 'playbook', 'babysit').evidence = { status: 'passed', refs: [] }; }, /RECORDS_EVIDENCE_UNSUPPORTED/],
  ['a passed claim while requirements are not recorded', document => { find(document, 'playbook', 'babysit').evidence = { status: 'passed', refs: ['docs/log.txt'] }; }, /RECORDS_EVIDENCE_UNSUPPORTED/],
  ['not-run evidence carrying references', document => { find(document, 'skill', 'architect').evidence.refs = ['docs/log.txt']; }, /RECORDS_EVIDENCE_STALE_REF/],
  ['an unknown record field', document => { find(document, 'skill', 'architect').note = 'x'; }, /RECORDS_UNKNOWN_FIELD/],
  ['an unknown source field', document => { find(document, 'skill', 'architect').source.mode = '100644'; }, /RECORDS_UNKNOWN_FIELD/],
  ['an unknown document field', document => { document.generatedAt = 'now'; }, /RECORDS_UNKNOWN_FIELD/],
  ['a rule version drift', document => { find(document, 'skill', 'architect').port.ruleVersion = 2; }, /RECORDS_PORT_RULE_VERSION/],
  ['differences without a status', document => { find(document, 'skill', 'architect').port.differences = {}; }, /RECORDS_DIFFERENCES/],
  ['records out of kind then name order', document => { document.records.reverse(); }, /RECORDS_ORDER/],
];

for (const [name, mutate, pattern] of rejections) {
  test(`records reject ${name}`, () => {
    const changed = committed();
    mutate(changed);
    assert.throws(() => validateRecords(changed, { root }), pattern);
  });
}

test('a registry name without a snapshot blob fails the build loudly', () => {
  const box = mkdtempSync(join(tmpdir(), 'registry-records-'));
  try {
    cpSync(join(root, 'PARITY.json'), join(box, 'PARITY.json'));
    for (const path of ['vendor', 'skills', 'scripts', 'docs/upstream-target-0.15.36.json', 'docs/upstream-dispositions-0.15.36.json', 'LICENSE']) {
      mkdirSync(dirname(join(box, path)), { recursive: true });
      cpSync(join(root, path), join(box, path), { recursive: true });
    }
    const parity = readJSON(join(box, 'PARITY.json'));
    parity.skills.ghost = 'ADAPTED';
    writeFileSync(join(box, 'PARITY.json'), serialize(parity));
    assert.throws(() => buildRecords({ root: box }), /RECORDS_SOURCE_BLOB_MISSING: skill ghost/);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
});
