import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { checkInventory } from '../check-inventory.mjs';
import { digest, readJSON } from './core.mjs';
import { buildInventory, readSnapshot, validateInventory, validateSnapshot } from './inventory.mjs';

const root = resolve('.');
const snapshotPath = 'docs/upstream-target-0.15.32.json';
const inventoryPath = 'docs/upstream-inventory-0.15.32.json';
const serialize = value => JSON.stringify(value,null,2)+'\n';
function snapshotFor(paths) {
  const blobs = paths.sort((a,b)=>a.localeCompare(b,'en')).map((path,index)=>({path,blob:String(index+1).repeat(40),mode:'100644',size:10+index}));
  return {schemaVersion:1,repository:'cursor/plugins',path:'pstack',treeTruncated:false,commit:'a'.repeat(40),version:'0.15.32',blobs,pstackBlobCount:blobs.length,blobDigest:digest(blobs)};
}
function fixture(t) {
  const localRoot = mkdtempSync(join(tmpdir(),'upstream-inventory-'));
  t.after(()=>rmSync(localRoot,{recursive:true,force:true}));
  const put = (path,text) => {mkdirSync(dirname(join(localRoot,path)),{recursive:true});writeFileSync(join(localRoot,path),text);};
  put('agents/reviewer.md','review');
  put('skills/adapted/SKILL.md','Read dataset.md.');
  put('skills/adapted/references/local.txt','Only here: helper.mjs');
  const snapshot = snapshotFor(['agents/reviewer.md','skills/adapted/SKILL.md','skills/missing/SKILL.md','skills/missing/references/dataset.md']);
  const parity = {upstreamCommit:'b'.repeat(40),upstream:'0.15.17',skills:{adapted:'ADAPTED'},playbooks:{}};
  return {snapshot,parity,localRoot,put};
}

test('fixture inventory separates port, closure, contracts and evidence',t=>{
  const f = fixture(t), inventory = buildInventory(f);
  assert.equal(validateSnapshot(f.snapshot),f.snapshot);
  assert.equal(validateInventory(inventory,f),inventory);
  assert.deepEqual(inventory.target,{commit:'a'.repeat(40),version:'0.15.32',snapshot:snapshotPath,snapshotDigest:f.snapshot.blobDigest});
  assert.deepEqual(inventory.reviewedBaseline,{commit:'b'.repeat(40),version:'0.15.17',registry:'PARITY.json'});
  assert.deepEqual(inventory.counts,{files:4,skills:2,playbooks:0,agents:1,manifest:0,references:1,scripts:0,automations:0,docs:0,assets:0,other:0,nestedSkills:0});
  assert.deepEqual(inventory.dispositionSummary,{local:2,sourceOnly:0,unsupported:0,pending:2});
  assert.deepEqual(inventory.openWork,{pendingSkills:['missing'],pendingPlaybooks:[],pendingNestedSkills:[],referencedFiles:['skills/missing/references/dataset.md']});
  assert.deepEqual(inventory.entries.map(e=>e.port),[
    {kind:'local',path:'agents/reviewer.md',reason:'agent-role-file'},
    {kind:'local',path:'skills/adapted/SKILL.md',reason:'parity-adapted',parity:'ADAPTED'},
    {kind:'pending',reason:'file-disposition-not-reviewed'},
    {kind:'pending',reason:'not-in-reviewed-registry'},
  ]);
  assert.deepEqual(inventory.entries[2].closure,{referencedByLocalSkill:true});
  assert.deepEqual(inventory.entries[2].source,{path:'skills/missing/references/dataset.md',blob:'3'.repeat(40),mode:'100644',size:12,category:'reference'});
  for(const entry of inventory.entries) {
    assert.deepEqual(entry.requirements,{status:'not_recorded'});
    assert.deepEqual(entry.contracts,{status:'not_run',ids:[]});
    assert.deepEqual(entry.evidence,{status:'not_run',refs:[]});
  }
  assert.equal(serialize(inventory),serialize(buildInventory(f)));
});

