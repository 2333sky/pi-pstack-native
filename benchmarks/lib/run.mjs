import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { WorkflowEngine } from "../../dist/workflow/engine.js";
import { AgentHost } from "../../dist/agent/host.js";
import { fingerprint } from "../../dist/artifacts/fingerprint.js";
import { workflowPath } from "../../dist/runtime/home.js";
import { protocol } from "../../dist/runtime/protocol.js";
import { writeJsonAtomic } from "../../dist/runtime/store.js";
import { runnerOnce } from "../../dist/runner/service.js";
import { buildBrief, buildWorkspace, git, loadTasks, verificationPolicy } from "./tasks.mjs";
import { FakeProvider, seedAgent } from "./fake-agent.mjs";
import { loadBaselines, loadTaxonomy, metric, unmeasured, validateReport, wilson } from "./report.mjs";

const KIND_CATEGORY = {
  "integration-conflict": "integration-intent-lost",
  "stacked-pull-request": "stack-layer-regression",
  "crash-recovery": "recovery-duplicate-side-effect",
  "adversarial-review-finding": "review-finding-missed",
  "long-context-program": "context-miss",
  "interface-api-regression": "interface-regression",
};

const now = () => new Date().toISOString();
const noGroundTruth = async () => ({ ok: true, detail: "the artifact gates are the ground truth for this task set" });

