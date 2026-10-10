import test from "node:test";
import assert from "node:assert/strict";
import { createLoop, formatInterval, parseInterval } from "../src/loop/store.ts";

test("interval parser is bounded from 1 minute to 7 days", () => {
  assert.equal(parseInterval("1m"), 60_000);
  assert.equal(parseInterval("2h"), 7_200_000);
  assert.equal(parseInterval("7d"), 604_800_000);
  assert.equal(parseInterval("8d"), undefined);
  assert.equal(parseInterval("30s"), undefined);
  assert.equal(formatInterval(7_200_000), "2h");
});

test("loop records schedule the next run deterministically", () => {
  const loop = createLoop("session", 60_000, "check CI", "run-once", 1_000);
  assert.equal(loop.nextRunAt, new Date(61_000).toISOString());
  assert.equal(loop.task, "check CI");
  assert.equal(loop.enabled, true);
});

test("loop store refuses a concurrent writer instead of losing an update", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { FileLock } = await import("../src/runtime/lock.ts");
  const { lockPath } = await import("../src/runtime/home.ts");
  const { updateLoops } = await import("../src/loop/store.ts");
  const old = process.env.PSTACK_NATIVE_HOME;
  const dir = mkdtempSync(join(process.cwd(), ".pstack-loop-lock-"));
  process.env.PSTACK_NATIVE_HOME = dir;
  const lock = new FileLock(lockPath("loops"));
  try {
    assert.equal(lock.acquire(), true);
    assert.throws(() => updateLoops((file) => file.loops.push(createLoop("s", 60_000, "x", "skip"))), /busy in another Pi process/);
  } finally {
    lock.release();
    if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old;
    rmSync(dir, { recursive: true, force: true });
  }
});
