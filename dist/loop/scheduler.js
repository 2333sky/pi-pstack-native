import { createHash } from "node:crypto";
import { loadConfig } from "../runtime/config.js";
import { lockPath } from "../runtime/home.js";
import { FileLock } from "../runtime/lock.js";
import { createLoop, loadLoops, updateLoops } from "./store.js";
const MAX_TIMER = 2_147_000_000;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_RETRY_MAX_MS = 5_000;
function executionLockName(loop) {
    const key = createHash("sha256").update(`${loop.sessionId}\0${loop.id}`).digest("hex");
    return `loop-run-${key}`;
}
class LoopExecutionBusyError extends Error {
    constructor(loopId) {
        super(`scheduled loop ${loopId} is already running in another Pi process`);
        this.name = "LoopExecutionBusyError";
    }
}
/**
 * Schedules durable loop occurrences. The state file lock makes claiming one
 * occurrence atomic across cooperating Pi processes. Claiming advances
 * nextRunAt before the external send, so delivery is at-most-once per claimed
 * occurrence, not exactly-once: a host crash between claim and send can lose
 * that delivery. A failed store lock does not claim or advance anything.
 */
export class LoopScheduler {
    timer;
    ctx;
    pi;
    retryBaseMs;
    retryMaxMs;
    logger;
    generation = 0;
    retryAttempt = 0;
    tickRunning = false;
    pendingRetryDelay;
    refreshAfterTick = false;
    constructor(pi, options = {}) {
        this.pi = pi;
        this.retryBaseMs = Math.max(1, options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS);
        this.retryMaxMs = Math.max(this.retryBaseMs, options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS);
        this.logger = options.logger ?? ((message, error) => console.error(message, error));
    }
    /** Start scheduling for a Pi session. Calling bind again replaces its timer. */
    bind(ctx) {
        this.stop();
        this.ctx = ctx;
        const generation = this.generation;
        try {
            const catchUpCompleted = this.catchUp();
            if (!catchUpCompleted)
                return;
            this.retryAttempt = 0;
            this.arm(generation);
        }
        catch (error) {
            this.report("pstack-native loop catch-up failed; retrying", error);
            this.scheduleRetry(generation);
        }
    }
    /** Alias for callers that use explicit start/stop lifecycle naming. */
    start(ctx) { this.bind(ctx); }
    /** Stop and invalidate old timer callbacks. In-flight Pi sends are not preempted. */
    stop() {
        this.generation += 1;
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = undefined;
        this.ctx = undefined;
        this.retryAttempt = 0;
        this.pendingRetryDelay = undefined;
        this.refreshAfterTick = false;
    }
    close() { this.stop(); }
    list(sessionId) { return loadLoops().loops.filter((x) => x.sessionId === sessionId); }
    get(sessionId, id) { return this.list(sessionId).find((loop) => loop.id === id); }
    remove(sessionId, id) {
        const removed = updateLoops((file) => {
            const before = file.loops.length;
            file.loops = file.loops.filter((loop) => !(loop.sessionId === sessionId && loop.id === id));
            return file.loops.length !== before;
        });
        this.arm();
        return removed;
    }
    create(sessionId, intervalMs, task) {
        const loop = createLoop(sessionId, intervalMs, task, loadConfig().loopMissedPolicy);
        updateLoops((file) => { file.loops.push(loop); });
        this.arm();
        return loop;
    }
    setEnabled(sessionId, id, enabled) {
        const updated = updateLoops((file) => {
            const loop = file.loops.find((x) => x.sessionId === sessionId && x.id === id);
            if (!loop)
                throw new Error(`Unknown loop ${id} in this session.`);
            loop.enabled = enabled;
            if (enabled && Date.parse(loop.nextRunAt) <= Date.now())
                loop.nextRunAt = new Date(Date.now() + loop.intervalMs).toISOString();
            return structuredClone(loop);
        });
        this.arm();
        return updated;
    }
    runNow(sessionId, id) {
        const current = this.get(sessionId, id);
        if (!current?.enabled)
            throw new Error(`Unknown active loop ${id} in this session.`);
        const lock = this.acquireExecutionLock(current);
        if (!lock)
            throw new LoopExecutionBusyError(id);
        let updated;
        try {
            updated = updateLoops((file) => {
                const loop = file.loops.find((x) => x.sessionId === sessionId && x.id === id && x.enabled);
                if (!loop)
                    throw new Error(`Unknown active loop ${id} in this session.`);
                const now = Date.now();
                loop.lastRunAt = new Date(now).toISOString();
                loop.nextRunAt = new Date(now + loop.intervalMs).toISOString();
                return structuredClone(loop);
            });
        }
        catch (error) {
            this.releaseExecutionLock(lock, id);
            throw error;
        }
        void this.dispatch(updated, lock);
        this.arm();
        return updated;
    }
    catchUp() {
        if (!this.ctx)
            return true;
        const sessionId = this.ctx.sessionManager.getSessionId();
        const { due, busyLoopIds } = this.claimDue(sessionId, Date.now(), true);
        for (const claim of due)
            void this.dispatch(claim.loop, claim.lock);
        if (busyLoopIds.length) {
            this.report("pstack-native loop catch-up found an occurrence already running; retrying", new LoopExecutionBusyError(busyLoopIds.join(", ")));
            this.scheduleRetry(this.generation);
            return false;
        }
        return true;
    }
    async tick(generation) {
        if (!this.isActive(generation))
            return;
        if (this.tickRunning) {
            this.refreshAfterTick = true;
            return;
        }
        this.tickRunning = true;
        try {
            const sessionId = this.ctx.sessionManager.getSessionId();
            const { due, busyLoopIds } = this.claimDue(sessionId, Date.now(), false);
            if (busyLoopIds.length) {
                this.report("pstack-native loop occurrence is still running in another Pi process; retrying", new LoopExecutionBusyError(busyLoopIds.join(", ")));
                this.scheduleRetry(generation);
            }
            else {
                this.retryAttempt = 0;
            }
            await Promise.all(due.map((claim) => this.dispatch(claim.loop, claim.lock)));
        }
        catch (error) {
            this.report("pstack-native loop timer tick failed; retrying", error);
            this.scheduleRetry(generation);
        }
        finally {
            this.tickRunning = false;
            if (!this.ctx)
                return;
            const currentGeneration = this.generation;
            const retryDelay = this.pendingRetryDelay;
            this.pendingRetryDelay = undefined;
            const needsRefresh = this.refreshAfterTick;
            this.refreshAfterTick = false;
            if (this.timer === undefined && (retryDelay !== undefined || needsRefresh || this.isActive(currentGeneration))) {
                this.arm(currentGeneration, retryDelay);
            }
        }
    }
    claimDue(sessionId, now, catchUp) {
        const candidates = loadLoops().loops.filter((loop) => loop.enabled
            && loop.sessionId === sessionId
            && Date.parse(loop.nextRunAt) <= now
            && (!catchUp || loop.missedPolicy === "run-once"));
        const locks = new Map();
        const busy = new Set();
        try {
            for (const loop of candidates) {
                const key = executionLockName(loop);
                if (locks.has(key) || busy.has(loop.id))
                    continue;
                const lock = this.acquireExecutionLock(loop);
                if (lock)
                    locks.set(key, lock);
                else
                    busy.add(loop.id);
            }
            const claimed = updateLoops((file) => {
                const result = [];
                for (const loop of file.loops) {
                    if (!loop.enabled || loop.sessionId !== sessionId || Date.parse(loop.nextRunAt) > now)
                        continue;
                    const shouldDispatch = !catchUp || loop.missedPolicy === "run-once";
                    const key = executionLockName(loop);
                    if (shouldDispatch && !locks.has(key)) {
                        busy.add(loop.id);
                        continue;
                    }
                    if (shouldDispatch) {
                        loop.lastRunAt = new Date(now).toISOString();
                        result.push({ loop: structuredClone(loop), key });
                    }
                    loop.nextRunAt = new Date(now + loop.intervalMs).toISOString();
                }
                return result;
            });
            const used = new Set(claimed.map((claim) => claim.key));
            for (const [key, lock] of locks)
                if (!used.has(key))
                    this.releaseExecutionLock(lock, key);
            return {
                due: claimed.map((claim) => ({ loop: claim.loop, lock: locks.get(claim.key) })),
                busyLoopIds: [...busy],
            };
        }
        catch (error) {
            for (const [key, lock] of locks)
                this.releaseExecutionLock(lock, key);
            throw error;
        }
    }
    acquireExecutionLock(loop) {
        const lock = new FileLock(lockPath(executionLockName(loop)));
        return lock.acquire() ? lock : undefined;
    }
    releaseExecutionLock(lock, label) {
        try {
            lock.release();
        }
        catch (error) {
            this.report(`pstack-native loop execution lock release failed for ${label}`, error);
        }
    }
    dispatch(loop, executionLock) {
        const ctx = this.ctx;
        if (!ctx) {
            if (executionLock)
                this.releaseExecutionLock(executionLock, loop.id);
            return Promise.resolve();
        }
        const text = `/skill:poteto-mode Scheduled loop ${loop.id}. ${loop.task}`;
        try {
            const delivery = this.pi.sendUserMessage(text, ctx.isIdle()
                ? { expandPromptTemplates: true }
                : { expandPromptTemplates: true, deliverAs: "followUp" });
            return Promise.resolve(delivery).catch((error) => {
                this.report(`pstack-native loop delivery failed for ${loop.id}; the claimed occurrence will not be replayed`, error);
            }).finally(() => { if (executionLock)
                this.releaseExecutionLock(executionLock, loop.id); });
        }
        catch (error) {
            this.report(`pstack-native loop delivery failed for ${loop.id}; the claimed occurrence will not be replayed`, error);
            if (executionLock)
                this.releaseExecutionLock(executionLock, loop.id);
            return Promise.resolve();
        }
    }
    isActive(generation) { return this.ctx !== undefined && generation === this.generation; }
    scheduleRetry(generation) {
        if (!this.isActive(generation))
            return;
        this.retryAttempt += 1;
        const exponent = Math.min(this.retryAttempt - 1, 30);
        const delay = Math.min(this.retryMaxMs, this.retryBaseMs * (2 ** exponent));
        this.arm(generation, delay);
    }
    arm(generation = this.generation, delayOverride) {
        if (!this.isActive(generation))
            return;
        if (this.tickRunning) {
            if (delayOverride !== undefined)
                this.pendingRetryDelay = delayOverride;
            else
                this.refreshAfterTick = true;
            return;
        }
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = undefined;
        let delay;
        if (delayOverride !== undefined) {
            delay = Math.max(0, Math.min(MAX_TIMER, delayOverride));
        }
        else {
            try {
                const sessionId = this.ctx.sessionManager.getSessionId();
                const active = loadLoops().loops
                    .filter((x) => x.enabled && x.sessionId === sessionId)
                    .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt));
                if (!active.length)
                    return;
                delay = Math.max(0, Math.min(MAX_TIMER, Date.parse(active[0].nextRunAt) - Date.now()));
            }
            catch (error) {
                this.report("pstack-native loop scheduler could not read loop state; retrying", error);
                this.scheduleRetry(generation);
                return;
            }
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            if (!this.isActive(generation))
                return;
            // Promise.resolve().then() contains synchronous throws as well as async rejections.
            void Promise.resolve().then(() => this.tick(generation)).catch((error) => {
                this.report("pstack-native loop timer callback failed; retrying", error);
                this.scheduleRetry(generation);
            });
        }, delay);
        this.timer.unref?.();
    }
    report(message, error) {
        try {
            this.logger(message, error);
        }
        catch (loggingError) {
            console.error("pstack-native loop scheduler logger failed", { message, error, loggingError });
        }
    }
}
