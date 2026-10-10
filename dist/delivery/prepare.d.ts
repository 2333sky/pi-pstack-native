import type { GitHubCLI } from './provider.js';
export declare function preparePR(cwd: string, ledgerId: string, options: {
    repo: string;
    base: string;
    head: string;
    title: string;
}): {
    headSha: string;
    ledgerId: string;
    evidence: string[];
    body: string;
    repo: string;
    base: string;
    head: string;
    title: string;
    id: string;
};
export declare function openPreparedPR(cwd: string, plan: ReturnType<typeof preparePR>, provider: GitHubCLI, approve?: boolean): Promise<unknown>;
