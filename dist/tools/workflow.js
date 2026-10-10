import { buildTemplate } from "../templates/build.js";
import { validateBrief } from "../contracts/brief.js";
import { validateGraph, dependencyEdges } from "../workflow/graph.js";
import { planArtifacts } from "../workflow/artifacts.js";
import { chainNodes } from "../workflow/graph.js";
import { assertSessionOwner } from "../runtime/ownership.js";
import { array, enums, number, object, string } from "./schema.js";
const NODE = object({
    brief: { type: "object", additionalProperties: true },
    thinkingLevel: enums(["off", "minimal", "low", "medium", "high", "xhigh", "max"]),
    budget: { type: "object", additionalProperties: true },
    key: string("Unique call key."),
    profile: string("Agent profile. Defaults to worker."),
    task: string("Task for this node."),
    dependsOn: array(string(), "Keys that must complete first."),
    model: string("Optional model selector."),
    isolation: enums(["shared", "readonly", "worktree"]),
}, ["key", "task"]);
const PARAMETERS = object({
    action: enums(["plan", "run", "start", "status", "list", "pause", "resume", "cancel", "retry"], "Operation."),
    template: { type: "object", additionalProperties: true },
    contractLevel: enums(["minimal", "strict"]),
    budget: { type: "object", additionalProperties: true },
    dryRun: { type: "boolean" },
    id: string("Workflow id."),
    key: string("Call key for retry."),
    name: string("Human-readable workflow name."),
    mode: enums(["graph", "parallel", "chain", "swarm", "arena", "orchestrate", "review"], "Workflow mode."),
    nodes: array(NODE, "Workflow nodes."),
    maxConcurrency: number("Shared concurrency limit.", { minimum: 1, maximum: 16 }),
});
function reply(value) { return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], details: value }; }
function normalizedNodes(mode, nodes) {
    if (mode === "chain")
        return chainNodes(nodes.map(({ dependsOn: _d, ...node }) => node));
    if (mode === "parallel")
        return nodes.map((node) => ({ ...node, dependsOn: [] }));
    return nodes;
}
export function registerWorkflowTool(pi, workflows) {
    pi.registerTool({
        name: "pstack_workflow",
        label: "Pstack Workflow",
        description: "Run durable Pi-native dependency graphs. Nodes that completed are not rerun after recovery. Use profiles such as worker, verifier, reviewer, architect, synthesizer, and integrator. Independent parallel writers are isolated; when several writer artifacts form one deliverable, add an integrator node depending on them, then verify the integrated target checkout.",
        promptSnippet: "Run durable pstack multi-agent workflows",
        parameters: PARAMETERS,
        executionMode: "sequential",
        async execute(_id, params, _signal, _update, ctx) {
            const sessionId = ctx.sessionManager.getSessionId();
            const owned = (id) => { const record = workflows.get(id); assertSessionOwner(record, sessionId); return record; };
            switch (params.action) {
                case "plan":
                case "run":
                case "start": {
                    let plan;
                    if (params.template) {
                        plan = buildTemplate(params.template);
                        params.nodes = plan.nodes;
                        params.mode = params.template.kind.startsWith("autopilot") ? "graph" : params.template.kind;
                        params.budget = params.budget ?? plan.budget;
                    }
                    else if (["arena", "swarm", "review"].includes(params.mode))
                        throw new Error("SPECIALIZED_MODE_REQUIRES_TEMPLATE");
                    if (!Array.isArray(params.nodes) || !params.nodes.length)
                        throw new Error(`${params.action} requires nodes`);
                    const nodes = normalizedNodes(params.mode, params.nodes);
                    validateGraph(nodes);
                    planArtifacts(nodes);
                    for (const n of nodes) {
                        if (params.contractLevel === "strict" && !n.brief)
                            throw new Error("BRIEF_INCOMPLETE");
                        if (n.brief)
                            validateBrief(n.brief);
                    }
                    if (params.action === "plan" || params.dryRun)
                        return reply({ nodes, edges: dependencyEdges(nodes), plan, budget: params.budget ?? null, dryRun: true });
                    const record = workflows.create({
                        name: params.name,
                        type: params.mode || "graph",
                        nodes, contractLevel: params.contractLevel, budget: params.budget,
                        maxConcurrency: params.maxConcurrency,
                        parentSessionId: ctx.sessionManager.getSessionId(),
                        cwd: ctx.cwd,
                        pstackVersion: "0.15.15",
                    });
                    return reply(params.action === "run" ? await workflows.run(record.id, ctx) : workflows.start(record.id, ctx));
                }
                case "status": {
                    if (!params.id)
                        throw new Error("status requires id");
                    const w = owned(params.id);
                    return reply({ ...w, currentAcceptance: Object.fromEntries(Object.values(w.calls).map((c) => [c.key, c.brief ? workflows.accepted(c) : "unknown"])) });
                }
                case "list": return reply(workflows.list(ctx.sessionManager.getSessionId()));
                case "pause": {
                    if (!params.id)
                        throw new Error("pause requires id");
                    owned(params.id);
                    return reply(workflows.pause(params.id));
                }
                case "resume": {
                    if (!params.id)
                        throw new Error("resume requires id");
                    owned(params.id);
                    return reply(workflows.resume(params.id, ctx));
                }
                case "cancel": {
                    if (!params.id)
                        throw new Error("cancel requires id");
                    owned(params.id);
                    return reply(await workflows.cancel(params.id));
                }
                case "retry": {
                    if (!params.id || !params.key)
                        throw new Error("retry requires id and key");
                    owned(params.id);
                    const next = workflows.retry(params.id, params.key);
                    workflows.start(params.id, ctx);
                    return reply(next);
                }
                default: throw new Error(`Unsupported action: ${params.action}`);
            }
        },
    });
}
