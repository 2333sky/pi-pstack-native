import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fingerprint } from "../../dist/artifacts/fingerprint.js";
import { agentPath } from "../../dist/runtime/home.js";
import { writeJsonAtomic } from "../../dist/runtime/store.js";
import { commit, tryGit } from "./tasks.mjs";

const completed = (spec, extra) => ({
  id: spec.id, workflowId: spec.workflowId, callKey: spec.callKey, profile: spec.profile,
  task: spec.task, state: "completed", cwd: spec.cwd, isolation: "shared",
  createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
  attempt: spec.attempt ?? 1, depth: 1, ...extra,
});

/** Deterministic stand-in for a model driven worker: it applies the recorded plan for one node. */
export class FakeProvider {
  constructor({ task, workspace, mutant }) {
    this.task = task;
    this.workspace = workspace;
    this.mutant = mutant;
    this.records = new Map();
    this.findingsFile = mutant?.findings ? join(task.dir, mutant.findings) : join(task.dir, task.fixture.findings ?? "");
  }

  findings() {
    return this.task.fixture.findings || this.mutant?.findings ? JSON.parse(readFileSync(this.findingsFile, "utf8")) : undefined;
  }

  planFor(key) {
    return this.mutant?.plan?.[key] ?? this.task.nodes.find((node) => node.key === key).plan;
  }

  api(cwd) {
    const task = this.task;
    return {
      cwd,
      copy: (dir) => cpSync(join(task.dir, dir), cwd, { recursive: true }),
      write: (path, text) => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), text); },
      read: (path) => readFileSync(join(cwd, path), "utf8"),
      append: (path, value) => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); appendFileSync(join(cwd, path), `${JSON.stringify(value)}\n`); },
      git: (...args) => tryGit(cwd, ...args),
      module: (rel) => import(pathToFileURL(join(cwd, rel)).href),
      findings: () => this.findings(),
    };
  }

  async applyNode(key, cwd) {
    const node = this.task.nodes.find((entry) => entry.key === key);
    const { apply } = await import(pathToFileURL(join(this.task.dir, this.planFor(key))).href);
    const startedAt = Date.now();
    await apply(this.api(cwd));
    const committed = commit(cwd, `${key}: ${node.plannedChanges}`);
    return { key, node, committed, head: committed.head, elapsedMs: Date.now() - startedAt };
  }

  reportFor(node, base, head) {
    const report = {
      status: "completed", artifactRefs: [], base, head, commandsRun: [], evidenceRefs: [],
      deviations: [], unresolved: [], nextActions: [`verify ${node.key}`],
    };
    const requirements = node.reportRequirements;
    if (requirements?.kind === "review") report.findings = this.findings();
    if (requirements?.kind === "coverage") report.coverage = { completed: [...requirements.slices], unresolved: [] };
    return report;
  }

  async run(spec) {
    const node = this.task.nodes.find((entry) => entry.key === spec.callKey);
    const baseline = fingerprint(spec.cwd);
    const applied = await this.applyNode(spec.callKey, spec.cwd);
    const record = completed(spec, {
      baseline, report: this.reportFor(node, baseline.commitSha, applied.head),
      model: spec.model, result: `${node.key}: committed ${applied.head.slice(0, 12)}`,
      usage: { tokens: null, cost: null, elapsedMs: applied.elapsedMs },
    });
    this.records.set(record.id, record);
    writeJsonAtomic(agentPath(record.id), record);
    return record;
  }

  async recover(record, ctx) {
    const node = this.task.nodes.find((entry) => entry.key === record.callKey);
    const applied = await this.applyNode(record.callKey, record.cwd);
    const resumed = { ...record, state: "completed", finishedAt: new Date().toISOString(), report: this.reportFor(node, record.baseline.commitSha, applied.head), result: `${node.key}: resumed ${applied.head.slice(0, 12)}`, usage: { tokens: null, cost: null, elapsedMs: applied.elapsedMs } };
    this.records.set(resumed.id, resumed);
    writeJsonAtomic(agentPath(resumed.id), resumed);
    return resumed;
  }

  get(id) {
    if (this.records.has(id)) return this.records.get(id);
    try { const record = JSON.parse(readFileSync(agentPath(id), "utf8")); this.records.set(id, record); return record; }
    catch { return undefined; }
  }

  async stop(id) {
    const record = this.get(id);
    if (!record) throw new Error(`Unknown agent ${id}`);
    const cancelled = { ...record, state: "cancelled", finishedAt: new Date().toISOString() };
    this.records.set(id, cancelled);
    writeJsonAtomic(agentPath(id), cancelled);
    return cancelled;
  }
}

export function seedAgent(provider, record) {
  provider.records.set(record.id, record);
  writeJsonAtomic(agentPath(record.id), record);
  return record;
}

