import type { Fingerprint } from '../contracts/types.js';
/** Inputs are derived from completed, verified workflow children, never supplied by a model. */
export interface CandidateInput {
    key: string;
    agentId: string;
    workspace: string;
    artifactId: string;
    ledgerId: string;
    baseline: Fingerprint;
}
export declare function assertCandidateCurrent(input: CandidateInput): void;
/** Read only the named candidate worktrees, using the same path confinement as ordinary reviewers. */
export declare function createCandidateTool(inputs: CandidateInput[]): any;
