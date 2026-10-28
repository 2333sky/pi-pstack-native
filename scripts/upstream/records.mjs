import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readJSON, safePath, shaPattern } from './core.mjs';
import { buildInventory, readSnapshot } from './inventory.mjs';

export const recordsPath = 'docs/registry-records-0.15.36.json';
const kindOrder = ['skill', 'playbook'];
const registryOf = { skill: 'skills', playbook: 'playbooks' };
const handlingOf = { ADAPTED: 'adapted', CURSOR_ONLY: 'cursor-only' };
const statusOf = { adapted: 'ADAPTED', 'cursor-only': 'CURSOR_ONLY' };
const evidenceStates = ['not_run', 'blocked', 'passed', 'failed', 'stale'];
const fields = {
  document: ['schemaVersion', 'target', 'records'],
  target: ['commit', 'version', 'snapshotDigest'],
  record: ['name', 'kind', 'source', 'port', 'requirements', 'contracts', 'evidence'],
  source: ['path', 'blob'],
  port: ['path', 'handling', 'ruleVersion', 'differences'],
  differences: ['status'],
  requirements: ['status'],
  contracts: ['ids'],
  evidence: ['status', 'refs'],
};
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const reject = message => { throw new Error(`RECORDS_${message}`); };
const recordPath = (kind, name) => kind === 'skill' ? `skills/${name}/SKILL.md` : `skills/poteto-mode/playbooks/${name}.md`;

function shape(value, keys, scope) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject(`SHAPE: ${scope}`);
  const unknown = Object.keys(value).filter(key => !keys.includes(key));
  if (unknown.length) reject(`UNKNOWN_FIELD: ${scope} has ${unknown.join(', ')}`);
}
function reference({ root }) {
  const snapshot = readSnapshot(root), parity = readJSON(join(root, 'PARITY.json'));
  const ports = new Map(buildInventory({ snapshot, parity, localRoot: root }).entries.map(entry => [entry.source.path, entry.port]));
  return { snapshot, parity, ports };
}
function names({ parity }) {
  return kindOrder.flatMap(kind => Object.keys(parity[registryOf[kind]] ?? {}).sort((a, b) => a.localeCompare(b, 'en')).map(name => ({ kind, name })));
}
function kindInParity(parity, name) {
  if (Object.hasOwn(parity.skills ?? {}, name)) return 'skill';
  if (Object.hasOwn(parity.playbooks ?? {}, name)) return 'playbook';
  return undefined;
}
function localExists(root, path) {
  try { return existsSync(join(root, safePath(path))); } catch { return false; }
}

export function buildRecords({ root }) {
  const { snapshot, parity, ports } = reference({ root });
  const blobs = new Map(snapshot.blobs.map(blob => [blob.path, blob.blob]));
  const records = names({ parity }).map(({ kind, name }) => {
    const status = parity[registryOf[kind]][name], path = recordPath(kind, name), blob = blobs.get(path), handling = handlingOf[status];
    if (blob === undefined) reject(`SOURCE_BLOB_MISSING: ${kind} ${name} has no snapshot blob at ${path}`);
    if (handling === undefined) reject(`STATUS_UNSUPPORTED: ${kind} ${name} is ${status} in PARITY.json`);
    const port = {...(status === 'ADAPTED' ? { path: ports.get(path)?.path } : {}), handling, ruleVersion: 1, differences: { status: 'not_recorded' }};
    if (status === 'ADAPTED' && !nonempty(port.path)) reject(`PORT_PATH_MISSING: ${kind} ${name} has no inventory local path`);
    return { name, kind, source: { path, blob }, port, requirements: { status: 'not_recorded' }, contracts: { ids: kind === 'playbook' ? [name] : [] }, evidence: { status: 'not_run', refs: [] } };
  });
  return { schemaVersion: 1, target: { commit: snapshot.commit, version: snapshot.version, snapshotDigest: snapshot.blobDigest }, records };
}

