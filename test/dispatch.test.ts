import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { capture, fingerprint, git, ownerOf } from "../src/artifacts/fingerprint.ts";
import { WorkflowEngine } from "../src/workflow/engine.ts";
import { ProgramCoordinator } from "../src/program/coordinator.ts";
import { briefDigest, buildDispatch, commitDispatch, dispatchVeto } from "../src/program/dispatch.ts";
import { workflowPath } from "../src/runtime/home.ts";
import { protocol, transact } from "../src/runtime/protocol.ts";
import { listJson, readJson, writeJsonAtomic } from "../src/runtime/store.ts";
import type { WorkflowRecord } from "../src/runtime/types.ts";
import type { TaskBrief } from "../src/contracts/types.ts";

function fixture() {
  const root = mkdtempSync(join(process.cwd(), ".test-dispatch-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  process.env.PSTACK_NATIVE_HOME = join(root, "state");
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["config", "user.email", "test@example.invalid"]);
  writeFileSync(join(repo, "source.txt"), "baseline");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "baseline"]);
  return { root, repo, cleanup() { rmSync(root, { recursive: true, force: true }); delete process.env.PSTACK_NATIVE_HOME; } };
}

function brief(repo: string, id: string): TaskBrief {
  return {
    id, revision: 1, contractLevel: "strict", goal: "Check source",
    scope: { repoId: fingerprint(repo).repoId, include: ["**"], exclude: [] },
    contextRefs: [], acceptance: [{ id: "ac", description: "source valid", required: true, gateIds: ["file"] }],
    verification: [{ id: "file", kind: "file", path: "source.txt", pattern: "baseline", category: "typecheck" }],
    forbidden: [], standingOrders: [], reportFormat: "task-report-v1", timeboxSeconds: 30,
  };
}

function report(fp: { commitSha: string }) {
  return { status: "completed" as const, base: fp.commitSha, head: fp.commitSha, artifactRefs: [], commandsRun: [], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [] };
}

function harness(repo: string) {
  const agents = new Map<string, any>();
  const state = { runs: 0 };
  const host: any = {
    get: (id: string) => agents.get(id),
    async run(spec: any) {
      state.runs += 1;
      const fp = capture(spec.cwd, spec.id, [], "working", { kind: "baseline", owner: ownerOf(spec.brief, { workflowId: spec.workflowId, callKey: spec.callKey }) }).fingerprint;
      const agent = { ...spec, state: "completed", cwd: spec.cwd, baseline: fp, report: report(fp), result: "checked" };
      agents.set(agent.id, agent);
      return agent;
    },
    async recover(agent: any) { return agent; },
    async stop(id: string) { return { ...agents.get(id), state: "cancelled" }; },
  };
  const engine = new WorkflowEngine(host);
  const coordinator = new ProgramCoordinator(engine);
  const ctx: any = { cwd: repo, sessionManager: { getSessionId: () => "session" } };
  const workflows = () => listJson<WorkflowRecord>(dirname(workflowPath("x")));
  return { engine, coordinator, ctx, runs: () => state.runs, workflows };
}

function program(coordinator: ProgramCoordinator, repo: string) {
  return coordinator.create("session", [{ key: "unit", spec: { cwd: repo, nodes: [{ key: "read", profile: "scout", task: "inspect", brief: brief(repo, "unit") }] } }]);
}

test("a crash between the dispatch commit and the workflow file rebuilds it from the record", async (t) => {
  const f = fixture();
  try {
    const h = harness(f.repo);
    const p = program(h.coordinator, f.repo);
    const materialize = h.engine.materialize.bind(h.engine);
    let crash = true;
    t.mock.method(h.engine, "materialize", (record: WorkflowRecord) => {
      if (crash) { crash = false; throw new Error("injected crash before the workflow file"); }
      return materialize(record);
    });
    await assert.rejects(() => h.coordinator.run(p.id, h.ctx), /injected crash/);
    const committed = h.coordinator.get(p.id, "session").units[0]!;
    assert.ok(committed.workflowId, "the unit link commits with the dispatch record");
    assert.equal(existsSync(workflowPath(committed.workflowId!)), false, "no workflow file exists yet");
    assert.equal(h.runs(), 0, "no child starts before the file is rebuilt");
    const dispatches = Object.values(protocol().dispatches);
    assert.equal(dispatches.length, 1);
    assert.equal(dispatches[0]!.state, "committed");

    await h.coordinator.run(p.id, h.ctx);
    assert.equal(h.runs(), 1);
    assert.equal(h.workflows().length, 1);
    assert.equal(h.workflows()[0]!.id, committed.workflowId);
    assert.equal(Object.values(protocol().dispatches).length, 1, "recovery reuses the committed dispatch");
    assert.equal(Object.values(protocol().dispatches)[0]!.state, "materialized");
  } finally { t.mock.restoreAll(); f.cleanup(); }
});

