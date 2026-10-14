import { upstreamVersion } from "../runtime/upstream.ts";
import { buildTemplate } from "../templates/build.ts";
import { validateBrief } from "../contracts/brief.ts";
import { validateGraph, dependencyEdges } from "../workflow/graph.ts";
import { planArtifacts } from "../workflow/artifacts.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { WorkflowEngine } from "../workflow/engine.ts";
import { chainNodes } from "../workflow/graph.ts";
import { assertSessionOwner } from "../runtime/ownership.ts";
import { array, enums, number, object, string } from "./schema.ts";

const NODE = object({
  evidencePackets: {type:"array",items:{type:"object",additionalProperties:true}},
  brief: { type: "object", additionalProperties: true },
  thinkingLevel: enums(["off","minimal","low","medium","high","xhigh","max"]),
  budget: {type:"object",additionalProperties:true},
  key: string("Unique call key."),
  profile: string("Agent profile. Defaults to worker."),
  task: string("Task for this node."),
  dependsOn: array(string(), "Keys that must complete first."),
  model: string("Optional model selector."),
  isolation: enums(["shared", "readonly", "worktree"]),
}, ["key", "task"]);
const PARAMETERS = object({
  action: enums(["plan", "run", "start", "status", "list", "pause", "resume", "cancel", "retry"], "Operation."),
  template: {type:"object",additionalProperties:true},
  contractLevel: enums(["minimal","strict"]),
  budget: {type:"object",additionalProperties:true},
  dryRun: {type:"boolean"},
  id: string("Workflow id."),
  key: string("Call key for retry."),
  name: string("Human-readable workflow name."),
  mode: enums(["graph", "parallel", "chain", "swarm", "arena", "orchestrate", "review"], "Workflow mode."),
  nodes: array(NODE, "Workflow nodes."),
  maxConcurrency: number("Shared concurrency limit.", { minimum: 1, maximum: 16 }),
}) as any;

function reply(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], details: value }; }
function normalizedNodes(mode: string | undefined, nodes: any[]): any[] {
  if (mode === "chain") return chainNodes(nodes.map(({ dependsOn: _d, ...node }) => node));
  if (mode === "parallel") return nodes.map((node) => ({ ...node, dependsOn: [] }));
  return nodes;
}

export function registerWorkflowTool(pi: ExtensionAPI, workflows: WorkflowEngine): void {
  pi.registerTool({
    name: "pstack_workflow",
    label: "Pstack Workflow",
    description: "Run durable Pi-native dependency graphs. Nodes that completed are not rerun after recovery. Use profiles such as worker, verifier, reviewer, architect, synthesizer, and integrator. Independent parallel writers are isolated; when several writer artifacts form one deliverable, add an integrator node depending on them, then verify the integrated target checkout.",
    promptSnippet: "Run durable pstack multi-agent workflows",
    parameters: PARAMETERS,
    executionMode: "sequential",
    async execute(_id, params: any, _signal, _update, ctx) {
      const sessionId = ctx.sessionManager.getSessionId();
      const owned = (id: string) => { const record = workflows.get(id); assertSessionOwner(record, sessionId); return record!; };
      switch (params.action) {
        case "plan":
        case "run":
        case "start": {
          let plan: ReturnType<typeof buildTemplate> | undefined;
          if (params.template) {plan=buildTemplate(params.template);params.nodes=plan.nodes;params.mode=params.template.kind.startsWith("autopilot")?"graph":params.template.kind;params.budget=params.budget ?? plan.budget;}
          else if (["arena","swarm","review"].includes(params.mode)) throw new Error("SPECIALIZED_MODE_REQUIRES_TEMPLATE");
          if (!Array.isArray(params.nodes) || !params.nodes.length) throw new Error(`${params.action} requires nodes`);
          const nodes=normalizedNodes(params.mode,params.nodes);
          validateGraph(nodes);planArtifacts(nodes);
          for(const n of nodes) {if(params.contractLevel==="strict" && !n.brief)throw new Error("BRIEF_INCOMPLETE");if(n.brief)validateBrief(n.brief);}
          if(params.action==="plan" || params.dryRun) return reply({nodes,edges:dependencyEdges(nodes),plan,budget:params.budget ?? null,dryRun:true});
          const record = workflows.create({
            name: params.name,
            deliveryContract: plan?.deliveryContract,
            type: params.mode || "graph",
            nodes, contractLevel: params.contractLevel, budget:params.budget,
            maxConcurrency: params.maxConcurrency,
            parentSessionId: ctx.sessionManager.getSessionId(),
            cwd: ctx.cwd,
            pstackVersion: upstreamVersion(),
          });
          return reply(params.action === "run" ? await workflows.run(record.id, ctx) : workflows.start(record.id, ctx));
        }
        case "status": { if (!params.id) throw new Error("status requires id"); const w=owned(params.id);return reply({...w,currentAcceptance:Object.fromEntries(Object.values(w.calls).map((c:any)=>[c.key,c.brief?workflows.accepted(c):"unknown"]))}); }
        case "list": return reply(workflows.list(ctx.sessionManager.getSessionId()));
        case "pause": { if (!params.id) throw new Error("pause requires id"); owned(params.id); return reply(workflows.pause(params.id)); }
        case "resume": { if (!params.id) throw new Error("resume requires id"); owned(params.id); return reply(workflows.resume(params.id, ctx)); }
        case "cancel": { if (!params.id) throw new Error("cancel requires id"); owned(params.id); return reply(await workflows.cancel(params.id)); }
        case "retry": { if (!params.id || !params.key) throw new Error("retry requires id and key"); owned(params.id); const next = workflows.retry(params.id, params.key); workflows.start(params.id, ctx); return reply(next); }
        default: throw new Error(`Unsupported action: ${params.action}`);
      }
    },
  } as any);
}
