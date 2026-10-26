/** Platform mappings and receipt checks. These never grant merge authority or replace native ledgers. */
export const CORE_SKILLS = ['poteto-mode', 'architect', 'arena', 'swarm', 'interrogate'] as const;
export const CORE_PLAYBOOKS = ['bug-fix', 'feature', 'autopilot-full', 'autopilot-stack', 'babysit', 'shipping'] as const;
export const CORE_RESOURCES = [
  ...CORE_SKILLS.map(name => `${name}/SKILL.md`),
  ...CORE_PLAYBOOKS.map(name => `poteto-mode/playbooks/${name}.md`),
];
export type CompatibilityStatus = 'equivalent' | 'adapted-with-deviation' | 'unsupported' | 'not-yet-verified';
export const CAPABILITIES: Record<string, {status: CompatibilityStatus; mapping: string; reason: string}> = {
  'skill-frontmatter': {status:'adapted-with-deviation', mapping:'Pi kebab-case resource name; upstream body unchanged', reason:'Pi rejects the upstream Poteto Mode display name as a Skill identifier.'},
  'verifier-command-execution': {status:'adapted-with-deviation', mapping:'native verification runner plus separate read-only reviewer', reason:'Reviewers cannot execute shell; commands run in an authorized writable lane or deterministic runner.'},
  'arena-cross-judge': {status:'adapted-with-deviation', mapping:'explicit DAG for upstream single cross-judge; native template has per-candidate judges', reason:'Template choreography differs; the generated upstream phases remain the coordinator contract.'},
  'swarm-mixed-first-pass-template': {status:'unsupported', mapping:'Use an explicit DAG and selection policy instead', reason:'Native specialized templates support partition/best-of, not automatic mixed/first-pass/rank-all.'},
  'autopilot-template': {status:'adapted-with-deviation', mapping:'local preparation DAG plus coordinator owner lifecycle', reason:'Templates alone do not publish, babysit, countersign, propagate stop orders or deliver a remote PR stack.'},
  Task: {status:'equivalent', mapping:'pstack_agents; pstack_workflow', reason:'Independent Pi AgentSessions with durable DAG dispatch.'},
  'cloud-agent': {status:'adapted-with-deviation', mapping:'Pi child with isolated worktree', reason:'Local process, not a Cursor cloud VM or OS security boundary.'},
  models: {status:'adapted-with-deviation', mapping:'models.json explicit provider/model panel', reason:'Unavailable models fail explicitly; no silent family/default substitution.'},
  loop: {status:'adapted-with-deviation', mapping:'/pstack-loop', reason:'Active Pi session only; no persistent cloud scheduler. A missed occurrence may be lost after a crash.'},
  'patch-id-reuse': {status:'adapted-with-deviation', mapping:'exact head AND base re-verification', reason:'Native ledgers invalidate on any head/base change, including a patch-preserving rebase.'},
  'Cursor-private-PR-provenance': {status:'unsupported', mapping:'none', reason:'GitHub CLI/API receipts cannot establish Cursor private-tool provenance.'},
  'Cursor-watch-READY': {status:'unsupported', mapping:'none', reason:'Native waiting/reviewable states do not prove Cursor queue verdicts.'},
  'Cursor-cleanup-plugin': {status:'unsupported', mapping:'none', reason:'No Cursor simulator/transcript cleanup integration.'},
  'Bugbot-pass-dismissal': {status:'unsupported', mapping:'none', reason:'No upstream pass-based Bugbot dismissal protocol.'},
};
export function requireCapability(name: string) {
  const capability = Object.hasOwn(CAPABILITIES, name) ? CAPABILITIES[name] : undefined;
  if (!capability) throw new Error(`UNMAPPED_CAPABILITY: ${name}`);
  if (capability.status === 'unsupported') throw new Error(`UNSUPPORTED_CAPABILITY: ${name}: ${capability.reason}`);
  return capability;
}
export function selectPlaybook(intent: string): string {
  const routes: Record<string,string> = {defect:'bug-fix', 'new-behavior':'feature', 'pr-queue':'autopilot-full', stack:'autopilot-stack', status:'babysit', land:'shipping'};
  if (!Object.hasOwn(routes, intent)) throw new Error(`UNMAPPED_INTENT: ${intent}`);
  return routes[intent];
}
export interface ReviewReceipt {
  lane: string; actor: string; head: string; base: string;
  status: 'passed' | 'failed' | 'blocked' | 'inconclusive'; evidence: string[];
}
export interface Round {
  workflow: string; head: string; base: string; writer: string;
  receipts: ReviewReceipt[]; requiredLanes: string[];
  checksPassed: boolean; unresolvedFindings: number;
  authorization: boolean; operatorReserved?: boolean; interrupted?: boolean; remoteReconciled?: boolean;
  requestedAction: 'verdict' | 'merge'; skippedSteps?: {step: string; reason: string}[];
}
/** A clean full-autopilot verdict requires all lanes, including live proof and trunk regression. */
export function evaluateRound(round: Round): {clean: boolean; blockers: string[]} {
  if (!CORE_PLAYBOOKS.includes(round?.workflow as any)) throw new Error('UNMAPPED_WORKFLOW');
  if (!/^[a-f0-9]{40}$/.test(round.head) || !/^[a-f0-9]{40}$/.test(round.base) || !round.writer || !Array.isArray(round.receipts) || !Array.isArray(round.requiredLanes) || !round.requiredLanes.length || typeof round.checksPassed!=='boolean' || !Number.isInteger(round.unresolvedFindings) || round.unresolvedFindings<0 || typeof round.authorization!=='boolean' || !['verdict','merge'].includes(round.requestedAction)) throw new Error('INVALID_ROUND');
  const lanes = new Set(round.requiredLanes);
  if (['autopilot-full','autopilot-stack'].includes(round.workflow)) for (const lane of ['gates','live','diff-1','diff-2','trunk-regression']) lanes.add(lane);
  if (['shipping','autopilot-stack','bug-fix','feature'].includes(round.workflow)) lanes.add('live');
  const blockers: string[] = [];
  for (const lane of lanes) {
    const receipts = round.receipts.filter(r => r.lane === lane);
    if (receipts.length !== 1) {blockers.push(`LANE_MISSING_OR_DUPLICATE:${lane}`); continue;}
    const r = receipts[0];
    if (!r.actor || r.actor === round.writer) blockers.push(`REVIEW_NOT_INDEPENDENT:${lane}`);
    if (r.head !== round.head || r.base !== round.base) blockers.push(`STALE_HEAD_OR_BASE:${lane}`);
    if (r.status !== 'passed' || !Array.isArray(r.evidence) || !r.evidence.some(e => typeof e==='string' && e.trim())) blockers.push(`LANE_NOT_PROVEN:${lane}`);
  }
  if (['autopilot-full','autopilot-stack'].includes(round.workflow)) {
    const a=round.receipts.find(r=>r.lane==='diff-1'), b=round.receipts.find(r=>r.lane==='diff-2');
    if (a && b && a.actor===b.actor) blockers.push('DIFF_REVIEWERS_NOT_DISTINCT');
  }
  if (!round.checksPassed) blockers.push('CHECKS_NOT_PASSED');
  if (round.unresolvedFindings !== 0) blockers.push('UNRESOLVED_FINDINGS');
  if ((round.skippedSteps ?? []).some(s=>!s.step?.trim() || !s.reason?.trim())) blockers.push('SILENT_SKIP');
  if (round.interrupted && round.remoteReconciled !== true) blockers.push('REMOTE_RECONCILIATION_REQUIRED');
  if (round.requestedAction==='merge') {
    if (!round.authorization || round.operatorReserved) blockers.push('MERGE_NOT_AUTHORIZED');
    if (['autopilot-stack','babysit'].includes(round.workflow)) blockers.push('WORKFLOW_STOPS_BEFORE_MERGE');
  }
  return {clean: blockers.length===0, blockers};
}
export function validatePanel(workflow: string, models: string[], judge?: string) {
  if (!['architect','arena','interrogate','swarm'].includes(workflow)) throw new Error('UNMAPPED_PANEL');
  if (!Array.isArray(models) || models.length < (workflow==='swarm'?1:2)) throw new Error('INDEPENDENT_PANEL_REQUIRED');
  for (const model of [...models, ...(judge ? [judge] : [])]) if (!/^[^/\s]+\/[^\s]+$/.test(model) || model==='inherit-parent' || model==='auto') throw new Error('EXPLICIT_MODEL_REQUIRED');
  if (workflow==='interrogate' && new Set(models).size<2) throw new Error('MODEL_DIVERSITY_REQUIRED');
  if (['architect','arena'].includes(workflow) && (!judge || models.includes(judge))) throw new Error('INDEPENDENT_JUDGE_REQUIRED');
  return {workflow, models:[...models], judge, dispatch:'pstack_workflow', writers:'isolated-worktrees', integration:'explicit-integrator', evidence:'not-run'};
}
