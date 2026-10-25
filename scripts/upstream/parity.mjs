import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJSON, safePath, shaPattern, validateReport } from './core.mjs';
export function checkParity(root) {
  const parity = readJSON(join(root,'PARITY.json')), upstream = readJSON(join(root,'UPSTREAM.json'));
  if(parity.upstream !== upstream.version || parity.upstreamCommit !== upstream.commit || !shaPattern.test(upstream.commit)) throw new Error('Upstream metadata mismatch');
  const skills = Object.keys(parity.skills ?? {}).sort(), playbooks = Object.keys(parity.playbooks ?? {}).sort();
  const pendingTarget = {skills: [], playbooks: []};
  const evidence = readJSON(join(root,safePath(parity.coverage?.countEvidence)));
  let baselineSkills = [], baselinePlaybooks = [];
  if(evidence.schemaVersion === 1) {
    validateReport(evidence);
    if(evidence.candidate.sha !== upstream.commit || evidence.candidate.version !== upstream.version) throw new Error('Count evidence baseline mismatch');
    baselineSkills = evidence.candidate.names.skills; baselinePlaybooks = evidence.candidate.names.playbooks;
  } else {
    // Retained historical evidence is explicitly tied to the pinned provenance.
    const provenance = readJSON(join(root,safePath(upstream.verification)));
    if(evidence.expected?.commit !== upstream.commit || evidence.discovered?.version !== upstream.version || provenance.commit !== upstream.commit || provenance.version !== upstream.version || provenance.treeTruncated !== false || !provenance.manifestBlob || provenance.verifiedPstackBlobs !== evidence.discovered.fileCount) throw new Error('Historical evidence mismatch');
    if(Object.values(evidence.names ?? {}).some(v => !Array.isArray(v) || v.length)) throw new Error('Historical evidence contains name drift');
  }
  const skillCount = evidence.schemaVersion === 1 ? evidence.candidate.names.skills.length : evidence.discovered.skillCount;
  const playbookCount = evidence.schemaVersion === 1 ? evidence.candidate.names.playbooks.length : evidence.discovered.playbookCount;
  if(playbooks.length !== playbookCount || skills.length < skillCount || parity.coverage.topLevelSkills !== skillCount || parity.coverage.potetoPlaybooks !== playbookCount) throw new Error('Coverage counts mismatch');
  const target = readJSON(join(root, safePath(parity.coverage.targetInventory)));
  if(!shaPattern.test(target.commit ?? '') || target.treeTruncated !== false || !Array.isArray(target.blobs)) throw new Error('Invalid target inventory');
  const targetSkills = target.blobs.filter(blob => /^skills\/[^/]+\/SKILL\.md$/.test(blob.path)).map(blob => blob.path.split('/')[1]).sort();
  const targetPlaybooks = target.blobs.filter(blob => /^skills\/poteto-mode\/playbooks\/[^/]+\.md$/.test(blob.path)).map(blob => blob.path.split('/').at(-1).slice(0, -3)).sort();
  if(parity.coverage.targetSkills !== targetSkills.length || parity.coverage.targetPlaybooks !== targetPlaybooks.length) throw new Error('Target counts mismatch');
  if(!baselineSkills.every(name => skills.includes(name)) || !baselinePlaybooks.every(name => playbooks.includes(name))) throw new Error('Coverage names mismatch');
  for(const name of [...skills, ...playbooks]) if(!targetSkills.includes(name) && !targetPlaybooks.includes(name)) throw new Error(`Registry name outside the pinned target: ${name}`);
  const pendingSkills = targetSkills.filter(name => !skills.includes(name)), pendingPlaybooks = targetPlaybooks.filter(name => !playbooks.includes(name));
  if(JSON.stringify(parity.coverage.pendingTargetSkills ?? []) !== JSON.stringify(pendingSkills) || JSON.stringify(parity.coverage.pendingTargetPlaybooks ?? []) !== JSON.stringify(pendingPlaybooks)) throw new Error('Pending target set mismatch');
  for(const name of [...pendingSkills, ...pendingPlaybooks]) if(!parity.coverage.pendingTargetReasons?.[name]) throw new Error(`Pending target needs a reason: ${name}`);
  for(const name of skills) if(!existsSync(join(root,`skills/${safePath(name)}/SKILL.md`))) throw new Error('Missing skill');
  for(const name of playbooks) if(!existsSync(join(root,`skills/poteto-mode/playbooks/${safePath(name)}.md`))) throw new Error('Missing playbook');
  for(const [name,status] of [...Object.entries(parity.skills),...Object.entries(parity.playbooks)]) {
    if(!['ADAPTED','CURSOR_ONLY','PENDING_PORT'].includes(status)) throw new Error(`Invalid parity status: ${name}`);
    if(status === 'PENDING_PORT') throw new Error(`Pending port: ${name}`);
    if(status === 'CURSOR_ONLY' && !parity.cursorOnly.includes(name)) throw new Error('Cursor-only item must be explicit');
  }
  if(parity.pending?.length || parity.skills['make-bot-ui'] !== 'CURSOR_ONLY' || !parity.cursorOnly.includes('make-bot-ui')) throw new Error('Pending/unsupported scope mismatch');
  if(parity.coverage.fileLevelAudit !== 'not-claimed' || parity.coverage.behavioralAudit !== 'not-claimed' || !parity.coverage.auxiliaryFiles) throw new Error('Parity claim must avoid unsupported equivalence');
  if(!existsSync(join(root,'skills/pstack-runtime/SKILL.md'))) throw new Error('Missing Pi-only runtime');
  return {skills:skills.length,playbooks:playbooks.length,pendingTarget:{skills:pendingSkills,playbooks:pendingPlaybooks}};
}
