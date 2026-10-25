import type { DispatchRecord, WorkflowRecord } from '../runtime/types.js';
type DispatchStore = {
    dispatches: Record<string, DispatchRecord>;
};
export declare function briefDigest(workflow: WorkflowRecord): string;
export declare function dispatchKey(programId: string, unitKey: string): string;
export declare function buildDispatch(input: {
    programId: string;
    unitKey: string;
    owner: string;
    workflow: WorkflowRecord;
    ordersRevision?: number;
}): DispatchRecord;
export declare function commitDispatch(store: DispatchStore, dispatch: DispatchRecord): DispatchRecord;
export declare function findDispatch(workflowId: string): DispatchRecord | undefined;
export declare function requireDispatch(workflowId: string): DispatchRecord;
/** Committed intent is the truth. The workflow file is rebuilt from it, never edited into agreement. */
export declare function materializeDispatch(dispatch: DispatchRecord, write: (record: WorkflowRecord) => void): DispatchRecord;
export declare function dispatchVeto(workflowId: string, file: WorkflowRecord | undefined): string | undefined;
export {};