test('category order and count buckets follow the path rules',t=>{
  const f = fixture(t);
  for(const [path,category,bucket] of [
    ['.cursor-plugin/plugin.json','manifest','manifest'],
    ['plugin.json','manifest','manifest'],
    ['skills/example/SKILL.md','skill','skills'],
    ['skills/poteto-mode/playbooks/example.md','playbook','playbooks'],
    ['skills/poteto-mode/scripts/references/fixture.md','playbook-script','scripts'],
    ['agents/example.md','agent','agents'],
    ['automations/benny/skills/example/SKILL.md','automation','automations'],
    ['automations/benny/references/fixture.md','automation','automations'],
    ['automations/benny/scripts/fixture.mjs','automation','automations'],
    ['skills/example/references/scripts/fixture.svg','reference','references'],
    ['skills/example/scripts/fixture.md','script','scripts'],
    ['scripts/fixture.mjs','script','scripts'],
    ['assets/image.jpeg','asset','assets'],
    ['docs/example.md','docs','docs'],
    ['LICENSE','other','other'],
  ]) {
    const inventory = buildInventory({...f,snapshot:snapshotFor([path])});
    assert.equal(inventory.entries[0].source.category,category,path);
    assert.equal(inventory.counts[bucket],1,path);
  }
  const inventory = buildInventory({...f,snapshot:snapshotFor(['scripts/helper.mjs'])});
  assert.equal(inventory.entries[0].closure.referencedByLocalSkill,true);
});

test('registry statuses and absent agents have explicit dispositions',t=>{
  const f = fixture(t);
  for(const category of ['skill','playbook']) {
    const path = category === 'skill' ? 'skills/example/SKILL.md':'skills/poteto-mode/playbooks/example.md';
    f.put(path,'example');
    for(const [status,port] of [
      ['ADAPTED',{kind:'local',path,reason:'parity-adapted',parity:'ADAPTED'}],
      ['CURSOR_ONLY',{kind:'unsupported',reason:'cursor-only'}],
      ['PENDING_PORT',{kind:'pending',reason:'parity-pending'}],
      ['FUTURE_STATUS',{kind:'pending',reason:'parity-pending'}],
      [undefined,{kind:'pending',reason:'not-in-reviewed-registry'}],
    ]) {
      const parity = {...f.parity,[category === 'skill' ? 'skills':'playbooks']:status ? {example:status}:{}};
      const inputs = {...f,snapshot:snapshotFor([path]),parity}, inventory = buildInventory(inputs);
      assert.deepEqual(inventory.entries[0].port,port);
      assert.equal(validateInventory(inventory,inputs),inventory);
      assert.deepEqual(inventory.openWork[category === 'skill' ? 'pendingSkills':'pendingPlaybooks'],port.kind === 'pending' ? ['example']:[]);
    }
  }
  assert.deepEqual(buildInventory({...f,snapshot:snapshotFor(['agents/absent.md'])}).entries[0].port,{kind:'pending',reason:'agent-role-not-ported'});
  assert.deepEqual(buildInventory({...f,snapshot:snapshotFor(['plugin.json'])}).entries[0].port,{kind:'source-only',reason:'upstream-manifest-not-vendored'});
});

test('real recorded snapshot has a complete non-overlapping category partition',()=>{
  const snapshot = readSnapshot(root), parity = readJSON(join(root,'PARITY.json'));
  const inputs = {snapshot,parity,localRoot:root}, inventory = buildInventory(inputs);
  assert.equal(validateInventory(inventory,inputs),inventory);
  assert.deepEqual(inventory.counts,{files:200,skills:58,playbooks:23,agents:2,manifest:2,references:33,scripts:48,automations:12,docs:13,assets:7,other:2,nestedSkills:3});
  const {files,nestedSkills,...partition} = inventory.counts;
  assert.equal(Object.values(partition).reduce((total,count)=>total+count,0),200);
  assert.equal(files,200);
  assert.equal(nestedSkills,3);
  assert.deepEqual(inventory.openWork.pendingNestedSkills,['reproduce-and-fix-issues','setup-benny','triage-issue-reports']);
  assert.equal(inventory.openWork.pendingNestedSkills.length,3);
  assert.equal(inventory.entries.filter(e=>e.source.category === 'automation').length,12);
  const ported = ['create-formal-verification-skill','in-your-own-words','ketchup-video','maintain-formal-verification-skill','sharpen'];
  for(const name of ported) {
    assert.equal(parity.skills[name],'ADAPTED');
    assert.deepEqual(inventory.entries.find(e=>e.source.path === `skills/${name}/SKILL.md`).port,{kind:'local',path:`skills/${name}/SKILL.md`,reason:'parity-adapted',parity:'ADAPTED'});
  }
  assert.deepEqual(inventory.openWork.pendingSkills,[]);
  assert.deepEqual(inventory.entries.find(e=>e.source.path === 'skills/statechart/SKILL.md').port,{kind:'local',path:'skills/statechart/SKILL.md',reason:'parity-adapted',parity:'ADAPTED'});
  assert.deepEqual(inventory.entries.find(e=>e.source.path === 'skills/make-bot-ui/SKILL.md').port,{kind:'unsupported',reason:'cursor-only'});
  for(const entry of inventory.entries.filter(e=>e.port.kind === 'local')) assert.ok(existsSync(join(root,entry.port.path)),entry.source.path);
  assert.deepEqual(inventory.dispositionSummary,{local:141,sourceOnly:2,unsupported:1,pending:56});
  assert.equal(serialize(inventory),serialize(buildInventory(inputs)));
  assert.equal(readFileSync(join(root,inventoryPath),'utf8'),serialize(inventory));
  assert.deepEqual(checkInventory(root),inventory);
  assert.equal(inventory.reviewedBaseline.commit,readJSON(join(root,'UPSTREAM.json')).commit);
  assert.equal(inventory.reviewedBaseline.version,readJSON(join(root,'UPSTREAM.json')).version);
});

