import { hash, transact } from '../runtime/protocol.ts';
import { git } from '../artifacts/fingerprint.ts';
import type { TaskBrief, TaskReport, Fingerprint } from './types.ts';
export function matchPath(path: string, glob: string): boolean {
  if (glob === '**' || glob === '**/*') return true;
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
}
export class BriefValidationError extends Error {
  readonly code = 'BRIEF_INCOMPLETE';
  constructor(detail: string) { super(`BRIEF_INCOMPLETE: ${detail}`); this.name = 'BriefValidationError'; }
}
export function validateBrief(brief: TaskBrief): void {
  try { checkBrief(brief); }
  catch(error) { if(error instanceof BriefValidationError) throw error; throw new BriefValidationError(String(error)); }
}
function checkBrief(brief: TaskBrief): void {
  const errors: string[] = [];
  if (!brief || !['minimal','strict'].includes(brief.contractLevel)) throw new BriefValidationError('contractLevel');
  if (!brief.id || !/^[a-zA-Z0-9._-]+$/.test(brief.id) || ['__proto__','constructor','prototype'].includes(brief.id) || !Number.isInteger(brief.revision) || brief.revision < 1) errors.push('id/revision');
  if (typeof brief.goal !== 'string' || !brief.goal.trim()) errors.push('goal');
  if (typeof brief.scope?.repoId !== 'string' || !brief.scope.repoId || !Array.isArray(brief.scope.include) || !brief.scope.include.length || !brief.scope.include.every(p=>typeof p==='string') || !Array.isArray(brief.scope.exclude) || !brief.scope.exclude.every(p=>typeof p==='string')) errors.push('scope');
  if (!Array.isArray(brief.contextRefs)) errors.push('contextRefs');
  if (!Array.isArray(brief.forbidden)) errors.push('forbidden');
  if (!Array.isArray(brief.standingOrders)) errors.push('standingOrders');
  if (brief.reportFormat !== 'task-report-v1') errors.push('reportFormat');
  if (brief.contractLevel === 'strict' && (!Number.isFinite(brief.timeboxSeconds) || brief.timeboxSeconds! <= 0)) errors.push('timeboxSeconds');
  if (!Array.isArray(brief.verification)) errors.push('verification');
  else {
    const ids = new Set<string>();
    for (const gate of brief.verification) {
      if (!gate.id || ids.has(gate.id)) errors.push('verification.id'); ids.add(gate.id);
      if (!['command','file','diff','test-report','human-approval','llm-review'].includes(gate.kind)) errors.push(`verification.${gate.id}.kind`);
      if (gate.command && (!gate.command.length || gate.command.some(x=>typeof x !== 'string' || x.includes('\0')))) errors.push(`verification.${gate.id}.command`);
      if (gate.coverage?.some(p=>p.startsWith('/') || p.split('/').includes('..'))) errors.push(`verification.${gate.id}.coverage`);
      if (gate.timeoutSeconds !== undefined && (!Number.isFinite(gate.timeoutSeconds) || gate.timeoutSeconds <= 0)) errors.push(`verification.${gate.id}.timeout`);
    }
    if (brief.acceptance !== undefined && !Array.isArray(brief.acceptance)) errors.push('acceptance');
    else {
      if (brief.contractLevel === 'strict' && (!brief.acceptance?.length || !brief.acceptance.some(x=>x?.required))) errors.push('acceptance');
      const acceptanceIds = new Set<string>();
      for (const ac of brief.acceptance ?? []) {
        if (!ac || typeof ac.id !== 'string' || !ac.id || acceptanceIds.has(ac.id) || typeof ac.description !== 'string' || !ac.description || typeof ac.required !== 'boolean' || !Array.isArray(ac.gateIds) || !ac.gateIds.length || ac.gateIds.some(id=>!ids.has(id))) { errors.push('acceptance'); continue; }
        acceptanceIds.add(ac.id);
        if (ac.required && ac.gateIds.some(id=>brief.verification.find(g=>g.id===id)?.required===false)) errors.push(`acceptance.${ac.id}.optionalGate`);
        if (ac.required && ac.gateIds.every(id=>brief.verification.find(g=>g.id===id)?.kind==='llm-review')) errors.push(`acceptance.${ac.id}.machineGate`);
      }
    }
  }
  for (const p of [...(brief.scope?.include ?? []), ...(brief.scope?.exclude ?? [])]) if (p.startsWith('/') || p.split('/').includes('..') || p.includes('\\')) errors.push('scope.relativeGlob');
  if (errors.length) throw new BriefValidationError([...new Set(errors)].join(', '));
}
export function saveBrief(brief: TaskBrief, actor: string, reason: string): TaskBrief {
  validateBrief(brief); if (!reason.trim()) throw new Error('Brief revision requires reason');
  return transact('brief-revised', brief.id, actor, s=>{
    const versions = s.briefs[brief.id] ?? [];
    const last = versions.at(-1);
    if (last && hash(last) === hash(brief)) return last;
    if (brief.revision !== (last?.revision ?? 0) + 1) throw new Error('BRIEF_REVISION_CONFLICT');
    versions.push(structuredClone(brief)); s.briefs[brief.id] = versions; return brief;
  });
}
export function changedPaths(before: Fingerprint, after: Fingerprint, cwd: string): string[] {
  const working = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].filter(p=>before.files[p] !== after.files[p]);
  const staged = git(cwd,['diff','--no-renames','--name-only','-z',before.indexTree,after.indexTree]).split('\0').filter(Boolean);
  return [...new Set([...working, ...staged])].sort();
}
export function scopeViolations(brief: TaskBrief, paths: string[]): string[] {
  return paths.filter(p=>!brief.scope.include.some(g=>matchPath(p,g)) || brief.scope.exclude.some(g=>matchPath(p,g)));
}
export function validateReport(value: unknown): TaskReport {
  const r = value as TaskReport;
  if (!r || !['completed','failed','blocked'].includes(r.status) || !r.base || !r.head || !['artifactRefs','commandsRun','evidenceRefs','deviations','unresolved','nextActions'].every(k=>Array.isArray((r as any)[k]))) throw new Error('TASK_REPORT_INCOMPLETE');
  if (![...r.unresolved, ...r.deviations].every(note => typeof note === 'string' || (note && typeof note === 'object' && ['blocking','advisory'].includes(note.severity) && typeof note.description === 'string' && Boolean(note.description.trim())))) throw new Error('TASK_REPORT_INCOMPLETE');
  return r;
}
/** Legacy strings and malformed notes remain blocking; only explicit advisory notes pass. */
export function hasBlockingReportNotes(report: TaskReport): boolean {
  return !Array.isArray(report.unresolved) || !Array.isArray(report.deviations) || [...report.unresolved, ...report.deviations].some(note => typeof note !== 'object' || note === null || note.severity !== 'advisory' || typeof note.description !== 'string' || !note.description.trim());
}
export function parseReport(text: string): TaskReport {
  const block = text.match(/```(?:task-report|json)\s*\n([\s\S]*?)```/);
  return validateReport(JSON.parse(block ? block[1] : text));
}
export function briefPrompt(brief: TaskBrief): string {
  const extra = {
    evaluation: 'Include evaluation: [{"criterion": "...", "score": 0, "evidence": ["..."], "weaknesses": [], "selectedParts": []}] for every required criterion; scores must be 0 to 10 and evidence must be nonempty.',
    'cross-evaluation': 'Include crossEvaluation: [{"candidate":"candidate-1", "criterion":"...", "score":0, "evidence":["file:line"], "weaknesses":[], "selectedParts":[]}] for every candidate and every required criterion, with scores 0 to 10 and nonempty evidence. Include selection: {"candidates":["candidate-1"], "selectedParts":[]} selecting exactly one base.',
    selection: 'Include selection: {"candidates": ["..."], "selectedParts": []}, naming candidates from the brief.',
    review: 'Include findings: [{"severity": "low", "location": "...", "description": "...", "evidence": "..."}]; severity is critical, high, medium, or low. Use [] when there are no findings.',
    coverage: 'Include coverage: {"completed": ["..."], "unresolved": []}, listing completed required slices.',
  };
  return `\n\nAuthoritative Task Brief (${brief.id} revision ${brief.revision}, orders ${hash(brief.standingOrders)}):\n${JSON.stringify(brief, null, 2)}\nReturn one fenced JSON task report with all fields: {"status":"completed", "artifactRefs":[], "base":"<starting full git commit SHA>", "head":"<current full git commit SHA>", "commandsRun":[], "evidenceRefs":[], "deviations":[], "unresolved":[], "nextActions":[]}. status must be exactly one of completed, failed, or blocked (not a synonym). All six array fields are required, even when empty; commandsRun entries are arrays of command arguments. Use full commit SHAs from git rev-parse (40 hex characters for SHA-1 or 64 for SHA-256), not abbreviations or invented values. For each unresolved item or deviation, use {"severity":"advisory","description":"..."} or {"severity":"blocking","description":"..."}; use blocking when it affects acceptance or its impact is uncertain, and advisory only for non-blocking information supported by evidence. Legacy plain strings are blocking. ${brief.reportRequirements ? extra[brief.reportRequirements.kind] : ''} Do not claim verification from narrative alone.`;
}

