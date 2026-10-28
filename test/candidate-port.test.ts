import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {loadSkillsFromDir} from '@earendil-works/pi-coding-agent';

test('pinned candidate accounts for every diff without advancing baseline or claiming integration',()=>{
 const report=JSON.parse(readFileSync('docs/upstream-sync/reports/978ca6e9c0e0_837067b75aa2.json','utf8'));
 const receipt=JSON.parse(readFileSync('docs/upstream-sync/candidate-0.15.23.json','utf8'));
 assert.deepEqual(receipt.tasks.map((t:any)=>t.upstreamPath).sort(),report.changes.map((c:any)=>c.path).sort());
 assert.equal(receipt.candidateSha,report.candidate.sha);assert.equal(receipt.integrated,false);assert.equal(receipt.status,'proposed');
 for(const file of ['UPSTREAM.json','PARITY.json']) {
   let previous=JSON.parse(readFileSync(file,'utf8')).previousBaseline;
   while(previous && previous.commit!==report.baseline.sha)previous=previous.previousBaseline;
   assert.equal(previous?.commit,report.baseline.sha);
 }
 for(const task of receipt.tasks){const evidence=report.changes.find((c:any)=>c.id===task.taskId);assert.equal(task.newBlob,evidence.newBlob);assert.equal(task.semanticReview,'pending');assert.equal(task.behavioralEquivalence,'not_claimed');assert.ok(task.rationale);for(const file of task.localFiles)assert.ok(existsSync(file),file);}
 const loaded=loadSkillsFromDir({dir:process.cwd()+'/skills',source:'path'});assert.deepEqual(loaded.diagnostics,[]);assert.ok(loaded.skills.some(s=>s.name==='in-your-own-words'));
});
