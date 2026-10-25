import { protocol, transact, uid, hash } from "../runtime/protocol.js";
import { buildDispatch, commitDispatch, materializeDispatch, requireDispatch } from "./dispatch.js";
export function ordersDrift(program, unit) {
    if (!program.orders || !unit.workflowId)
        return undefined;
    if (unit.ordersRevision === program.orders.revision || unit.ordersAcknowledgement?.revision === program.orders.revision)
        return undefined;
    const dispatchedRevision = unit.ordersRevision ?? null;
    return { key: unit.key, dispatchedRevision, currentRevision: program.orders.revision, message: `STALE_ORDERS: unit ${unit.key} was dispatched under orders revision ${dispatchedRevision ?? 'none'}, current revision ${program.orders.revision}` };
}
export class ProgramCoordinator {
    workflows;
    constructor(workflows) { this.workflows = workflows; }
    create(owner, specs, maxConcurrency = 4) {
        if (!specs.length || new Set(specs.map(s => s.key)).size !== specs.length)
            throw new Error('INVALID_UNITS');
        if (specs.some(s => s.spec.nodes.some(n => !n.brief || n.brief.contractLevel !== 'strict')))
            throw new Error('PROGRAM_REQUIRES_STRICT_BRIEFS');
        const p = { id: uid('program'), owner, revision: 0, state: 'pilot', maxConcurrency: Math.max(1, Math.min(16, maxConcurrency)), units: specs.map(s => ({ ...s, state: 'pending', ledgerRefs: [] })), inbox: [], completionPredicate: 'all-units-verified', createdAt: new Date().toISOString() };
        return transact('program-created', p.id, owner, s => { s.programs[p.id] = p; return p; });
    }
    get(id, owner) { const p = protocol().programs[id]; if (!p || p.owner !== owner)
        throw new Error('PROGRAM_NOT_FOUND'); return p; }
    drift(program) { return program.units.flatMap(unit => { const found = ordersDrift(program, unit); return found ? [found] : []; }); }
    assertOrdersDigest(program) { if (program.orders && program.orders.digest !== hash(program.orders.instructions))
        throw new Error('ORDERS_INTEGRITY_MISMATCH: stored standing orders do not match their digest'); }
    blockOrders(id, owner, drift) {
        return transact('program-orders-stale', id, owner, s => { const p = s.programs[id]; p.state = 'blocked'; p.blockedReason = { code: 'ORDERS_STALE', units: drift.map(d => ({ key: d.key, dispatchedRevision: d.dispatchedRevision })), currentRevision: drift[0].currentRevision, message: drift.map(d => d.message).join('; ') }; p.revision++; return p; });
    }
    async run(id, ctx) {
        const owner = ctx.sessionManager.getSessionId();
        const p = this.get(id, owner);
        if (p.state === 'paused' || p.state === 'completed')
            return p;
        this.assertOrdersDigest(p);
        const stale = this.drift(p);
        if (stale.length)
            return this.blockOrders(id, owner, stale);
        const runUnit = async (key) => {
            let unit = this.get(id, owner).units.find(u => u.key === key);
            if (!unit.workflowId) {
                const currentProgram = this.get(id, owner);
                const orders = currentProgram.orders;
                this.assertOrdersDigest(currentProgram);
                const workflow = this.workflows.build({ ...unit.spec, nodes: unit.spec.nodes.map(n => ({ ...n, brief: n.brief && orders ? { ...n.brief, id: `${n.brief.id}.${currentProgram.id}.${unit.key}`, revision: 1, standingOrders: orders.instructions } : n.brief })), parentSessionId: owner, contractLevel: 'strict' });
                const dispatch = buildDispatch({ programId: id, unitKey: key, owner, workflow, ordersRevision: orders?.revision });
                transact('unit-dispatched', id, owner, s => {
                    const u = s.programs[id].units.find((x) => x.key === key);
                    if (u.workflowId && u.workflowId !== dispatch.workflowId)
                        throw new Error('UNIT_ALREADY_DISPATCHED');
                    u.workflowId = dispatch.workflowId;
                    u.state = 'running';
                    if (orders)
                        u.ordersRevision = orders.revision;
                    commitDispatch(s, dispatch);
                    return { key, workflowId: dispatch.workflowId, dispatchId: dispatch.id };
                });
                unit = this.get(id, owner).units.find(u => u.key === key);
            }
            materializeDispatch(requireDispatch(unit.workflowId), (record) => this.workflows.materialize(record));
            const wf = await this.workflows.run(unit.workflowId, ctx);
            transact('unit-completion', id, owner, s => {
                const program = s.programs[id];
                const u = program.units.find(x => x.key === key);
                u.ledgerRefs = Object.values(wf.calls).flatMap(c => c.verification?.ledgerId ?? []);
                u.state = wf.state === 'failed' || wf.state === 'cancelled' ? 'failed' : this.workflows.acceptedWorkflow(wf) ? 'ready-to-integrate' : 'blocked';
                program.inbox.push({ id: uid('inbox'), key, state: u.state, processed: false });
                program.revision++;
                return { key, state: u.state };
            });
        };
        if (p.state === 'pilot') {
            await runUnit(p.units[0].key);
            const pilot = this.get(id, owner).units[0];
            transact('pilot-settled', id, owner, s => { s.programs[id].state = pilot.state === 'ready-to-integrate' ? 'scaling' : 'blocked'; return { state: s.programs[id].state }; });
            const stalled = this.drift(this.get(id, owner));
            if (stalled.length)
                return this.blockOrders(id, owner, stalled);
            if (pilot.state !== 'ready-to-integrate')
                return this.get(id, owner);
        }
        const active = new Map();
        while (true) {
            const current = this.get(id, owner);
            if (current.state === 'paused') {
                await Promise.all(active.values());
                return this.get(id, owner);
            }
            const drift = this.drift(current);
            if (drift.length) {
                await Promise.all(active.values());
                return this.blockOrders(id, owner, drift);
            }
            for (const unit of current.units) {
                if (active.size >= current.maxConcurrency)
                    break;
                if (!['pending', 'running', 'blocked'].includes(unit.state) || active.has(unit.key))
                    continue;
                const promise = runUnit(unit.key).finally(() => active.delete(unit.key));
                active.set(unit.key, promise);
            }
            if (!active.size)
                break;
            await Promise.race(active.values());
            if (this.get(id, owner).units.some(u => u.state === 'blocked' || u.state === 'failed')) {
                await Promise.all(active.values());
                break;
            }
        }
        const late = this.drift(this.get(id, owner));
        return late.length ? this.blockOrders(id, owner, late) : this.drain(id, owner);
    }
    drain(id, owner) {
        this.get(id, owner);
        return transact('inbox-drained', id, owner, s => { const p = s.programs[id]; for (const e of p.inbox) {
            if (e.processed)
                continue;
            e.processed = true;
            const u = p.units.find(u => u.key === e.key);
            if (u.state === 'ready-to-integrate')
                u.state = 'reconciled';
        } p.revision++; return p; });
    }
    close(id, owner) {
        const p = this.get(id, owner);
        const failures = p.units.filter(u => { const wf = u.workflowId ? this.workflows.get(u.workflowId) : undefined; return u.state !== 'reconciled' || !wf || !this.workflows.acceptedWorkflow(wf); });
        if (failures.length)
            throw new Error(`PROGRAM_CLOSE_BLOCKED: ${failures.map(u => u.key).join(',')}`);
        return transact('program-closed', id, owner, s => { s.programs[id].state = 'completed'; return s.programs[id]; });
    }
    updateOrders(id, owner, instructions, reason) {
        this.get(id, owner);
        if (!reason.trim() || !instructions.length || instructions.some(x => typeof x !== 'string'))
            throw new Error('INVALID_STANDING_ORDERS');
        return transact('program-orders-revised', id, owner, s => { const p = s.programs[id]; p.orders = { revision: (p.orders?.revision ?? 0) + 1, instructions, digest: hash(instructions) }; p.revision++; return { ...p, reason }; });
    }
    acknowledgeOrders(id, owner, key, revision, reason) {
        const p = this.get(id, owner);
        if (!reason.trim())
            throw new Error('INVALID_STANDING_ORDERS_ACKNOWLEDGEMENT');
        this.assertOrdersDigest(p);
        if (!p.orders)
            throw new Error('NO_STANDING_ORDERS');
        if (p.orders.revision !== revision)
            throw new Error(`ORDERS_REVISION_MISMATCH: acknowledgement names revision ${revision}, current revision ${p.orders.revision}`);
        const unit = p.units.find(u => u.key === key);
        if (!unit)
            throw new Error('UNKNOWN_UNIT');
        if (!unit.workflowId)
            throw new Error('UNIT_NOT_DISPATCHED');
        return transact('unit-orders-acknowledged', id, owner, s => {
            const current = s.programs[id];
            if (current.orders?.revision !== revision)
                throw new Error(`ORDERS_REVISION_MISMATCH: acknowledgement names revision ${revision}, current revision ${current.orders?.revision ?? 'none'}`);
            this.assertOrdersDigest(current);
            current.units.find(u => u.key === key).ordersAcknowledgement = { revision, actor: owner, reason, at: new Date().toISOString() };
            current.revision++;
            return current;
        });
    }
    resume(id, owner) {
        const p = this.get(id, owner);
        if (!['paused', 'blocked'].includes(p.state))
            throw new Error('PROGRAM_NOT_RESUMABLE');
        const resumed = transact('program-resumed', id, owner, s => { const p = s.programs[id]; p.state = ['ready-to-integrate', 'reconciled'].includes(p.units[0].state) ? 'scaling' : 'pilot'; return p; });
        return { ...resumed, staleUnits: this.drift(resumed) };
    }
    pause(id, owner) { this.get(id, owner); return transact('program-paused', id, owner, s => { s.programs[id].state = 'paused'; return s.programs[id]; }); }
}