export function validateRecords(document, { root }) {
  const { snapshot, parity, ports } = reference({ root });
  shape(document, fields.document, 'document');
  if (document.schemaVersion !== 1) reject('SCHEMA_VERSION');
  shape(document.target, fields.target, 'target');
  if (!isDeepStrictEqual(document.target, { commit: snapshot.commit, version: snapshot.version, snapshotDigest: snapshot.blobDigest })) reject('TARGET_MISMATCH');
  if (!Array.isArray(document.records)) reject('SHAPE: records must be an array');
  const blobs = new Map(snapshot.blobs.map(blob => [blob.path, blob.blob]));
  const seen = new Set();
  for (const record of document.records) {
    shape(record, fields.record, 'record');
    if (!nonempty(record.name) || record.name.includes('/')) reject('NAME: a record needs a plain name');
    if (seen.has(record.name)) reject(`NAME_DUPLICATE: ${record.name}`);
    seen.add(record.name);
    const kind = kindInParity(parity, record.name);
    if (kind === undefined) reject(`NOT_IN_PARITY: ${record.name}`);
    if (record.kind !== kind) reject(`KIND: ${record.name} is a ${kind} in PARITY.json`);
    const status = parity[registryOf[kind]][record.name], path = recordPath(kind, record.name);
    shape(record.source, fields.source, `${record.name} source`);
    if (record.source.path !== path) reject(`SOURCE_PATH: ${record.name} must cite ${path}`);
    if (typeof record.source.blob !== 'string' || !shaPattern.test(record.source.blob) || blobs.get(path) !== record.source.blob) reject(`SOURCE_BLOB: ${record.name} must cite the snapshot blob at ${path}`);
    shape(record.port, fields.port, `${record.name} port`);
    if (!Object.hasOwn(statusOf, record.port.handling)) reject(`PORT_HANDLING: ${record.name} is ${record.port.handling}`);
    if (statusOf[record.port.handling] !== status) reject(`PORT_STATUS_MISMATCH: ${record.name} is ${status} in PARITY.json`);
    if (record.port.ruleVersion !== 1) reject(`PORT_RULE_VERSION: ${record.name}`);
    shape(record.port.differences, fields.differences, `${record.name} differences`);
    if (!nonempty(record.port.differences.status)) reject(`DIFFERENCES: ${record.name} needs a status`);
    if (record.port.handling === 'adapted') {
      if (!nonempty(record.port.path)) reject(`PORT_PATH_MISSING: ${record.name} is adapted without a local path`);
      if (!localExists(root, record.port.path)) reject(`PORT_PATH_ABSENT: ${record.name} has no file at ${record.port.path}`);
      if (record.port.path !== ports.get(path)?.path) reject(`PORT_PATH_MISMATCH: ${record.name} port path is not the inventory local path`);
    } else if (record.port.path !== undefined) reject(`PORT_PATH_UNEXPECTED: ${record.name} is cursor-only and carries no local path`);
    shape(record.requirements, fields.requirements, `${record.name} requirements`);
    if (record.requirements.status !== 'not_recorded') reject(`REQUIREMENTS_STATUS: ${record.name} is ${record.requirements.status}`);
    shape(record.contracts, fields.contracts, `${record.name} contracts`);
    const ids = record.contracts.ids;
    if (!Array.isArray(ids) || !ids.every(nonempty)) reject(`CONTRACTS_IDS: ${record.name} needs contract IDs as non-empty strings`);
    if (kind === 'skill' && ids.length > 0) reject(`CONTRACTS_SKILL_ID: ${record.name} is a skill and claims ${ids.join(', ')}`);
    if (kind === 'playbook' && !isDeepStrictEqual(ids, [record.name])) reject(`CONTRACTS_PLAYBOOK_ID: ${record.name} must cite only its own contract`);
    shape(record.evidence, fields.evidence, `${record.name} evidence`);
    if (!evidenceStates.includes(record.evidence.status)) reject(`EVIDENCE_STATUS: ${record.name} is ${record.evidence.status}`);
    if (!Array.isArray(record.evidence.refs) || !record.evidence.refs.every(nonempty)) reject(`EVIDENCE_REFS: ${record.name} needs references as non-empty strings`);
    if (record.evidence.status === 'passed' && (record.requirements.status === 'not_recorded' || ids.length === 0 || record.evidence.refs.length === 0 || record.port.differences.status === 'not_recorded')) reject(`EVIDENCE_UNSUPPORTED: ${record.name} claims a pass its fields do not support`);
    if (record.evidence.status === 'not_run' && record.evidence.refs.length > 0) reject(`EVIDENCE_STALE_REF: ${record.name} is not_run and carries references`);
  }
  const expected = names({ parity });
  for (const { kind, name } of expected) if (!seen.has(name)) reject(`MISSING_RECORD: ${kind} ${name} is in PARITY.json without a record`);
  if (!isDeepStrictEqual(document.records.map(record => `${record.kind}:${record.name}`), expected.map(entry => `${entry.kind}:${entry.name}`))) reject('ORDER: records must be sorted by kind then name');
  return document;
}
