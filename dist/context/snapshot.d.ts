import type { WorkflowEngine } from '../workflow/engine.js';
export declare function contextSnapshot(engine: WorkflowEngine, sessionId: string, contextTokens?: number, watermark?: number): {
    schemaVersion: number;
    at: string;
    storeRevision: number;
    contextWarning: string;
    workflows: {
        id: string;
        state: import("../runtime/types.js").WorkflowState;
        goal: string;
        budget: import("../api.js").Budget | null;
        calls: {
            key: string;
            execution: import("../runtime/types.js").CallState;
            brief: {
                id: string;
                revision: number;
                ordersHash: string;
            } | null;
            artifactId: string | null;
            acceptance: string;
            ledgerId: string | null;
            usage: import("../api.js").Usage | {
                tokens: null;
                cost: null;
            };
            nextAction: string;
        }[];
    }[];
    programs: {
        id: any;
        state: any;
        units: any;
        pendingInbox: any;
    }[];
    sourceOfTruth: string;
};
