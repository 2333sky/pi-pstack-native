import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentHost } from "../../src/agent/host.ts";
import { fingerprint } from "../../src/artifacts/fingerprint.ts";
import { saveModels } from "../../src/runtime/config.ts";
import { registerWorkflowTool } from "../../src/tools/workflow.ts";
import { WorkflowEngine } from "../../src/workflow/engine.ts";
import { agentPath, workflowPath } from "../../src/runtime/home.ts";
import { readJson, writeJsonAtomic } from "../../src/runtime/store.ts";
import type { WorkflowRecord } from "../../src/runtime/types.ts";
import { FAKE_PROVIDER, MODEL, git, initFixtureRepo, spawnChild, startModelServer, taskMarker, toolResultText, waitFor, writeVerificationPolicy, type ModelCall, type ModelStep } from "./harness.ts";
import { GATE_COMMANDS, SIGKILL_SESSION_ID, openParentContext, strictWorkflowSpec } from "./parent-context.ts";

const REMOTE = "https://github.com/loopback-owner/lemn-disposable.git";
const SHA = /\b[0-9a-f]{40}\b/g;

interface Workspace { root: string; home: string; agentDir: string; checkout: string; sessionDir: string; restoreEnv(): void; dispose(): void }

function workspace(): Workspace {
  const root = mkdtempSync(join(process.cwd(), ".e2e-workflow-"));
  const home = join(root, "pstack");
  const agentDir = join(root, "pi-agent");
  const checkout = join(root, "checkout");
  mkdirSync(home, { recursive: true });
  const previous = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = home;
  initFixtureRepo(checkout, REMOTE);
  writeVerificationPolicy(home, GATE_COMMANDS);
  return {
    root, home, agentDir, checkout, sessionDir: join(root, "parent-sessions"),
    restoreEnv() { if (previous === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = previous; },
    dispose() { rmSync(root, { recursive: true, force: true }); },
  };
}

function shas(call: ModelCall): string[] {
  return [...toolResultText(call.messages).matchAll(SHA)].map((match) => match[0]);
}

function lastUserText(call: ModelCall): string {
  const user = call.messages.filter((message) => message.role === "user");
  const content = user.at(-1)?.content;
  return typeof content === "string" ? content : Array.isArray(content) ? content.map((part: any) => part.text ?? "").join("") : "";
}

function workerScript(file: string, content: string): (call: ModelCall) => ModelStep {
  return (call) => {
    const found = shas(call);
    switch (call.step) {
      case 0: return { tool: { name: "bash", args: { command: "git rev-parse HEAD" } } };
      case 1: return { tool: { name: "write", args: { path: file, content } } };
      case 2: return { tool: { name: "bash", args: { command: `git add -A && git commit -qm "${taskMarker(lastUserText(call))}"` } } };
      case 3: return { tool: { name: "bash", args: { command: "git rev-parse HEAD" } } };
      default: return { text: report(found[0]!, found.at(-1)!) };
    }
  };
}

function report(base: string, head: string): string {
  return `\`\`\`json\n${JSON.stringify({ status: "completed", artifactRefs: [], base, head, commandsRun: [], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [] })}\n\`\`\``;
}

function integrationScript(): (call: ModelCall) => ModelStep {
  return (call) => {
    const found = shas(call);
    const sources = [...lastUserText(call).matchAll(/workspace: (\S+)/g)].map((match) => match[1]!);
    switch (call.step) {
      case 0: return { tool: { name: "bash", args: { command: "git rev-parse HEAD" } } };
      case 1: return {
        tool: {
          name: "bash",
          args: { command: sources.map((source) => `cp '${source}/alpha.txt' alpha.txt; cp '${source}/beta.txt' beta.txt`).join("; ") },
        },
      };
      case 2: return { tool: { name: "bash", args: { command: "git add -A && git commit -qm integrate" } } };
      case 3: return { tool: { name: "bash", args: { command: "git rev-parse HEAD" } } };
      default: return { text: report(found[0]!, found.at(-1)!) };
    }
  };
}

function verifierScript(): (call: ModelCall) => ModelStep {
  return (call) => {
    const head = lastUserText(call).match(/"head":"([0-9a-f]{40})"/)?.[1] ?? shas(call).at(-1);
    return { text: report(head!, head!) };
  };
}

function script(options: { betaHeld?: () => boolean } = {}): (call: ModelCall) => ModelStep {
  const alpha = workerScript("alpha.txt", "alpha\n");
  const beta = workerScript("beta.txt", "beta\n");
  const integrate = integrationScript();
  const check = verifierScript();
  return (call) => {
    if (call.node === "beta" && call.step === 1 && options.betaHeld?.()) return { hold: true };
    if (call.node === "alpha") return alpha(call);
    if (call.node === "beta") return beta(call);
    if (call.node === "integrate") return integrate(call);
    if (call.node === "check") return check(call);
    throw new Error(`unscripted model request: ${JSON.stringify({ node: call.node, step: call.step })}`);
  };
}

test(`${FAKE_PROVIDER} a strict workflow runs two worktrees, an integrator and deterministic verification`, { timeout: 120_000 }, async () => {
  const w = workspace();
  const model = await startModelServer(script());
  const parent = await openParentContext({ agentDir: w.agentDir, cwd: w.checkout, modelPort: model.port, sessionDir: w.sessionDir });
  const engine = new WorkflowEngine(new AgentHost());
  try {
    const record = engine.create(strictWorkflowSpec(w.checkout, parent.ctx.sessionManager.getSessionId()));
    const done = await engine.run(record.id, parent.ctx);

    assert.equal(done.state, "completed");
    assert.equal(done.verification, "verified");
    const alphaAgent = new AgentHost().get(done.calls.alpha!.agentId!)!;
    const betaAgent = new AgentHost().get(done.calls.beta!.agentId!)!;
    assert.ok(alphaAgent.worktree && betaAgent.worktree, "both writers own a worktree");
    assert.notEqual(alphaAgent.worktree, betaAgent.worktree);
    assert.equal(existsSync(alphaAgent.worktree!), true);
    assert.equal(existsSync(betaAgent.worktree!), true);
    assert.equal(readFileSync(join(alphaAgent.worktree!, "alpha.txt"), "utf8"), "alpha\n");
    assert.equal(readFileSync(join(betaAgent.worktree!, "beta.txt"), "utf8"), "beta\n");

    const integration = model.calls.find((call) => call.node === "integrate" && call.step === 1)!;
    assert.match(lastUserText(integration), new RegExp(`workspace: ${alphaAgent.worktree}`));
    assert.match(lastUserText(integration), new RegExp(`workspace: ${betaAgent.worktree}`));
    assert.equal(done.calls.integrate!.cwd, w.checkout, "the integrator owns the target checkout");
    assert.equal(readFileSync(join(w.checkout, "alpha.txt"), "utf8"), "alpha\n");
    assert.equal(readFileSync(join(w.checkout, "beta.txt"), "utf8"), "beta\n");

    const verifier = model.calls.filter((call) => call.node === "check");
    assert.equal(verifier.length, 1);
    assert.deepEqual([...verifier[0]!.tools].sort(), ["find","grep","ls","pstack_evidence","pstack_skill","read"], "the verifier gets only confined read/resource tools, no commands or writes");
    assert.match(lastUserText(verifier.at(-1)!), /TASK:check/);

    for (const key of ["alpha", "beta", "integrate", "check"]) {
      const call = done.calls[key]!;
      assert.equal(call.verification?.status, "passed", `${key} verification passed`);
      assert.ok(call.verification?.ledgerId, `${key} produced a ledger`);
    }
    assert.equal(done.calls.alpha!.report?.head, git(alphaAgent.worktree!, ["rev-parse", "HEAD"]));
    assert.equal(done.calls.integrate!.report?.head, git(w.checkout, ["rev-parse", "HEAD"]));
  } finally {
    parent.dispose();
    await model.close();
    w.restoreEnv(); w.dispose();
  }
});

test(`${FAKE_PROVIDER} a workflow resumes after SIGKILL without replaying completed calls or external effects`, { timeout: 180_000 }, async () => {
  const w = workspace();
  let held = true;
  const model = await startModelServer(script({ betaHeld: () => held }));
  const child = spawnChild(join(process.cwd(), "test", "e2e", "fixture-child.mjs"), ["workflow", String(model.port), w.home, w.agentDir, w.checkout, w.sessionDir], {});
  let engine: WorkflowEngine | undefined;
  try {
    const workflowId = (await child.waitForLine("WORKFLOW ")).slice("WORKFLOW ".length);
    await waitFor(() => {
      const record = readJson<WorkflowRecord | undefined>(workflowPath(workflowId), undefined);
      return record?.calls.alpha?.state === "completed" && record?.calls.beta?.state === "running";
    }, "alpha completed and beta running");

    const before = readJson<WorkflowRecord | undefined>(workflowPath(workflowId), undefined)!;
    const host = new AgentHost();
    const alphaBefore = host.get(before.calls.alpha!.agentId!)!;
    const betaBefore = host.get(before.calls.beta!.agentId!)!;
    const alphaRequestsBefore = model.calls.filter((call) => call.node === "alpha").length;
    assert.equal(betaBefore.state, "running");
    assert.ok(betaBefore.worktree && existsSync(betaBefore.worktree), "the interrupted worktree survives the crash");

    child.child.kill("SIGKILL");
    const exited = await child.exit;
    assert.equal(exited.signal, "SIGKILL");

    held = false;
    const parent = await openParentContext({ agentDir: w.agentDir, cwd: w.checkout, modelPort: model.port, sessionDir: w.sessionDir, sessionId: SIGKILL_SESSION_ID });
    try {
      engine = new WorkflowEngine(new AgentHost());
      const recovered = engine.recoverSession(SIGKILL_SESSION_ID, parent.ctx);
      assert.deepEqual(recovered.map((record) => record.id), [workflowId]);
      const done = await engine.run(workflowId, parent.ctx);

      assert.equal(done.state, "completed");
      assert.equal(done.calls.alpha!.attempt, 1, "a completed call is not a new business attempt");
      assert.equal(done.calls.beta!.attempt, 1, "process recovery is not a new business attempt");
      assert.equal(model.calls.filter((call) => call.node === "alpha").length, alphaRequestsBefore, "completed work is not replayed");
      const alphaAfter = new AgentHost().get(done.calls.alpha!.agentId!)!;
      const betaAfter = new AgentHost().get(done.calls.beta!.agentId!)!;
      assert.equal(alphaAfter.sessionFile, alphaBefore.sessionFile);
      assert.equal(betaAfter.sessionFile, betaBefore.sessionFile, "the interrupted child resumed its own session");
      assert.equal(betaAfter.worktree, betaBefore.worktree);
      const resumed = model.calls.filter((call) => call.node === "beta").at(-1)!;
      assert.match(lastUserText(resumed), /Resume the interrupted assigned task/);
      assert.equal(readFileSync(join(w.checkout, "beta.txt"), "utf8"), "beta\n");
      assert.equal(model.calls.some((call) => call.node === "check"), true, "verification still runs after the process resume");
    } finally { parent.dispose(); }
  } finally {
    if (child.child.exitCode === null && child.child.signalCode === null) child.child.kill("SIGKILL");
    await model.close();
    w.restoreEnv(); w.dispose();
  }
});

test(`${FAKE_PROVIDER} malformed task reports expose diagnostics and stay blocked`, { timeout: 60_000 }, async () => {
  const w = workspace();
  const model = await startModelServer(() => ({ text: '```json\n{"status":"success","artifactRefs":[],"base":"x","head":"x","commandsRun":[],"evidenceRefs":[],"deviations":[],"unresolved":[],"nextActions":[]}\n```' }));
  const parent = await openParentContext({ agentDir: w.agentDir, cwd: w.checkout, modelPort: model.port, sessionDir: w.sessionDir });
  const engine = new WorkflowEngine(new AgentHost());
  try {
    const spec = strictWorkflowSpec(w.checkout, parent.ctx.sessionManager.getSessionId());
    spec.nodes = [spec.nodes[0]!];
    const wf = engine.create(spec);
    const done = await engine.run(wf.id, parent.ctx);
    const call = done.calls.alpha!;
    assert.equal(call.reportError, 'TASK_REPORT_INCOMPLETE');
    assert.equal(new AgentHost().get(call.agentId!)?.reportError, 'TASK_REPORT_INCOMPLETE');
    assert.equal(call.verification?.status, 'blocked');
    assert.equal(engine.acceptedWorkflow(done), false);
    assert.match(lastUserText(model.calls[0]!), /status must be exactly one of completed, failed, or blocked/);
  } finally { parent.dispose(); await model.close(); w.restoreEnv(); w.dispose(); }
});

test(`${FAKE_PROVIDER} configured review panels dispatch distinct models through Pi sessions`, { timeout: 60_000 }, async () => {
  const w = workspace();
  const sha = git(w.checkout, ['rev-parse', 'HEAD']);
  const output = '```json\n' + JSON.stringify({ status: 'completed', base: sha, head: sha, artifactRefs: [], commandsRun: [], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [], findings: [] }) + '\n```';
  const model = await startModelServer(() => ({ text: output }));
  const other = 'loopback-model-two';
  const parent = await openParentContext({ agentDir: w.agentDir, cwd: w.checkout, modelPort: model.port, sessionDir: w.sessionDir, modelIds: [MODEL, other] });
  try {
    saveModels({ version: 1, roles: {}, thinkingLevel: 'off', panels: { interrogate: [`loopback/${MODEL}`, `loopback/${other}`] } });
    const brief: any = {
      id: 'panel-e2e', revision: 1, contractLevel: 'strict', goal: 'Review base.txt',
      scope: { repoId: fingerprint(w.checkout).repoId, include: ['**'], exclude: [] }, contextRefs: [],
      acceptance: [{ id: 'file', description: 'base exists', required: true, gateIds: ['file'] }],
      verification: [{ id: 'file', kind: 'file', path: 'base.txt', pattern: 'base' }],
      forbidden: [], standingOrders: [], reportFormat: 'task-report-v1', timeboxSeconds: 30,
    };
    const engine = new WorkflowEngine(new AgentHost({ agentDir: w.agentDir, modelRuntime: parent.session.modelRuntime }));
    let tool: any;
    registerWorkflowTool({ registerTool: (value: any) => { tool = value; } } as any, engine);
    const result = await tool.execute('panel', { action: 'run', template: { kind: 'interrogate', brief } }, undefined, undefined, { ...parent.ctx, cwd: w.checkout });
    assert.equal(result.details.state, 'completed');
    assert.deepEqual([result.details.calls['adversary-1'].model, result.details.calls['adversary-2'].model], [`loopback/${MODEL}`, `loopback/${other}`]);
    assert(model.calls.some(call => call.model === MODEL));
    assert(model.calls.some(call => call.model === other));
  } finally { parent.dispose(); await model.close(); w.restoreEnv(); w.dispose(); }
});

test(`${FAKE_PROVIDER} panel model fallback is visible in the durable workflow`, { timeout: 60_000 }, async () => {
  const w = workspace();
  const sha = git(w.checkout, ['rev-parse', 'HEAD']);
  const output = '```json\n' + JSON.stringify({ status: 'completed', base: sha, head: sha, artifactRefs: [], commandsRun: [], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [], findings: [] }) + '\n```';
  const model = await startModelServer(() => ({ text: output }));
  const first = 'claude-opus-4', second = 'claude-sonnet-4';
  const parent = await openParentContext({ agentDir: w.agentDir, cwd: w.checkout, modelPort: model.port, sessionDir: w.sessionDir, modelIds: [MODEL, first, second] });
  try {
    saveModels({ version: 1, roles: { reviewer: 'loopback/claude-opus-5' }, thinkingLevel: 'off', fallbackPolicy: 'same-family', panels: { interrogate: ['loopback/claude-opus-5', `loopback/${second}`] } });
    const brief: any = {
      id: 'fallback-e2e', revision: 1, contractLevel: 'strict', goal: 'Review base.txt',
      scope: { repoId: fingerprint(w.checkout).repoId, include: ['**'], exclude: [] }, contextRefs: [],
      acceptance: [{ id: 'file', description: 'base exists', required: true, gateIds: ['file'] }],
      verification: [{ id: 'file', kind: 'file', path: 'base.txt', pattern: 'base' }],
      forbidden: [], standingOrders: [], reportFormat: 'task-report-v1', timeboxSeconds: 30,
    };
    const host = new AgentHost({ agentDir: w.agentDir, modelRuntime: parent.session.modelRuntime });
    const engine = new WorkflowEngine(host);
    let tool: any;
    registerWorkflowTool({ registerTool: (value: any) => { tool = value; } } as any, engine);
    const result = await tool.execute('panel', { action: 'run', template: { kind: 'interrogate', brief } }, undefined, undefined, { ...parent.ctx, cwd: w.checkout });
    assert.equal(result.details.state, 'completed');
    assert.equal(result.details.calls['adversary-1'].model, `loopback/${first}`);
    assert(result.details.modelNotes.some((note: string) => note.includes('loopback/claude-opus-5') && note.includes(`loopback/${first}`)));
    assert(engine.get(result.details.id)?.modelNotes?.some(note => note.includes('same-family')));
    assert(model.calls.some(call => call.model === first));
    const single = await host.run({ profile: 'reviewer', task: 'Review the checkout', cwd: w.checkout }, parent.ctx);
    assert.equal(single.state, 'completed');
    assert.equal(single.model, `loopback/${first}`);
    assert(single.modelSelection?.notes.some(note => note.includes('loopback/claude-opus-5')));
  } finally { parent.dispose(); await model.close(); w.restoreEnv(); w.dispose(); }
});

test(`${FAKE_PROVIDER} one cross-judge inspects isolated candidates before integration`, { timeout: 90_000 }, async () => {
  const w = workspace();
  const sha = git(w.checkout, ['rev-parse', 'HEAD']);
  const other = 'loopback-model-two', judge = 'loopback-judge';
  const baseReport = { status: 'completed', base: sha, head: sha, artifactRefs: [], commandsRun: [], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [] };
  const reportText = (extra: object = {}) => '```json\n' + JSON.stringify({ ...baseReport, ...extra }) + '\n```';
  const model = await startModelServer(call => {
    const prompt = lastUserText(call);
    if (call.tools.includes('pstack_candidates')) {
      if (call.step === 0) return { tool: { name: 'pstack_candidates', args: { action: 'list' } } };
      if (call.step === 1) return { tool: { name: 'pstack_candidates', args: { action: 'read', candidate: 'candidate-1', path: 'candidate.txt' } } };
      if (call.step === 2) return { tool: { name: 'pstack_candidates', args: { action: 'read', candidate: 'candidate-2', path: 'candidate.txt' } } };
      if (call.step === 3) return { tool: { name: 'pstack_candidates', args: { action: 'read', candidate: 'candidate-1', path: '../outside.txt' } } };
      return { text: reportText({ crossEvaluation: [
        { candidate: 'candidate-1', criterion: 'correctness', score: 9, evidence: ['candidate.txt:1'], weaknesses: [], selectedParts: [] },
        { candidate: 'candidate-2', criterion: 'correctness', score: 8, evidence: ['candidate.txt:1'], weaknesses: [], selectedParts: [] },
      ], selection: { candidates: ['candidate-1'], selectedParts: [] } }) };
    }
    if (prompt.includes('Read each candidate and independently compare')) {
      if (call.step === 0) return { tool: { name: 'write', args: { path: 'integrated.txt', content: 'integrated\n' } } };
      return { text: reportText() };
    }
    if (prompt.includes('Audit final combined artifact')) return { text: reportText() };
    if (call.step === 0) return { tool: { name: 'write', args: { path: 'candidate.txt', content: call.model === MODEL ? 'alpha\n' : 'beta\n' } } };
    return { text: reportText() };
  });
  const parent = await openParentContext({ agentDir: w.agentDir, cwd: w.checkout, modelPort: model.port, sessionDir: w.sessionDir, modelIds: [MODEL, other, judge] });
  try {
    saveModels({ version: 1, roles: {}, thinkingLevel: 'off', panels: { arena: [`loopback/${MODEL}`, `loopback/${other}`], 'arena-judges': [`loopback/${judge}`] } });
    const brief: any = {
      id: 'cross-e2e', revision: 1, contractLevel: 'strict', goal: 'Produce one candidate file',
      scope: { repoId: fingerprint(w.checkout).repoId, include: ['**'], exclude: [] }, contextRefs: [],
      acceptance: [{ id: 'file', description: 'base exists', required: true, gateIds: ['file'] }],
      verification: [{ id: 'file', kind: 'file', path: 'base.txt', pattern: 'base' }],
      forbidden: [], standingOrders: [], reportFormat: 'task-report-v1', timeboxSeconds: 30,
    };
    const host = new AgentHost({ agentDir: w.agentDir, modelRuntime: parent.session.modelRuntime });
    const engine = new WorkflowEngine(host);
    let tool: any;
    registerWorkflowTool({ registerTool: (value: any) => { tool = value; } } as any, engine);
    const result = await tool.execute('arena', { action: 'run', template: { kind: 'arena', brief, rubric: [{ criterion: 'correctness', weight: 1 }] } }, undefined, undefined, { ...parent.ctx, cwd: w.checkout });
    assert.equal(result.details.state, 'completed', JSON.stringify(result.details.calls));
    const judgeCall = result.details.calls['cross-judge'];
    assert.equal(judgeCall.state, 'completed');
    assert.equal(judgeCall.model, `loopback/${judge}`);
    assert.equal(judgeCall.report.crossEvaluation.length, 2);
    const calls = model.calls.filter(call => call.tools.includes('pstack_candidates'));
    assert.equal(calls.length, 5);
    assert.match(toolResultText(calls.at(-1)!.messages), /alpha/);
    assert.match(toolResultText(calls.at(-1)!.messages), /beta/);
    assert.match(toolResultText(calls.at(-1)!.messages), /Path escapes child workspace/);
    assert.equal(readFileSync(join(w.checkout, 'integrated.txt'), 'utf8'), 'integrated\n');
    const saved = host.get(judgeCall.agentId)!;
    assert.equal(saved.candidateInputs?.length, 2);
    writeJsonAtomic(agentPath(saved.id), { ...saved, state: 'running' });
    const recovered = await host.recover({ ...saved, state: 'running' }, parent.ctx);
    assert.equal(recovered.state, 'completed');
    const requestsBefore = model.calls.length;
    const candidate = host.get(result.details.calls['candidate-2'].agentId)!;
    writeFileSync(join(candidate.worktree!, 'candidate.txt'), 'changed after judging\n');
    writeJsonAtomic(agentPath(saved.id), { ...recovered, state: 'running' });
    const stale = await host.recover({ ...recovered, state: 'running' }, parent.ctx);
    assert.equal(stale.state, 'failed');
    assert.match(JSON.stringify(stale.error), /CANDIDATE_ARTIFACT_CHANGED/);
    assert.equal(model.calls.length, requestsBefore);
  } finally { parent.dispose(); await model.close(); w.restoreEnv(); w.dispose(); }
});

test(`${FAKE_PROVIDER} interrogate copies dirty changes and reruns findings in isolated sessions`, { timeout: 90_000 }, async () => {
  const w = workspace();
  const sha = git(w.checkout, ['rev-parse', 'HEAD']);
  writeFileSync(join(w.checkout, 'base.txt'), 'base with uncommitted change\n');
  writeFileSync(join(w.checkout, 'untracked.txt'), 'local context\n');
  const finding = { severity: 'high', location: 'base.txt', description: 'The value differs from intent', evidence: 'cat base.txt', reproduction: { command: ['cat', 'base.txt'], observed: 'base with uncommitted change', expected: 'base' } };
  const output = (findings: any[]) => '```json\n' + JSON.stringify({ status: 'completed', base: sha, head: sha, artifactRefs: [], commandsRun: [['cat', 'base.txt']], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [], findings }) + '\n```';
  const model = await startModelServer(call => {
    const prompt = lastUserText(call);
    if (prompt.includes('Break the stated change') || prompt.includes('Independently rerun each reported command')) {
      if (call.step === 0) return { tool: { name: 'bash', args: { command: 'cat base.txt && cat untracked.txt' } } };
      return { text: output([finding]) };
    }
    return { text: output([]) };
  });
  const other = 'loopback-model-two';
  const parent = await openParentContext({ agentDir: w.agentDir, cwd: w.checkout, modelPort: model.port, sessionDir: w.sessionDir, modelIds: [MODEL, other] });
  try {
    saveModels({ version: 1, roles: {}, thinkingLevel: 'off', panels: { interrogate: [`loopback/${MODEL}`, `loopback/${other}`] } });
    const brief: any = { id: 'repro-e2e', revision: 1, contractLevel: 'strict', goal: 'Review base.txt', scope: { repoId: fingerprint(w.checkout).repoId, include: ['**'], exclude: [] }, contextRefs: [], acceptance: [{ id: 'file', description: 'base exists', required: true, gateIds: ['file'] }], verification: [{ id: 'file', kind: 'file', path: 'base.txt', pattern: 'base' }], forbidden: [], standingOrders: [], reportFormat: 'task-report-v1', timeboxSeconds: 30 };
    const host = new AgentHost({ agentDir: w.agentDir, modelRuntime: parent.session.modelRuntime });
    const engine = new WorkflowEngine(host); let tool: any;
    registerWorkflowTool({ registerTool: (value: any) => { tool = value; } } as any, engine);
    const result = await tool.execute('repro', { action: 'run', template: { kind: 'interrogate', brief } }, undefined, undefined, { ...parent.ctx, cwd: w.checkout });
    assert.equal(result.details.state, 'completed', JSON.stringify(result.details.calls));
    const runs = model.calls.filter(call => call.step === 1 && call.tools.includes('bash'));
    assert.equal(runs.length, 4);
    for (const call of runs) { assert.match(toolResultText(call.messages), /base with uncommitted change/); assert.match(toolResultText(call.messages), /local context/); }
    assert.equal(readFileSync(join(w.checkout, 'base.txt'), 'utf8'), 'base with uncommitted change\n');
    for (const name of ['adversary-1', 'adversary-2']) assert(host.get(result.details.calls[name].agentId)?.worktree);
  } finally { parent.dispose(); await model.close(); w.restoreEnv(); w.dispose(); }
});

test(`${FAKE_PROVIDER} swarm first-pass cancels an in-flight Pi session after verified acceptance`, { timeout: 90_000 }, async () => {
  const w = workspace(); const sha = git(w.checkout, ['rev-parse', 'HEAD']); const other = 'loopback-model-two';
  const output = '```json\n' + JSON.stringify({ status: 'completed', base: sha, head: sha, artifactRefs: [], commandsRun: [], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [] }) + '\n```';
  const model = await startModelServer(call => {
    if (call.model === other) return { hold: true };
    if (call.step === 0) return { tool: { name: 'bash', args: { command: 'node -e "setTimeout(() => console.log(\'ready\'), 500)"' } } };
    return { text: output };
  });
  const parent = await openParentContext({ agentDir: w.agentDir, cwd: w.checkout, modelPort: model.port, sessionDir: w.sessionDir, modelIds: [MODEL, other] });
  try {
    saveModels({ version: 1, roles: {}, thinkingLevel: 'off' });
    const brief: any = { id: 'first-pass-e2e', revision: 1, contractLevel: 'strict', goal: 'Find the first passing candidate', scope: { repoId: fingerprint(w.checkout).repoId, include: ['**'], exclude: [] }, contextRefs: [], acceptance: [{ id: 'file', description: 'base exists', required: true, gateIds: ['file'] }], verification: [{ id: 'file', kind: 'file', path: 'base.txt', pattern: 'base' }], forbidden: [], standingOrders: [], reportFormat: 'task-report-v1', timeboxSeconds: 30 };
    const host = new AgentHost({ agentDir: w.agentDir, modelRuntime: parent.session.modelRuntime }); const engine = new WorkflowEngine(host); let tool: any;
    registerWorkflowTool({ registerTool: (value: any) => { tool = value; } } as any, engine);
    const result = await tool.execute('race', { action: 'run', template: { kind: 'swarm', swarmMode: 'race', selectionPolicy: 'first-pass', candidateCount: 2, models: [`loopback/${MODEL}`, `loopback/${other}`], brief } }, undefined, undefined, { ...parent.ctx, cwd: w.checkout });
    assert.equal(result.details.state, 'completed', JSON.stringify(result.details.calls));
    assert.equal(result.details.firstPassWinner, 'candidate-1');
    assert.equal(result.details.calls['candidate-1'].verification.status, 'passed');
    assert.equal(result.details.calls['candidate-2'].state, 'cancelled');
    assert.equal(result.details.calls['candidate-2'].excludedFromSelection, true);
    assert(model.calls.some(call => call.model === other));
  } finally { parent.dispose(); await model.close(); w.restoreEnv(); w.dispose(); }
});
