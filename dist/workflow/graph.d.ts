import type { WorkflowNodeSpec } from "../runtime/types.js";
export declare function validateGraph(nodes: WorkflowNodeSpec[]): void;
export declare function chainNodes(tasks: Array<Omit<WorkflowNodeSpec, "dependsOn">>): WorkflowNodeSpec[];
export declare function dependencyEdges(nodes: WorkflowNodeSpec[]): Array<{
    from: string;
    to: string;
}>;
export declare function downstreamKeys(nodes: Record<string, {
    dependsOn: string[];
}>, root: string): Set<string>;
