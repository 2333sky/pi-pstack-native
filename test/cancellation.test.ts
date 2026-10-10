import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { WorkflowEngine, type AgentRunner } from "../src/workflow/engine.ts";
import type { AgentRecord } from "../src/runtime/types.ts";

async function inHome(fn: () => Promise<void>) {
  const old = process.env.PSTACK_NATIVE_HOME;
  const dir = mkdtempSync(join(process.cwd(), ".pstack-cancel-"));
  process.env.PSTACK_NATIVE_HOME = dir;
  try { await fn(); } finally {
    if (old === undefined) delete process.env.PSTACK_NATIVE_HOME;
    else process.env.PSTACK_NATIVE_HOME = old;
    rmSync(dir, { recursive: true, force: true });
  }
}
const ctx = { sessionManager: { getSessionId: () => "owner" } } as any;
function agent(spec: Parameters<AgentRunner["run"]>[0], state: AgentRecord["state"]): AgentRecord {
  return { id: spec.id!, workflowId: spec.workflowId, callKey: spec.callKey, profile: spec.profile,
    task: spec.task, state, cwd: spec.cwd, isolation: spec.isolation ?? "shared", attempt: spec.attempt ?? 1,
    depth: 1, createdAt: new Date().toISOString() };
}

test("cancel without acknowledgement reports cancelling, never a false terminal success", async () => inHome(async () => {
  let release!: () => void;
  const started = new Promise<void>((resolve) => { release = resolve; });
  let signal!: () => void;
  const gate = new Promise<void>((resolve) => { signal = resolve; });
  const records = new Map<string, AgentRecord>();
  const agents: AgentRunner = {
    async run(spec) { records.set(spec.id!, agent(spec, "running")); release(); await gate; return agent(spec, "cancelled"); },
    get(id) { return records.get(id); },
    async stop(id) { return { ...records.get(id)!, state: "cancelling" }; },
    async recover(record) { return record; },
  };
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: "/repo", nodes: [{ key: "a", task: "edit" }, { key: "b", task: "later", dependsOn: ["a"] }] });
  const running = engine.run(wf.id, ctx);
  await started;
  const pending = await engine.cancel(wf.id);
  assert.equal(pending.state, "cancelling");
  assert.equal(pending.calls.a.state, "running");
  assert.equal(pending.calls.b.state, "cancelled");
  assert.throws(() => engine.retry(wf.id, "b"), /stop all agents/);
  signal();
  assert.equal((await running).state, "cancelled");
}));

test("pause/cancel does not discard a concurrent call settlement", async () => inHome(async () => {
  let trigger!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { trigger = resolve; });
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const records = new Map<string, AgentRecord>();
  const agents: AgentRunner = {
    async run(spec) { records.set(spec.id!, agent(spec, "running")); started(); await gate; return agent(spec, "completed"); },
    get(id) { return records.get(id); },
    async stop(id) { return { ...records.get(id)!, state: "cancelling" }; },
    async recover(record) { return record; },
  };
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: "/repo", nodes: [{ key: "a", task: "edit" }] });
  const running = engine.run(wf.id, ctx);
  await ready;
  engine.pause(wf.id);
  trigger();
  assert.equal((await running).state, "paused");
  assert.equal(engine.get(wf.id)!.calls.a.state, "completed");
}));

test("resume during a paused active call does not strand or spin the executor", async () => inHome(async () => {
  let unblock!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { unblock = resolve; });
  const seen = new Promise<void>((resolve) => { started = resolve; });
  const runner: AgentRunner = {
    async run(spec) { if (spec.callKey === "a") { started(); await gate; } return agent(spec, "completed"); },
    get() { return undefined; },
    async stop() { throw new Error("not needed"); },
    async recover(record) { return record; },
  };
  const engine = new WorkflowEngine(runner);
  const wf = engine.create({ cwd: "/repo", nodes: [{ key: "a", task: "a" }, { key: "b", task: "b", dependsOn: ["a"] }] });
  const run = engine.run(wf.id, ctx);
  await seen;
  engine.pause(wf.id);
  engine.resume(wf.id, ctx);
  unblock();
  assert.equal((await run).state, "completed");
  assert.equal(engine.get(wf.id)!.calls.b.state, "completed");
}));
