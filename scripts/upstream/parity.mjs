import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJSON, safePath, shaPattern, validateReport } from './core.mjs';
export function checkParity(root) {
  const parity = readJSON(join(root,'PARITY.json')), upstream = readJSON(join(root,'UPSTREAM.json'));
  if(parity.upstream !== upstream.version || parity.upstreamCommit !== upstream.commit || !shaPattern.test(upstream.commit)) throw new Error('Upstream metadata mismatch');
  const skills = Object.keys(parity.skills ?? {}).sort(), playbooks = Object.keys(parity.playbooks ?? {}).sort();
  const evidence = readJSON(join(root,safePath(parity.coverage?.countEvidence)));
  if(evidence.schemaVersion === 1) {
    validateReport(evidence);
    if(evidence.candidate.sha !== upstream.commit || evidence.candidate.version !== upstream.version) throw new Error('Count evidence baseline mismatch');
    if(JSON.stringify(skills) !== JSON.stringify(evidence.candidate.names.skills) || JSON.stringify(playbooks) !== JSON.stringify(evidence.candidate.names.playbooks)) throw new Error('Coverage names mismatch');
  } else {
    // Retained historical evidence is explicitly tied to the pinned provenance.
    const provenance = readJSON(join(root,safePath(upstream.verification)));
    if(evidence.expected?.commit !== upstream.commit || evidence.discovered?.version !== upstream.version || provenance.commit !== upstream.commit || provenance.version !== upstream.version || provenance.treeTruncated !== false || !provenance.manifestBlob || provenance.verifiedPstackBlobs !== evidence.discovered.fileCount) throw new Error('Historical evidence mismatch');
    if(Object.values(evidence.names ?? {}).some(v => !Array.isArray(v) || v.length)) throw new Error('Historical evidence contains name drift');
  }
  const skillCount = evidence.schemaVersion === 1 ? evidence.candidate.names.skills.length : evidence.discovered.skillCount;
  const playbookCount = evidence.schemaVersion === 1 ? evidence.candidate.names.playbooks.length : evidence.discovered.playbookCount;
  if(skills.length !== skillCount || playbooks.length !== playbookCount || parity.coverage.topLevelSkills !== skillCount || parity.coverage.potetoPlaybooks !== playbookCount) throw new Error('Coverage counts mismatch');
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
  return {skills:skills.length,playbooks:playbooks.length};
}