export function validateBudget(budget?: import('./types.ts').Budget): void {
  if (!budget) return;
  for (const [key,value] of Object.entries(budget)) if (!['maxTokens','maxCost','maxTimeSeconds'].includes(key) || !Number.isFinite(value) || value<=0) throw new Error(`INVALID_BUDGET: ${key}`);
}

export function reportSatisfies(brief: TaskBrief, report: TaskReport): boolean {
  const req=brief.reportRequirements;if(!req)return true;
  if(req.kind==='evaluation')return Boolean(report.evaluation && req.criteria?.every(c=>report.evaluation!.some(e=>e.criterion===c && Number.isFinite(e.score) && e.score>=0 && e.score<=10 && e.evidence?.length && Array.isArray(e.weaknesses) && Array.isArray(e.selectedParts))));
  if(req.kind==='cross-evaluation') {
    if (!req.candidates?.length || !req.criteria?.length || !Array.isArray(report.crossEvaluation) ||
        !Array.isArray(report.selection?.candidates) || report.selection.candidates.length !== 1 ||
        !req.candidates.includes(report.selection.candidates[0]!) || !Array.isArray(report.selection.selectedParts)) return false;
    const pairs = new Set<string>();
    for (const entry of report.crossEvaluation) {
      if (!entry || !req.candidates.includes(entry.candidate) || !req.criteria.includes(entry.criterion) ||
          !Number.isFinite(entry.score) || entry.score < 0 || entry.score > 10 ||
          !Array.isArray(entry.evidence) || !entry.evidence.some(value => typeof value === 'string' && value.trim()) ||
          !Array.isArray(entry.weaknesses) || !Array.isArray(entry.selectedParts)) return false;
      const pair = JSON.stringify([entry.candidate, entry.criterion]);
      if (pairs.has(pair)) return false;
      pairs.add(pair);
    }
    return req.candidates.every(candidate => req.criteria!.every(criterion => pairs.has(JSON.stringify([candidate, criterion]))));
  }
  if(req.kind==='selection')return Boolean(report.selection?.candidates.length && report.selection.candidates.every(c=>req.candidates?.includes(c)) && Array.isArray(report.selection.selectedParts));
  if(req.kind==='review')return Array.isArray(report.findings) && report.findings.every(f=>['critical','high','medium','low'].includes(f.severity) && Boolean(f.location && f.description && f.evidence));
  if(req.kind==='coverage')return Boolean(report.coverage && !report.coverage.unresolved.length && req.slices?.every(c=>report.coverage!.completed.includes(c)));
  return false;
}
