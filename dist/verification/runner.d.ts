import type { TaskBrief, Ledger, Fingerprint, TaskReport } from '../contracts/types.js';
export interface RunnerPolicy {
    commands: string[][];
    environment?: Record<string, string>;
    allowLocal?: boolean;
    allowRemote?: boolean;
    maxOutputBytes?: number;
    maxTimeoutSeconds?: number;
}
export declare function loadRunnerPolicy(): RunnerPolicy;
export declare function parseTestReport(text: string, format: 'junit' | 'tap'): boolean;
export declare function ledgerCurrent(entry: Ledger, current: Fingerprint): boolean;
export declare function invalidate(cwd: string, reason: string): string[];
export declare function verify(cwd: string, brief: TaskBrief, options?: {
    policy?: RunnerPolicy;
    actor?: string;
    before?: Fingerprint;
    parents?: string[];
    pr?: Ledger['pr'];
    signal?: AbortSignal;
    report?: TaskReport;
}): Promise<Ledger>;
