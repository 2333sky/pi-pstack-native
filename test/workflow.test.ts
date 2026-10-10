import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AgentRecord } from "../src/runtime/types.ts";
import { workflowPath } from "../src/runtime/home.ts";
import { writeJsonAtomic } from "../src/runtime/store.ts";
import { WorkflowEngine, type AgentRunner } from "../src/workflow/engine.ts";

type Run = Parameters<AgentRunner["run"]>[0];

class FakeAgents implements AgentRunner {
  active = 0;
  maxActive = 0;
  started: string[] = [];
  recovered: string[] = [];
  records = new Map<string, AgentRecord>();
  delay = 15;

  async run(spec: Run): Promise<AgentRecord> {
    this.active++; this.maxActive = Math.max(this.maxActive, this.active); this.started.push(spec.callKey ?? "?");
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    this.active--;
    const failed = spec.task.includes("FAIL");
    const isolated = spec.isolation === "worktree";
    const record: AgentRecord = {
      id: spec.id!, workflowId: spec.workflowId, callKey: spec.callKey, profile: spec.profile,
      task: spec.task, state: failed ? "failed" : "completed", cwd: isolated ? `/tmp/${spec.callKey}-tree` : spec.cwd, isolation: spec.isolation ?? "shared",
      ...(isolated ? { worktree: `/tmp/${spec.callKey}-tree`, branch: `pstack-native/${spec.callKey}` } : {}),
      createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(), attempt: spec.attempt ?? 1, depth: 1,
      ...(failed ? { error: { code: "TEST", message: "boom", retryable: false, occurredAt: new Date().toISOString() } } : { result: `done:${spec.callKey}` }),
    };
    this.records.set(record.id, record); return record;
  }
  get(id: string) { return this.records.get(id); }
  async stop(id: string) { const r = this.records.get(id)!; const n = { ...r, state: "cancelled" as const }; this.records.set(id,n); return n; }
  async recover(record: AgentRecord) { this.recovered.push(record.callKey ?? "?"); const n = { ...record, state: "completed" as const, result: `resumed:${record.callKey}`, finishedAt: new Date().toISOString() }; this.records.set(record.id,n); return n; }
}

function fakeCtx(sessionId = "s1"): any {
  return { cwd: process.cwd(), sessionManager: { getSessionId: () => sessionId } };
}

async function withHome(fn: (dir: string) => Promise<void>) {
  const old = process.env.PSTACK_NATIVE_HOME;
  const dir = mkdtempSync(join(process.cwd(), ".pstack-wf-"));
  process.env.PSTACK_NATIVE_HOME = dir;
  try { await fn(dir); } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(dir, {recursive:true,force:true}); }
}

test("parallel graph obeys shared concurrency and completes", async () => withHome(async () => {
  const agents = new FakeAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: process.cwd(), parentSessionId: "s1", maxConcurrency: 2, nodes: [
    { key: "a", task: "A" }, { key: "b", task: "B" }, { key: "c", task: "C" },
  ]});
  const done = await engine.run(wf.id, fakeCtx());
  assert.equal(done.state, "completed");
  assert.equal(agents.maxActive, 2);
  assert.equal(Object.values(done.calls).every((c) => c.state === "completed"), true);
}));

test("chain waits for dependencies in order", async () => withHome(async () => {
  const agents = new FakeAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: process.cwd(), nodes: [
    { key: "a", task: "A" },
    { key: "b", task: "B", dependsOn: ["a"] },
    { key: "c", task: "C", dependsOn: ["b"] },
  ]});
  const done = await engine.run(wf.id, fakeCtx());
  assert.equal(done.state, "completed");
  assert.deepEqual(agents.started, ["a", "b", "c"]);
}));

test("failed dependency skips downstream work", async () => withHome(async () => {
  const agents = new FakeAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: process.cwd(), nodes: [
    { key: "a", task: "FAIL" },
    { key: "b", task: "must not run", dependsOn: ["a"] },
  ]});
  const done = await engine.run(wf.id, fakeCtx());
  assert.equal(done.state, "failed");
  assert.equal(done.calls.a.state, "failed");
  assert.equal(done.calls.b.state, "skipped");
  assert.deepEqual(agents.started, ["a"]);
}));

