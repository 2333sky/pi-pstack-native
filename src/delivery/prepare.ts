import { assertGitHubRepository } from "./git.ts";
import { writeFileSync } from 'node:fs';
import { homePath } from '../runtime/home.ts';
import { protocol, uid, transact } from '../runtime/protocol.ts';
import { fingerprint } from '../artifacts/fingerprint.ts';
import { ledgerCurrent } from '../verification/runner.ts';
import type { GitHubCLI } from './provider.ts';
export function preparePR(cwd:string,ledgerId:string,options:{repo:string;base:string;head:string;title:string}) {
  assertGitHubRepository(cwd,options.repo);
  const l=protocol().ledgers[ledgerId];const current=fingerprint(cwd,'committed');
  if(!l || !l.contractAccepted || l.fingerprint.kind!=='committed' || !ledgerCurrent(l,current))throw new Error('CURRENT_ACCEPTED_COMMIT_REQUIRED');
  if(!options.title.trim() || !/^[\w.-]+\/[\w.-]+$/.test(options.repo))throw new Error('INVALID_PR_DETAILS');
  const plan={id:uid('prplan'),...options,headSha:current.commitSha,ledgerId,evidence:l.evidenceRefs,body:`${options.title}\n\nVerified commit: ${current.commitSha}\nVerification: ${l.verdict}\nLedger: ${l.id}\nEvidence: ${l.evidenceRefs.join(', ')}\n`};
  transact('pr-prepared',plan.id,'delivery',()=>plan);return plan;
}
export async function openPreparedPR(cwd:string,plan:ReturnType<typeof preparePR>,provider:GitHubCLI,approve=false):Promise<unknown> {
  if(!approve)return {plan,dryRun:true};
  preparePR(cwd,plan.ledgerId,plan);
  if(await provider.branchHead(plan.repo,plan.head)!==plan.headSha)throw new Error('REMOTE_BRANCH_NOT_VERIFIED');
  const path=homePath(`${plan.id}.md`);writeFileSync(path,plan.body,{mode:0o600});
  const url=await provider.open(plan.repo,plan.base,plan.head,plan.title,path);
  transact('pr-opened',plan.id,'human-cli',()=>({url,headSha:plan.headSha}));return {url};
}
