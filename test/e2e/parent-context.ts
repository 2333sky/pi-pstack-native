import { createAgentSession, DefaultResourceLoader, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";
import { fingerprint } from "../../src/artifacts/fingerprint.ts";
import type { TaskBrief } from "../../src/contracts/types.ts";
import type { WorkflowRunSpec } from "../../src/runtime/types.ts";
import { MODEL, writeModelConfig } from "./harness.ts";

export const GATE_ALPHA = ["node", "-e", "process.exit(require('fs').readFileSync('alpha.txt','utf8').trim()==='alpha'?0:1)"];
export const GATE_BETA = ["node", "-e", "process.exit(require('fs').readFileSync('beta.txt','utf8').trim()==='beta'?0:1)"];
export const GATE_INTEGRATED = ["node", "-e", "process.exit(require('fs').readFileSync('alpha.txt','utf8').trim()==='alpha'&&require('fs').readFileSync('beta.txt','utf8').trim()==='beta'?0:1)"];
export const GATE_COMMANDS = [GATE_ALPHA, GATE_BETA, GATE_INTEGRATED];

export function strictBrief(id: string, repoId: string, goal: string, include: string[], command: string[]): TaskBrief {
  return {
    id, revision: 1, contractLevel: "strict", goal,
    scope: { include, exclude: [], repoId },
    contextRefs: [],
    acceptance: [{ id: `${id}-ac`, description: "the artifact gate passes on the real checkout", required: true, gateIds: [`${id}-gate`] }],
    verification: [{ id: `${id}-gate`, kind: "command", command, sideEffect: "none", category: "behavior", required: true }],
    timeboxSeconds: 300, forbidden: [], standingOrders: [], reportFormat: "task-report-v1",
  };
}

export function strictWorkflowSpec(cwd: string, parentSessionId?: string): WorkflowRunSpec {
  const repoId = fingerprint(cwd).repoId;
  return {
    name: "e2e-strict-integration",
    type: "graph",
    contractLevel: "strict",
    maxConcurrency: 2,
    cwd,
    ...(parentSessionId ? { parentSessionId } : {}),
    nodes: [
      { key: "alpha", profile: "worker", isolation: "worktree", task: "TASK:alpha write the alpha artifact", brief: strictBrief("e2e-alpha", repoId, "write alpha.txt", ["alpha.txt"], GATE_ALPHA) },
      { key: "beta", profile: "worker", isolation: "worktree", task: "TASK:beta write the beta artifact", brief: strictBrief("e2e-beta", repoId, "write beta.txt", ["beta.txt"], GATE_BETA) },
      { key: "integrate", profile: "integrator", dependsOn: ["alpha", "beta"], task: "TASK:integrate combine both artifacts into the target checkout", brief: strictBrief("e2e-integrate", repoId, "integrate both artifacts", ["alpha.txt", "beta.txt"], GATE_INTEGRATED) },
      { key: "check", profile: "verifier", dependsOn: ["integrate"], task: "TASK:check verify the integrated artifact", brief: strictBrief("e2e-check", repoId, "verify the integrated checkout", ["**"], GATE_INTEGRATED) },
    ],
  };
}

export interface ParentContext {
  session: any;
  ctx: any;
  dispose(): void;
}

export const SIGKILL_SESSION_ID = "e2e-sigkill-parent";

export async function openParentContext(options: { agentDir: string; cwd: string; modelPort: number; sessionDir?: string; sessionId?: string }): Promise<ParentContext> {
  process.env.PI_CODING_AGENT_DIR = options.agentDir;
  writeModelConfig(options.agentDir, options.modelPort);
  const loader = new DefaultResourceLoader({
    cwd: options.cwd, agentDir: options.agentDir,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
  });
  await loader.reload();
  const manager = SessionManager.create(options.cwd, options.sessionDir, options.sessionId ? { id: options.sessionId } : undefined);
  const { session } = await createAgentSession({
    cwd: options.cwd, agentDir: options.agentDir, thinkingLevel: "off",
    sessionManager: manager, resourceLoader: loader, tools: [], customTools: [],
  });
  const model = session.modelRuntime.getModel("loopback", MODEL);
  if (!model) throw new Error("the loopback model is not configured");
  const ctx = { sessionManager: session.sessionManager, modelRegistry: new ModelRegistry(session.modelRuntime), model, thinkingLevel: "off" as const, scopedModels: [] };
  return { session, ctx, dispose: () => session.dispose() };
}
