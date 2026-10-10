import { protocol, hash } from "../runtime/protocol.js";
export function contextSnapshot(engine, sessionId, contextTokens, watermark = 100000) {
    const state = protocol();
    const workflows = engine.list(sessionId);
    return {
        schemaVersion: 1, at: new Date().toISOString(), storeRevision: state.revision,
        contextWarning: contextTokens === undefined ? 'unknown' : contextTokens >= watermark ? 'watermark-exceeded' : 'within-watermark',
        workflows: workflows.map(w => ({ id: w.id, state: w.state, goal: w.name ?? w.type, budget: w.budget ?? null, calls: Object.values(w.calls).map(c => ({ key: c.key, execution: c.state, brief: c.brief ? { id: c.brief.id, revision: c.brief.revision, ordersHash: hash(c.brief.standingOrders) } : null, artifactId: c.artifactId ?? null, acceptance: c.brief ? engine.accepted(c) ? 'verified' : c.verification?.status === 'passed' ? 'stale' : c.verification?.status ?? 'unknown' : 'legacy-completed', ledgerId: c.verification?.ledgerId ?? null, usage: c.usage ?? { tokens: null, cost: null }, nextAction: c.state === 'pending' ? 'await-dependencies' : c.brief && !engine.accepted(c) ? 'verify-current-artifact' : 'inspect-report' })) })),
        programs: Object.values(state.programs).filter(p => p.owner === sessionId).map(p => ({ id: p.id, state: p.state, units: p.units.map((u) => ({ key: u.key, state: u.state, workflowId: u.workflowId })), pendingInbox: p.inbox.filter((e) => !e.processed).length })),
        sourceOfTruth: 'Reload Store and live PR provider on resume. This snapshot is an index, never execution authority.'
    };
}
