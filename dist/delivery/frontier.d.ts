import type { PRProvider, PullRequest } from './provider.js';
export interface StackSpec {
    id: string;
    repoId: string;
    repo: string;
    numbers: number[];
    owner: string;
    requireReview?: boolean;
    requireBehavior?: boolean;
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
