import type { PRProvider, PullRequest } from './provider.js';
export interface StackSpec {
    id: string;
    repoId: string;
    repo: string;
    numbers: number[];
    owner: string;
    requireReview?: boolean;
    requireBehavior?: boolean;
    rootBase?: string;
}
export interface Frontier extends StackSpec {
    generation: number;
    digest: string;
    prs: PullRequest[];
    checkedAt: string;
}
export declare function refresh(spec: StackSpec, provider: PRProvider): Promise<Frontier>;
export declare function eligibility(f: Frontier): {
    number: number;
    eligible: boolean;
    blockers: string[];
}[];
export declare function authorizeMerge(f: Frontier, number: number, actor: string): string;
export declare function ship(spec: StackSpec, provider: PRProvider, options?: {
    token?: string;
    dryRun?: boolean;
}): Promise<unknown>;
/** Native snapshot states, not fabricated Cursor watcher verdicts. No merging or polling. */
export declare function watchFrontier(f: Frontier, previous?: {
    number: number;
    headSha: string;
    digest: string;
}): {
    state: string;
    frontier: null;
    digest: string;
    headSha?: undefined;
    blockers?: undefined;
    autoMergeRequested?: undefined;
    queueState?: undefined;
    stopBeforeMerge?: undefined;
} | {
    state: string;
    frontier: number;
    digest: string;
    headSha?: undefined;
    blockers?: undefined;
    autoMergeRequested?: undefined;
    queueState?: undefined;
    stopBeforeMerge?: undefined;
} | {
    state: string;
    frontier: number;
    headSha: string;
    digest: string;
    blockers: string[];
    autoMergeRequested: boolean;
    queueState: string;
    stopBeforeMerge: boolean;
};
