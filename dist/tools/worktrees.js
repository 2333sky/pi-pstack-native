import { enums, object, string } from "./schema.js";
import { assertSessionOwner } from "../runtime/ownership.js";
const PARAMETERS = object({
    action: enums(["list", "cleanup"], "Operation."),
    id: string("Agent id that owns the worktree."),
}, ["action"]);
function reply(value) {
    return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], details: value };
}
export function registerWorktreeTool(pi, agents) {
    pi.registerTool({
        name: "pstack_worktrees",
        label: "Pstack Worktrees",
        description: "List runtime-owned Git worktrees or safely clean one by agent id. Cleanup refuses dirty worktrees.",
        promptSnippet: "Inspect or clean pstack-owned worktrees",
        parameters: PARAMETERS,
        executionMode: "sequential",
        async execute(_id, params, _signal, _update, ctx) {
            const sessionId = ctx.sessionManager.getSessionId();
            if (params.action === "list") {
                return reply(agents.list().filter((a) => a.worktree && a.parentSessionId === sessionId).map((a) => ({
                    agentId: a.id, workflowId: a.workflowId, callKey: a.callKey, state: a.state,
                    path: a.worktree, branch: a.branch, repoRoot: a.worktreeRepoRoot, baseRef: a.worktreeBaseRef,
                })));
            }
            if (params.action === "cleanup") {
                if (!params.id)
                    throw new Error("cleanup requires id");
                assertSessionOwner(agents.get(params.id), sessionId);
                return reply(await agents.cleanupWorktree(params.id));
            }
            throw new Error(`Unsupported action: ${params.action}`);
        },
    });
}
