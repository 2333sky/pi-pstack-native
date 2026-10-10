import assert from "node:assert/strict";
import test from "node:test";
import { registerAgentTool } from "../src/tools/agents.ts";
import { registerWorkflowTool } from "../src/tools/workflow.ts";
import { registerWorktreeTool } from "../src/tools/worktrees.ts";

function capture(register: (pi: any, runtime: any) => void, runtime: any): any {
  let tool: any;
  register({ registerTool(t: any) { tool = t; } }, runtime);
  return tool;
}
const ctx = { cwd: "/repo", sessionManager: { getSessionId() { return "my-session"; } } } as any;
const otherAgent = { id: "ag_other", state: "running", parentSessionId: "other-session", worktree: "/repo/other" };
const ownAgent = { id: "ag_own", state: "completed", parentSessionId: "my-session", worktree: "/repo/own" };
const otherWorkflow = { id: "wf_other", parentSessionId: "other-session" };
const ownWorkflow = { id: "wf_own", parentSessionId: "my-session" };

test("agent tools do not leak status or let one session control another session's agent", async () => {
  let touched = false;
  const runtime = {
    list: () => [otherAgent, ownAgent],
    get: (id: string) => id === otherAgent.id ? otherAgent : id === ownAgent.id ? ownAgent : undefined,
    send: async () => { touched = true; }, stop: async () => { touched = true; },
  };
  const tool = capture(registerAgentTool, runtime);
  const execute = (action: string, id?: string) => tool.execute("1", { action, id, message: "hello" }, undefined, undefined, ctx);
  assert.deepEqual((await execute("list")).details.map((r: any) => r.id), ["ag_own"]);
  for (const action of ["status", "send", "stop"]) await assert.rejects(() => execute(action, "ag_other"), /not found in this Pi session/);
  assert.equal(touched, false);
  assert.equal((await execute("status", "ag_own")).details.id, "ag_own");
});

test("workflow tools scope every lifecycle operation to the calling session", async () => {
  let mutated = false;
  const runtime = {
    get: (id: string) => id === "wf_other" ? otherWorkflow : ownWorkflow,
    list: () => [ownWorkflow],
    pause: () => { mutated = true; }, resume: () => { mutated = true; },
    cancel: async () => { mutated = true; }, retry: () => { mutated = true; },
  };
  const tool = capture(registerWorkflowTool, runtime);
  for (const action of ["status", "pause", "resume", "cancel", "retry"]) {
    await assert.rejects(() => tool.execute("1", { action, id: "wf_other", key: "a" }, undefined, undefined, ctx), /not found in this Pi session/);
  }
  assert.equal(mutated, false);
});

test("worktree cleanup cannot operate on another session's agent", async () => {
  let removed = false;
  const runtime = {
    get: (id: string) => id === "ag_other" ? otherAgent : ownAgent,
    list: () => [otherAgent, ownAgent],
    cleanupWorktree: async () => { removed = true; },
  };
  const tool = capture(registerWorktreeTool, runtime);
  assert.deepEqual((await tool.execute("1", { action: "list" }, undefined, undefined, ctx)).details.map((a: any) => a.agentId), ["ag_own"]);
  await assert.rejects(() => tool.execute("1", { action: "cleanup", id: "ag_other" }, undefined, undefined, ctx), /not found in this Pi session/);
  assert.equal(removed, false);
});
