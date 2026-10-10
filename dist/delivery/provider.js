import { execFileSync } from 'node:child_process';
export class GitHubCLI {
    gh(args) { return execFileSync('gh', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }); }
    async read(repo, number) {
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isSafeInteger(number) || number < 1)
            throw new Error('Invalid GitHub PR');
        const p = JSON.parse(this.gh(['pr', 'view', String(number), '--repo', repo, '--json', 'number,headRefOid,baseRefOid,baseRefName,state,mergeable,reviewDecision,statusCheckRollup']));
        const checks = p.statusCheckRollup;
        const ci = !Array.isArray(checks) || !checks.length ? 'unknown' : checks.some((c) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(c.conclusion ?? c.state)) ? 'failed' : checks.every((c) => ['SUCCESS'].includes(c.conclusion ?? c.state)) ? 'passed' : 'pending';
        return { number: p.number, repo, headSha: p.headRefOid, baseSha: p.baseRefOid, baseRef: p.baseRefName, state: p.state, mergeable: p.mergeable, ci, review: p.reviewDecision === 'APPROVED' ? 'approved' : p.reviewDecision === 'CHANGES_REQUESTED' ? 'changes-requested' : 'pending' };
    }
    async merge(pr) {
        this.gh(['pr', 'merge', String(pr.number), '--repo', pr.repo, '--merge', '--match-head-commit', pr.headSha]);
    }
    async branchHead(repo, branch) {
        const r = JSON.parse(this.gh(['api', `repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`]));
        if (r.object?.type !== 'commit' || !r.object.sha)
            throw new Error('REMOTE_BRANCH_UNCERTAIN');
        return r.object.sha;
    }
    async open(repo, base, head, title, bodyFile) {
        return this.gh(['pr', 'create', '--repo', repo, '--base', base, '--head', head, '--title', title, '--body-file', bodyFile]).trim();
    }
}
