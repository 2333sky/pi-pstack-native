import type { Artifact, Evidence, Ledger, TaskBrief, Event } from '../contracts/types.js';
import type { DispatchRecord } from './types.js';
export declare const hash: (value: unknown) => string;
export declare const uid: (prefix: string) => string;
export interface ProtocolState {
    schemaVersion: 1;
    revision: number;
    artifacts: Record<string, Artifact>;
    evidence: Record<string, Evidence>;
    ledgers: Record<string, Ledger>;
    briefs: Record<string, TaskBrief[]>;
    invalidations: Record<string, {
        at: string;
        reason: string;
    }>;
    programs: Record<string, any>;
    frontiers: Record<string, any>;
    approvals: Record<string, any>;
    leases: Record<string, any>;
    events: Event[];
    dispatches: Record<string, DispatchRecord>;
}
export declare function protocol(): ProtocolState;
export declare function transact<T>(type: string, subject: string, actor: string, fn: (state: ProtocolState) => T): T;