export async function runTaskSets(options = {}) {
  const output = resolve(options.output ?? "benchmark-tasks");
  const provider = options.provider ?? "fake";
  if (!["fake", "configured"].includes(provider)) throw new Error(`UNKNOWN_PROVIDER: ${provider}`);
  const selected = loadTasks(options.root).filter((task) => !options.only || options.only.includes(task.id));
  if (!selected.length) throw new Error("NO_TASKS_SELECTED");
  for (const task of selected) {
    if (options.effort && options.effort !== task.expects.effort) throw new Error(`EFFORT_MISMATCH: ${task.id} expects ${task.expects.effort}`);
    if (provider === "configured" && options.model !== task.expects.model && !options.allowModelOverride) throw new Error(`MODEL_MISMATCH: ${task.id} expects ${task.expects.model}`);
  }
  if (provider === "configured" && !options.agentDir) throw new Error("CONFIGURED_PROVIDER_REQUIRES_AGENT_DIR");
  mkdirSync(output, { recursive: true });
  const home = join(output, "state");
  mkdirSync(home, { recursive: true });
  const previousHome = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = home;
  writeFileSync(join(home, "verification-policy.json"), JSON.stringify(verificationPolicy(selected)));
  const startedAt = Date.now();
  const runnerResults = [];
  const rows = [];
  try {
    for (const task of selected) {
      rows.push(provider === "fake" ? await runFakeTask(task, options, output) : await runConfiguredTask(task, options, output, runnerResults));
    }
  } finally {
    if (previousHome === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = previousHome;
  }
  const blocked = runnerResults.some((result) => result?.reason === "AUTHENTICATION_UNAVAILABLE") ? "AUTHENTICATION_UNAVAILABLE" : undefined;
  const report = validateReport(buildReport({ rows, selected, options, provider, blocked, startedAt }));
  writeFileSync(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const exitCode = blocked ? 1 : rows.length > 0 && rows.every((row) => row.verified) ? 0 : 1;
  return { report, exitCode, blocked };
}

function workflowSpec(task, workspace, options) {
  return {
    cwd: workspace.cwd,
    parentSessionId: `benchmark-${task.id}`,
    contractLevel: "strict",
    type: task.workflow?.type ?? "graph",
    maxConcurrency: task.workflow?.maxConcurrency ?? 1,
    budget: { maxTimeSeconds: task.budget.timeSeconds, maxCost: task.budget.costUsd, maxTokens: task.budget.tokens },
    nodes: task.nodes.map((node) => ({
      key: node.key, profile: node.profile, task: node.goal, dependsOn: node.dependsOn,
      thinkingLevel: options.effort ?? task.expects.effort,
      ...(options.provider === "configured" ? { model: options.model } : {}),
      brief: buildBrief(task, node, workspace),
    })),
  };
}

async function runFakeTask(task, options, output) {
  const workspace = buildWorkspace(task, join(output, "tasks", task.id));
  const mutants = task.fixture.mutants ?? {};
  const mutantKey = options.mutant ? Object.keys(mutants).find((key) => key === options.mutant || mutants[key].category === options.mutant) : undefined;
  if (options.mutant && !mutantKey) throw new Error(`UNKNOWN_MUTANT: ${task.id}/${options.mutant}`);
  const mutant = mutantKey ? mutants[mutantKey] : undefined;
  const startedAt = Date.now();
  let state = {
    task, workspace, mutant, mutantKey,
    provider: new FakeProvider({ task, workspace, mutant }),
    context: { cwd: workspace.cwd, sessionManager: { getSessionId: () => `benchmark-${task.id}` } },
  };
  state.engine = new WorkflowEngine(state.provider);
  state.workflow = state.engine.create(workflowSpec(task, workspace, options));
  if (PREPARE[task.kind]) state = await PREPARE[task.kind](state);
  await state.engine.run(state.workflow.id, state.context);
  const record = state.engine.get(state.workflow.id);
  const truth = await (GROUND_TRUTH[task.kind] ?? noGroundTruth)(state, record);
  const verified = state.engine.acceptedWorkflow(record) && truth.ok;
  const row = buildRow({ task, workspace, record, truth, verified, startedAt, options, provider: "fake" });
  row.mutant = mutantKey ?? null;
  row.mutantCategory = mutant?.category ?? null;
  return row;
}

async function runConfiguredTask(task, options, output, runnerResults) {
  const workspace = buildWorkspace(task, join(output, "tasks", task.id));
  const startedAt = Date.now();
  const engine = new WorkflowEngine(new AgentHost());
  const workflow = engine.create(workflowSpec(task, workspace, options));
  const results = await runnerOnce({ agentDir: resolve(options.agentDir), model: options.model, workflowIds: [workflow.id] });
  runnerResults.push(...results);
  const record = engine.get(workflow.id);
  const blocked = results.some((result) => result?.reason === "AUTHENTICATION_UNAVAILABLE");
  let truth = { ok: false, detail: "the runner did not execute the workflow" };
  let verified = false;
  if (!blocked) {
    truth = await (GROUND_TRUTH[task.kind] ?? noGroundTruth)({ task, workspace, provider: new AgentHost() }, record);
    verified = engine.acceptedWorkflow(record) && truth.ok;
  }
  const row = buildRow({ task, workspace, record, truth, verified, startedAt, options, provider: "configured" });
  if (blocked) row.failureCategory = "provider-blocked";
  return row;
}

function buildRow({ task, workspace, record, truth, verified, startedAt, options, provider }) {
  const calls = Object.values(record.calls);
  const usage = calls.map((call) => call.usage).filter(Boolean);
  const usageKnown = usage.length === calls.length && calls.length > 0 && usage.every((entry) => typeof entry.tokens === "number" && typeof entry.cost === "number");
  const offline = provider === "fake";
  return {
    id: task.id, kind: task.kind, title: task.title, successCriteria: task.successCriteria,
    verified, failureCategory: verified ? null : classify({ task, record, truth }),
    failureDetail: verified ? null : `${truth.detail}; ${summarize(record)}`,
    expects: task.expects, budgets: task.budget, contextBytes: workspace.contextBytes,
    workspace: { commit: workspace.commitSha, tree: workspace.treeSha, digest: workspace.workspaceDigest, repoId: workspace.repoId },
    nodes: calls.map((call) => ({
      key: call.key, profile: call.profile, state: call.state, attempts: call.attempt,
      gateIds: (call.brief?.verification ?? []).map((gate) => gate.id),
      verification: call.verification?.status ?? "none",
      verificationReason: call.verification?.reason ?? null,
      error: call.error?.code ?? null,
    })),
    groundTruth: { ok: truth.ok, detail: truth.detail },
    mutant: null,
    mutantCategory: null,
    stack: truth.stack ?? null,
    metrics: {
      verifiedTaskSuccess: metric(verified ? 1 : 0, true, null, "artifact gates plus the ground truth check"),
      retries: metric(calls.reduce((total, call) => total + Math.max(0, call.attempt - 1), 0), true, null, "workflow call attempts"),
      humanInterventions: metric(options.interventions ?? 0, true, null, "operator actions recorded in the run manifest"),
      latencyMs: metric(Date.now() - startedAt, true, null, offline ? "harness wall clock; no provider call" : "provider round trip plus gates"),
      tokens: usageKnown && !offline ? metric(usage.reduce((total, entry) => total + entry.tokens, 0), true, null, "provider reported usage") : unmeasured(offline ? "no provider call in this run" : "the provider reported no usage", offline ? "offline fake provider" : "configured provider"),
      costUsd: usageKnown && !offline ? metric(usage.reduce((total, entry) => total + entry.cost, 0), true, null, "provider reported cost") : unmeasured(offline ? "no provider call in this run" : "the provider reported no cost", offline ? "offline fake provider" : "configured provider"),
      integrationFailures: metric(task.kind === "integration-conflict" && !verified ? 1 : 0, true, null, "integration steps that did not verify"),
      recoverySideEffects: metric(task.kind === "crash-recovery" ? truth.duplicates ?? 0 : 0, true, null, task.kind === "crash-recovery" ? "duplicate durable effects after recovery" : "this task set has no recovery step"),
    },
  };
}

function summarize(record) {
  const states = Object.values(record.calls).map((call) => `${call.key}: ${call.state}/${call.verification?.status ?? "unverified"}${call.verification?.reason ? ` (${call.verification.reason})` : ""}${call.error ? ` [${call.error.code}]` : ""}`);
  return `workflow ${record.state}${record.error ? ` [${record.error.code}]` : ""}; ${states.join("; ")}`;
}

function classify({ task, record, truth }) {
  if (truth.ok === false) return truth.category ?? KIND_CATEGORY[task.kind] ?? "unclassified";
  if (record.error?.code === "BUDGET_EXCEEDED") return "budget-exceeded";
  const evidence = Object.values(record.calls).flatMap((call) => (call.verification?.ledgerId ? ledgerEvidence(call.verification.ledgerId) : []));
  const reasons = evidence.map((entry) => entry.reason).filter(Boolean);
  if (reasons.includes("SCOPE_VIOLATION")) return evidence.some((entry) => /checks\//.test(entry.log ?? "")) ? "test-gaming" : "scope-violation";
  if (reasons.includes("HUMAN_APPROVAL_REQUIRED")) return "human-intervention-required";
  if (reasons.some((reason) => ["COMMAND_NOT_ALLOWED", "ENVIRONMENT_UNAVAILABLE", "CHECK_UNAVAILABLE"].includes(reason))) return "harness-gate-unavailable";
  if (Object.values(record.calls).some((call) => call.verification?.reason === "TASK_REPORT_INCOMPLETE_OR_MISMATCH")) return "agent-failure";
  if (Object.values(record.calls).some((call) => call.state === "failed" || call.verification?.status === "failed")) return KIND_CATEGORY[task.kind] ?? "behavior-defect-landed";
  return "unclassified";
}

function ledgerEvidence(ledgerId) {
  const ledger = protocol().ledgers[ledgerId];
  if (!ledger) return [];
  return ledger.evidenceRefs.map((id) => protocol().evidence[id]).filter(Boolean).map((entry) => ({
    gateId: entry.gateId, status: entry.status, reason: entry.reason ?? null, log: entry.logPath ? readFileSync(entry.logPath, "utf8") : "",
  }));
}

const PREPARE = {
  "integration-conflict": async (state) => {
    const { task, workspace } = state;
    for (const branch of task.fixture.branches) {
      git(workspace.cwd, "checkout", "-q", "-B", branch.name, workspace.base);
      cpSync(join(task.dir, branch.plan), workspace.cwd, { recursive: true });
      git(workspace.cwd, "add", "-A");
      git(workspace.cwd, "commit", "-qm", `landed ${branch.name}`);
    }
    git(workspace.cwd, "checkout", "-q", workspace.base);
    return state;
  },
  "crash-recovery": async (state) => {
    const { task, workspace, workflow, mutant } = state;
    const crash = task.fixture.crash;
    const completedKey = crash.completed[0];
    const seeder = new FakeProvider({ task, workspace, mutant });
    const baseline = fingerprint(workspace.cwd);
    const applied = await seeder.applyNode(completedKey, workspace.cwd);
    const node = task.nodes.find((entry) => entry.key === completedKey);
    seedAgent(seeder, {
      id: `seed-${completedKey}`, workflowId: workflow.id, callKey: completedKey, profile: node.profile,
      task: node.goal, state: "completed", cwd: workspace.cwd, isolation: "shared",
      createdAt: now(), finishedAt: now(), attempt: 1, depth: 1, baseline,
      report: seeder.reportFor(node, baseline.commitSha, applied.head),
      result: `${completedKey}: landed before the crash`,
      usage: { tokens: null, cost: null, elapsedMs: applied.elapsedMs },
    });
    appendFileSync(join(workspace.cwd, crash.log), `${JSON.stringify({ id: crash.effectId })}\n`);
    const interrupted = task.nodes.find((entry) => entry.key === crash.running);
    const interruptedBaseline = fingerprint(workspace.cwd);
    seedAgent(seeder, {
      id: `seed-${crash.running}`, workflowId: workflow.id, callKey: crash.running, profile: interrupted.profile,
      task: interrupted.goal, state: "running", cwd: workspace.cwd, isolation: "shared",
      createdAt: now(), attempt: 1, depth: 1, baseline: interruptedBaseline,
    });
    const record = state.engine.get(workflow.id);
    const dead = {
      ...record,
      state: "running",
      calls: {
        ...record.calls,
        [completedKey]: { ...record.calls[completedKey], state: "completed", attempt: 1, agentId: `seed-${completedKey}`, cwd: workspace.cwd, finishedAt: now(), result: `${completedKey}: landed before the crash` },
        [crash.running]: { ...record.calls[crash.running], state: "running", attempt: 1, agentId: `seed-${crash.running}`, cwd: workspace.cwd, startedAt: now() },
      },
    };
    writeJsonAtomic(workflowPath(workflow.id), dead);
    return state;
  },
};

const GROUND_TRUTH = {
  "integration-conflict": async (state) => {
    const { workspace } = state;
    const unmerged = git(workspace.cwd, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
    const parents = git(workspace.cwd, "log", "-1", "--format=%P").split(" ").filter(Boolean);
    return { ok: unmerged.length === 0 && parents.length >= 2, detail: `merge parents ${parents.length}, unresolved paths ${unmerged.length}` };
  },
  "crash-recovery": async (state) => {
    const { task, workspace } = state;
    const log = join(workspace.cwd, task.fixture.crash.log);
    const ids = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line).id) : [];
    const duplicates = ids.length - new Set(ids).size;
    return { ok: duplicates === 0, detail: `duplicate durable effects ${duplicates} of ${ids.length} recorded`, duplicates };
  },
  "adversarial-review-finding": async (state, record) => {
    const { task } = state;
    const truth = task.fixture.groundTruth;
    const findings = record.calls.review?.report?.findings ?? [];
    const named = findings.filter((finding) => `${finding.location}`.includes(truth.symbol) && `${finding.location} ${finding.evidence}`.includes(truth.file));
    const falsePositive = findings.filter((finding) => `${finding.location}`.includes(truth.cleanControl));
    return { ok: findings.length > 0 && named.length > 0 && falsePositive.length === 0, detail: `findings ${findings.length}, naming the planted defect ${named.length}, naming the clean control ${falsePositive.length}` };
  },
  "stacked-pull-request": async (state, record) => {
    const { task, workspace, provider } = state;
    const heads = task.fixture.stack.map((key) => {
      const call = record.calls[key];
      const agent = call?.agentId ? provider.get(call.agentId) : undefined;
      return agent?.report?.head ?? null;
    });
    const stack = [];
    for (const [index, key] of task.fixture.stack.entries()) {
      const commit = heads[index];
      const parent = commit ? git(workspace.cwd, "rev-parse", `${commit}^`) : null;
      stack.push({ layer: key, commit, parent });
    }
    const ok = heads.every(Boolean) && stack.every((entry, index) => index === 0 || entry.parent === heads[index - 1]);
    return { ok, detail: `stack heads ${heads.map((head) => String(head).slice(0, 12)).join(" -> ")}`, stack };
  },
};

function buildReport({ rows, selected, options, provider, blocked, startedAt }) {
  const taxonomy = loadTaxonomy();
  const baselines = loadBaselines();
  const verified = rows.filter((row) => row.verified).length;
  const sampleSize = rows.length;
  const repetitions = options.repetitions ?? 1;
  const offline = provider === "fake";
  const scope = offline ? "offline fake provider; measures the harness path, not a model" : "configured provider";
  const interval = repetitions >= 5 ? wilson(verified, sampleSize) : null;
  const model = options.model ?? selected[0].expects.model;
  return {
    schemaVersion: 1,
    generatedAt: now(),
    measurement: {
      mode: blocked ? "provider-blocked" : offline ? "offline-fake" : "configured-provider",
      provider: blocked ? (options.model ?? "").split("/")[0] || "unknown" : offline ? "fake" : (options.model ?? "").split("/")[0] || "unknown",
      model: offline ? null : model,
      effort: options.effort ?? selected[0].expects.effort,
      repetitions,
      credentialedCalls: offline || blocked ? 0 : rows.reduce((total, row) => total + row.nodes.length, 0),
      host: { node: process.version, platform: process.platform },
      proves: offline
        ? ["fixture generation is repeatable", "the workflow, verification and recovery paths run end to end", "the artifact tests reject a mutant plan", "the report schema refuses unmeasured numbers"]
        : ["the configured provider path reaches the runner"],
    },
    taxonomyVersion: taxonomy.version,
    taxonomyReviewedAt: taxonomy.reviewedAt,
    baselines: { measured: baselines.measured, reason: baselines.reason, items: baselines.items, cursorCloudOnly: baselines.cursorCloudOnly },
    declaredBudget: selected.reduce((total, task) => ({ timeSeconds: total.timeSeconds + task.budget.timeSeconds, costUsd: Number((total.costUsd + task.budget.costUsd).toFixed(2)), tokens: total.tokens + task.budget.tokens }), { timeSeconds: 0, costUsd: 0, tokens: 0 }),
    tasks: rows,
    aggregate: {
      sampleSize,
      verified,
      verifiedTaskSuccess: blocked
        ? unmeasured(`runner blocked: ${blocked}`, "configured provider")
        : metric(verified / sampleSize, true, null, scope),
      retries: metric(rows.reduce((total, row) => total + row.metrics.retries.value, 0), true, null, scope),
      humanInterventions: metric(options.interventions ?? 0, true, null, "operator actions recorded in the run manifest"),
      latencyMs: metric(Date.now() - startedAt, true, null, offline ? "harness wall clock; no provider call" : "provider round trip plus gates"),
      tokens: offline || blocked ? unmeasured(blocked ? "runner blocked before any call" : "no provider call in this run", blocked ? "configured provider" : "offline fake provider") : rows.every((row) => row.metrics.tokens.measured) ? metric(rows.reduce((total, row) => total + row.metrics.tokens.value, 0), true, null, "provider reported usage") : unmeasured("some calls reported no usage", "configured provider"),
      costUsd: offline || blocked ? unmeasured(blocked ? "runner blocked before any call" : "no provider call in this run", blocked ? "configured provider" : "offline fake provider") : rows.every((row) => row.metrics.costUsd.measured) ? metric(rows.reduce((total, row) => total + row.metrics.costUsd.value, 0), true, null, "provider reported cost") : unmeasured("some calls reported no cost", "configured provider"),
      integrationFailures: metric(rows.reduce((total, row) => total + row.metrics.integrationFailures.value, 0), true, null, "integration steps that did not verify"),
      recoverySideEffects: metric(rows.reduce((total, row) => total + row.metrics.recoverySideEffects.value, 0), true, null, "duplicate durable effects after recovery"),
      interval95: interval ? { value: interval, method: "wilson-95", reason: null } : { value: null, method: null, reason: `an interval needs five or more repetitions of five or more task sets; this report covers ${repetitions} repetition(s) of ${sampleSize} task set(s)` },
    },
    claims: {
      overallSuperiority: null,
      reason: "No credentialed run exists, so no comparison is claimed. Cursor cloud only capabilities run on a different substrate and are listed separately.",
      comparability: "not-comparable",
    },
  };
}