test("retry reruns a failed call and resets failed downstream work", async () => withHome(async () => {
  class RetryAgents extends FakeAgents {
    attempts = new Map<string, number>();
    override async run(spec: Run): Promise<AgentRecord> {
      const key = spec.callKey ?? "?";
      const attempt = (this.attempts.get(key) ?? 0) + 1;
      this.attempts.set(key, attempt);
      if (key === "a" && attempt === 1) {
        this.started.push(key);
        const failed: AgentRecord = {
          id: spec.id!, workflowId: spec.workflowId, callKey: key, profile: spec.profile,
          task: spec.task, state: "failed", cwd: spec.cwd, isolation: spec.isolation ?? "shared",
          createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(), attempt: spec.attempt ?? 1, depth: 1,
          error: { code: "INJECTED", message: "first attempt fails", retryable: true, occurredAt: new Date().toISOString() },
        };
        this.records.set(failed.id, failed);
        return failed;
      }
      return super.run(spec);
    }
  }
  const agents = new RetryAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: process.cwd(), nodes: [
    { key: "a", task: "retry this call" },
    { key: "b", task: "rerun after a succeeds", dependsOn: ["a"] },
  ] });
  const first = await engine.run(wf.id, fakeCtx());
  assert.equal(first.state, "failed");
  assert.equal(first.calls.a.state, "failed");
  assert.equal(first.calls.b.state, "skipped");

  const retried = engine.retry(wf.id, "a");
  assert.equal(retried.state, "created");
  assert.equal(retried.calls.a.state, "pending");
  assert.equal(retried.calls.b.state, "pending");
  const final = await engine.run(wf.id, fakeCtx());
  assert.equal(final.state, "completed");
  assert.equal(final.calls.a.attempt, 2);
  assert.equal(final.calls.b.attempt, 1);
  assert.deepEqual(agents.attempts, new Map([["a", 2], ["b", 1]]));
}));

test("restart resumes only the running child and does not rerun completed nodes", async () => withHome(async () => {
  const agents = new FakeAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: process.cwd(), parentSessionId: "s1", nodes: [
    { key: "a", task: "A" },
    { key: "b", task: "B", dependsOn: ["a"] },
  ]});
  wf.state = "running";
  wf.calls.a.state = "completed"; wf.calls.a.result = "already"; wf.calls.a.attempt = 1; wf.calls.a.agentId = "ag_done";
  wf.calls.b.state = "running"; wf.calls.b.attempt = 1; wf.calls.b.agentId = "ag_resume";
  writeJsonAtomic(workflowPath(wf.id), wf);
  agents.records.set("ag_done", { id:"ag_done",workflowId:wf.id,callKey:"a",profile:"worker",task:"A",state:"completed",cwd:process.cwd(),isolation:"shared",createdAt:new Date().toISOString(),attempt:1,depth:1,result:"already" });
  agents.records.set("ag_resume", { id:"ag_resume",workflowId:wf.id,callKey:"b",profile:"worker",task:"B",state:"running",cwd:process.cwd(),isolation:"shared",createdAt:new Date().toISOString(),attempt:1,depth:1 });
  engine.recoverSession("s1", fakeCtx());
  const done = await engine.run(wf.id, fakeCtx());
  assert.equal(done.state, "completed");
  assert.deepEqual(agents.started, []);
  assert.deepEqual(agents.recovered, ["b"]);
  assert.equal(done.calls.b.attempt, 1, "process recovery is not a new business attempt");
}));

test("verifier with one worker dependency runs against that worker worktree", async () => withHome(async () => {
  class WorktreeAgents extends FakeAgents {
    specs: Run[] = [];
    override async run(spec: Run) {
      this.specs.push(spec);
      const r = await super.run(spec);
      if (spec.callKey === "worker") {
        r.worktree = "/tmp/fake-worker-tree"; r.cwd = r.worktree;
        this.records.set(r.id,r);
      }
      return r;
    }
  }
  const agents = new WorktreeAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: "/repo", nodes: [
    { key: "worker", profile: "worker", task: "change" },
    { key: "verify", profile: "verifier", task: "test", dependsOn: ["worker"] },
  ]});
  const done = await engine.run(wf.id, fakeCtx());
  assert.equal(done.state, "completed");
  const verify = agents.specs.find((s) => s.callKey === "verify")!;
  assert.equal(verify.cwd, "/tmp/fake-worker-tree");
  assert.equal(verify.isolation, "readonly");
}));