const snapshotRejections = [
  ['missing blob',s=>s.blobs.pop()],
  ['duplicate path',s=>{s.blobs[1].path=s.blobs[0].path;s.blobDigest=digest(s.blobs);}],
  ['unsorted paths',s=>{s.blobs.reverse();s.blobDigest=digest(s.blobs);}],
  ['tampered blobDigest',s=>s.blobDigest='0'.repeat(64)],
  ['unsafe path',s=>{s.blobs[0].path='../escape';s.blobDigest=digest(s.blobs);}],
  ['schema version',s=>s.schemaVersion=2],
  ['repository',s=>s.repository='wrong/repo'],
  ['source path',s=>s.path='elsewhere'],
  ['truncated tree',s=>s.treeTruncated=true],
  ['commit',s=>s.commit='not-a-sha'],
  ['version',s=>s.version='bad version'],
  ['blobs not array',s=>s.blobs={}],
  ['blob SHA',s=>{s.blobs[0].blob='invalid';s.blobDigest=digest(s.blobs);}],
  ['blob mode',s=>{s.blobs[0].mode='120000';s.blobDigest=digest(s.blobs);}],
  ['negative size',s=>{s.blobs[0].size=-1;s.blobDigest=digest(s.blobs);}],
  ['fractional size',s=>{s.blobs[0].size=1.5;s.blobDigest=digest(s.blobs);}],
  ['unsafe integer size',s=>{s.blobs[0].size=Number.MAX_SAFE_INTEGER+1;s.blobDigest=digest(s.blobs);}],
];
for(const [name,mutate] of snapshotRejections) test(`snapshot rejects ${name}`,t=>{
  const f = fixture(t), snapshot = structuredClone(f.snapshot);
  mutate(snapshot);
  assert.throws(()=>validateSnapshot(snapshot),/^Error: SNAPSHOT_/);
});
test('snapshot rejects null and preserves the recorded locale path order',t=>{
  assert.throws(()=>validateSnapshot(null),/^Error: SNAPSHOT_/);
  const f = fixture(t), snapshot = snapshotFor(['skills/example/references/data.md','skills/example/SKILL.md']);
  assert.equal(validateSnapshot(snapshot),snapshot);
  f.put(snapshotPath,serialize(snapshot));
  assert.deepEqual(readSnapshot(f.localRoot),snapshot);
});

