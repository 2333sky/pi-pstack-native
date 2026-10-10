import { randomUUID } from "node:crypto";
import { lockPath, loopsPath } from "../runtime/home.ts";
import { FileLock } from "../runtime/lock.ts";
import { readJson, writeJsonAtomic } from "../runtime/store.ts";
import type { LoopRecord } from "../runtime/types.ts";

const MIN = 60_000;
const MAX = 7 * 24 * 60 * 60_000;
export type LoopFile = { version: 1; loops: LoopRecord[] };
const EMPTY: LoopFile = { version: 1, loops: [] };

export class LoopStoreBusyError extends Error {
  readonly code = "PSTACK_LOOP_STORE_BUSY";

  constructor() {
    super("pstack loop state is busy in another Pi process; retry shortly.");
    this.name = "LoopStoreBusyError";
  }
}

export function loadLoops(): LoopFile { return readJson<LoopFile>(loopsPath(), EMPTY); }
export function saveLoops(file: LoopFile): void { writeJsonAtomic(loopsPath(), file); }

/** Atomic read-modify-write for the shared loop file. Prevents multiple Pi processes from losing updates. */
export function updateLoops<T>(mutate: (file: LoopFile) => T): T {
  const lock = new FileLock(lockPath("loops"));
  if (!lock.acquire()) throw new LoopStoreBusyError();
  try {
    const file = loadLoops();
    const result = mutate(file);
    saveLoops(file);
    return result;
  } finally {
    lock.release();
  }
}

export function parseInterval(raw: string): number | undefined {
  const match = /^(\d+)(m|h|d)$/i.exec(raw.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  if (!Number.isSafeInteger(n) || n < 1) return undefined;
  const factor = match[2]!.toLowerCase() === "m" ? 60_000 : match[2]!.toLowerCase() === "h" ? 3_600_000 : 86_400_000;
  const ms = n * factor;
  return ms >= MIN && ms <= MAX ? ms : undefined;
}
export function formatInterval(ms: number): string {
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000}d`;
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  return `${ms / 60_000}m`;
}
export function createLoop(sessionId: string, intervalMs: number, task: string, missedPolicy: LoopRecord["missedPolicy"], now = Date.now()): LoopRecord {
  if (intervalMs < MIN || intervalMs > MAX) throw new Error("Interval must be from 1m to 7d.");
  const clean = task.trim();
  if (!clean) throw new Error("Loop task cannot be empty.");
  return {
    id: `loop_${randomUUID().replaceAll("-", "").slice(0, 8)}`,
    sessionId,
    intervalMs,
    task: clean,
    enabled: true,
    createdAt: new Date(now).toISOString(),
    nextRunAt: new Date(now + intervalMs).toISOString(),
    missedPolicy,
  };
}