test("single writer works in the target checkout while parallel root writers are isolated", async () => withHome(async () => {
  class CaptureAgents extends FakeAgents { specs: Run[] = []; override async run(spec: Run) { this.specs.push(spec); return super.run(spec); } }
  const singleAgents = new CaptureAgents();
  const single = new WorkflowEngine(singleAgents);
  const one = single.create({ cwd: "/repo", nodes: [{ key: "worker", profile: "worker", task: "change" }] });
  await single.run(one.id, fakeCtx());
  assert.equal(singleAgents.specs[0]!.cwd, "/repo");
  assert.equal(singleAgents.specs[0]!.isolation, "shared");

  const parallelAgents = new CaptureAgents();
  const parallel = new WorkflowEngine(parallelAgents);
  const many = parallel.create({ cwd: "/repo", nodes: [
    { key: "a", profile: "worker", task: "A" },
    { key: "b", profile: "worker", task: "B" },
  ]});
  await parallel.run(many.id, fakeCtx());
  assert.deepEqual(parallelAgents.specs.map((x) => x.isolation).sort(), ["worktree", "worktree"]);
}));

test("a writable chain continues in its predecessor workspace", async () => withHome(async () => {
  class CaptureAgents extends FakeAgents { specs: Run[] = []; override async run(spec: Run) { this.specs.push(spec); return super.run(spec); } }
  const agents = new CaptureAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: "/repo", nodes: [
    { key: "a", profile: "worker", task: "A", isolation: "worktree" },
    { key: "b", profile: "worker", task: "B", dependsOn: ["a"] },
  ]});
  await engine.run(wf.id, fakeCtx());
  const b = agents.specs.find((x) => x.callKey === "b")!;
  assert.equal(b.cwd, "/tmp/a-tree");
  assert.equal(b.isolation, "shared");
}));

test("multiple writer outputs require an integrator and the integrator receives artifact locations", async () => withHome(async () => {
  const invalid = new WorkflowEngine(new FakeAgents());
  assert.throws(() => invalid.create({ cwd: "/repo", nodes: [
    { key: "a", profile: "worker", task: "A" },
    { key: "b", profile: "worker", task: "B" },
    { key: "merge", profile: "worker", task: "merge", dependsOn: ["a", "b"] },
  ]}), /Use profile "integrator"/);

  class CaptureAgents extends FakeAgents { specs: Run[] = []; override async run(spec: Run) { this.specs.push(spec); return super.run(spec); } }
  const agents = new CaptureAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: "/repo", nodes: [
    { key: "a", profile: "worker", task: "A" },
    { key: "b", profile: "worker", task: "B" },
    { key: "merge", profile: "integrator", task: "combine", dependsOn: ["a", "b"] },
    { key: "verify", profile: "verifier", task: "verify combined", dependsOn: ["merge"] },
  ]});
  const done = await engine.run(wf.id, fakeCtx());
  assert.equal(done.state, "completed");
  const merge = agents.specs.find((x) => x.callKey === "merge")!;
  assert.equal(merge.cwd, "/repo");
  assert.equal(merge.isolation, "shared");
  assert.match(merge.task, /workspace: \/tmp\/a-tree/);
  assert.match(merge.task, /workspace: \/tmp\/b-tree/);
  assert.match(merge.task, /explicit integration owner/);
  const verify = agents.specs.find((x) => x.callKey === "verify")!;
  assert.equal(verify.cwd, "/repo");
  assert.equal(verify.isolation, "readonly");
}));

