import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, cpSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { buildTemplate } from '../src/templates/build.ts';
import { planArtifacts } from '../src/workflow/artifacts.ts';
import type { TaskBrief } from '../src/contracts/types.ts';
import { CORE_RESOURCES, evaluateRound, requireCapability, selectPlaybook, validatePanel, type Round } from '../src/compatibility/adapter.ts';
import { createResourceTools } from '../src/agent/resources.ts';
import { registerSemanticTool } from '../src/compatibility/tool.ts';
// @ts-ignore ESM verification tooling is shared with the CI CLI.
import { checkSemantics, drift, digest, units } from '../scripts/semantics/core.mjs';
const root=process.cwd();
const snapshotRoot=JSON.parse(readFileSync('SEMANTICS.json','utf8')).snapshot.root;
const head='a'.repeat(40),base='b'.repeat(40);
const scenarios=JSON.parse(readFileSync('test/fixtures/semantics/scenarios.json','utf8'));
function round():Round {
  const lanes=['gates','live','diff-1','diff-2','trunk-regression'];
  return {workflow:'autopilot-full',head,base,writer:'owner',requiredLanes:lanes,receipts:lanes.map(lane=>({lane,actor:`reviewer-${lane}`,head,base,status:'passed',evidence:[`receipts/${lane}.log`]})),checksPassed:true,unresolvedFindings:0,authorization:true,requestedAction:'verdict'};
}
test('semantic source: eleven generated entrypoints retain pinned bodies and bound critical rules',()=>{
  const result=checkSemantics(root);assert.equal(result.workflows,11);assert.ok(result.rules>=25);assert.equal(result.fullBehavioralParity,'not-claimed');
  for(const resource of CORE_RESOURCES) {
    const source=readFileSync(`${snapshotRoot}/pstack/skills/${resource}`,'utf8').replace(/^---\n[\s\S]*?\n---\n/,'');
    assert.ok(readFileSync(`skills/${resource}`,'utf8').includes(source),resource);
  }
});
test('semantic routing: explicit task scenarios select the matching playbook',()=>{
  for(const fixture of scenarios.routes)assert.equal(selectPlaybook(fixture.intent),fixture.playbook,fixture.task);
  assert.throws(()=>selectPlaybook('unknown'),/UNMAPPED_INTENT/);
});
test('semantic panels: architect arena interrogate preserve independent dispatch and model boundaries',()=>{
  assert.throws(()=>validatePanel('architect',['p/a'],'p/j'),/INDEPENDENT_PANEL/);
  assert.throws(()=>validatePanel('arena',['p/a','p/b'],'p/a'),/INDEPENDENT_JUDGE/);
  assert.throws(()=>validatePanel('interrogate',['p/a','p/a']),/MODEL_DIVERSITY/);
  assert.throws(()=>validatePanel('swarm',['auto']),/EXPLICIT_MODEL/);
  const panel=validatePanel('architect',['p/a','p/b'],'p/j');assert.equal(panel.dispatch,'pstack_workflow');assert.equal(panel.integration,'explicit-integrator');assert.equal(panel.evidence,'not-run');
});
test('semantic rounds: autopilot needs live trunk and two independent diff lanes at current head and base',()=>{
  assert.equal(evaluateRound(round()).clean,true);
  for(const lane of round().requiredLanes) {
    const r=round();r.receipts=r.receipts.filter(v=>v.lane!==lane);assert.equal(evaluateRound(r).clean,false,lane);
  }
  for(const mutate of [
    (r:Round)=>{r.receipts[0].actor=r.writer;},(r:Round)=>{r.receipts[2].actor=r.receipts[3].actor;},
    (r:Round)=>{r.receipts[0].head='c'.repeat(40);},(r:Round)=>{r.receipts[0].base='c'.repeat(40);},
    (r:Round)=>{r.receipts[0].status='inconclusive';},(r:Round)=>{r.receipts[0].evidence=[];},
    (r:Round)=>{r.unresolvedFindings=1;},(r:Round)=>{r.checksPassed=false;},(r:Round)=>{r.skippedSteps=[{step:'proof',reason:''}];},
  ]) {const r=round();mutate(r);assert.equal(evaluateRound(r).clean,false);}
});
test('semantic authority: stack babysit reserved items and interrupted effects cannot acquire merge permission',()=>{
  for(const workflow of ['autopilot-stack','babysit']) {const r=round();r.workflow=workflow;r.requestedAction='merge';assert.ok(evaluateRound(r).blockers.includes('WORKFLOW_STOPS_BEFORE_MERGE'));}
  for(const authorized of [false,true]) {const r=round();r.requestedAction='merge';r.authorization=authorized;r.operatorReserved=true;assert.equal(evaluateRound(r).clean,false);}
  const r=round();r.interrupted=true;assert.ok(evaluateRound(r).blockers.includes('REMOTE_RECONCILIATION_REQUIRED'));r.remoteReconciled=true;assert.equal(evaluateRound(r).clean,true);
  r.requestedAction='merge';r.authorization=false;assert.equal(evaluateRound(r).clean,false);
});
test('semantic capabilities: unavailable Cursor operations and unknown mappings fail explicitly',async()=>{
  for(const name of ['Cursor-private-PR-provenance','Cursor-watch-READY','Cursor-cleanup-plugin','Bugbot-pass-dismissal','swarm-mixed-first-pass-template'])assert.throws(()=>requireCapability(name),/UNSUPPORTED_CAPABILITY/);
  for(const name of ['unknown','toString','__proto__'])assert.throws(()=>requireCapability(name),/UNMAPPED_CAPABILITY/);
  assert.equal(requireCapability('patch-id-reuse').status,'adapted-with-deviation');
  const tools:any[]=[];registerSemanticTool({registerTool:(t:any)=>tools.push(t)} as any);
  await assert.rejects(tools[0].execute('x',{action:'capability',name:'Cursor-watch-READY'}),/UNSUPPORTED_CAPABILITY/);
  assert.equal((await tools[0].execute('x',{action:'round',round:round()})).details.clean,true);
});
test('semantic resources: readonly children can paginate original playbooks references and adapter without workspace escape',async()=>{
  const tool=createResourceTools(join(root,'skills'))[0];
  const source='upstream/skills/poteto-mode/SKILL.md';let offset=1,lines:string[]=[];
  for(;;){const result=await tool.execute('x',{action:'read',resource:source,offset,limit:25});lines.push(...result.details.lines.map((v:any)=>v.text));if(!result.details.hasMore)break;offset=result.details.nextOffset;}
  assert.equal(lines.join('\n'),readFileSync(`${snapshotRoot}/pstack/skills/poteto-mode/SKILL.md`,'utf8'));
  for(const resource of ['upstream/skills/architect/references/runner-prompt.md','upstream/skills/poteto-mode/playbooks/shipping.md','poteto-mode/playbooks/shipping.md','pi-adapter.md'])assert.ok((await tool.execute('x',{action:'read',resource})).details.totalLines>1);
  for(const resource of ['upstream/../../etc/passwd','upstream/skills/poteto-mode/scripts/bootstrap.ts'])await assert.rejects(tool.execute('x',{action:'read',resource}),/INVALID_UPSTREAM_RESOURCE/);
});
test('semantic drift: edits to rules tests mappings and unreviewed relevant upstream steps require review',()=>{
  const box=mkdtempSync(join(tmpdir(),'semantic-drift-'));
  try {
    for(const p of ['SEMANTICS.json','UPSTREAM.json','PARITY.json','vendor','skills','docs','src','test','scripts'])cpSync(join(root,p),join(box,p),{recursive:true});
    const manifest=JSON.parse(readFileSync(join(box,'SEMANTICS.json'),'utf8'));
    const target=join(box,'src/compatibility/adapter.ts'),saved=readFileSync(target,'utf8');
    writeFileSync(target,saved+'\n// drift\n');assert.throws(()=>checkSemantics(box),/SEMANTIC_REVIEW_REQUIRED/);writeFileSync(target,saved);
    const missing=structuredClone(manifest);delete missing.reviewedFiles['src/compatibility/adapter.ts'];assert.throws(()=>checkSemantics(box,missing),/SEMANTIC_REVIEW_SCOPE_MISMATCH/);
    const noOverride=structuredClone(manifest);noOverride.overrides.pop();assert.throws(()=>checkSemantics(box,noOverride),/SEMANTIC_OVERRIDE_COVERAGE/);
    const bad=structuredClone(manifest);bad.workflows[0].units.pop();assert.throws(()=>checkSemantics(box,bad),/SEMANTIC_STEP_DRIFT/);
    const badRule=structuredClone(manifest);badRule.workflows[0].rules[0].tests[0].name=['nonexistent','test','binding'].join('-');assert.throws(()=>checkSemantics(box,badRule),/SEMANTIC_TEST_UNBOUND/);
    const repo=join(box,'candidate');mkdirSync(repo);cpSync(join(root,snapshotRoot,'pstack'),join(repo,'pstack'),{recursive:true});
    const git=(...args:string[])=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');git('add','.');git('commit','-qm','snapshot');
    const irrelevant=join(repo,'pstack/skills/teach/SKILL.md');writeFileSync(irrelevant,readFileSync(irrelevant,'utf8')+'\nUnrelated change.\n');git('add','.');git('commit','-qm','irrelevant');assert.equal(drift(box,repo,git('rev-parse','HEAD')).status,'reviewed-or-irrelevant');
    const critical=join(repo,'pstack/skills/poteto-mode/playbooks/autopilot-full.md');writeFileSync(critical,readFileSync(critical,'utf8').replace('Green CI alone never authorizes a merge.','Merge without review.'));git('add','.');git('commit','-qm','critical');
    const commit=git('rev-parse','HEAD'),report=drift(box,repo,commit);assert.equal(report.status,'needs-review');const change=report.changes.find((v:any)=>v.relevant);assert.notDeepEqual(change.beforeSteps,change.afterSteps);
    manifest.driftReviews.push({commit,path:change.path,before:change.before,after:change.after,status:'signed-off',reviewer:'fixture maintainer',rationale:'Fixture-only signoff, not a baseline advance',tests:['test/semantic-compatibility.test.ts']});writeFileSync(join(box,'SEMANTICS.json'),JSON.stringify(manifest));assert.equal(drift(box,repo,commit).status,'reviewed-or-irrelevant');
    // Drift remains tied to the committed candidate, even if the checkout is subsequently edited.
    writeFileSync(critical,'dirty checkout');assert.equal(drift(box,repo,commit).status,'reviewed-or-irrelevant');
    writeFileSync(join(box,'skills/architect/SKILL.md'),'condensed rewrite');assert.throws(()=>checkSemantics(box),/SEMANTIC_ENTRYPOINT_DRIFT/);
  } finally {rmSync(box,{recursive:true,force:true});}
});

