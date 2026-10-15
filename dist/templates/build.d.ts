import type { WorkflowNodeSpec } from '../runtime/types.js';
import type { TaskBrief, Budget } from '../contracts/types.js';
export interface TemplateSpec {
    kind: 'arena' | 'swarm' | 'review' | 'autopilot-stack' | 'autopilot-full';
    brief: TaskBrief;
    models: string[];
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
    independencePolicy?: 'different-model' | 'different-family' | 'explicit-waiver';
    modelFamilies?: Record<string, string>;
    budget?: Budget;
}
export declare function buildTemplate(t: TemplateSpec): {
    nodes: WorkflowNodeSpec[];
    estimatedAgents: number;
    budget: Budget | undefined;
    notes: string[];
    deliveryContract: 'local-dag' | 'remote-stack-required';
};
