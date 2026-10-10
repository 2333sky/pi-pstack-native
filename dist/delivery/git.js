import { git } from "../artifacts/fingerprint.js";
export function githubRepository(cwd) {
    const remote = git(cwd, ['remote', 'get-url', 'origin']);
    const match = remote.match(/^(?:https:\/\/(?:[^/@]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
    if (!match)
        throw new Error('GITHUB_REPOSITORY_UNCONFIRMED');
    return match[1];
}
export function assertGitHubRepository(cwd, repo) {
    if (githubRepository(cwd).toLowerCase() !== repo.toLowerCase())
        throw new Error('PROVIDER_REPOSITORY_MISMATCH');
}