test('semantic scenarios: stale rebase topology and recovery fail against fixed golden expectations',()=>{
  for(const fixture of scenarios.negativeRounds)assert.ok(evaluateRound({...round(),...fixture.change}).blockers.includes(fixture.blocker),fixture.name);
});
test('semantic DAG: native dispatch isolates candidate writers and verifies the integrated artifact',()=>{
  const brief:TaskBrief={id:'semantic-template',revision:1,contractLevel:'strict',goal:'Prove the candidate artifact',scope:{repoId:'fixture',include:['**'],exclude:[]},contextRefs:[],acceptance:[{id:'proof',description:'proof',required:true,gateIds:['proof']}],verification:[{id:'proof',kind:'file',path:'proof.txt'}],forbidden:['remote-write'],standingOrders:[],reportFormat:'task-report-v1',timeboxSeconds:30};
  const t={kind:'arena' as const,brief,models:['p/a','p/b'],judgeModel:'p/j',rubric:[{criterion:'observable correctness',weight:1}]};
  const plan=buildTemplate(t),artifacts=planArtifacts(plan.nodes);
  assert.deepEqual([...artifacts.isolated].sort(),['candidate-1','candidate-2']);
  assert.equal(plan.nodes.find(n=>n.key==='integrate')?.profile,'integrator');
  assert.deepEqual(plan.nodes.find(n=>n.key==='verify')?.dependsOn,['integrate']);
  assert.deepEqual(plan.nodes.filter(n=>n.profile==='reviewer').map(n=>n.model),['p/j','p/j']);
  assert.throws(()=>buildTemplate({...t,judgeModel:'p/a'}),/JUDGE_NOT_INDEPENDENT/);
  assert.throws(()=>planArtifacts(plan.nodes.filter(n=>n.key!=='integrate').map(n=>n.key==='verify'?{...n,dependsOn:['candidate-1','candidate-2']}:n)),/multiple unmerged writable artifacts/);
});