const inventoryRejections = [
  ['missing blob',i=>i.entries.pop()],
  ['duplicate path',i=>i.entries[1].source.path=i.entries[0].source.path],
  ['tampered blob SHA',i=>i.entries[0].source.blob='f'.repeat(40)],
  ['tampered mode',i=>i.entries[0].source.mode='100755'],
  ['tampered size',i=>i.entries[0].source.size++],
  ['schema version',i=>i.schemaVersion=2],
  ['target commit',i=>i.target.commit='f'.repeat(40)],
  ['target version',i=>i.target.version='0.0.0'],
  ['target digest',i=>i.target.snapshotDigest='0'.repeat(64)],
  ['baseline',i=>i.reviewedBaseline.commit='f'.repeat(40)],
  ['category',i=>i.entries[0].source.category='docs'],
  ['counts',i=>i.counts.files++],
  ['disposition summary',i=>i.dispositionSummary.local++],
  ['open work',i=>i.openWork.pendingSkills=[]],
  ['unknown disposition',i=>i.entries[0].port.kind='unknown'],
  ['nonexistent local path',i=>i.entries[0].port.path='agents/nonexistent.md'],
  ['registry-lacking skill claimed local',i=>i.entries[3].port={kind:'local',path:'skills/adapted/SKILL.md'},'Local skill or playbook is not registry-adapted'],
  ['pending without reason',i=>delete i.entries[3].port.reason,'Disposition requires a reason'],
  ['pending with blank reason',i=>i.entries[3].port.reason='  ','Disposition requires a reason'],
  ['unsupported without reason',i=>i.entries[3].port={kind:'unsupported'},'Disposition requires a reason'],
  ['passed evidence without contracts',i=>i.entries[0].evidence={status:'passed',refs:['docs/evidence.json']}],
  ['passed evidence without references',i=>{i.entries[0].contracts.ids=['contract-1'];i.entries[0].evidence.status='passed';}],
  ['not-run evidence with references',i=>i.entries[0].evidence.refs=['docs/evidence.json']],
  ['unknown evidence status',i=>i.entries[0].evidence.status='unknown'],
  ['missing dependency closure',i=>delete i.entries[2].closure,'Invalid dependency closure'],
  ['requirements recorded as passed',i=>i.entries[0].requirements={status:'passed'},'Invalid requirements'],
  ['unsafe entry path',i=>i.entries[0].source.path='../escape'],
  ['unsafe local path',i=>i.entries[0].port.path='../escape'],
];
for(const [name,mutate,message = ''] of inventoryRejections) test(`inventory rejects ${name}`,t=>{
  const f = fixture(t), inventory = buildInventory(f);
  mutate(inventory);
  assert.throws(()=>validateInventory(inventory,f),new RegExp(`^Error: INVENTORY_${message}`));
});
test('inventory rejects unadapted local skills, null input and escaped symlinks',t=>{
  const f = fixture(t), inventory = buildInventory(f);
  for(const status of ['CURSOR_ONLY','PENDING_PORT','FUTURE_STATUS']) {
    f.parity.skills.adapted = status;
    assert.throws(()=>validateInventory(inventory,f),/^Error: INVENTORY_/);
  }
  f.parity.skills.adapted = 'ADAPTED';
  assert.throws(()=>validateInventory(null,f),/^Error: INVENTORY_/);
  symlinkSync(join(root,'UPSTREAM.json'),join(f.localRoot,'agents/escape.md'));
  inventory.entries[0].port.path = 'agents/escape.md';
  assert.throws(()=>validateInventory(inventory,f),/^Error: INVENTORY_/);
});
test('inventory accepts evidence states and passed evidence with contracts and references',t=>{
  const f = fixture(t), inventory = buildInventory(f);
  for(const status of ['not_run','blocked','failed','stale']) {
    inventory.entries[0].evidence.status = status;
    assert.equal(validateInventory(inventory,f),inventory);
  }
  inventory.entries[0].contracts = {status:'passed',ids:['contract-1']};
  inventory.entries[0].evidence = {status:'passed',refs:['docs/evidence.json']};
  assert.equal(validateInventory(inventory,f),inventory);
});

test('CLI writes deterministically, check modes detect drift and never rewrite it',t=>{
  const f = fixture(t);
  f.put(snapshotPath,serialize(f.snapshot));
  f.put('PARITY.json',serialize(f.parity));
  const cli = (...args) => spawnSync(process.execPath,[join(root,'scripts/upstream/cli.mjs'),'inventory',...args],{cwd:f.localRoot,encoding:'utf8'});
  const runner = () => spawnSync(process.execPath,[join(root,'scripts/check-inventory.mjs')],{cwd:f.localRoot,encoding:'utf8'});
  const written = cli();
  assert.equal(written.status,0,written.stderr);
  assert.deepEqual(JSON.parse(written.stdout),{status:'written',files:4,pending:2});
  const original = readFileSync(join(f.localRoot,inventoryPath),'utf8');
  assert.equal(cli().status,0);
  assert.equal(readFileSync(join(f.localRoot,inventoryPath),'utf8'),original);
  for(const result of [cli('--check'),runner()]) {
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),{status:'in-sync',files:4});
  }
  f.put(inventoryPath,original+'\n');
  for(const result of [cli('--check'),runner()]) {
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/INVENTORY_Drift/);
  }
  assert.equal(readFileSync(join(f.localRoot,inventoryPath),'utf8'),original+'\n');
  f.put(inventoryPath,original);
  f.put('skills/adapted/SKILL.md','Reference removed.');
  assert.throws(()=>checkInventory(f.localRoot),/INVENTORY_Drift/);
  const invalid = JSON.parse(original);
  invalid.entries.pop();
  f.put(inventoryPath,serialize(invalid));
  assert.match(runner().stderr,/INVENTORY_Entry count mismatch/);
});
