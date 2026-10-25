import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, join, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { digest, readJSON, safePath } from './core.mjs';

const snapshotPath = 'docs/upstream-target-0.15.32.json';
const sha = /^[a-f0-9]{40}$/;
const categoryRules = [
  ['manifest', /^(?:\.cursor-plugin\/)?plugin\.json$/],
  ['skill', /^skills\/[^/]+\/SKILL\.md$/],
  ['playbook', /^skills\/poteto-mode\/playbooks\/[^/]+\.md$/],
  ['playbook-script', /^skills\/poteto-mode\/scripts\//],
  ['agent', /^agents\/[^/]+\.md$/],
  ['automation', /^automations\//],
  ['reference', /\/references\//],
  ['script', /(?:^|\/)scripts\//],
  ['asset', /\.(png|jpe?g|gif|svg|webp|ico)$/],
  ['docs', /\.md$/],
];
const countKeys = {skill:'skills',playbook:'playbooks',agent:'agents',manifest:'manifest',reference:'references','playbook-script':'scripts',script:'scripts',automation:'automations',docs:'docs',asset:'assets',other:'other'};
const dispositionKeys = {local:'local','source-only':'sourceOnly',unsupported:'unsupported',pending:'pending'};
const evidenceStates = ['not_run','blocked','passed','failed','stale'];
const classify = path => categoryRules.find(([,pattern])=>pattern.test(path))?.[0] ?? 'other';
const nestedName = path => path.match(/^automations\/.+\/skills\/([^/]+)\/SKILL\.md$/)?.[1];
const genericNames = new Set(['SKILL','README','LICENSE','index','plugin']);
const closureCategories = new Set(['reference','script','playbook-script']);
const nameOf = source => source.category === 'skill' ? source.path.split('/')[1] : basename(source.path,'.md');
const registryOf = (source,parity) => parity[source.category === 'skill' ? 'skills':'playbooks'];
function closureNeedle(path) {
  const nested = nestedName(path);
  if(nested) return nested;
  const name = basename(path,extname(path));
  return genericNames.has(name) || name.length < 6 ? undefined : name;
}
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const requireValue = (condition,message) => { if(!condition) throw new Error(message); };
function confinedFile(root,path) {
  safePath(path);
  const base = realpathSync(root), target = realpathSync(join(base,path));
  requireValue(target.startsWith(base + sep) && statSync(target).isFile(),'Local path must be a file under localRoot');
}
function skillText(root) {
  const texts = [], base = join(root,'skills');
  function walk(dir) {
    for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      const path = join(dir,entry.name);
      if(entry.isDirectory()) walk(path);
      else if(entry.isFile()) texts.push(readFileSync(path,'utf8'));
    }
  }
  if(existsSync(base)) {
    requireValue(realpathSync(base).startsWith(realpathSync(root) + sep),'Skills tree escapes localRoot');
    walk(base);
  }
  return texts.join('\n');
}
function summarize(entries) {
  const counts = {files:entries.length,skills:0,playbooks:0,agents:0,manifest:0,references:0,scripts:0,automations:0,docs:0,assets:0,other:0,nestedSkills:0};
  const dispositionSummary = {local:0,sourceOnly:0,unsupported:0,pending:0};
  const openWork = {pendingSkills:[],pendingPlaybooks:[],pendingNestedSkills:[],referencedFiles:[]};
  for(const entry of entries) {
    const source = entry.source;
    counts[countKeys[source.category]]++;
    dispositionSummary[dispositionKeys[entry.port.kind]]++;
    const nested = nestedName(source.path);
    if(nested) counts.nestedSkills++;
    if(entry.port.kind !== 'pending') continue;
    if(source.category === 'skill') openWork.pendingSkills.push(nameOf(source));
    if(source.category === 'playbook') openWork.pendingPlaybooks.push(nameOf(source));
    if(nested) openWork.pendingNestedSkills.push(nested);
    if(entry.closure?.referencedByLocalSkill) openWork.referencedFiles.push(source.path);
  }
  for(const list of Object.values(openWork)) list.sort();
  return {counts,dispositionSummary,openWork};
}
function disposition(source,parity,localRoot) {
  if(['skill','playbook'].includes(source.category)) {
    const name = nameOf(source), registry = registryOf(source,parity);
    if(!Object.hasOwn(registry ?? {},name)) return {kind:'pending',reason:'not-in-reviewed-registry'};
    const status = registry[name];
    if(status === 'ADAPTED') return {kind:'local',path:source.path,reason:'parity-adapted',parity:'ADAPTED'};
    if(status === 'CURSOR_ONLY') return {kind:'unsupported',reason:'cursor-only'};
    return {kind:'pending',reason:'parity-pending'};
  }
  if(source.category === 'agent') return existsSync(join(localRoot,source.path)) ? {kind:'local',path:source.path,reason:'agent-role-file'} : {kind:'pending',reason:'agent-role-not-ported'};
  if(source.category === 'manifest') return {kind:'source-only',reason:'upstream-manifest-not-vendored'};
  return {kind:'pending',reason:'file-disposition-not-reviewed'};
}

export function readSnapshot(root) {
  return validateSnapshot(readJSON(join(root,snapshotPath)));
}
export function validateSnapshot(snapshot) {
  try {
    requireValue(snapshot?.schemaVersion === 1 && snapshot.repository === 'cursor/plugins' && snapshot.path === 'pstack' && snapshot.treeTruncated === false,'Invalid identity');
    requireValue(typeof snapshot.commit === 'string' && sha.test(snapshot.commit),'Invalid commit');
    requireValue(typeof snapshot.version === 'string' && /^[\w.+-]+$/.test(snapshot.version),'Invalid version');
    requireValue(Array.isArray(snapshot.blobs),'Blobs must be an array');
    let previous;
    for(const blob of snapshot.blobs) {
      safePath(blob?.path);
      requireValue(typeof blob.blob === 'string' && sha.test(blob.blob),'Invalid blob SHA');
      requireValue(['100644','100755'].includes(blob.mode),'Invalid blob mode');
      requireValue(Number.isSafeInteger(blob.size) && blob.size >= 0,'Invalid blob size');
      requireValue(previous === undefined || previous.localeCompare(blob.path,'en') < 0,'Paths must be strictly ascending and unique');
      previous = blob.path;
    }
    requireValue(snapshot.pstackBlobCount === snapshot.blobs.length,'Blob count mismatch');
    requireValue(snapshot.blobDigest === digest(snapshot.blobs),'Blob digest mismatch');
    return snapshot;
  } catch(error) { throw new Error(`SNAPSHOT_${error.message}`); }
}
export function buildInventory({ snapshot, parity, localRoot }) {
  validateSnapshot(snapshot);
  const text = skillText(localRoot);
  const entries = snapshot.blobs.map(blob=>{
    const source = {path:blob.path,blob:blob.blob,mode:blob.mode,size:blob.size,category:classify(blob.path)};
    const entry = {source,port:disposition(source,parity,localRoot),requirements:{status:'not_recorded'},contracts:{status:'not_run',ids:[]},evidence:{status:'not_run',refs:[]}};
    if(closureCategories.has(source.category)) {
      const needle = closureNeedle(source.path);
      entry.closure = {referencedByLocalSkill:Boolean(needle) && text.includes(needle)};
    }
    return entry;
  });
  return {
    schemaVersion:1,
    target:{commit:snapshot.commit,version:snapshot.version,snapshot:snapshotPath,snapshotDigest:snapshot.blobDigest},
    reviewedBaseline:{commit:parity.upstreamCommit,version:parity.upstream,registry:'PARITY.json'},
    ...summarize(entries),
    entries,
  };
}
export function validateInventory(inventory, { snapshot, parity, localRoot }) {
  try {
    validateSnapshot(snapshot);
    requireValue(inventory?.schemaVersion === 1,'Invalid schema version');
    requireValue(isDeepStrictEqual(inventory.target,{commit:snapshot.commit,version:snapshot.version,snapshot:snapshotPath,snapshotDigest:snapshot.blobDigest}),'Target mismatch');
    requireValue(isDeepStrictEqual(inventory.reviewedBaseline,{commit:parity.upstreamCommit,version:parity.upstream,registry:'PARITY.json'}),'Reviewed baseline mismatch');
    requireValue(Array.isArray(inventory.entries) && inventory.entries.length === snapshot.blobs.length,'Entry count mismatch');
    for(const [index,entry] of inventory.entries.entries()) {
      const blob = snapshot.blobs[index], source = entry?.source;
      safePath(source?.path);
      requireValue(['path','blob','mode','size'].every(key=>source[key] === blob[key]),'Entry does not match snapshot blob');
      requireValue(source.category === classify(source.path),'Category mismatch');
      requireValue(isDeepStrictEqual(entry.requirements,{status:'not_recorded'}),'Invalid requirements');
      requireValue(Object.hasOwn(dispositionKeys,entry.port?.kind),'Unknown disposition');
      if(entry.port.kind === 'local') {
        confinedFile(localRoot,entry.port.path);
        if(['skill','playbook'].includes(source.category)) {
          const registry = registryOf(source,parity), name = nameOf(source);
          requireValue(Object.hasOwn(registry ?? {},name) && registry[name] === 'ADAPTED','Local skill or playbook is not registry-adapted');
        }
      }
      if(['pending','unsupported'].includes(entry.port.kind)) requireValue(nonempty(entry.port.reason),'Disposition requires a reason');
      if(closureCategories.has(source.category)) requireValue(typeof entry.closure?.referencedByLocalSkill === 'boolean','Invalid dependency closure');
      if(!closureCategories.has(source.category)) requireValue(entry.closure === undefined,'Dependency closure only applies to referenced files');
      requireValue(evidenceStates.includes(entry.contracts?.status) && Array.isArray(entry.contracts.ids) && entry.contracts.ids.every(nonempty),'Invalid contracts');
      requireValue(evidenceStates.includes(entry.evidence?.status) && Array.isArray(entry.evidence.refs) && entry.evidence.refs.every(nonempty),'Invalid evidence');
      if(entry.evidence.status === 'passed') requireValue(entry.contracts.ids.length > 0 && entry.evidence.refs.length > 0,'Passed evidence requires contracts and references');
      if(entry.evidence.status === 'not_run') requireValue(entry.evidence.refs.length === 0,'Not-run evidence must have no references');
    }
    const expected = summarize(inventory.entries);
    for(const key of ['counts','dispositionSummary','openWork']) requireValue(isDeepStrictEqual(inventory[key],expected[key]),`${key} mismatch`);
    return inventory;
  } catch(error) { throw new Error(`INVENTORY_${error.message}`); }
}