test("recovery reattaches every saved running call even when more were running than the current cap", async () => withHome(async () => {
  const agents = new FakeAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: process.cwd(), parentSessionId: "s1", maxConcurrency: 1, nodes: [
    { key: "a", task: "A" }, { key: "b", task: "B" },
  ]});
  wf.state = "running";
  for (const key of ["a", "b"]) {
    const id = `ag_${key}`;
    wf.calls[key]!.state = "running"; wf.calls[key]!.attempt = 1; wf.calls[key]!.agentId = id;
    agents.records.set(id, { id, workflowId:wf.id, callKey:key, profile:"worker", task:key, state:"running", cwd:process.cwd(), isolation:"shared", createdAt:new Date().toISOString(), attempt:1,depth:1 });
  }
  writeJsonAtomic(workflowPath(wf.id), wf);
  const done = await engine.run(wf.id, fakeCtx());
  assert.equal(done.state, "completed");
  assert.deepEqual(agents.recovered.sort(), ["a", "b"]);
  assert.equal(done.calls.a.attempt, 1);
  assert.equal(done.calls.b.attempt, 1);
}));

test("reviewer or verifier cannot pretend to inspect several isolated writer artifacts without integration", async () => withHome(async () => {
  const engine = new WorkflowEngine(new FakeAgents());
  for (const profile of ["reviewer", "verifier"]) {
    assert.throws(() => engine.create({ cwd: "/repo", nodes: [
      { key: "a", profile: "worker", task: "A" },
      { key: "b", profile: "worker", task: "B" },
      { key: "check", profile, task: "check both", dependsOn: ["a", "b"] },
    ]}), /Add an integrator node first/);
  }
}));

test("terminal callback wakes async start/recovery but not a synchronous run twice", async () => withHome(async () => {
  const agents = new FakeAgents();
  const notified: string[] = [];
  const engine = new WorkflowEngine(agents, (record) => notified.push(record.id));
  const sync = engine.create({ cwd: "/repo", nodes: [{ key: "a", task: "A" }] });
  await engine.run(sync.id, fakeCtx());
  assert.deepEqual(notified, [], "synchronous run returns its result through the tool and must not wake again");

  const asyncWf = engine.create({ cwd: "/repo", nodes: [{ key: "b", task: "B" }] });
  engine.start(asyncWf.id, fakeCtx());
  await engine.run(asyncWf.id, fakeCtx());
  assert.deepEqual(notified, [asyncWf.id]);
}));

test("pause stops scheduling new nodes after active work drains; resume continues remaining graph", async () => withHome(async () => {
  class GateAgents extends FakeAgents {
    release!: () => void;
    gate = new Promise<void>((resolve) => { this.release = resolve; });
    override async run(spec: Run): Promise<AgentRecord> {
      this.active++; this.maxActive = Math.max(this.maxActive, this.active); this.started.push(spec.callKey ?? "?");
      if (spec.callKey === "a") await this.gate;
      this.active--;
      const record: AgentRecord = {
        id: spec.id!, workflowId: spec.workflowId, callKey: spec.callKey, profile: spec.profile,
        task: spec.task, state: "completed", cwd: spec.cwd, isolation: spec.isolation ?? "shared",
        createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(), attempt: spec.attempt ?? 1, depth: 1,
        result: `done:${spec.callKey}`,
      };
      this.records.set(record.id, record); return record;
    }
  }
  const agents = new GateAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: "/repo", maxConcurrency: 1, nodes: [
    { key: "a", task: "A" },
    { key: "b", task: "B", dependsOn: ["a"] },
  ]});
  engine.start(wf.id, fakeCtx());
  while (!agents.started.includes("a")) await new Promise((resolve) => setTimeout(resolve, 1));
  const paused = engine.pause(wf.id);
  assert.equal(paused.state, "paused");
  agents.release();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.deepEqual(agents.started, ["a"], "pause must not schedule b after a finishes");
  assert.equal(engine.get(wf.id)!.state, "paused");
  engine.resume(wf.id, fakeCtx());
  const done = await engine.run(wf.id, fakeCtx());
  assert.equal(done.state, "completed");
  assert.deepEqual(agents.started, ["a", "b"]);
}));

test("writer reached through scout cannot collide with an unrelated root writer", async () => withHome(async () => {
  class CaptureAgents extends FakeAgents {
    specs: Run[] = [];
    override async run(spec: Run) { this.specs.push(spec); return super.run(spec); }
  }
  const agents = new CaptureAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: "/repo", maxConcurrency: 3, nodes: [
    { key: "first", profile: "worker", task: "A" },
    { key: "scout", profile: "scout", task: "inspect" },
    { key: "second", profile: "worker", task: "B", dependsOn: ["scout"] },
  ]});
  const done = await engine.run(wf.id, fakeCtx());
  assert.equal(done.state, "completed");
  assert.deepEqual(agents.specs.filter((spec) => spec.profile === "worker").map((spec) => spec.isolation), ["worktree", "worktree"]);
}));

