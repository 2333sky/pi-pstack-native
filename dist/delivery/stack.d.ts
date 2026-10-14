import type { PullRequest } from './provider.js';
export interface StackLane {
    key: string;
    cwd: string;
    head: string;
    ledgerId: string;
    title: string;
}
export interface StackInput {
    repo: string;
    rootBase: string;
    owner: string;
    lanes: StackLane[];
}
export interface StackPlan extends StackInput {
    id: string;
    rootSha: string;
    entries: (StackLane & {
        base: string;
        baseSha: string;
        headSha: string;
        patchId: string;
    })[];
}
export interface StackProvider {
    branchHead(repo: string, branch: string): Promise<string>;
    find(repo: string, head: string): Promise<number | null>;
    read(repo: string, number: number): Promise<PullRequest>;
    open(repo: string, base: string, head: string, title: string, bodyFile: string): Promise<string>;
}
export declare function prepareStack(input: StackInput, provider: StackProvider): Promise<StackPlan>;
export declare function openStack(plan: StackPlan, provider: StackProvider, approve?: boolean): Promise<unknown>;
