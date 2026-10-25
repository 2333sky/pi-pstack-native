import { FileLock } from "./lock.ts";
import { lockPath } from "./home.ts";
import { readJson, writeJsonAtomic } from "./store.ts";

// Short-lived state locks are distinct from long-lived execution/checkout locks.
// Every read-modify-write participates in the same cross-process critical section.
const sleepArray = new Int32Array(new SharedArrayBuffer(4));
const DEFAULT_BUDGET_MS = 20_000;
// One uncontended update costs about 16 ms here (read, mutate, fsync, rename), so a
// 70-update contested burst needs about 1.1 s on an idle machine and several times
// that under load. The default budget keeps real contention retryable; only an owner
// that keeps renewing the lock for this long surfaces STATE_BUSY.
function budgetMs(): number {
  const raw = process.env.PSTACK_STATE_LOCK_BUDGET_MS;
  if (raw === undefined) return DEFAULT_BUDGET_MS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 300_000) throw new Error("PSTACK_STATE_LOCK_BUDGET_MS must be an integer between 1 and 300000");
  return value;
}
export function updateRecord<T extends { id: string; revision?: number }>(
  kind: "workflow" | "agent", id: string, path: string,
  change: (record: T) => void, afterSave?: (record: T) => void,
): T {
  const budget = budgetMs();
  const lock = new FileLock(lockPath(`state-${kind}-${id}`), Math.max(15_000, budget));
  const deadline = Date.now() + budget;
  while (!lock.acquire()) {
    if (Date.now() >= deadline) throw new Error(`State for ${kind} ${id} is busy after ${budget} ms of contention; retry the operation.`);
    Atomics.wait(sleepArray, 0, 0, 10);
  }
  try {
    const record = readJson<T | undefined>(path, undefined);
    if (!record) throw new Error(`Unknown ${kind}: ${id}`);
    const previous = record.revision ?? 0;
    change(record);
    record.revision = previous + 1;
    writeJsonAtomic(path, record);
    afterSave?.(record);
    return record;
  } finally { lock.release(); }
}
