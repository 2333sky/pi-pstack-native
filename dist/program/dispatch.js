import { hash, protocol, transact } from "../runtime/protocol.js";
import { workflowPath } from "../runtime/home.js";
import { readJson } from "../runtime/store.js";
export function briefDigest(workflow) {
    return hash(Object.keys(workflow.calls).sort().map((key) => [key, workflow.calls[key].brief ? hash(workflow.calls[key].brief) : null]));
}
export function dispatchKey(programId, unitKey) {
    return `dsp_${hash({ programId, unitKey }).slice(0, 24)}`;
}
export function buildDispatch(input) {
    return {
        id: dispatchKey(input.programId, input.unitKey),
        owner: input.owner,
        programId: input.programId,
        unitKey: input.unitKey,
        workflowId: input.workflow.id,
        briefDigest: briefDigest(input.workflow),
        ...(input.ordersRevision === undefined ? {} : { ordersRevision: input.ordersRevision }),
        state: 'committed',
        workflow: input.workflow,
        createdAt: new Date().toISOString(),
    };
}
function sameIntent(a, b) {
    return a.programId === b.programId && a.unitKey === b.unitKey && a.owner === b.owner && a.workflowId === b.workflowId &&
        a.briefDigest === b.briefDigest && a.ordersRevision === b.ordersRevision && hash(a.workflow) === hash(b.workflow);
}
export function commitDispatch(store, dispatch) {
    const existing = store.dispatches[dispatch.id];
    if (!existing) {
        store.dispatches[dispatch.id] = dispatch;
        return dispatch;
    }
    if (!sameIntent(existing, dispatch))
        throw new Error(`DISPATCH_CONFLICT: ${dispatch.id} was already committed with a different description`);
    return existing;
}
export function findDispatch(workflowId) {
    return Object.values(protocol().dispatches).find((dispatch) => dispatch.workflowId === workflowId);
}
export function requireDispatch(workflowId) {
    const dispatch = findDispatch(workflowId);
    if (!dispatch)
        throw new Error(`ORPHAN_WORKFLOW: ${workflowId} has no committed dispatch record`);
    return dispatch;
}
/** Committed intent is the truth. The workflow file is rebuilt from it, never edited into agreement. */
export function materializeDispatch(dispatch, write) {
    const existing = readJson(workflowPath(dispatch.workflowId), undefined);
    if (!existing)
        write(dispatch.workflow);
    else if (hash(existing) !== hash(dispatch.workflow))
        throw new Error(`DISPATCH_MATERIALIZE_CONFLICT: ${dispatch.workflowId} on disk differs from the committed dispatch`);
    if (dispatch.state === 'materialized')
        return dispatch;
    return transact('dispatch-materialized', dispatch.id, dispatch.owner, (state) => {
        const current = state.dispatches[dispatch.id];
        if (!current || current.state === 'materialized')
            return current ?? dispatch;
        current.state = 'materialized';
        current.materializedAt = new Date().toISOString();
        return current;
    });
}
export function dispatchVeto(workflowId, file) {
    const state = protocol();
    const units = Object.values(state.programs)
        .flatMap((program) => (program.units ?? []).map((unit) => ({ program, unit })));
    const references = units.find(({ unit }) => unit.workflowId === workflowId);
    const dispatch = Object.values(state.dispatches).find((candidate) => candidate.workflowId === workflowId);
    if (!references && !dispatch)
        return undefined;
    if (!references || !dispatch)
        return 'ORPHAN_WORKFLOW';
    if (dispatch.programId !== references.program.id || dispatch.unitKey !== references.unit.key)
        return 'DISPATCH_MISMATCH';
    if (!file)
        return 'DISPATCH_NOT_MATERIALIZED';
    if (briefDigest(file) !== dispatch.briefDigest)
        return 'DISPATCH_DRIFT';
    return undefined;
}
