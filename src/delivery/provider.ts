import { collectReviewThreads, REVIEW_THREADS_QUERY, type ReviewThreadSummary } from './review-threads.ts';
import { execFileSync } from 'node:child_process';
export interface PullRequest {
  headRef?:string; draft?:boolean; mergeState?:string; autoMergeRequested?:boolean; reviewThreads?:ReviewThreadSummary;
  number:number; repo:string; headSha:string; baseSha:string; baseRef:string; state:'OPEN'|'MERGED'|'CLOSED';
  mergeable:'MERGEABLE'|'CONFLICTING'|'UNKNOWN'; ci:'passed'|'failed'|'pending'|'unknown'; review:'approved'|'changes-requested'|'pending';
}
export interface PRProvider { read(repo:string,number:number):Promise<PullRequest>; merge(pr:PullRequest):Promise<void> }
export class GitHubCLI implements PRProvider {
  private readonly execute?: (args:string[])=>string;
  constructor(execute?: (args:string[])=>string){this.execute=execute;}
  private gh(args:string[]):string {if(this.execute)return this.execute(args);return execFileSync('gh',args,{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});}
  async read(repo:string,number:number):Promise<PullRequest> {
    if(!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isSafeInteger(number) || number<1)throw new Error('Invalid GitHub PR');
    let p=JSON.parse(this.gh(['pr','view',String(number),'--repo',repo,'--json','number,headRefOid,headRefName,baseRefOid,baseRefName,state,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,autoMergeRequest']));
    const [owner,name]=repo.split('/');
    const reviewThreads=await collectReviewThreads(async cursor=>JSON.parse(this.gh(['api','graphql','-f',`query=${REVIEW_THREADS_QUERY}`,'-F',`owner=${owner}`,'-F',`repo=${name}`,'-F',`number=${number}`,...(cursor ? ['-f',`after=${cursor}`]:[])])));
    const confirmed=JSON.parse(this.gh(['pr','view',String(number),'--repo',repo,'--json','number,headRefOid,headRefName,baseRefOid,baseRefName,state,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,autoMergeRequest']));
    if(confirmed.headRefOid!==p.headRefOid || confirmed.baseRefOid!==p.baseRefOid || confirmed.state!==p.state)throw new Error('PR_CHANGED_DURING_READ');
    p=confirmed;
    const checks=p.statusCheckRollup;
    const ci = !Array.isArray(checks) || !checks.length ? 'unknown' : checks.some((c:any)=>['FAILURE','ERROR','CANCELLED','TIMED_OUT','ACTION_REQUIRED'].includes(c.conclusion ?? c.state))?'failed':checks.every((c:any)=>['SUCCESS'].includes(c.conclusion ?? c.state))?'passed':'pending';
    return {headRef:p.headRefName,draft:p.isDraft,mergeState:p.mergeStateStatus,autoMergeRequested:p.autoMergeRequest!=null,reviewThreads,number:p.number,repo,headSha:p.headRefOid,baseSha:p.baseRefOid,baseRef:p.baseRefName,state:p.state,mergeable:p.mergeable,ci,review:p.reviewDecision==='APPROVED'?'approved':p.reviewDecision==='CHANGES_REQUESTED'?'changes-requested':'pending'};
  }
  async merge(pr:PullRequest):Promise<void> {
    this.gh(['pr','merge',String(pr.number),'--repo',pr.repo,'--merge','--match-head-commit',pr.headSha]);
  }
  async branchHead(repo:string,branch:string):Promise<string> {
    const r=JSON.parse(this.gh(['api',`repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`]));
    if(r.object?.type!=='commit' || !r.object.sha)throw new Error('REMOTE_BRANCH_UNCERTAIN');return r.object.sha;
  }
  async find(repo:string,head:string):Promise<number|null> {
    if(!/^[\w.-]+\/[\w.-]+$/.test(repo) || !head || head.startsWith('-'))throw new Error('INVALID_PR_LOOKUP');
    const prs=JSON.parse(this.gh(['pr','list','--repo',repo,'--head',head,'--state','all','--limit','100','--json','number']));
    if(!Array.isArray(prs) || prs.length>1)throw new Error('PR_LOOKUP_AMBIGUOUS');
    return prs[0]?.number ?? null;
  }
  async open(repo:string,base:string,head:string,title:string,bodyFile:string):Promise<string> {
    return this.gh(['pr','create','--repo',repo,'--base',base,'--head',head,'--title',title,'--body-file',bodyFile]).trim();
  }
}