test("hidden multi-writer artifacts require integration before verification or further writes", () => withHome(async () => {
  const engine = new WorkflowEngine(new FakeAgents());
  const prefix = [
    { key: "a", profile: "worker", task: "A" },
    { key: "b", profile: "worker", task: "B" },
    { key: "summary", profile: "synthesizer", task: "summarize", dependsOn: ["a", "b"] },
  ];
  assert.throws(() => engine.create({ cwd: "/repo", nodes: [
    ...prefix, { key: "verify", profile: "verifier", task: "check", dependsOn: ["summary"] },
  ]}), /Add an integrator node first/);
  assert.throws(() => engine.create({ cwd: "/repo", nodes: [
    ...prefix, { key: "next", profile: "worker", task: "continue", dependsOn: ["summary"] },
  ]}), /Use profile "integrator"/);
}));

test("single writer artifact propagates through synthesizer to verifier", async () => withHome(async () => {
  class CaptureAgents extends FakeAgents { specs: Run[] = []; override async run(spec: Run) { this.specs.push(spec); return super.run(spec); } }
  const agents = new CaptureAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: "/repo", nodes: [
    { key: "a", profile: "worker", task: "A", isolation: "worktree" },
    { key: "summary", profile: "synthesizer", task: "summarize", dependsOn: ["a"] },
    { key: "verify", profile: "verifier", task: "verify", dependsOn: ["summary"] },
  ]});
  assert.equal((await engine.run(wf.id, fakeCtx())).state, "completed");
  const verifier = agents.specs.find((spec) => spec.callKey === "verify")!;
  assert.equal(verifier.cwd, "/tmp/a-tree");
  assert.equal(verifier.isolation, "readonly");
}));

test("two incomparable writers cannot share a single predecessor lane", () => withHome(async () => {
  const engine = new WorkflowEngine(new FakeAgents());
  assert.throws(() => engine.create({ cwd: "/repo", nodes: [
    { key: "base", profile: "worker", task: "base" },
    { key: "fork1", profile: "worker", task: "A", dependsOn: ["base"] },
    { key: "fork2", profile: "worker", task: "B", dependsOn: ["base"] },
  ]}), /Concurrent writable calls/);
}));

test("shared override and writable readonly override fail closed", () => withHome(async () => {
  const engine = new WorkflowEngine(new FakeAgents());
  assert.throws(() => engine.create({ cwd: "/repo", nodes: [
    { key: "a", profile: "worker", task: "A", isolation: "shared" },
    { key: "b", profile: "worker", task: "B" },
  ]}), /requires a worktree/);
  assert.throws(() => engine.create({ cwd: "/repo", nodes: [
    { key: "a", profile: "worker", task: "A", isolation: "readonly" },
  ]}), /cannot use readonly isolation/);
}));

test("integrator receives upstream artifact paths hidden behind a summary", async () => withHome(async () => {
  class CaptureAgents extends FakeAgents { specs: Run[] = []; override async run(spec: Run) { this.specs.push(spec); return super.run(spec); } }
  const agents = new CaptureAgents();
  const engine = new WorkflowEngine(agents);
  const wf = engine.create({ cwd: "/repo", nodes: [
    { key: "a", task: "A" }, { key: "b", task: "B" },
    { key: "summary", profile: "synthesizer", task: "summarize", dependsOn: ["a", "b"] },
    { key: "merge", profile: "integrator", task: "merge", dependsOn: ["summary"] },
    { key: "verify", profile: "verifier", task: "check", dependsOn: ["merge"] },
  ]});
  assert.equal((await engine.run(wf.id, fakeCtx())).state, "completed");
  const merge = agents.specs.find((spec) => spec.callKey === "merge")!;
  assert.match(merge.task, /a: workspace: \/tmp\/a-tree/);
  assert.match(merge.task, /b: workspace: \/tmp\/b-tree/);
  assert.equal(agents.specs.find((spec) => spec.callKey === "verify")!.cwd, "/repo");
}));
