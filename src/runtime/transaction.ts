import { FileLock } from "./lock.ts";
import { lockPath } from "./home.ts";
import { readJson, writeJsonAtomic } from "./store.ts";

// Short-lived state locks are distinct from long-lived execution/checkout locks.
// Every read-modify-write participates in the same cross-process critical section.
const sleepArray = new Int32Array(new SharedArrayBuffer(4));
export function updateRecord<T extends { id: string; revision?: number }>(
  kind: "workflow" | "agent", id: string, path: string,
  change: (record: T) => void, afterSave?: (record: T) => void,
): T {
  const lock = new FileLock(lockPath(`state-${kind}-${id}`), 15_000);
  const deadline = Date.now() + 3000;
  while (!lock.acquire()) {
    if (Date.now() >= deadline) throw new Error(`State for ${kind} ${id} is busy; retry the operation.`);
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
