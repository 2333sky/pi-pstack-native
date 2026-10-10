import type { LoopRecord } from "../runtime/types.js";
export type LoopFile = {
    version: 1;
    loops: LoopRecord[];
};
export declare class LoopStoreBusyError extends Error {
    readonly code = "PSTACK_LOOP_STORE_BUSY";
    constructor();
}
export declare function loadLoops(): LoopFile;
export declare function saveLoops(file: LoopFile): void;
/** Atomic read-modify-write for the shared loop file. Prevents multiple Pi processes from losing updates. */
export declare function updateLoops<T>(mutate: (file: LoopFile) => T): T;
export declare function parseInterval(raw: string): number | undefined;
export declare function formatInterval(ms: number): string;
export declare function createLoop(sessionId: string, intervalMs: number, task: string, missedPolicy: LoopRecord["missedPolicy"], now?: number): LoopRecord;
