import { type ReviewThreadSummary } from './review-threads.js';
export interface PullRequest {
    headRef?: string;
    draft?: boolean;
    mergeState?: string;
    autoMergeRequested?: boolean;
    reviewThreads?: ReviewThreadSummary;
    number: number;
    repo: string;
    headSha: string;
    baseSha: string;
    baseRef: string;
    state: 'OPEN' | 'MERGED' | 'CLOSED';
    mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
    ci: 'passed' | 'failed' | 'pending' | 'unknown';
    review: 'approved' | 'changes-requested' | 'pending';
}
export interface PRProvider {
    read(repo: string, number: number): Promise<PullRequest>;
    merge(pr: PullRequest): Promise<void>;
}
export declare class GitHubCLI implements PRProvider {
    private readonly execute?;
    constructor(execute?: (args: string[]) => string);
    private gh;
    read(repo: string, number: number): Promise<PullRequest>;
    merge(pr: PullRequest): Promise<void>;
    branchHead(repo: string, branch: string): Promise<string>;
    find(repo: string, head: string): Promise<number | null>;
    open(repo: string, base: string, head: string, title: string, bodyFile: string): Promise<string>;
}
