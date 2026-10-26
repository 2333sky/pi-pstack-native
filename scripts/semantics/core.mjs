import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_RESOURCES, CAPABILITIES } from '../../src/compatibility/adapter.ts';
import { generateCore, generatedResources } from './generate.mjs';
export const REVIEWED_FILES = ["src/compatibility/adapter.ts", "src/compatibility/source.ts", "src/compatibility/tool.ts", "src/agent/resources.ts", "src/extension.ts", "src/agent/profiles.ts", "src/agent/host.ts", "src/models/router.ts", "src/templates/build.ts", "src/workflow/engine.ts", "src/workflow/artifacts.ts", "src/verification/runner.ts", "src/delivery/frontier.ts", "docs/PI-SEMANTIC-ADAPTER.md", "scripts/upstream/cli.mjs", "scripts/check-semantics.mjs", "scripts/semantics/core.mjs", "scripts/semantics/generate.mjs", "test/semantic-compatibility.test.ts", "test/fixtures/semantics/scenarios.json", "scripts/semantics/real-pi-smoke.mjs", "test/e2e/workflow.test.ts", "test/e2e/shipping.test.ts", "test/protocol.test.ts", "test/verification.test.ts", "test/latest-upstream.test.ts", "test/statechart.test.ts"];
export const digest = value => createHash('sha256').update(value).digest('hex');
export const blob = bytes => createHash('sha1').update(`blob ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
export function units(body) {
  const lines=body.split('\n'), starts=[];
  lines.forEach((line,i)=>{if(/^#{1,6} |^\d+\. /.test(line))starts.push(i);});
  if(starts[0]!==0)starts.unshift(0);
  return starts.map((start,i)=>({id:`L${start+1}`,start:start+1,end:starts[i+1]??lines.length,label:lines[start],hash:digest(lines.slice(start,starts[i+1]??lines.length).join('\n'))}));
}
export function checkSemantics(root, document=JSON.parse(readFileSync(join(root,'SEMANTICS.json'),'utf8'))) {
  const read=path=>{
    if(typeof path!=='string' || path.startsWith('/') || path.split('/').some(p=>!p || p==='.' || p==='..'))throw new Error('SEMANTIC_PATH_INVALID');
    let file=root;for(const part of path.split('/')){file=join(file,part);if(lstatSync(file).isSymbolicLink())throw new Error('SEMANTIC_SYMLINK_REFUSED');}
    return readFileSync(file);
  };
  const upstream=JSON.parse(read('UPSTREAM.json'));
  if(document.schemaVersion!==1 || document.snapshot.commit!==upstream.commit || document.snapshot.version!==upstream.version)throw new Error('SEMANTIC_BASELINE_MISMATCH');
  if(document.baselineAdvancement!=='requires-explicit-semantic-signoff' || !['pending-maintainer-signoff','signed-off'].includes(document.review.status))throw new Error('SEMANTIC_SIGNOFF_REQUIRED');
  if(document.review.status==='signed-off' && (!document.review.reviewer || !document.review.rationale || !document.review.at))throw new Error('SEMANTIC_SIGNOFF_REQUIRED');
  const names=document.workflows.map(w=>w.resource).sort();
  if(JSON.stringify(names)!==JSON.stringify([...CORE_RESOURCES].sort()))throw new Error('SEMANTIC_CORE_COVERAGE_MISMATCH');
  if(JSON.stringify(Object.keys(document.reviewedFiles).sort())!==JSON.stringify([...REVIEWED_FILES].sort()))throw new Error('SEMANTIC_REVIEW_SCOPE_MISMATCH');
  const files=new Map();
  for(const file of document.snapshot.files) {
    if(files.has(file.path))throw new Error('SEMANTIC_DUPLICATE_SOURCE');
    const bytes=read(`${document.snapshot.root}/${file.path}`);
    if(blob(bytes)!==file.sha || bytes.length!==file.size)throw new Error(`SEMANTIC_SOURCE_DRIFT: ${file.path}`);
    files.set(file.path,bytes.toString('utf8'));
  }
  if(!files.has('pstack/LICENSE'))throw new Error('SEMANTIC_LICENSE_MISSING');
  for(const [path,hash] of Object.entries(document.reviewedFiles))if(digest(read(path))!==hash)throw new Error(`SEMANTIC_REVIEW_REQUIRED: ${path}`);
  if(JSON.stringify(document.capabilities)!==JSON.stringify(CAPABILITIES))throw new Error('SEMANTIC_CAPABILITY_DRIFT');
  if(!Array.isArray(document.overrides) || JSON.stringify(document.overrides.map(o=>o.name).sort())!==JSON.stringify(Object.keys(CAPABILITIES).sort()))throw new Error('SEMANTIC_OVERRIDE_COVERAGE');
  for(const override of document.overrides) {
    const capability=CAPABILITIES[override.name];
    if(override.status!==capability.status || override.mapping!==capability.mapping || override.rationale!==capability.reason || !override.scope || !override.tests?.length)throw new Error('SEMANTIC_OVERRIDE_INVALID');
    const source=files.get(override.upstream?.path),span=override.upstream;
    if(!source || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start<1 || span.end<span.start)throw new Error('SEMANTIC_OVERRIDE_SOURCE');
    const slice=source.split('\n').slice(span.start-1,span.end).join('\n');
    if(!slice.includes(span.quote) || digest(slice)!==span.hash)throw new Error('SEMANTIC_OVERRIDE_SOURCE');
    for(const test of override.tests)if(!document.reviewedFiles[test.file] || !read(test.file).toString().includes(test.name))throw new Error('SEMANTIC_OVERRIDE_TEST');
  }

  const ids=new Set();
  const statuses=['equivalent','adapted-with-deviation','unsupported','not-yet-verified'];
  for(const workflow of document.workflows) {
    const source=`pstack/skills/${workflow.resource}`, body=files.get(source);
    if(!body || workflow.coverage!=='critical-rules-only' || workflow.fullBehavioralParity!=='not-claimed')throw new Error('SEMANTIC_SCOPE_INVALID');
    if(JSON.stringify(workflow.units)!==JSON.stringify(units(body)))throw new Error(`SEMANTIC_STEP_DRIFT: ${source}`);
    if(!workflow.rules.length)throw new Error('SEMANTIC_RULES_MISSING');
    for(const rule of workflow.rules) {
      if(ids.has(rule.id) || !rule.id || !statuses.includes(rule.status) || !rule.mapping || !rule.rationale || !rule.scope || !rule.tests?.length)throw new Error('SEMANTIC_RULE_INVALID');
      ids.add(rule.id);
      const slice=body.split('\n').slice(rule.upstream.start-1,rule.upstream.end).join('\n');
      if(rule.upstream.path!==source || rule.upstream.start<1 || rule.upstream.end<rule.upstream.start || !slice.includes(rule.upstream.quote) || digest(slice)!==rule.upstream.hash)throw new Error(`SEMANTIC_RULE_SOURCE_DRIFT: ${rule.id}`);
      for(const ref of rule.tests){
        if(!document.reviewedFiles[ref.file] || !read(ref.file).toString().includes(ref.name))throw new Error(`SEMANTIC_TEST_UNBOUND: ${rule.id}`);
      }
    }
  }
  for(const cap of Object.values(document.capabilities))if(!cap.reason || !cap.mapping || !statuses.includes(cap.status))throw new Error('SEMANTIC_OVERRIDE_INVALID');
  if(JSON.stringify(document.generatedResources)!==JSON.stringify(generatedResources(root)))throw new Error('SEMANTIC_GENERATED_SCOPE_DRIFT');
  generateCore(root);
  return {generatedEntrypoints:document.generatedResources.length,workflows:names.length,rules:ids.size,sourceFiles:files.size,fullBehavioralParity:'not-claimed',realModel:document.evidence.realModel};
}
/** Candidate contents are read from Git objects, never from a possibly dirty working tree. */
export function drift(root, repository, commit) {
  if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('FULL_CANDIDATE_COMMIT_REQUIRED');
  const document=JSON.parse(readFileSync(join(root,'SEMANTICS.json'),'utf8'));
  checkSemantics(root,document);
  const git=args=>execFileSync('git',['-C',repository,...args],{encoding:'utf8',maxBuffer:16*1024*1024});
  if(git(['rev-parse',`${commit}^{commit}`]).trim()!==commit)throw new Error('CANDIDATE_COMMIT_MISMATCH');
  const paths=git(['ls-tree','-r','--name-only',commit,'--','pstack/skills']).trim().split('\n');
  const relevant=p=>p.startsWith('pstack/skills/statechart/scripts/') || document.overrides.some(o=>o.upstream.path===p) || document.workflows.some(w=>p===`pstack/skills/${w.resource}`) || /^pstack\/skills\/(architect|interrogate|poteto-mode)\/references\/.*\.md$/.test(p);
  const all=new Set([...document.snapshot.files.map(f=>f.path),...paths.filter(p=>p.endsWith('.md') || p.startsWith('pstack/skills/statechart/scripts/'))]);
  const changes=[];
  for(const path of [...all].sort()) {
    if(!path.startsWith('pstack/skills/'))continue;
    const entry=document.snapshot.files.find(f=>f.path===path);
    const after=paths.includes(path)?git(['show',`${commit}:${path}`]):null;
    if(entry?.sha=== (after===null?null:blob(after)))continue;
    if(!entry && after===null)continue;
    const before=entry?readFileSync(join(root,document.snapshot.root,path),'utf8'):null;
    const beforeBlob=entry?.sha??null,afterBlob=after===null?null:blob(after);
    const review=document.driftReviews.find(r=>r.commit===commit && r.path===path && r.before===beforeBlob && r.after===afterBlob && r.status==='signed-off' && r.reviewer && r.rationale && r.tests?.length && r.tests.every(t=>document.reviewedFiles[t]));
    changes.push({path,relevant:relevant(path),reviewed:Boolean(review),before:beforeBlob,after:afterBlob,beforeSteps:before===null?[]:units(before),afterSteps:after===null?[]:units(after),diff:after===before?'':{before,after}});
  }
  return {candidate:commit,baseline:document.snapshot.commit,status:changes.some(c=>c.relevant&&!c.reviewed)?'needs-review':'reviewed-or-irrelevant',changes};
}
