import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { homePath, lockPath } from "./home.js";
import { FileLock } from "./lock.js";
import { writeJsonAtomic } from "./store.js";
export const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const uid = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '')}`;
const empty = () => ({ schemaVersion: 1, revision: 0, artifacts: {}, evidence: {}, ledgers: {}, briefs: {}, invalidations: {}, programs: {}, frontiers: {}, approvals: {}, leases: {}, events: [] });
export function protocol() {
    const path = homePath('protocol.json');
    if (!existsSync(path))
        return empty();
    const state = JSON.parse(readFileSync(path, 'utf8'));
    if (state.schemaVersion !== 1 || !state.ledgers || !state.artifacts || !Array.isArray(state.events))
        throw new Error('STATE_UNCERTAIN: invalid protocol store');
    return state;
}
// State and audit events commit in one atomic envelope. No cross-file journal transaction claims.
export function transact(type, subject, actor, fn) {
    const lock = new FileLock(lockPath('protocol-state'));
    if (!lock.acquire())
        throw new Error('STATE_BUSY: retry protocol operation');
    try {
        const state = protocol();
        const result = fn(state);
        state.revision++;
        state.events.push({ id: uid('evt'), at: new Date().toISOString(), actor, type, subject, data: result ?? null });
        writeJsonAtomic(homePath('protocol.json'), state);
        return result;
    }
    finally {
        lock.release();
    }
}
