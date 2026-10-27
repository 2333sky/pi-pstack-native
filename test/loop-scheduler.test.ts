import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadLoops, updateLoops, type LoopFile } from "../src/loop/store.ts";
import type { LoopRecord } from "../src/runtime/types.ts";

const workerScript = fileURLToPath(new URL("./fixtures/loop-scheduler-worker.mjs", import.meta.url));
const lockScript = fileURLToPath(new URL("./fixtures/loop-lock-holder.mjs", import.meta.url));
const executionLockScript = fileURLToPath(new URL("./fixtures/loop-execution-lock-holder.mjs", import.meta.url));

interface Sandbox {
  root: string;
  home: string;
  previousHome: string | undefined;
  sessionId: string;
  cleanup(): void;
}

interface Child extends ChildProcessWithoutNullStreams {
  capturedOut: string;
  capturedErr: string;
}

interface LockOwner {
  child: Child;
  lockedPath: string;
  releasePath: string;
  releasedPath: string;
}

function sandbox(): Sandbox {
  const root = mkdtempSync(join(process.cwd(), ".pstack-loop-scheduler-"));
  const home = join(root, "pstack-home");
  const previousHome = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = home;
  return {
    root,
    home,
    previousHome,
    sessionId: `scheduler-test-${process.pid}-${Date.now()}-${Math.random()}`,
    cleanup() {
      if (previousHome === undefined) delete process.env.PSTACK_NATIVE_HOME;
      else process.env.PSTACK_NATIVE_HOME = previousHome;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function seedLoop(box: Sandbox, options: { delayMs?: number; intervalMs?: number; task?: string } = {}): LoopRecord {
  const now = Date.now();
  const loop: LoopRecord = {
    id: `loop_test_${Math.random().toString(16).slice(2, 10)}`,
    sessionId: box.sessionId,
    intervalMs: options.intervalMs ?? 60_000,
    task: options.task ?? "scheduler integration task",
    enabled: true,
    createdAt: new Date(now).toISOString(),
    nextRunAt: new Date(now + (options.delayMs ?? 120)).toISOString(),
    missedPolicy: "run-once",
  };
  updateLoops((file) => { file.loops.push(loop); });
  return loop;
}

function launch(script: string, env: NodeJS.ProcessEnv): Child {
  const child = spawn(process.execPath, ["--experimental-strip-types", script], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  }) as Child;
  child.capturedOut = "";
  child.capturedErr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { child.capturedOut += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { child.capturedErr += chunk; });
  return child;
}

function launchLockHolder(box: Sandbox): LockOwner {
  const lockedPath = join(box.root, "lock-held");
  const releasePath = join(box.root, "release-lock");
  const releasedPath = join(box.root, "lock-released");
  const child = launch(lockScript, {
    ...process.env,
    PSTACK_NATIVE_HOME: box.home,
    PSTACK_TEST_LOCKED_FILE: lockedPath,
    PSTACK_TEST_RELEASE_LOCK_FILE: releasePath,
    PSTACK_TEST_RELEASED_FILE: releasedPath,
  });
  return { child, lockedPath, releasePath, releasedPath };
}

function launchExecutionLockHolder(box: Sandbox, loopId: string): LockOwner {
  const lockedPath = join(box.root, "execution-lock-held");
  const releasePath = join(box.root, "release-execution-lock");
  const releasedPath = join(box.root, "execution-lock-released");
  const child = launch(executionLockScript, {
    ...process.env,
    PSTACK_NATIVE_HOME: box.home,
    PSTACK_TEST_SESSION_ID: box.sessionId,
    PSTACK_TEST_LOOP_ID: loopId,
    PSTACK_TEST_LOCKED_FILE: lockedPath,
    PSTACK_TEST_RELEASE_LOCK_FILE: releasePath,
    PSTACK_TEST_RELEASED_FILE: releasedPath,
  });
  return { child, lockedPath, releasePath, releasedPath };
}

function launchWorker(box: Sandbox, name: string, options: {
  mode?: "deliver" | "faults" | "hold";
  retryBaseMs?: number;
  retryMaxMs?: number;
  loopId?: string;
} = {}): {
  child: Child;
  logsPath: string;
  attemptsPath: string;
  deliveriesPath: string;
  readyPath: string;
  stopPath: string;
  stoppedPath: string;
  releaseDeliveryPath: string;
  deliveryReleasedPath: string;
  disablePath: string;
  disabledPath: string;
  removePath: string;
  removedPath: string;
} {
  const logsPath = join(box.root, `${name}.logs.jsonl`);
  const attemptsPath = join(box.root, `${name}.attempts.jsonl`);
  const deliveriesPath = join(box.root, `${name}.deliveries.jsonl`);
  const readyPath = join(box.root, `${name}.ready`);
  const stopPath = join(box.root, `${name}.stop`);
  const stoppedPath = join(box.root, `${name}.stopped`);
  const releaseDeliveryPath = join(box.root, `${name}.release-delivery`);
  const deliveryReleasedPath = join(box.root, `${name}.delivery-released`);
  const disablePath = join(box.root, `${name}.disable`);
  const disabledPath = join(box.root, `${name}.disabled`);
  const removePath = join(box.root, `${name}.remove`);
  const removedPath = join(box.root, `${name}.removed`);
  const child = launch(workerScript, {
    ...process.env,
    PSTACK_NATIVE_HOME: box.home,
    PSTACK_TEST_LOG: logsPath,
    PSTACK_TEST_ATTEMPTS: attemptsPath,
    PSTACK_TEST_DELIVERIES: deliveriesPath,
    PSTACK_TEST_SESSION_ID: box.sessionId,
    PSTACK_TEST_READY_FILE: readyPath,
    PSTACK_TEST_STOP_FILE: stopPath,
    PSTACK_TEST_STOPPED_FILE: stoppedPath,
    PSTACK_TEST_RELEASE_DELIVERY_FILE: releaseDeliveryPath,
    PSTACK_TEST_DELIVERY_RELEASED_FILE: deliveryReleasedPath,
    PSTACK_TEST_DISABLE_FILE: disablePath,
    PSTACK_TEST_DISABLED_FILE: disabledPath,
    PSTACK_TEST_REMOVE_FILE: removePath,
    PSTACK_TEST_REMOVED_FILE: removedPath,
    ...(options.loopId ? { PSTACK_TEST_LOOP_ID: options.loopId } : {}),
    PSTACK_TEST_MODE: options.mode ?? "deliver",
    PSTACK_TEST_RETRY_BASE_MS: String(options.retryBaseMs ?? 35),
    PSTACK_TEST_RETRY_MAX_MS: String(options.retryMaxMs ?? 140),
  });
  return { child, logsPath, attemptsPath, deliveriesPath, readyPath, stopPath, stoppedPath, releaseDeliveryPath, deliveryReleasedPath, disablePath, disabledPath, removePath, removedPath };
}

function records<T>(path: string): T[] {
  try {
    return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function waitUntil(predicate: () => boolean, child?: Child, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    if (child && child.exitCode !== null) {
      throw new Error(`child exited ${child.exitCode}; stdout=${child.capturedOut}; stderr=${child.capturedErr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(predicate(), `condition not reached before timeout${child ? `; stdout=${child.capturedOut}; stderr=${child.capturedErr}` : ""}`);
}

async function waitExit(child: Child, timeoutMs = 1_500): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`child did not exit; stdout=${child.capturedOut}; stderr=${child.capturedErr}`)), timeoutMs);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function releaseOwner(owner: LockOwner | undefined): Promise<void> {
  if (!owner || owner.child.exitCode !== null) return;
  writeFileSync(owner.releasePath, "release");
  await waitUntil(() => existsSync(owner.releasedPath), owner.child, 1_000);
  await waitExit(owner.child);
}

async function stopWorker(child: Child | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  try { await waitExit(child, 1_000); }
  catch { child.kill("SIGKILL"); await waitExit(child, 1_000); }
}

function tickErrors(logsPath: string): Array<{ at: number; message: string; error: { message?: string } }> {
  return records<{ at: number; message: string; error: { message?: string } }>(logsPath)
    .filter((record) => record.message.includes("loop timer tick failed"));
}

async function updateLoopsWithBoundedLockRetry<T>(mutate: (file: LoopFile) => T): Promise<T> {
  const deadline = Date.now() + 2_000;
  let delayMs = 5;
  while (true) {
    try { return updateLoops(mutate); }
    catch (error) {
      if ((error as { code?: unknown }).code !== "PSTACK_LOOP_STORE_BUSY" || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(80, delayMs * 2);
    }
  }
}

test("real timer recovers from a lock held by an independent process without crashing or losing the due loop", { timeout: 8_000 }, async () => {
  const box = sandbox();
  const loop = seedLoop(box, { delayMs: 140 });
  let owner: LockOwner | undefined;
  let worker: ReturnType<typeof launchWorker> | undefined;
  try {
    owner = launchLockHolder(box);
    await waitUntil(() => existsSync(owner!.lockedPath), owner.child);
    worker = launchWorker(box, "recover", { retryBaseMs: 30, retryMaxMs: 120 });
    await waitUntil(() => existsSync(worker!.readyPath), worker.child);
    await waitUntil(() => tickErrors(worker!.logsPath).length >= 1, worker.child);
    assert.equal(worker.child.exitCode, null, "the real timer callback must not terminate its Pi scheduler process");
    assert.match(tickErrors(worker.logsPath)[0]!.error.message ?? "", /busy in another Pi process/);

    await releaseOwner(owner);
    owner = undefined;
    await waitUntil(() => records(worker!.deliveriesPath).length === 1, worker.child);
    const saved = loadLoops().loops.find((item) => item.id === loop.id);
    assert.ok(saved?.lastRunAt, "the due occurrence is durably recorded after lock release");
    assert.ok(Date.parse(saved.nextRunAt) > Date.parse(saved.lastRunAt!), "the next occurrence advances only after recovery");
    assert.equal(records(worker.attemptsPath).length, 1, "the due occurrence is dispatched once");
  } finally {
    await stopWorker(worker?.child);
    await releaseOwner(owner);
    box.cleanup();
  }
});

test("sustained lock contention uses spaced, bounded retries rather than a busy loop", { timeout: 8_000 }, async () => {
  const box = sandbox();
  seedLoop(box, { delayMs: 100 });
  let owner: LockOwner | undefined;
  let worker: ReturnType<typeof launchWorker> | undefined;
  try {
    owner = launchLockHolder(box);
    await waitUntil(() => existsSync(owner!.lockedPath), owner.child);
    worker = launchWorker(box, "backoff", { retryBaseMs: 30, retryMaxMs: 90 });
    await waitUntil(() => existsSync(worker!.readyPath), worker.child);
    await waitUntil(() => tickErrors(worker!.logsPath).length >= 3, worker.child);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const errors = tickErrors(worker.logsPath);
    assert.ok(errors.length >= 3 && errors.length <= 10, `retry cadence should remain bounded; observed ${errors.length} failures`);
    const gaps = errors.slice(1).map((item, index) => item.at - errors[index]!.at);
    assert.ok(gaps.every((gap) => gap >= 15), `timer retries should not spin; observed gaps ${gaps.join(", ")}`);
    assert.equal(worker.child.exitCode, null, "repeated lock failures remain contained in the scheduler process");
    await releaseOwner(owner);
    owner = undefined;
    await waitUntil(() => records(worker!.deliveriesPath).length === 1, worker.child);
  } finally {
    await stopWorker(worker?.child);
    await releaseOwner(owner);
    box.cleanup();
  }
});

test("stop invalidates a pending retry and prevents another timer callback from being registered", { timeout: 8_000 }, async () => {
  const box = sandbox();
  seedLoop(box, { delayMs: 100 });
  let owner: LockOwner | undefined;
  let worker: ReturnType<typeof launchWorker> | undefined;
  try {
    owner = launchLockHolder(box);
    await waitUntil(() => existsSync(owner!.lockedPath), owner.child);
    worker = launchWorker(box, "stop-race", { retryBaseMs: 100, retryMaxMs: 100 });
    await waitUntil(() => existsSync(worker!.readyPath), worker.child);
    await waitUntil(() => tickErrors(worker!.logsPath).length >= 1, worker.child);
    writeFileSync(worker.stopPath, "stop");
    await waitUntil(() => existsSync(worker!.stoppedPath), worker.child);
    const countAtStop = tickErrors(worker.logsPath).length;
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(tickErrors(worker.logsPath).length, countAtStop, "stop must clear the pending retry timer and invalidate callbacks");
    assert.equal(records(worker.attemptsPath).length, 0, "a stopped scheduler must not dispatch the due loop");
    assert.equal(worker.child.exitCode, null, "the worker remains alive after stopping the scheduler");
  } finally {
    await stopWorker(worker?.child);
    await releaseOwner(owner);
    box.cleanup();
  }
});

test("synchronous and asynchronous delivery errors are observable and do not stop later timer runs", { timeout: 8_000 }, async () => {
  const box = sandbox();
  seedLoop(box, { delayMs: 80, intervalMs: 140 });
  let worker: ReturnType<typeof launchWorker> | undefined;
  try {
    worker = launchWorker(box, "errors", { mode: "faults", retryBaseMs: 25, retryMaxMs: 80 });
    await waitUntil(() => existsSync(worker!.readyPath), worker.child);
    await waitUntil(() => records(worker!.attemptsPath).length >= 3 && records(worker!.deliveriesPath).length >= 1, worker.child, 4_000);
    const logText = records<{ message: string; error: { message?: string } }>(worker.logsPath)
      .map((record) => `${record.message}: ${record.error.message ?? ""}`).join("\n");
    assert.match(logText, /injected synchronous delivery failure/);
    assert.match(logText, /injected asynchronous delivery failure/);
    assert.equal(worker.child.exitCode, null, "a rejected Pi send is observed and contained");
  } finally {
    await stopWorker(worker?.child);
    box.cleanup();
  }
});

test("two scheduler processes atomically claim the same due occurrence once", { timeout: 8_000 }, async () => {
  const box = sandbox();
  const loop = seedLoop(box, { delayMs: 120, intervalMs: 60_000 });
  let first: ReturnType<typeof launchWorker> | undefined;
  let second: ReturnType<typeof launchWorker> | undefined;
  try {
    first = launchWorker(box, "multi-a", { retryBaseMs: 25, retryMaxMs: 80 });
    second = launchWorker(box, "multi-b", { retryBaseMs: 25, retryMaxMs: 80 });
    await waitUntil(() => existsSync(first!.readyPath), first.child);
    await waitUntil(() => existsSync(second!.readyPath), second.child);
    await waitUntil(() => records(first!.attemptsPath).length + records(second!.attemptsPath).length >= 1);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const totalAttempts = records(first.attemptsPath).length + records(second.attemptsPath).length;
    assert.equal(totalAttempts, 1, "only one process may claim and dispatch this durable occurrence");
    const persisted = loadLoops().loops.filter((item) => item.id === loop.id);
    assert.equal(persisted.length, 1, "concurrent state writes retain the loop record");
    assert.ok(persisted[0]?.lastRunAt);
    assert.ok(Date.parse(persisted[0]!.nextRunAt) > Date.now());
  } finally {
    await stopWorker(first?.child);
    await stopWorker(second?.child);
    box.cleanup();
  }
});

test("a running loop holds a cross-process execution claim, leaves the next due time intact, and sees updates after completion", { timeout: 8_000 }, async () => {
  const box = sandbox();
  const loop = seedLoop(box, { delayMs: 80, intervalMs: 240, task: "original task" });
  let holder: ReturnType<typeof launchWorker> | undefined;
  let competitor: ReturnType<typeof launchWorker> | undefined;
  try {
    holder = launchWorker(box, "inflight-a", { mode: "hold", retryBaseMs: 25, retryMaxMs: 80 });
    competitor = launchWorker(box, "inflight-b", { retryBaseMs: 25, retryMaxMs: 80 });
    await waitUntil(() => existsSync(holder!.readyPath), holder.child);
    await waitUntil(() => existsSync(competitor!.readyPath), competitor.child);
    await waitUntil(() => records(holder!.attemptsPath).length === 1, holder.child);
    const competingAttemptsBeforeActiveLock = records(competitor.attemptsPath).length;
    const totalAttemptsBeforeActiveLock = records(holder.attemptsPath).length + competingAttemptsBeforeActiveLock;
    const claimedNextRunAt = loadLoops().loops.find((item) => item.id === loop.id)!.nextRunAt;
    await waitUntil(() => records<{ message: string }>(competitor!.logsPath).some((item) => item.message.includes("running in another Pi process")), competitor.child, 3_000);
    assert.equal(records(competitor.attemptsPath).length, competingAttemptsBeforeActiveLock, "a second Pi process must not overlap the active execution");
    assert.equal(loadLoops().loops.find((item) => item.id === loop.id)!.nextRunAt, claimedNextRunAt, "a busy execution lock must not consume the next occurrence");

    await updateLoopsWithBoundedLockRetry((file) => {
      const current = file.loops.find((item) => item.id === loop.id)!;
      current.task = "updated while original task was running";
    });
    writeFileSync(holder.releaseDeliveryPath, "release");
    await waitUntil(() => existsSync(holder!.deliveryReleasedPath), holder.child);
    await waitUntil(() => records(holder!.attemptsPath).length + records(competitor!.attemptsPath).length >= totalAttemptsBeforeActiveLock + 1, undefined, 4_000);
    const secondAttempt = [...records<{ content: string }>(holder.attemptsPath), ...records<{ content: string }>(competitor.attemptsPath)]
      .find((item) => item.content.includes("updated while original task was running"));
    assert.ok(secondAttempt, "the next occurrence uses the updated task after the active execution releases its claim");
    assert.equal(loadLoops().loops.find((item) => item.id === loop.id)?.task, "updated while original task was running");
  } finally {
    await stopWorker(holder?.child);
    await stopWorker(competitor?.child);
    box.cleanup();
  }
});

test("startup catch-up preserves its bounded retry when another process owns the due loop", { timeout: 8_000 }, async () => {
  const box = sandbox();
  const loop = seedLoop(box, { delayMs: 70, intervalMs: 60_000 });
  let owner: LockOwner | undefined;
  let contender: ReturnType<typeof launchWorker> | undefined;
  try {
    owner = launchExecutionLockHolder(box, loop.id);
    await waitUntil(() => existsSync(owner!.lockedPath), owner.child);
    await new Promise((resolve) => setTimeout(resolve, 90));

    contender = launchWorker(box, "catchup-contender", { retryBaseMs: 220, retryMaxMs: 220 });
    await waitUntil(() => existsSync(contender!.readyPath), contender.child);
    await waitUntil(() => records<{ message: string }>(contender!.logsPath).some((item) => item.message.includes("catch-up found an occurrence already running")), contender.child);
    await new Promise((resolve) => setTimeout(resolve, 70));
    const logs = records<{ message: string }>(contender.logsPath);
    assert.equal(logs.filter((item) => item.message.includes("loop timer tick failed")).length, 0,
      "bind must not replace the bounded startup retry with an immediate timer");
    assert.equal(records(contender.attemptsPath).length, 0, "the contender must not overlap the active delivery");

    await releaseOwner(owner);
    owner = undefined;
    await waitUntil(() => records(contender!.deliveriesPath).length === 1, contender.child, 3_000);
    assert.equal(records(contender.attemptsPath).length, 1, "the occurrence is dispatched after the execution lock is released");
  } finally {
    await releaseOwner(owner);
    await stopWorker(contender?.child);
    box.cleanup();
  }
});

test("disabling a loop through the scheduler during an active delivery affects later occurrences", { timeout: 8_000 }, async () => {
  const box = sandbox();
  const loop = seedLoop(box, { delayMs: 80, intervalMs: 160 });
  let worker: ReturnType<typeof launchWorker> | undefined;
  try {
    worker = launchWorker(box, "cancel-inflight", { mode: "hold", retryBaseMs: 25, retryMaxMs: 80, loopId: loop.id });
    await waitUntil(() => existsSync(worker!.readyPath), worker.child);
    await waitUntil(() => records(worker!.attemptsPath).length === 1, worker.child);
    writeFileSync(worker.disablePath, "disable");
    await waitUntil(() => existsSync(worker!.disabledPath), worker.child);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(records(worker.attemptsPath).length, 1, "the in-flight occurrence is not duplicated while being cancelled");
    writeFileSync(worker.releaseDeliveryPath, "release");
    await waitUntil(() => existsSync(worker!.deliveryReleasedPath), worker.child);
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(records(worker.attemptsPath).length, 1, "a disabled loop does not start another occurrence");
    assert.equal(loadLoops().loops.find((item) => item.id === loop.id)?.enabled, false, "completion does not overwrite the cancellation update");
  } finally {
    await stopWorker(worker?.child);
    box.cleanup();
  }
});

test("removing a loop through the scheduler during an active delivery does not recreate it", { timeout: 8_000 }, async () => {
  const box = sandbox();
  const loop = seedLoop(box, { delayMs: 80, intervalMs: 160 });
  let worker: ReturnType<typeof launchWorker> | undefined;
  try {
    worker = launchWorker(box, "delete-inflight", { mode: "hold", retryBaseMs: 25, retryMaxMs: 80, loopId: loop.id });
    await waitUntil(() => existsSync(worker!.readyPath), worker.child);
    await waitUntil(() => records(worker!.attemptsPath).length === 1, worker.child);
    writeFileSync(worker.removePath, "remove");
    await waitUntil(() => existsSync(worker!.removedPath) && readFileSync(worker!.removedPath, "utf8") === "true", worker.child);
    assert.equal(loadLoops().loops.some((item) => item.id === loop.id), false, "the record is removed while the already claimed send is still active");
    writeFileSync(worker.releaseDeliveryPath, "release");
    await waitUntil(() => existsSync(worker!.deliveryReleasedPath), worker.child);
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(records(worker.attemptsPath).length, 1, "a removed loop has no subsequent occurrence");
    assert.equal(loadLoops().loops.some((item) => item.id === loop.id), false, "delivery completion does not restore a deleted record");
  } finally {
    await stopWorker(worker?.child);
    box.cleanup();
  }
});
