import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { resolveRoleModel, resolvePanelSeats, selectJudgeFromPool, suggestedPanels, modelFamily } from '../models/router.ts';
import { loadModels } from '../runtime/config.ts';
import type { WorkflowNodeSpec } from '../runtime/types.ts';
import type { TaskBrief, Budget } from '../contracts/types.ts';
import { validateBrief } from '../contracts/brief.ts';
import { validateGraph } from '../workflow/graph.ts';
import { planArtifacts } from '../workflow/artifacts.ts';

export interface TemplateSpec {
  kind: 'arena' | 'architect' | 'interrogate' | 'swarm' | 'review' | 'autopilot-stack' | 'autopilot-full';
  brief: TaskBrief;
  models?: string[]; panel?: string; judgeModel?: string; rubric?: { criterion: string; weight: number }[];
  candidateCount?: number; swarmMode?: 'race' | 'partition'; slices?: { key: string; task: string; brief: TaskBrief }[];
  selectionPolicy?: 'best-of' | 'first-pass' | 'rank-all';
  judgeMode?: 'cross' | 'per-candidate';
  independencePolicy?: 'different-model' | 'different-family' | 'explicit-waiver' | 'independent-session';
  modelFamilies?: Record<string, string>; budget?: Budget;
}

function panelModels(name: string, ctx?: ExtensionContext, notes: string[] = []): string[] {
  const models = loadModels().panels?.[name];
  if ((!Array.isArray(models) || !models.length) && ctx) {
    const suggested = suggestedPanels(ctx)[name];
    if (suggested) { notes.push(`Panel ${name} was not configured; using session-available suggested seats: ${suggested.join(', ')}.`); return suggested; }
  }
  if (!Array.isArray(models) || !models.length || models.length > 16 || models.some(m => typeof m !== 'string' || !m.trim())) {
    throw new Error(`PANEL_NOT_CONFIGURED: ${name}. Run /setup-pstack and configure its model seats.`);
  }
  return models;
}

function canonicalModel(selector: string, ctx?: ExtensionContext, notes: string[] = []): string {
  if (typeof selector !== 'string' || !selector.trim()) throw new Error('EXPLICIT_MODEL_PANEL_REQUIRED');
  const value = selector.trim();
  if (!ctx) {
    if (!value.includes('/') && value !== 'auto' && value !== 'inherit-parent') throw new Error('EXPLICIT_MODEL_PANEL_REQUIRED');
    return value;
  }
  const resolved = resolveRoleModel(ctx, 'panel', value);
  const { model } = resolved;
  notes.push(...resolved.notes);
  if (!model) throw new Error(`PARENT_MODEL_UNAVAILABLE: ${value}`);
  return `${model.provider}/${model.id}`;
}

