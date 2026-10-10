import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { WorkflowRunSpec } from '../runtime/types.js';
import type { WorkflowEngine } from '../workflow/engine.js';
export interface Unit {
    key: string;
    spec: WorkflowRunSpec;
    workflowId?: string;
    state: 'pending' | 'running' | 'needs-verify' | 'blocked' | 'failed' | 'ready-to-integrate' | 'reconciled';
    ledgerRefs: string[];
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
    completionPredicate: 'all-units-verified';
    createdAt: string;
}
export declare class ProgramCoordinator {
    private workflows;
    constructor(workflows: WorkflowEngine);
    create(owner: string, specs: {
        key: string;
        spec: WorkflowRunSpec;
    }[], maxConcurrency?: number): Program;
    get(id: string, owner: string): Program;
    run(id: string, ctx: ExtensionContext): Promise<Program>;
    drain(id: string, owner: string): Program;
    close(id: string, owner: string): Program;
    updateOrders(id: string, owner: string, instructions: string[], reason: string): Program;
    resume(id: string, owner: string): Program;
    pause(id: string, owner: string): Program;
}
