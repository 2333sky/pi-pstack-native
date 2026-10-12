import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { WorkflowRunSpec } from '../runtime/types.js';
import type { WorkflowEngine } from '../workflow/engine.js';
export interface Unit {
    key: string;
    spec: WorkflowRunSpec;
    workflowId?: string;
    ordersRevision?: number;
    ordersAcknowledgement?: {
        revision: number;
        actor: string;
        reason: string;
        at: string;
    };
    state: 'pending' | 'running' | 'needs-verify' | 'blocked' | 'failed' | 'ready-to-integrate' | 'reconciled';
    ledgerRefs: string[];
}
export interface OrdersDrift {
    key: string;
    dispatchedRevision: number | null;
    currentRevision: number;
    message: string;
}
export interface Program {
    id: string;
    owner: string;
    revision: number;
    state: 'pilot' | 'scaling' | 'paused' | 'blocked' | 'completed';
    maxConcurrency: number;
    units: Unit[];
    inbox: {
        id: string;
        key: string;
        state: Unit['state'];
        processed: boolean;
    }[];
    orders?: {
        revision: number;
        instructions: string[];
        digest: string;
    };
    blockedReason?: {
        code: 'ORDERS_STALE';
        units: {
            key: string;
            dispatchedRevision: number | null;
        }[];
        currentRevision: number;
        message: string;
    };
    completionPredicate: 'all-units-verified';
    createdAt: string;
}
export declare function ordersDrift(program: Program, unit: Unit): OrdersDrift | undefined;
export declare class ProgramCoordinator {
    private workflows;
    constructor(workflows: WorkflowEngine);
    create(owner: string, specs: {
        key: string;
        spec: WorkflowRunSpec;
    }[], maxConcurrency?: number): Program;
    get(id: string, owner: string): Program;
    private drift;
    private assertOrdersDigest;
    private blockOrders;
    run(id: string, ctx: ExtensionContext): Promise<Program>;
    drain(id: string, owner: string): Program;
    close(id: string, owner: string): Program;
    updateOrders(id: string, owner: string, instructions: string[], reason: string): Program;
    acknowledgeOrders(id: string, owner: string, key: string, revision: number, reason: string): Program;
    resume(id: string, owner: string): Program & {
        staleUnits: OrdersDrift[];
    };
    pause(id: string, owner: string): Program;
}
