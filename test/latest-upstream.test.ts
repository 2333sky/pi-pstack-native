import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadSkillsFromDir} from '@earendil-works/pi-coding-agent';
import {evaluateRound, type Round} from '../src/compatibility/adapter.ts';
// @ts-ignore shared ESM tooling
import {generatedResources, renderCore} from '../scripts/semantics/generate.mjs';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
test('latest source: every supported 0.15.36 Skill and playbook retains its pinned body and loads on Pi 1.4',()=>{
 const upstream=read('UPSTREAM.json'),manifest=read('SEMANTICS.json'),parity=read('PARITY.json');
 assert.equal(upstream.version,'0.15.36');assert.equal(upstream.commit,'c742dd61706fbacc1b95f1a20b7b988cf096ce6c');
 assert.equal(manifest.snapshot.commit,upstream.commit);
 assert.equal(read('package-lock.json').packages['node_modules/@earendil-works/pi-coding-agent'].version,'1.4.0');
 assert.equal(Object.keys(parity.skills).length,58);assert.equal(parity.skills['make-bot-ui'],'CURSOR_ONLY');assert.equal(parity.skills.statechart,'ADAPTED');
 const loaded=loadSkillsFromDir({dir:process.cwd()+'/skills',source:'path'});assert.deepEqual(loaded.diagnostics,[]);assert.ok(loaded.skills.some(s=>s.name==='statechart'));
 const resources=generatedResources(process.cwd());assert.equal(resources.length,80);
 for(const resource of resources){const body=readFileSync(`${manifest.snapshot.root}/pstack/skills/${resource}`,'utf8').replace(/^---\n[\s\S]*?\n---\n/,'');assert.ok(renderCore(process.cwd(),resource).includes(body),resource);}
 const target=read(parity.coverage.targetInventory);
 for(const entry of target.blobs.filter((v:any)=>v.path.startsWith('skills/statechart/scripts/'))) {
   const bytes=readFileSync(entry.path);const hash=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
   assert.equal(hash,entry.blob,entry.path);
 }
});
function full():Round {
 const head='a'.repeat(40),base='b'.repeat(40),lanes=['gates','live','diff-1','diff-2','trunk-regression'];
 return {workflow:'autopilot-full',head,base,writer:'author',requiredLanes:lanes,receipts:lanes.map(lane=>({lane,actor:`reviewer-${lane}`,head,base,status:'passed',evidence:[`${lane}.log`]})),checksPassed:true,unresolvedFindings:0,authorization:false,requestedAction:'verdict'};
}
function followup():Round {
 const head='c'.repeat(40),base='b'.repeat(40),lanes=['gates','live','follow-up-review'];
 return {...full(),head,base,changeKind:'minor',priorRound:full(),requiredLanes:lanes,receipts:lanes.map(lane=>({lane,actor:'independent-followup',head,base,status:'passed',evidence:[`new-${lane}.log`]}))};
}
test('latest autopilot: minor rebase and conflict follow-ups need a prior full swarm and fresh independent receipts',()=>{
 for(const changeKind of ['minor','rebase','conflict'] as const)assert.equal(evaluateRound({...followup(),changeKind}).clean,true);
 for(const changeKind of ['initial','major'] as const)assert.equal(evaluateRound({...followup(),changeKind}).clean,false);
 const missing=followup();delete missing.priorRound;assert.ok(evaluateRound(missing).blockers.includes('PRIOR_FULL_SWARM_REQUIRED'));
 const failed=followup();failed.priorRound!.checksPassed=false;assert.equal(evaluateRound(failed).clean,false);
 const stale=followup();stale.receipts[0].head=stale.priorRound!.head;assert.equal(evaluateRound(stale).clean,false);
 const self=followup();self.writer='replacement';self.receipts[0].actor=self.priorRound!.writer;assert.equal(evaluateRound(self).clean,false);
 const quiet=followup();quiet.receipts=quiet.receipts.filter(r=>r.lane!=='live');assert.equal(evaluateRound(quiet).clean,false);
});
