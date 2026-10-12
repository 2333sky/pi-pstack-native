import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { AgentHost } from "../../src/agent/host.ts";
import { WorkflowEngine } from "../../src/workflow/engine.ts";
import { workflowPath } from "../../src/runtime/home.ts";
import { readJson } from "../../src/runtime/store.ts";
import type { WorkflowRecord } from "../../src/runtime/types.ts";
import { FAKE_PROVIDER, git, initFixtureRepo, spawnChild, startModelServer, taskMarker, toolResultText, waitFor, writeVerificationPolicy, type ModelCall, type ModelStep } from "./harness.ts";
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
    assert.deepEqual(verifier[0]!.tools, [], "the verifier cannot run commands or write");
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
