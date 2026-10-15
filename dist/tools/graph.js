import { upstreamVersion } from "../runtime/upstream.js";
import { array, enums, number, object, string } from "./schema.js";
const NODE = object({ evidencePackets: { type: "array", items: { type: "object", additionalProperties: true } }, key: string(), profile: string(), task: string(), model: string(), isolation: enums(["shared", "readonly", "worktree"]) }, ["key", "task"]);
const EDGE = object({ from: string(), to: string() }, ["from", "to"]);
const PARAMETERS = object({
    action: enums(["run", "start"]), name: string(), nodes: array(NODE), edges: array(EDGE), maxConcurrency: number(undefined, { minimum: 1, maximum: 16 }),
}, ["action", "nodes", "edges"]);
function reply(value) { return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], details: value }; }
export function registerGraphTool(pi, workflows) {
    pi.registerTool({
        name: "pstack_graph",
        label: "Pstack Graph",
        description: "Low-level durable DAG runner. Edges are dependency arrows from prerequisite to dependent node.",
        parameters: PARAMETERS,
        executionMode: "sequential",
        async execute(_id, params, _signal, _update, ctx) {
            const deps = new Map();
            for (const node of params.nodes)
                deps.set(node.key, []);
            for (const edge of params.edges) {
                if (!deps.has(edge.to) || !deps.has(edge.from))
                    throw new Error(`Unknown edge ${edge.from} -> ${edge.to}`);
                deps.get(edge.to).push(edge.from);
            }
            const record = workflows.create({
                name: params.name,
                type: "graph",
                nodes: params.nodes.map((node) => ({ ...node, dependsOn: deps.get(node.key) })),
                maxConcurrency: params.maxConcurrency,
                parentSessionId: ctx.sessionManager.getSessionId(), cwd: ctx.cwd, pstackVersion: upstreamVersion(),
            });
            return reply(params.action === "run" ? await workflows.run(record.id, ctx) : workflows.start(record.id, ctx));
        },
    });
}