/** Configured panels become explicit node models before a workflow is created. */
export function buildTemplate(input: TemplateSpec, ctx?: ExtensionContext): {
  nodes: WorkflowNodeSpec[]; estimatedAgents: number; budget: Budget | undefined;
  notes: string[]; deliveryContract: 'local-dag' | 'candidate-only' | 'remote-stack-required'; completionPolicy?: 'first-pass';
} {
  validateBrief(input.brief);
  if (input.selectionPolicy && (!['best-of', 'first-pass', 'rank-all'].includes(input.selectionPolicy) || input.kind !== 'swarm' || input.swarmMode !== 'race')) throw new Error('INVALID_SWARM_SELECTION_POLICY');
  if (input.brief.contractLevel !== 'strict') throw new Error('TEMPLATE_REQUIRES_STRICT_BRIEF');
  const defaultPanel = input.kind === 'arena' ? 'arena' : input.kind === 'architect' ? 'architect' :
    input.kind === 'review' || input.kind === 'interrogate' ? 'interrogate' : undefined;
  const panel = input.panel ?? (!input.models?.length ? defaultPanel : undefined);
  const config = loadModels();
  const notes = ['Strict deterministic gates run on each artifact. Fallbacks and failed panels are reported.',
    'Model cost estimate is unknown until provider usage is available.'];
  const selectors = panel ? panelModels(panel, ctx, notes) : input.models?.length ? input.models :
    input.kind === 'swarm' ? [config.workflows?.swarm?.worker ?? config.roles.worker ?? 'inherit-parent'] : undefined;
  if (!selectors?.length) throw new Error('EXPLICIT_MODEL_PANEL_REQUIRED');
  const tolerantPanel = Boolean(ctx && ['arena', 'architect', 'interrogate', 'review'].includes(input.kind));
  const minimum = selectors.length === 1 && ['interrogate', 'review'].includes(input.kind) ? 1 : 2;
  const models = tolerantPanel ? resolvePanelSeats(ctx!, selectors, minimum, notes) : selectors.map(selector => canonicalModel(selector, ctx, notes));
  let judgeModel = input.judgeModel ? canonicalModel(input.judgeModel, ctx, notes) : undefined;
  let policy = input.independencePolicy ?? (['arena', 'architect'].includes(input.kind) ? 'independent-session' : undefined);
  if (judgeModel && ctx && ['arena', 'architect'].includes(input.kind)) {
    const parent = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
    if (parent && modelFamily(parent) && (!modelFamily(judgeModel) || modelFamily(parent) === modelFamily(judgeModel))) {
      notes.push('The requested judge is not known to be from a different family than the parent and was skipped.'); judgeModel = undefined;
    }
  }
  if (!judgeModel && (input.kind === 'arena' || input.kind === 'architect')) {
    const pool = panelModels('arena-judges', ctx, notes);
    if (ctx) {
      const selection = selectJudgeFromPool(ctx, pool);
      judgeModel = selection.model;
      notes.push(...selection.notes);
    } else judgeModel = canonicalModel(pool[0]!);
    policy ??= 'independent-session';
    if (judgeModel) notes.push('The configured judge is a separate session.');
  }
  if ((input.kind === 'review' || input.kind === 'interrogate') && new Set(models).size < 2) {
    notes.push('The review panel has fewer than two distinct models; multiple sessions do not establish model diversity.');
  } else if ((input.kind === 'review' || input.kind === 'interrogate') && new Set(models).size < models.length) {
    notes.push('Some review seats resolve to the same model; those seats do not add model diversity.');
  }
  const node = (key: string, profile: string, task: string, dependsOn: string[] = [], model?: string, brief = input.brief): WorkflowNodeSpec =>
    ({ key, profile, task, dependsOn, model, brief, isolation: profile === 'worker' || profile === 'adversary' ? 'worktree' : profile === 'integrator' || profile === 'repro-verifier' ? 'shared' : 'readonly' });
  let nodes: WorkflowNodeSpec[];
  let candidateOnly = false;
  if (input.kind === 'interrogate') {
    const adversaries = models.map((model, i) => node(`adversary-${i + 1}`, 'adversary',
      'Break the stated change. Run a reproduction for every finding in this isolated copy of the target, including its uncommitted changes. Report the command, observed and expected outputs; do not fix the target.', [], model,
      { ...input.brief, id: `${input.brief.id}.adversary-${i + 1}`, reportRequirements: { kind: 'repro-review' } }));
    const verifiers = adversaries.map((a, i) => node(`repro-${i + 1}`, 'repro-verifier',
      'Independently rerun each reported command in this adversary worktree. Check whether the reproduction changes the reviewed code and whether its output breaks the stated intent. Drop findings that do not reproduce. Report actual commands and output; do not apply fixes.', [a.key], models[(i + 1) % models.length],
      { ...input.brief, id: `${input.brief.id}.repro-${i + 1}`, reportRequirements: { kind: 'repro-review' } }));
    nodes = [...adversaries, ...verifiers, node('synthesize', 'synthesizer', 'Compare the independently rerun reports, merge duplicate root causes, and report findings and dropped findings. Do not apply any changes. The coordinator must inspect actual command evidence before calling findings verified.', verifiers.map(n => n.key), judgeModel, { ...input.brief, id: `${input.brief.id}.interrogate-synthesis`, reportRequirements: { kind: 'repro-review' } })];
    notes.push('Adversaries and separate repro sessions use isolated worktrees. Reports are model statements; the coordinator must inspect command evidence before accepting a finding. No changes are integrated.');
  } else if (input.kind === 'review') {
    const reviewers = models.map((model, i) => node(`review-${i + 1}`, 'reviewer',
      'Review the fixed artifact. Emit findings with evidence locations, severity, reproducible findings, and model identity; do not edit.', [], model,
      { ...input.brief, id: `${input.brief.id}.review-${i + 1}`, reportRequirements: { kind: 'review' } }));
    nodes = [...reviewers, node('synthesize', 'synthesizer', 'Deduplicate findings by evidence, preserve minority reproducible findings. Produce severity and unresolved list.', reviewers.map(n => n.key), judgeModel)];
  } else if (input.kind === 'autopilot-stack' || input.kind === 'autopilot-full' || input.kind === 'swarm' && input.swarmMode === 'partition') {
    if (!input.slices?.length) throw new Error('SLICES_REQUIRED');
    const serial = input.kind === 'autopilot-stack';
    const workers = input.slices.map((slice, i) => {
      validateBrief(slice.brief);
      const result = node(slice.key, 'worker', slice.task, serial && i ? [input.slices![i - 1]!.key] : [], models[i % models.length], slice.brief);
      if (serial && i) result.isolation = 'shared';
      return result;
    });
    nodes = [...workers, node('integrate', 'integrator', 'Integrate every completed slice. Report completed/total coverage and unresolved slices.', workers.map(w => w.key), models[0],
      { ...input.brief, id: `${input.brief.id}.coverage`, reportRequirements: { kind: 'coverage', slices: workers.map(w => w.key) } }),
      node('verify', 'verifier', 'Audit integrated artifact and deterministic evidence. Default delivery is dry-run.', ['integrate'], judgeModel)];
  } else if (input.kind === 'swarm' && input.swarmMode === 'race' && input.selectionPolicy === 'first-pass') {
    const count = input.candidateCount ?? Math.max(2, models.length);
    if (!Number.isInteger(count) || count < 2 || count > 16) throw new Error('INDEPENDENT_CANDIDATES_REQUIRED');
    nodes = Array.from({ length: count }, (_, i) => node(`candidate-${i + 1}`, 'worker', input.brief.goal, [], models[i % models.length], { ...input.brief, id: `${input.brief.id}.candidate-${i + 1}` }));
    notes.push('First-pass race: the first independently accepted candidate wins; remaining sessions receive cancellation and must settle before completion. No candidate is integrated automatically.');
  } else {
    if (input.kind === 'swarm' && input.swarmMode !== 'race') throw new Error('SWARM_MODE_REQUIRED');
    if (!input.rubric?.length || input.rubric.some(r => !r.criterion || !(r.weight > 0))) throw new Error('RUBRIC_REQUIRED');
    const count = input.candidateCount ?? (input.kind === 'swarm' ? Math.max(2, models.length) : models.length);
    if (!Number.isInteger(count) || count < 2 || count > 16) throw new Error('INDEPENDENT_CANDIDATES_REQUIRED');
    if (!judgeModel && input.kind === 'swarm') throw new Error('INDEPENDENT_JUDGE_REQUIRED');
    policy ??= 'different-model';
    if (judgeModel && policy === 'different-model' && models.includes(judgeModel)) throw new Error('JUDGE_NOT_INDEPENDENT');
    if (judgeModel && policy === 'different-family' && (!input.modelFamilies?.[judgeModel] || models.some(m => !input.modelFamilies?.[m] || input.modelFamilies[m] === input.modelFamilies[judgeModel!]))) throw new Error('MODEL_FAMILY_INDEPENDENCE_UNPROVEN');
    const goal = input.kind === 'architect' ? `${input.brief.goal}\nProduce a structurally distinct architectural sketch with types, signatures and module boundaries. Use not-implemented bodies and pseudocode; do not implement the final behavior in this phase.` : input.brief.goal;
    const candidates = Array.from({ length: count }, (_, i) => node(`candidate-${i + 1}`, 'worker', goal, [], models[i % models.length],
      { ...input.brief, id: `${input.brief.id}.candidate-${i + 1}` }));
    if (!judgeModel && input.kind !== 'swarm') {
      nodes = candidates;
      candidateOnly = true;
      notes.push('Cross-judge skipped. The coordinator must inspect every candidate, select and integrate the base, and verify the result; this candidate-only plan does not complete the skill.');
    } else if (input.kind !== 'swarm' && input.judgeMode !== 'per-candidate') {
      const keys = candidates.map(c => c.key);
      const judge = node('cross-judge', 'cross-judge', `Inspect every candidate using pstack_candidates. Compare each against the same rubric ${JSON.stringify(input.rubric)} using direct file evidence, select one base, and identify useful parts to integrate.`, keys, judgeModel,
        { ...input.brief, id: `${input.brief.id}.cross-evaluation`, reportRequirements: { kind: 'cross-evaluation', candidates: keys, criteria: input.rubric.map(r => r.criterion) } });
      const integrate = node('integrate', 'integrator', 'Read each candidate and independently compare it criterion by criterion. Compare that judgment with the cross-judge, select a base, graft useful parts deliberately, and record the selection, grafts, rejections and dropouts.', [...keys, judge.key], models[0]);
      const implement = input.kind === 'architect' ? node('implement', 'worker', 'Implement the requested behavior against the selected architectural sketch. Surface deviations from the sketch and run the relevant checks.', ['integrate'], models[0], { ...input.brief, id: `${input.brief.id}.implementation` }) : undefined;
      if (implement) implement.isolation = 'shared';
      nodes = [...candidates, judge, integrate, ...(implement ? [implement] : []),
        node('verify', 'verifier', 'Audit final combined artifact. Candidate passes cannot prove integrated code.', [implement?.key ?? 'integrate'], judgeModel)];
      if (implement) notes.push('Ground the existing system with how/why before dispatch; the implementation phase follows the selected sketch.');
      notes.push('One read-only cross-judge can inspect the verified candidate worktrees through confined tools.');
    } else {
      const judges = candidates.map(c => node(`judge-${c.key}`, 'reviewer', `Evaluate only this candidate using ${JSON.stringify(input.rubric)}. Emit criterion, score, evidence, weaknesses, selectedParts.`, [c.key], judgeModel,
        { ...input.brief, id: `${input.brief.id}.${c.key}.evaluation`, reportRequirements: { kind: 'evaluation', criteria: input.rubric!.map(r => r.criterion) } }));
      if (input.kind === 'swarm' && input.selectionPolicy === 'rank-all') {
        nodes = [...candidates, ...judges, node('rank', 'synthesizer', 'Rank every candidate against the rubric and explain each rank. Do not integrate or change any candidate.', judges.map(n => n.key), judgeModel,
          { ...input.brief, id: `${input.brief.id}.ranking`, reportRequirements: { kind: 'ranking', candidates: candidates.map(c => c.key) } })];
        notes.push('Rank-all returns an ordered comparison without automatically integrating a winner.');
      } else {
        nodes = [...candidates, ...judges, node('select', 'synthesizer', 'Select evidence-backed candidate/parts and explain rubric scores.', judges.map(n => n.key), judgeModel,
          { ...input.brief, id: `${input.brief.id}.selection`, reportRequirements: { kind: 'selection', candidates: candidates.map(c => c.key) } }),
          node('integrate', 'integrator', 'Integrate only selected parts and rerun deterministic checks.', ['select'], models[0]),
          node('verify', 'verifier', 'Audit final combined artifact. Candidate passes cannot prove integrated code.', ['integrate'], judgeModel)];
        notes.push('This template uses per-candidate judge sessions.');
      }
    }
  }
  validateGraph(nodes);
  planArtifacts(nodes);
  if (input.kind === 'autopilot-stack') notes.push('This DAG prepares local work, not a delivered PR stack. Use pstack-runner stack-plan/stack-open with independently verified linear worktree branches.');
  return { deliveryContract: candidateOnly ? 'candidate-only' : input.kind === 'autopilot-stack' ? 'remote-stack-required' : 'local-dag', ...(input.kind === 'swarm' && input.swarmMode === 'race' && input.selectionPolicy === 'first-pass' ? { completionPolicy: 'first-pass' as const } : {}), nodes, estimatedAgents: nodes.length, budget: input.budget, notes };
}
