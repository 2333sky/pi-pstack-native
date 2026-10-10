import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { LoopRecord } from "../runtime/types.js";
export interface LoopSchedulerOptions {
    /** Lower bounds are useful for deterministic timer integration tests. */
    retryBaseMs?: number;
    retryMaxMs?: number;
    /** Called for scheduler and delivery errors; the default writes to stderr. */
    logger?: (message: string, error?: unknown) => void;
}
/**
 * Schedules durable loop occurrences. The state file lock makes claiming one
 * occurrence atomic across cooperating Pi processes. Claiming advances
 * nextRunAt before the external send, so delivery is at-most-once per claimed
 * occurrence, not exactly-once: a host crash between claim and send can lose
 * that delivery. A failed store lock does not claim or advance anything.
 */
export declare class LoopScheduler {
    private timer;
    private ctx;
    private readonly pi;
    private readonly retryBaseMs;
    private readonly retryMaxMs;
    private readonly logger;
    private generation;
    private retryAttempt;
    private tickRunning;
    private pendingRetryDelay;
    private refreshAfterTick;
    constructor(pi: ExtensionAPI, options?: LoopSchedulerOptions);
    /** Start scheduling for a Pi session. Calling bind again replaces its timer. */
    bind(ctx: ExtensionContext): void;
    /** Alias for callers that use explicit start/stop lifecycle naming. */
    start(ctx: ExtensionContext): void;
    /** Stop and invalidate old timer callbacks. In-flight Pi sends are not preempted. */
    stop(): void;
    close(): void;
    list(sessionId: string): LoopRecord[];
    get(sessionId: string, id: string): LoopRecord | undefined;
    remove(sessionId: string, id: string): boolean;
    create(sessionId: string, intervalMs: number, task: string): LoopRecord;
    setEnabled(sessionId: string, id: string, enabled: boolean): LoopRecord;
    runNow(sessionId: string, id: string): LoopRecord;
    private catchUp;
    private tick;
    private claimDue;
    private acquireExecutionLock;
    private releaseExecutionLock;
    private dispatch;
    private isActive;
    private scheduleRetry;
    private arm;
    private report;
}
