import type { WorkflowRecord } from '../runtime/types.js';
export declare function metrics(workflows: WorkflowRecord[]): {
    attempts: number;
    completed: number;
    verifiedRecorded: number;
    verificationRate: number | null;
    tokens: number | null;
    cost: number | null;
    blocked: number;
    staleRecorded: number;
    elapsedMs: number;
    interpretation: string;
};
