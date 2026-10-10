import { assertGitHubRepository } from "../delivery/git.js";
import { assertSessionOwner } from "../runtime/ownership.js";
import { object, string, enums, array, number } from "./schema.js";
import { verify } from "../verification/runner.js";
import { fingerprint } from "../artifacts/fingerprint.js";
import { protocol } from "../runtime/protocol.js";
import { contextSnapshot } from "../context/snapshot.js";
import { GitHubCLI } from "../delivery/provider.js";
import { refresh, eligibility } from "../delivery/frontier.js";
import { ProgramCoordinator } from "../program/coordinator.js";
const reply = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], details: value });
export function registerProtocolTools(pi, engine) {
    const owned = (id, ctx) => { const w = engine.get(id); assertSessionOwner(w, ctx.sessionManager.getSessionId()); return w; };
    pi.registerTool({ name: 'pstack_verify', label: 'Pstack Verification', description: 'Inspect current repository fingerprint or run the persisted deterministic gates for a workflow call. Command permissions come from operator verification-policy.json, never from agent text.', parameters: object({ action: enums(['fingerprint', 'run', 'run-pr', 'ledger', 'contract', 'revise']), id: string(), key: string(), brief: { type: 'object', additionalProperties: true }, reason: string(), repo: string(), number: number() }, ['action']), executionMode: 'sequential', async execute(_id, p, _signal, _update, ctx) {
            if (p.action === 'fingerprint')
                return reply(fingerprint(ctx.cwd));
            const w = owned(p.id, ctx);
            const c = w.calls[p.key];
            if (!c)
                throw new Error('Unknown call');
            if (p.action === 'contract')
                return reply(c.brief ?? { contractLevel: 'legacy', verification: 'unknown' });
            if (p.action === 'revise')
                return reply(engine.reviseBrief(w.id, c.key, p.brief, 'coordinator', p.reason));
            if (p.action === 'ledger') {
                const l = c.verification?.ledgerId ? protocol().ledgers[c.verification.ledgerId] : undefined;
                return reply({ ledger: l ?? null, current: engine.accepted(c), verification: c.verification ?? 'unknown' });
            }
            if (!c.brief || c.state !== 'completed' || !c.cwd)
                throw new Error('Completed call with brief and artifact cwd required');
            const agent = c.agentId ? (await import("../runtime/store.js")).readJson((await import("../runtime/home.js")).agentPath(c.agentId), undefined) : undefined;
            if (!agent)
                throw new Error('Agent artifact record missing');
            if (p.action === 'run-pr') {
                assertGitHubRepository(c.cwd, p.repo);
                const actual = await new GitHubCLI().read(p.repo, p.number);
                const current = fingerprint(c.cwd, 'committed');
                if (actual.headSha !== current.commitSha || actual.state !== 'OPEN')
                    throw new Error('PR_HEAD_MISMATCH');
                return reply(await verify(c.cwd, c.brief, { before: agent.baseline, report: agent.report, pr: { repoId: current.repoId, number: p.number, headSha: actual.headSha }, signal: _signal }));
            }
            await engine.verifyCall(w.id, c.key, agent);
            return reply(engine.get(w.id)?.calls[c.key]);
        } });
    pi.registerTool({ name: 'pstack_delivery', label: 'Pstack Delivery Plan', description: 'Read live GitHub PR stack state and return deterministic shipping blockers. This tool never merges; authorized merge is a human CLI operation.', parameters: object({ id: string(), repo: string(), numbers: array(number()), requireReview: { type: 'boolean' }, requireBehavior: { type: 'boolean' } }, ['id', 'repo', 'numbers']), executionMode: 'sequential', async execute(_id, p, _signal, _update, ctx) {
            assertGitHubRepository(ctx.cwd, p.repo);
            const f = await refresh({ ...p, repoId: fingerprint(ctx.cwd).repoId, owner: ctx.sessionManager.getSessionId() }, new GitHubCLI());
            return reply({ frontier: f, decisions: eligibility(f), dryRun: true });
        } });
    pi.registerTool({ name: 'pstack_context', label: 'Pstack Context Snapshot', description: 'Rebuild authoritative handoff and current evidence status from durable records.', parameters: object({}), async execute(_id, _p, _signal, _update, ctx) { return reply(contextSnapshot(engine, ctx.sessionManager.getSessionId())); } });
    const coordinator = new ProgramCoordinator(engine);
    pi.registerTool({ name: 'pstack_program', label: 'Pstack Program', description: 'Create, run, drain, pause and close strict unit programs with a pilot and rolling concurrency. Close checks every unit and its current evidence.', parameters: object({ action: enums(['create', 'run', 'status', 'drain', 'pause', 'resume', 'orders', 'close']), id: string(), units: array({ type: 'object', additionalProperties: true }), maxConcurrency: number(), standingOrders: array(string()), reason: string() }, ['action']), executionMode: 'sequential', async execute(_id, p, _signal, _update, ctx) {
            const owner = ctx.sessionManager.getSessionId();
            if (p.action === 'create')
                return reply(coordinator.create(owner, (p.units ?? []).map((u) => ({ ...u, spec: { ...u.spec, cwd: ctx.cwd, parentSessionId: owner } })), p.maxConcurrency));
            if (p.action === 'run')
                return reply(await coordinator.run(p.id, ctx));
            if (p.action === 'status')
                return reply(coordinator.get(p.id, owner));
            if (p.action === 'resume') {
                coordinator.resume(p.id, owner);
                return reply(await coordinator.run(p.id, ctx));
            }
            if (p.action === 'orders')
                return reply(coordinator.updateOrders(p.id, owner, p.standingOrders, p.reason));
            if (p.action === 'drain')
                return reply(coordinator.drain(p.id, owner));
            if (p.action === 'pause')
                return reply(coordinator.pause(p.id, owner));
            return reply(coordinator.close(p.id, owner));
        } });
    for (const [name, action] of [['pstack-contract', 'contract'], ['pstack-ledger', 'ledger']])
        pi.registerCommand(name, { description: `Show ${action} for WORKFLOW KEY`, handler: async (args, ctx) => { const [id, key] = args.trim().split(/\s+/); const w = owned(id, ctx); const c = w.calls[key]; if (!c)
                throw new Error('Unknown call'); ctx.ui.notify(JSON.stringify(action === 'contract' ? c.brief : { ...c.verification, current: engine.accepted(c) }, null, 2), 'info'); } });
    pi.registerCommand('pstack-handoff', { description: 'Reconstruct durable context index', handler: async (_args, ctx) => { ctx.ui.notify(JSON.stringify(contextSnapshot(engine, ctx.sessionManager.getSessionId()), null, 2), 'info'); } });
}
