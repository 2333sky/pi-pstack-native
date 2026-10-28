import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, join, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { digest, readJSON, safePath } from './core.mjs';

const snapshotPath = 'docs/upstream-target-0.15.36.json';
const dispositionsPath = 'docs/upstream-dispositions-0.15.36.json';
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
function disposition(source,parity,localRoot,reviewed = {}) {
  if(Object.hasOwn(reviewed,source.path)) return {...reviewed[source.path]};
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
  const vendored = `vendor/upstream/${parity.upstream}/pstack/${source.path}`;
  const matches = path => {
    if(!existsSync(join(localRoot,path)))return false;
    const bytes=readFileSync(join(localRoot,path));
    return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')===source.blob;
  };
  if(matches(vendored))return matches(source.path)
    ? {kind:'local',path:source.path,reason:'pinned-auxiliary-source'}
    : {kind:'source-only',path:vendored,reason:'pinned-upstream-source'};
  return {kind:'pending',reason:'file-disposition-not-reviewed'};
}

function parseReviewedJSON(text) {
  const value = JSON.parse(text), scopes = [];
  let previous;
  for(const [token] of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g)) {
    if(token === '{') scopes.push(new Set());
    else if(token === '[') scopes.push(null);
    else if(token === '}' || token === ']') scopes.pop();
    else if(token.startsWith('"') && scopes.at(-1) && ['{',','].includes(previous)) {
      const key = JSON.parse(token), keys = scopes.at(-1);
      requireValue(!keys.has(key),`Duplicate override key: ${key}`);
      keys.add(key);
    }
    previous = token;
  }
  return value;
}
function readDispositions({snapshot,parity,localRoot}) {
  const reviewed = parseReviewedJSON(readFileSync(join(localRoot,dispositionsPath),'utf8'));
  const fields = (value,keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key=>Object.hasOwn(value,key));
  requireValue(fields(reviewed,['schemaVersion','target','reviewedAt','byPath']) && reviewed.schemaVersion === 1,'Invalid override schema');
  requireValue(fields(reviewed.target,['commit','snapshotDigest']) && reviewed.target.commit === snapshot.commit && reviewed.target.snapshotDigest === snapshot.blobDigest,'Override target mismatch');
  requireValue(typeof reviewed.reviewedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(reviewed.reviewedAt),'Invalid override review date');
  requireValue(reviewed.byPath !== null && typeof reviewed.byPath === 'object' && !Array.isArray(reviewed.byPath),'Invalid override byPath');
  const sources = new Map(snapshot.blobs.map(blob=>[blob.path,{...blob,category:classify(blob.path)}]));
  for(const [path,port] of Object.entries(reviewed.byPath)) {
    safePath(path);
    requireValue(sources.has(path),`Unknown override snapshot path: ${path}`);
    requireValue(['local','source-only','unsupported'].includes(port?.kind),`Unknown override kind: ${path}`);
    requireValue(fields(port,port.kind === 'local' ? ['kind','reason','path']:['kind','reason']),`Invalid override fields: ${path}`);
    requireValue(nonempty(port.reason),`Override requires a reason: ${path}`);
    const source = sources.get(path);
    if(port.kind === 'local') confinedFile(localRoot,port.path);
    if(['skill','playbook'].includes(source.category)) {
      const registry = registryOf(source,parity), name = nameOf(source);
      if(port.kind === 'local') requireValue(Object.hasOwn(registry ?? {},name) && registry[name] === 'ADAPTED','Local skill or playbook is not registry-adapted');
      if(registry?.[name] === 'ADAPTED') requireValue(port.kind === 'local','Override cannot downgrade registry-adapted skill or playbook');
    }
  }
  for(const source of sources.values()) {
    if(['skill','playbook','agent','manifest'].includes(source.category)) continue;
    requireValue(Object.hasOwn(reviewed.byPath,source.path),`Missing reviewed disposition: ${source.path}`);
  }
  return reviewed.byPath;
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
  try {
    validateSnapshot(snapshot);
    const reviewed = readDispositions({snapshot,parity,localRoot});
    const text = skillText(localRoot);
    const entries = snapshot.blobs.map(blob=>{
      const source = {path:blob.path,blob:blob.blob,mode:blob.mode,size:blob.size,category:classify(blob.path)};
      const entry = {source,port:disposition(source,parity,localRoot,reviewed),requirements:{status:'not_recorded'},contracts:{status:'not_run',ids:[]},evidence:{status:'not_run',refs:[]}};
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
  } catch(error) { throw new Error(`INVENTORY_${error.message}`); }
}
export function validateInventory(inventory, { snapshot, parity, localRoot }) {
  try {
    validateSnapshot(snapshot);
    const reviewed = readDispositions({snapshot,parity,localRoot});
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
      if(Object.hasOwn(reviewed,source.path)) requireValue(isDeepStrictEqual(entry.port,reviewed[source.path]),'Reviewed disposition mismatch');
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