test("duplicate recovery never creates a second dispatch or workflow file", async (t) => {
  const f = fixture();
  try {
    const h = harness(f.repo);
    const p = program(h.coordinator, f.repo);
    const materialize = h.engine.materialize.bind(h.engine);
    let crash = true;
    t.mock.method(h.engine, "materialize", (record: WorkflowRecord) => {
      if (crash) { crash = false; throw new Error("injected crash"); }
      return materialize(record);
    });
    await assert.rejects(() => h.coordinator.run(p.id, h.ctx), /injected crash/);
    await h.coordinator.run(p.id, h.ctx);
    await h.coordinator.run(p.id, h.ctx);
    assert.equal(h.runs(), 1);
    assert.equal(h.workflows().length, 1);
    assert.equal(Object.values(protocol().dispatches).length, 1);
    assert.deepEqual(Object.values(protocol().dispatches).map((d) => d.workflowId), [h.workflows()[0]!.id]);
  } finally { t.mock.restoreAll(); f.cleanup(); }
});

test("a program unit that points at an unregistered workflow file is refused", async () => {
  const f = fixture();
  try {
    const h = harness(f.repo);
    const p = program(h.coordinator, f.repo);
    const orphan = h.engine.create({ cwd: f.repo, nodes: [{ key: "read", profile: "scout", task: "inspect", brief: brief(f.repo, "orphan") }] });
    transact("test-orphan-link", p.id, "test", (s) => {
      const unit = s.programs[p.id].units[0];
      unit.workflowId = orphan.id;
      unit.state = "running";
      return null;
    });
    await assert.rejects(() => h.coordinator.run(p.id, h.ctx), /ORPHAN_WORKFLOW/);
    assert.equal(h.runs(), 0);
    assert.equal(h.workflows().length, 1, "the refused unit creates no second workflow");
    assert.equal(Object.keys(protocol().dispatches).length, 0);
  } finally { f.cleanup(); }
});

test("a workflow file rewritten after the commit is reported as drift", async () => {
  const f = fixture();
  try {
    const h = harness(f.repo);
    const p = program(h.coordinator, f.repo);
    await h.coordinator.run(p.id, h.ctx);
    const id = h.coordinator.get(p.id, "session").units[0]!.workflowId!;
    const dispatch = Object.values(protocol().dispatches)[0]!;
    assert.equal(dispatch.workflowId, id);
    assert.equal(dispatch.briefDigest, briefDigest(h.workflows()[0]!));
    const file = readJson<WorkflowRecord>(workflowPath(id), undefined as any);
    file.calls.read!.brief!.standingOrders = ["rewritten outside the transaction"];
    file.updatedAt = new Date().toISOString();
    writeJsonAtomic(workflowPath(id), file);
    assert.equal(dispatchVeto(id, readJson<WorkflowRecord>(workflowPath(id), undefined as any)), "DISPATCH_DRIFT");
  } finally { f.cleanup(); }
});

test("the dispatch record carries the orders revision and one stable identity", async () => {
  const f = fixture();
  try {
    const h = harness(f.repo);
    const p = program(h.coordinator, f.repo);
    h.coordinator.updateOrders(p.id, "session", ["rule"], "operator update");
    await h.coordinator.run(p.id, h.ctx);
    const dispatch = Object.values(protocol().dispatches)[0]!;
    assert.equal(dispatch.ordersRevision, 1);
    assert.equal(dispatch.programId, p.id);
    assert.equal(dispatch.unitKey, "unit");
    const rebuilt = buildDispatch({ programId: p.id, unitKey: "unit", owner: "session", workflow: dispatch.workflow, ordersRevision: 1 });
    assert.equal(rebuilt.id, dispatch.id, "the dispatch identity is deterministic per program unit");
    assert.equal(commitDispatch(protocol(), rebuilt).id, dispatch.id);
  } finally { f.cleanup(); }
});
