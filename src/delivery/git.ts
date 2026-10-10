import { git } from '../artifacts/fingerprint.ts';
export function githubRepository(cwd:string):string {
  const remote=git(cwd,['remote','get-url','origin']);
  const match=remote.match(/^(?:https:\/\/(?:[^/@]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
  if(!match)throw new Error('GITHUB_REPOSITORY_UNCONFIRMED');return match[1];
}
export function assertGitHubRepository(cwd:string,repo:string):void {
  if(githubRepository(cwd).toLowerCase()!==repo.toLowerCase())throw new Error('PROVIDER_REPOSITORY_MISMATCH');
}
