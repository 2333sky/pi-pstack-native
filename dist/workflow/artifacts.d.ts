import type { WorkflowNodeSpec } from "../runtime/types.js";
export declare const PARENT_ARTIFACT = "@parent";
export type ArtifactPlan = {
    origin: Map<string, Set<string>>;
    /** Every writer lane must be isolated if any unrelated writer could run concurrently. */
    isolated: Set<string>;
    ancestors: Map<string, Set<string>>;
};
/** Analyze all upstream writes, including writes hidden behind read-only synthesizers. */
export declare function planArtifacts(nodes: WorkflowNodeSpec[]): ArtifactPlan;
