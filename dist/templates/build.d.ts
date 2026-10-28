import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { WorkflowNodeSpec } from '../runtime/types.js';
import type { TaskBrief, Budget } from '../contracts/types.js';
export interface TemplateSpec {
    kind: 'arena' | 'architect' | 'interrogate' | 'swarm' | 'review' | 'autopilot-stack' | 'autopilot-full';
    brief: TaskBrief;
    models?: string[];
    panel?: string;
    judgeModel?: string;
    rubric?: {
        criterion: string;
        weight: number;
    }[];
    candidateCount?: number;
    swarmMode?: 'race' | 'partition';
    slices?: {
        key: string;
        task: string;
        brief: TaskBrief;
    }[];
    selectionPolicy?: 'best-of' | 'first-pass' | 'rank-all';
    judgeMode?: 'cross' | 'per-candidate';
    independencePolicy?: 'different-model' | 'different-family' | 'explicit-waiver' | 'independent-session';
    modelFamilies?: Record<string, string>;
    budget?: Budget;
}
/** Configured panels become explicit node models before a workflow is created. */
export declare function buildTemplate(input: TemplateSpec, ctx?: ExtensionContext): {
    nodes: WorkflowNodeSpec[];
    estimatedAgents: number;
    budget: Budget | undefined;
    notes: string[];
    deliveryContract: 'local-dag' | 'candidate-only' | 'remote-stack-required';
    completionPolicy?: 'first-pass';
};
