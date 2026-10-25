import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { homePath, lockPath } from './home.ts';
import { FileLock } from './lock.ts';
import { writeJsonAtomic } from './store.ts';
import type { Artifact, Evidence, Ledger, TaskBrief, Event } from '../contracts/types.ts';
import type { DispatchRecord } from './types.ts';
export const hash = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const uid = (prefix: string): string => `${prefix}_${randomUUID().replaceAll('-', '')}`;
export interface ProtocolState {
  schemaVersion: 1; revision: number; artifacts: Record<string, Artifact>; evidence: Record<string, Evidence>;
  ledgers: Record<string, Ledger>; briefs: Record<string, TaskBrief[]>;
  invalidations: Record<string, { at: string; reason: string }>;
  programs: Record<string, any>; frontiers: Record<string, any>; approvals: Record<string, any>;
  leases: Record<string, any>; events: Event[]; dispatches: Record<string, DispatchRecord>;
}
const empty = (): ProtocolState => ({schemaVersion:1, revision:0, artifacts:{}, evidence:{}, ledgers:{}, briefs:{}, invalidations:{}, programs:{}, frontiers:{}, approvals:{}, leases:{}, events:[], dispatches:{}});
export function protocol(): ProtocolState {
  const path = homePath('protocol.json');
  if (!existsSync(path)) return empty();
  const state = JSON.parse(readFileSync(path, 'utf8')) as ProtocolState;
  if (state.schemaVersion !== 1 || !state.ledgers || !state.artifacts || !Array.isArray(state.events)) throw new Error('STATE_UNCERTAIN: invalid protocol store');
  state.dispatches ??= {};
  return state;
}
// State and audit events commit in one atomic envelope. No cross-file journal transaction claims.
export function transact<T>(type: string, subject: string, actor: string, fn: (state: ProtocolState) => T): T {
  const lock = new FileLock(lockPath('protocol-state'));
  if (!lock.acquire()) throw new Error('STATE_BUSY: retry protocol operation');
  try {
    const state = protocol(); const result = fn(state); state.revision++;
    state.events.push({id:uid('evt'), at:new Date().toISOString(), actor, type, subject, data:result ?? null});
    writeJsonAtomic(homePath('protocol.json'), state); return result;
  } finally { lock.release(); }
}
