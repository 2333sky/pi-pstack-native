import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentHost } from "../agent/host.ts";
import { getProfile } from "../agent/profiles.ts";
import { assertSessionOwner } from "../runtime/ownership.ts";
import { array, enums, object, string } from "./schema.ts";

const PARAMETERS = object({
  action: enums(["run", "start", "status", "list", "send", "stop"], "Operation."),
  evidencePackets: {type:"array",items:{type:"object",additionalProperties:true}},
  brief: {type:"object",additionalProperties:true},
  budget: {type:"object",additionalProperties:true},
  thinkingLevel: enums(["off","minimal","low","medium","high","xhigh","max"]),
  id: string("Agent id for status/send/stop."),
  profile: string("Agent profile, e.g. worker, reviewer, verifier, architect."),
  task: string("Assigned task for run/start; message for send when message is omitted."),
  message: string("Message for send."),
  model: string("Optional provider/model selector or inherit-parent."),
  isolation: enums(["shared", "readonly", "worktree"], "Optional isolation override."),
  cwd: string("Optional working directory. Defaults to current Pi cwd."),
  ids: array(string(), "Reserved for future batch operations."),
}) as any;

function reply(value: unknown) { return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], details: value }; }

export function registerAgentTool(pi: ExtensionAPI, agents: AgentHost): void {
  pi.registerTool({
    name: "pstack_agents",
    label: "Pstack Agents",
    description: "Run and control Pi-native child AgentSessions. Background writable starts default to a worktree. Prefer pstack_workflow for parallel writers, integration, and dependency graphs.",
    promptSnippet: "Launch or inspect Pi-native pstack child agents",
    parameters: PARAMETERS,
    executionMode: "sequential",
    async execute(_id, params: any, _signal, _update, ctx) {
      const sessionId = ctx.sessionManager.getSessionId();
      const owned = (id: string) => { const record = agents.get(id); assertSessionOwner(record, sessionId); return record!; };
      switch (params.action) {
        case "run": {
          if (!params.profile || !params.task) throw new Error("run requires profile and task");
          return reply(await agents.run({ profile: params.profile, task: params.task, cwd: params.cwd || ctx.cwd, isolation: params.isolation, model: params.model, evidencePackets:params.evidencePackets,brief:params.brief,budget:params.budget,thinkingLevel:params.thinkingLevel }, ctx));
        }
        case "start": {
          if (!params.profile || !params.task) throw new Error("start requires profile and task");
          const profile = getProfile(params.profile);
          const isolation = params.isolation ?? (profile.writable ? "worktree" : profile.defaultIsolation);
          return reply(agents.start({ profile: params.profile, task: params.task, cwd: params.cwd || ctx.cwd, isolation, model: params.model, evidencePackets:params.evidencePackets,brief:params.brief,budget:params.budget,thinkingLevel:params.thinkingLevel }, ctx));
        }
        case "status": { if (!params.id) throw new Error("status requires id"); return reply(owned(params.id)); }
        case "list": return reply(agents.list().filter((a) => a.parentSessionId === sessionId));
        case "send": { if (!params.id || !(params.message || params.task)) throw new Error("send requires id and message"); owned(params.id); await agents.send(params.id, params.message || params.task); return reply({ ok: true, id: params.id }); }
        case "stop": { if (!params.id) throw new Error("stop requires id"); owned(params.id); return reply(await agents.stop(params.id)); }
        default: throw new Error(`Unsupported action: ${params.action}`);
      }
    },
  } as any);
}
