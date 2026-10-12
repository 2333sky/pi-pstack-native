import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture, fingerprint, git } from '../src/artifacts/fingerprint.ts';
import { BriefValidationError, changedPaths, validateBrief } from '../src/contracts/brief.ts';
import { verify, ledgerCurrent } from '../src/verification/runner.ts';
import { protocol, hash, transact } from '../src/runtime/protocol.ts';
import { lockPath } from '../src/runtime/home.ts';
import { refresh, eligibility } from '../src/delivery/frontier.ts';
import type { TaskBrief } from '../src/contracts/types.ts';
import type { PullRequest } from '../src/delivery/provider.ts';
function fixture() {
  const root=mkdtempSync(join(tmpdir(),'pstack-verification-'));const repo=join(root,'repo');mkdirSync(repo);
  process.env.PSTACK_NATIVE_HOME=join(root,'state');
  git(repo,['init','-q']);git(repo,['config','user.name','Test']);git(repo,['config','user.email','test@example.invalid']);
  writeFileSync(join(repo,'allowed.txt'),'baseline');git(repo,['add','.']);git(repo,['commit','-qm','baseline']);
  return {repo,cleanup(){rmSync(root,{recursive:true,force:true});delete process.env.PSTACK_NATIVE_HOME;}};
}
function brief(repo:string):TaskBrief & {contractLevel:'minimal'} {
  return {id:'verification',revision:1,contractLevel:'minimal',goal:'Check scope',scope:{repoId:fingerprint(repo).repoId,include:['allowed.txt'],exclude:[]},contextRefs:[],acceptance:[],verification:[{id:'diff',kind:'diff',maxFiles:0}],forbidden:[],standingOrders:[],reportFormat:'task-report-v1'};
}
test('minimal brief without acceptance verifies safely',async()=>{
  const f=fixture();try {const b=brief(f.repo);delete (b as Partial<TaskBrief>).acceptance;validateBrief(b);assert.equal((await verify(f.repo,b)).status,'passed');}finally{f.cleanup();}
});
test('committed forbidden PR change without a baseline fails closed',async()=>{
  const f=fixture();try {writeFileSync(join(f.repo,'forbidden.txt'),'forbidden');git(f.repo,['add','.']);git(f.repo,['commit','-qm','forbidden']);const fp=fingerprint(f.repo);const ledger=await verify(f.repo,brief(f.repo),{pr:{repoId:fp.repoId,number:1,headSha:fp.commitSha}});assert.equal(ledger.status,'blocked');}finally{f.cleanup();}
});
test('minimal missing, empty and populated acceptance settle and retry',async()=>{
  const f=fixture();try {
    for(const acceptance of [undefined,[],[{id:'scope',description:'Scope matches',required:true,gateIds:['diff']}]] as TaskBrief['acceptance'][]) {
      const b={...brief(f.repo),acceptance:acceptance===undefined?undefined:structuredClone([...acceptance])};
      for(let i=0;i<2;i++){const ledger=await verify(f.repo,b);assert.equal(ledger.status,'passed');assert.equal(protocol().ledgers[ledger.id].status,'passed');assert.equal(existsSync(lockPath(`verify-${hash(realpathSync(f.repo))}`)),false);}
    }
  }finally{f.cleanup();}
});
test('malformed acceptance fails at the typed boundary with a durable rejection',async()=>{
  const f=fixture();try {
    for(const acceptance of [null,{},[null],[{id:'bad',description:'Bad',required:true,gateIds:['missing']}]]) {
      const b={...brief(f.repo),acceptance} as unknown as TaskBrief;
      assert.throws(()=>validateBrief(b),BriefValidationError);await assert.rejects(()=>verify(f.repo,b),BriefValidationError);
    }
    assert.equal(Object.keys(protocol().ledgers).length,0);assert.equal(protocol().events.filter(e=>e.type==='verification-rejected').length,4);
    assert.equal((await verify(f.repo,brief(f.repo))).status,'passed');
  }finally{f.cleanup();}
});
test('minimal unavailable gate records durable blocked state and releases the lock for retry',async()=>{
  const f=fixture();try {
    const b=brief(f.repo);delete b.acceptance;b.verification=[{id:'file',kind:'file',path:'missing.txt'}];
    const failed=await verify(f.repo,b);assert.equal(failed.status,'blocked');assert.equal(protocol().evidence[failed.evidenceRefs[0]].reason,'CHECK_UNAVAILABLE');assert.equal(protocol().ledgers[failed.id].status,'blocked');assert.equal(existsSync(lockPath(`verify-${hash(realpathSync(f.repo))}`)),false);
    assert.equal((await verify(f.repo,b)).status,'blocked');writeFileSync(join(f.repo,'missing.txt'),'ready');b.scope.include.push('missing.txt');assert.equal((await verify(f.repo,b)).status,'passed');assert.equal(protocol().ledgers[failed.id].status,'blocked');
  }finally{f.cleanup();}
});
function prOptions(repo:string,baseSha?:string) {const fp=fingerprint(repo);return {pr:{repoId:fp.repoId,number:1,headSha:fp.commitSha,...(baseSha?{baseSha}:{})}};}
function commit(repo:string,path:string,contents:string) {writeFileSync(join(repo,path),contents);git(repo,['add','.']);git(repo,['commit','-qm','change']);}
function pathsFor(ledger:Awaited<ReturnType<typeof verify>>) {return JSON.parse(readFileSync(protocol().evidence[ledger.evidenceRefs[0]].logPath,'utf8'));}
test('PR base detects forbidden committed change and diff maxFiles zero cannot pass',async()=>{
  const f=fixture();try {const base=git(f.repo,['rev-parse','HEAD']);commit(f.repo,'forbidden.txt','bad');const ledger=await verify(f.repo,brief(f.repo),prOptions(f.repo,base));assert.equal(ledger.status,'blocked');assert.equal(protocol().evidence[ledger.evidenceRefs[0]].reason,'SCOPE_VIOLATION');assert.deepEqual(pathsFor(ledger),['forbidden.txt']);assert.equal(ledger.diffBase?.commitSha,base);assert.equal(ledger.diffBase?.refreshed,false);}finally{f.cleanup();}
});
test('clean allowed PR commit verifies over its base and enforces diff maxFiles',async()=>{
  const f=fixture();try {const base=git(f.repo,['rev-parse','HEAD']);commit(f.repo,'allowed.txt','changed');const b=brief(f.repo);b.verification[0].maxFiles=1;const ledger=await verify(f.repo,b,prOptions(f.repo,base));assert.equal(ledger.status,'passed');assert.deepEqual(pathsFor(ledger),['allowed.txt']);assert.equal(ledger.diffBase?.kind,'pr');b.verification[0].maxFiles=0;assert.equal((await verify(f.repo,b,prOptions(f.repo,base))).status,'failed');}finally{f.cleanup();}
});
test('strict verification requires a baseline and checks staged and untracked paths',async()=>{
  const f=fixture();try {
    const before=capture(f.repo).fingerprint;const b={...brief(f.repo),contractLevel:'strict' as const,acceptance:[{id:'scope',description:'Scope',required:true,gateIds:['diff']}],timeboxSeconds:10};
    const blocked=await verify(f.repo,b);assert.equal(blocked.status,'blocked');assert.equal(protocol().evidence[blocked.evidenceRefs[0]].reason,'DIFF_BASE_REQUIRED');assert.equal((await verify(f.repo,b,{before})).status,'passed');
    writeFileSync(join(f.repo,'forbidden.txt'),'staged');git(f.repo,['add','.']);assert.equal((await verify(f.repo,b,{before})).status,'blocked');await assert.rejects(()=>verify(f.repo,b,prOptions(f.repo,before.commitSha)),/DIRTY_ARTIFACT/);
    git(f.repo,['reset','--hard','-q','HEAD']);writeFileSync(join(f.repo,'untracked.txt'),'bad');assert.equal((await verify(f.repo,b,{before})).status,'blocked');await assert.rejects(()=>verify(f.repo,b,prOptions(f.repo,before.commitSha)),/DIRTY_ARTIFACT/);
    rmSync(join(f.repo,'untracked.txt'));assert.equal((await verify(f.repo,b,prOptions(f.repo,before.commitSha))).status,'passed');
  }finally{f.cleanup();}
});
test('PR renames check both the removed and added paths including newline names',async()=>{
  const f=fixture();try {const base=git(f.repo,['rev-parse','HEAD']);git(f.repo,['mv','allowed.txt','forbidden\nname.txt']);git(f.repo,['commit','-qm','rename']);const ledger=await verify(f.repo,brief(f.repo),prOptions(f.repo,base));assert.equal(ledger.status,'blocked');assert.deepEqual(pathsFor(ledger),['forbidden\nname.txt']);const b=brief(f.repo);b.scope.include=['**'];b.verification[0].maxFiles=1;const diff=await verify(f.repo,b,prOptions(f.repo,base));assert.equal(diff.status,'failed');assert.deepEqual(pathsFor(diff),['allowed.txt','forbidden\nname.txt']);}finally{f.cleanup();}
});
test('unavailable or unrelated PR bases and cross-repo fingerprints fail closed',async()=>{
  const f=fixture();try {for(const base of ['main','f'.repeat(40)]){const l=await verify(f.repo,brief(f.repo),prOptions(f.repo,base));assert.equal(l.status,'blocked');assert.equal(protocol().evidence[l.evidenceRefs[0]].reason,'DIFF_BASE_UNAVAILABLE');}const before={...fingerprint(f.repo),repoId:'other'};assert.equal((await verify(f.repo,brief(f.repo),{before})).status,'blocked');const inconsistent={...fingerprint(f.repo),workspaceDigest:'invalid'};assert.equal((await verify(f.repo,brief(f.repo),{...prOptions(f.repo),before:inconsistent})).status,'blocked');const original=git(f.repo,['rev-parse','HEAD']);git(f.repo,['checkout','--orphan','unrelated']);commit(f.repo,'allowed.txt','unrelated');const unrelated=git(f.repo,['rev-parse','HEAD']);git(f.repo,['checkout','--detach',original]);assert.equal((await verify(f.repo,brief(f.repo),prOptions(f.repo,unrelated))).status,'blocked');}finally{f.cleanup();}
});
test('explicit prechange fingerprint checks committed scope changes',async()=>{
  const f=fixture();try {const before=capture(f.repo).fingerprint;commit(f.repo,'forbidden.txt','bad');const blocked=await verify(f.repo,brief(f.repo),{...prOptions(f.repo),before});assert.equal(blocked.status,'blocked');assert.equal(blocked.diffBase?.kind,'fingerprint');assert.equal(blocked.diffBase?.fingerprintHash,hash(before));}finally{f.cleanup();}
});
function strictBrief(repo:string):TaskBrief {
  return {...brief(repo),contractLevel:'strict',acceptance:[{id:'scope',description:'Scope',required:true,gateIds:['diff']}],timeboxSeconds:10};
}
function completedReport(fp:ReturnType<typeof fingerprint>) {
  return {status:'completed' as const,base:fp.commitSha,head:fp.commitSha,artifactRefs:[],commandsRun:[],evidenceRefs:[],deviations:[],unresolved:[],nextActions:[]};
}
test('edited-fingerprint-with-rehash-strict',async()=>{
  const f=fixture();try {
    const original=capture(f.repo).fingerprint;
    writeFileSync(join(f.repo,'forbidden.txt'),'hidden');
    const before={...original,files:fingerprint(f.repo).files};
    before.workspaceDigest=hash({files:before.files,indexTree:before.indexTree});
    const ledger=await verify(f.repo,strictBrief(f.repo),{before,report:completedReport(original)});
    assert.equal(ledger.status,'blocked');
    assert.equal(protocol().evidence[ledger.evidenceRefs[0]].reason,'DIFF_BASE_UNPROVEN');
    assert.equal(ledger.contractAccepted,false);
    assert.equal(ledgerCurrent(ledger,fingerprint(f.repo)),false);
  }finally{f.cleanup();}
});
test('round4 A rejected forged baseline cannot bootstrap a retry',async()=>{
  const f=fixture();try {
    writeFileSync(join(f.repo,'allowed.txt'),'pre-existing work');
    const original=capture(f.repo).fingerprint;
    writeFileSync(join(f.repo,'forbidden.txt'),'hidden');
    const before={...original,files:fingerprint(f.repo).files};
    before.workspaceDigest=hash({files:before.files,indexTree:before.indexTree});
    const b=strictBrief(f.repo);
    for(let attempt=0;attempt<2;attempt++) {
      const ledger=await verify(f.repo,b,{before,report:completedReport(original)});
      assert.equal(ledger.status,'blocked',`attempt ${attempt+1} must reject the forged baseline`);
      assert.equal(protocol().evidence[ledger.evidenceRefs[0]].reason,'DIFF_BASE_UNPROVEN');
      assert.equal(ledger.contractAccepted,false);
      assert.equal(ledgerCurrent(ledger,fingerprint(f.repo)),false);
    }
  }finally{f.cleanup();}
});
test('round4 A result carrying a valid baseline reference cannot hide later changes',async()=>{
  const f=fixture();try {
    const original=capture(f.repo).fingerprint;
    writeFileSync(join(f.repo,'forbidden.txt'),'hidden');
    const other={...brief(f.repo),id:'other-workflow',scope:{...brief(f.repo).scope,include:['**']}};
    other.verification[0].maxFiles=1;
    const result=await verify(f.repo,other,{before:original});
    assert.equal(result.status,'passed');
    const before=protocol().artifacts[result.artifactId].fingerprint;
    for(const candidate of [before,{...before,baselineId:result.artifactId}]) {
      const ledger=await verify(f.repo,strictBrief(f.repo),{before:candidate,report:completedReport(original)});
      assert.equal(ledger.status,'blocked');
      assert.equal(protocol().evidence[ledger.evidenceRefs[0]].reason,'DIFF_BASE_UNPROVEN');
      assert.equal(ledger.contractAccepted,false);
      assert.equal(ledgerCurrent(ledger,fingerprint(f.repo)),false);
    }
  }finally{f.cleanup();}
});
test('round4 A another workflow result cannot become a prechange baseline',async()=>{
  const f=fixture();try {
    const original=capture(f.repo).fingerprint;
    writeFileSync(join(f.repo,'forbidden.txt'),'hidden');
    const other={...brief(f.repo),id:'other-workflow',scope:{...brief(f.repo).scope,include:['**']}};
    other.verification[0].maxFiles=1;
    const result=await verify(f.repo,other);
    assert.equal(result.status,'passed');
    const before=protocol().artifacts[result.artifactId].fingerprint;
    const ledger=await verify(f.repo,strictBrief(f.repo),{before,report:completedReport(original)});
    assert.equal(ledger.status,'blocked');
    assert.equal(protocol().evidence[ledger.evidenceRefs[0]].reason,'DIFF_BASE_UNPROVEN');
    assert.equal(ledger.contractAccepted,false);
    assert.equal(ledgerCurrent(ledger,fingerprint(f.repo)),false);
  }finally{f.cleanup();}
});
test('round4 B minimal baseline-free diff sees hidden index changes',async()=>{
  const f=fixture();try {
    commit(f.repo,'forbidden.txt','baseline');
    const b=brief(f.repo);
    writeFileSync(join(f.repo,'forbidden.txt'),'staged forbidden change');
    git(f.repo,['add','forbidden.txt']);
    writeFileSync(join(f.repo,'forbidden.txt'),'baseline');
    assert.equal(git(f.repo,['status','--porcelain=v1']),'MM forbidden.txt');
    assert.equal(git(f.repo,['diff','--cached','--name-only']),'forbidden.txt');
    const ledger=await verify(f.repo,b);
    assert.equal(ledger.status,'blocked');
    assert.equal(protocol().evidence[ledger.evidenceRefs[0]].reason,'SCOPE_VIOLATION');
    assert.deepEqual(pathsFor(ledger),['forbidden.txt']);
    assert.equal(ledgerCurrent(ledger,fingerprint(f.repo)),false);
  }finally{f.cleanup();}
});
for(const flag of ['--skip-worktree','--assume-unchanged']) {
  test(`round4 C fingerprint fails closed for ${flag}`,async()=>{
    const f=fixture();try {
      commit(f.repo,'forbidden.txt','baseline');
      const b=brief(f.repo);const before=capture(f.repo).fingerprint;
      git(f.repo,['update-index',flag,'forbidden.txt']);
      writeFileSync(join(f.repo,'forbidden.txt'),'hidden');
      assert.equal(git(f.repo,['status','--porcelain=v1']),'');
      assert.throws(()=>fingerprint(f.repo),{message:'FINGERPRINT_INDEX_FLAGS_UNSUPPORTED'});
      assert.throws(()=>fingerprint(f.repo,'committed'),{message:'FINGERPRINT_INDEX_FLAGS_UNSUPPORTED'});
      assert.throws(()=>capture(f.repo),{message:'FINGERPRINT_INDEX_FLAGS_UNSUPPORTED'});
      await assert.rejects(()=>verify(f.repo,b,{before}),{message:'FINGERPRINT_INDEX_FLAGS_UNSUPPORTED'});
      assert.equal(Object.keys(protocol().ledgers).length,0);
      assert.deepEqual(protocol().events.filter(e=>e.type==='verification-rejected').at(-1)?.data,{reason:'Error: FINGERPRINT_INDEX_FLAGS_UNSUPPORTED'});
    }finally{f.cleanup();}
  });
}
test('uncaptured fingerprint cannot gain provenance from the verification capture',async()=>{
  const f=fixture();try {
    const before=fingerprint(f.repo);
    const ledger=await verify(f.repo,strictBrief(f.repo),{before,report:completedReport(before)});
    assert.equal(ledger.status,'blocked');
    assert.equal(protocol().evidence[ledger.evidenceRefs[0]].reason,'DIFF_BASE_UNPROVEN');
    assert.equal(ledger.contractAccepted,false);
    assert.equal(ledgerCurrent(ledger,fingerprint(f.repo)),false);
    const retry=await verify(f.repo,strictBrief(f.repo),{before,report:completedReport(before)});
    assert.equal(retry.status,'blocked');
    assert.equal(protocol().evidence[retry.evidenceRefs[0]].reason,'DIFF_BASE_UNPROVEN');
    assert.equal(retry.contractAccepted,false);
    const durable=capture(f.repo).fingerprint;
    const valid=await verify(f.repo,strictBrief(f.repo),{before:durable,report:completedReport(durable)});
    assert.equal(valid.status,'passed');
    assert.equal(valid.contractAccepted,true);
    assert.equal(ledgerCurrent(valid,fingerprint(f.repo)),true);
  }finally{f.cleanup();}
});
test('dirty durable baseline preserves pre-existing working and index changes',async()=>{
  const f=fixture();try {
    writeFileSync(join(f.repo,'allowed.txt'),'already staged');git(f.repo,['add','allowed.txt']);
    writeFileSync(join(f.repo,'allowed.txt'),'already unstaged');
    writeFileSync(join(f.repo,'forbidden.txt'),'pre-existing untracked');
    const before=capture(f.repo).fingerprint;
    assert.equal(before.dirty,true);
    assert.notEqual(before.indexTree,before.treeSha);
    const b=strictBrief(f.repo);
    const unchanged=await verify(f.repo,b,{before,report:completedReport(before)});
    assert.equal(unchanged.status,'passed');assert.deepEqual(pathsFor(unchanged),[]);
    writeFileSync(join(f.repo,'allowed.txt'),'new allowed change');b.verification[0].maxFiles=1;
    const changed=await verify(f.repo,b,{before,report:completedReport(before)});
    assert.equal(changed.status,'passed');assert.deepEqual(pathsFor(changed),['allowed.txt']);
    assert.equal(changed.contractAccepted,true);assert.equal(ledgerCurrent(changed,fingerprint(f.repo)),true);
    assert.equal(hash(protocol().artifacts[unchanged.artifactId].fingerprint),hash(before));
  }finally{f.cleanup();}
});
test('index paths compare captured index trees rather than HEAD',async()=>{
  const f=fixture();try {
    commit(f.repo,'forbidden.txt','baseline');
    writeFileSync(join(f.repo,'forbidden.txt'),'pre-existing stage');git(f.repo,['add','forbidden.txt']);
    writeFileSync(join(f.repo,'forbidden.txt'),'baseline');
    const before=capture(f.repo).fingerprint;
    const b=strictBrief(f.repo);
    const unchanged=await verify(f.repo,b,{before,report:completedReport(before)});
    assert.equal(unchanged.status,'passed');assert.deepEqual(pathsFor(unchanged),[]);
    git(f.repo,['reset','-q','HEAD','forbidden.txt']);
    const unstaged=await verify(f.repo,b,{before,report:completedReport(before)});
    assert.equal(unstaged.status,'blocked');assert.deepEqual(pathsFor(unstaged),['forbidden.txt']);
    assert.equal(protocol().evidence[unstaged.evidenceRefs[0]].reason,'SCOPE_VIOLATION');
  }finally{f.cleanup();}
});
test('index-only rename includes both ends and keeps newline paths intact',async()=>{
  const f=fixture();try {
    const before=capture(f.repo).fingerprint;
    git(f.repo,['mv','allowed.txt','forbidden\nname.txt']);
    writeFileSync(join(f.repo,'allowed.txt'),'baseline');rmSync(join(f.repo,'forbidden\nname.txt'));
    assert.deepEqual(changedPaths(before,fingerprint(f.repo),f.repo),['allowed.txt','forbidden\nname.txt']);
    const b=strictBrief(f.repo);b.scope.include=['**'];b.verification[0].maxFiles=1;
    const ledger=await verify(f.repo,b,{before,report:completedReport(before)});
    assert.equal(ledger.status,'failed');assert.deepEqual(pathsFor(ledger),['allowed.txt','forbidden\nname.txt']);
    b.verification[0].maxFiles=2;assert.equal((await verify(f.repo,b,{before,report:completedReport(before)})).status,'passed');
  }finally{f.cleanup();}
});
test('staged-hidden-by-worktree-revert-strict',async()=>{
  const f=fixture();try {
    commit(f.repo,'forbidden.txt','baseline');
    const before=capture(f.repo).fingerprint;
    writeFileSync(join(f.repo,'forbidden.txt'),'staged forbidden change');
    git(f.repo,['add','forbidden.txt']);
    writeFileSync(join(f.repo,'forbidden.txt'),'baseline');
    assert.equal(git(f.repo,['status','--porcelain=v1']),'MM forbidden.txt');
    assert.equal(git(f.repo,['diff','--cached','--name-only']),'forbidden.txt');
    const ledger=await verify(f.repo,strictBrief(f.repo),{before,report:completedReport(before)});
    assert.equal(ledger.status,'blocked');
    assert.equal(protocol().evidence[ledger.evidenceRefs[0]].reason,'SCOPE_VIOLATION');
    assert.deepEqual(pathsFor(ledger),['forbidden.txt']);
    assert.equal(ledgerCurrent(ledger,fingerprint(f.repo)),false);
  }finally{f.cleanup();}
});
for(const [name,field,value] of [['malformed-acceptance-number-id','id',7],['malformed-acceptance-object-description','description',{}]] as const) {
  test(name,async()=>{
    const f=fixture();try {
      const before=capture(f.repo).fingerprint;
      const b=strictBrief(f.repo);
      Object.assign(b.acceptance![0],{[field]:value});
      assert.throws(()=>validateBrief(b),{name:'BriefValidationError',code:'BRIEF_INCOMPLETE',message:'BRIEF_INCOMPLETE: acceptance'});
      await assert.rejects(()=>verify(f.repo,b,{before,report:completedReport(before)}),{name:'BriefValidationError',code:'BRIEF_INCOMPLETE',message:'BRIEF_INCOMPLETE: acceptance'});
      assert.equal(Object.keys(protocol().ledgers).length,0);
      assert.equal(protocol().events.filter(e=>e.type==='verification-rejected').length,1);
      const valid=await verify(f.repo,strictBrief(f.repo),{before,report:completedReport(before)});
      assert.equal(valid.status,'passed');
      assert.equal(valid.contractAccepted,true);
    }finally{f.cleanup();}
  });
}
test('base and head changes invalidate old evidence and shipping rejects old false-green records',async()=>{
  const f=fixture();try {
    const base=git(f.repo,['rev-parse','HEAD']);commit(f.repo,'allowed.txt','one');const b=brief(f.repo);b.verification[0].maxFiles=1;const first=await verify(f.repo,b,prOptions(f.repo,base));assert.equal(first.status,'passed');
    const pr:PullRequest={repo:'example/project',number:1,headSha:first.fingerprint.commitSha,baseSha:base,baseRef:'main',state:'OPEN',mergeable:'MERGEABLE',ci:'passed',review:'approved'};
    const provider={async read(){return structuredClone(pr);},async merge(){throw new Error('must not merge');}};
    const spec={id:'stack',repoId:first.fingerprint.repoId,repo:pr.repo,numbers:[1],owner:'test',requireBehavior:false};
    assert.equal(eligibility(await refresh(spec,provider))[0].eligible,true);
    pr.baseSha=pr.headSha;assert.equal(eligibility(await refresh(spec,provider))[0].eligible,false);assert.equal(ledgerCurrent(first,first.fingerprint),false);
    const second=await verify(f.repo,b,prOptions(f.repo,pr.baseSha));assert.equal(second.status,'passed');assert.equal(second.diffBase?.refreshed,true);assert.equal(eligibility(await refresh(spec,provider))[0].eligible,true);
    transact('legacy-ledger',second.id,'test',s=>{delete s.ledgers[second.id].diffBase;});assert.equal(eligibility(await refresh(spec,provider))[0].eligible,false);
    commit(f.repo,'allowed.txt','two');pr.headSha=git(f.repo,['rev-parse','HEAD']);const third=await verify(f.repo,b,prOptions(f.repo,pr.baseSha));assert.equal(third.status,'passed');assert.equal(ledgerCurrent(second,second.fingerprint),false);assert.equal(eligibility(await refresh(spec,provider))[0].eligible,true);
  }finally{f.cleanup();}
});
