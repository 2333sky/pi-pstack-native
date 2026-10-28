import { resolveRoleModel, selectJudgeFromPool } from "../models/router.js";
import { loadModels } from "../runtime/config.js";
import { validateBrief } from "../contracts/brief.js";
import { validateGraph } from "../workflow/graph.js";
import { planArtifacts } from "../workflow/artifacts.js";
function panelModels(name) {
    const models = loadModels().panels?.[name];
    if (!Array.isArray(models) || !models.length || models.length > 16 || models.some(m => typeof m !== 'string' || !m.trim())) {
        throw new Error(`PANEL_NOT_CONFIGURED: ${name}. Run /setup-pstack and configure its model seats.`);
    }
    return models;
}
function canonicalModel(selector, ctx, notes = []) {
    if (typeof selector !== 'string' || !selector.trim())
        throw new Error('EXPLICIT_MODEL_PANEL_REQUIRED');
    const value = selector.trim();
    if (!ctx) {
        if (!value.includes('/') && value !== 'auto' && value !== 'inherit-parent')
            throw new Error('EXPLICIT_MODEL_PANEL_REQUIRED');
        return value;
    }
    const resolved = resolveRoleModel(ctx, 'panel', value);
    const { model } = resolved;
    notes.push(...resolved.notes);
    if (!model)
        throw new Error(`PARENT_MODEL_UNAVAILABLE: ${value}`);
    return `${model.provider}/${model.id}`;
}
/** Configured panels become explicit node models before a workflow is created. */
export function buildTemplate(input, ctx) {
    validateBrief(input.brief);
    if (input.brief.contractLevel !== 'strict')
        throw new Error('TEMPLATE_REQUIRES_STRICT_BRIEF');
    const defaultPanel = input.kind === 'arena' ? 'arena' : input.kind === 'architect' ? 'architect' :
        input.kind === 'review' || input.kind === 'interrogate' ? 'interrogate' : undefined;
    const panel = input.panel ?? (!input.models?.length ? defaultPanel : undefined);
    const config = loadModels();
    const selectors = panel ? panelModels(panel) : input.models?.length ? input.models :
        input.kind === 'swarm' ? [config.workflows?.swarm?.worker ?? config.roles.worker ?? 'inherit-parent'] : undefined;
    if (!selectors?.length)
        throw new Error('EXPLICIT_MODEL_PANEL_REQUIRED');
    const notes = ['Strict deterministic gates run on each artifact. Fallbacks and failed panels are reported.',
        'Model cost estimate is unknown until provider usage is available.'];
    const models = selectors.map(m => canonicalModel(m, ctx, notes));
    let judgeModel = input.judgeModel ? canonicalModel(input.judgeModel, ctx, notes) : undefined;
    let policy = input.independencePolicy;
    if (!judgeModel && (input.kind === 'arena' || input.kind === 'architect')) {
        const pool = panelModels('arena-judges');
        if (ctx) {
            const selection = selectJudgeFromPool(ctx, pool);
            judgeModel = selection.model;
            notes.push(...selection.notes);
        }
        else
            judgeModel = canonicalModel(pool[0]);
        policy ??= 'independent-session';
        notes.push('The configured judge is a separate session.');
    }
    if ((input.kind === 'review' || input.kind === 'interrogate') && new Set(models).size < 2) {
        notes.push('The review panel has fewer than two distinct models; multiple sessions do not establish model diversity.');
    }
    else if ((input.kind === 'review' || input.kind === 'interrogate') && new Set(models).size < models.length) {
        notes.push('Some review seats resolve to the same model; those seats do not add model diversity.');
    }
    const node = (key, profile, task, dependsOn = [], model, brief = input.brief) => ({ key, profile, task, dependsOn, model, brief, isolation: profile === 'worker' ? 'worktree' : profile === 'integrator' ? 'shared' : 'readonly' });
    let nodes;
    if (input.kind === 'review' || input.kind === 'interrogate') {
        const reviewers = models.map((model, i) => node(`review-${i + 1}`, 'reviewer', 'Review the fixed artifact. Emit findings with evidence locations, severity, reproducible findings, and model identity; do not edit.', [], model, { ...input.brief, id: `${input.brief.id}.review-${i + 1}`, reportRequirements: { kind: 'review' } }));
        nodes = [...reviewers, node('synthesize', 'synthesizer', 'Deduplicate findings by evidence, preserve minority reproducible findings. Produce severity and unresolved list.', reviewers.map(n => n.key), judgeModel)];
    }
    else if (input.kind === 'autopilot-stack' || input.kind === 'autopilot-full' || input.kind === 'swarm' && input.swarmMode === 'partition') {
        if (!input.slices?.length)
            throw new Error('SLICES_REQUIRED');
        const serial = input.kind === 'autopilot-stack';
        const workers = input.slices.map((slice, i) => {
            validateBrief(slice.brief);
            const result = node(slice.key, 'worker', slice.task, serial && i ? [input.slices[i - 1].key] : [], models[i % models.length], slice.brief);
            if (serial && i)
                result.isolation = 'shared';
            return result;
        });
        nodes = [...workers, node('integrate', 'integrator', 'Integrate every completed slice. Report completed/total coverage and unresolved slices.', workers.map(w => w.key), models[0], { ...input.brief, id: `${input.brief.id}.coverage`, reportRequirements: { kind: 'coverage', slices: workers.map(w => w.key) } }),
            node('verify', 'verifier', 'Audit integrated artifact and deterministic evidence. Default delivery is dry-run.', ['integrate'], judgeModel)];
    }
    else {
        if (input.kind === 'swarm' && input.swarmMode !== 'race')
            throw new Error('SWARM_MODE_REQUIRED');
        if (!input.rubric?.length || input.rubric.some(r => !r.criterion || !(r.weight > 0)))
            throw new Error('RUBRIC_REQUIRED');
        const count = input.candidateCount ?? models.length;
        if (!Number.isInteger(count) || count < 2 || count > 16)
            throw new Error('INDEPENDENT_CANDIDATES_REQUIRED');
        if (!judgeModel)
            throw new Error('INDEPENDENT_JUDGE_REQUIRED');
        policy ??= 'different-model';
        if (policy === 'different-model' && models.includes(judgeModel))
            throw new Error('JUDGE_NOT_INDEPENDENT');
        if (policy === 'different-family' && (!input.modelFamilies?.[judgeModel] || models.some(m => !input.modelFamilies?.[m] || input.modelFamilies[m] === input.modelFamilies[judgeModel])))
            throw new Error('MODEL_FAMILY_INDEPENDENCE_UNPROVEN');
        const goal = input.kind === 'architect' ? `${input.brief.goal}\nProduce a distinct architectural sketch with types, interfaces and module boundaries before implementation.` : input.brief.goal;
        const candidates = Array.from({ length: count }, (_, i) => node(`candidate-${i + 1}`, 'worker', goal, [], models[i % models.length], { ...input.brief, id: `${input.brief.id}.candidate-${i + 1}` }));
        if (input.kind !== 'swarm' && input.judgeMode !== 'per-candidate') {
            const keys = candidates.map(c => c.key);
            const judge = node('cross-judge', 'cross-judge', `Inspect every candidate using pstack_candidates. Compare each against the same rubric ${JSON.stringify(input.rubric)} using direct file evidence, select one base, and identify useful parts to integrate.`, keys, judgeModel, { ...input.brief, id: `${input.brief.id}.cross-evaluation`, reportRequirements: { kind: 'cross-evaluation', candidates: keys, criteria: input.rubric.map(r => r.criterion) } });
            nodes = [...candidates, judge,
                node('integrate', 'integrator', 'Integrate only selected parts and rerun deterministic checks.', [...keys, judge.key], models[0]),
                node('verify', 'verifier', 'Audit final combined artifact. Candidate passes cannot prove integrated code.', ['integrate'], judgeModel)];
            notes.push('One read-only cross-judge can inspect the verified candidate worktrees through confined tools.');
        }
        else {
            const judges = candidates.map(c => node(`judge-${c.key}`, 'reviewer', `Evaluate only this candidate using ${JSON.stringify(input.rubric)}. Emit criterion, score, evidence, weaknesses, selectedParts.`, [c.key], judgeModel, { ...input.brief, id: `${input.brief.id}.${c.key}.evaluation`, reportRequirements: { kind: 'evaluation', criteria: input.rubric.map(r => r.criterion) } }));
            nodes = [...candidates, ...judges, node('select', 'synthesizer', 'Select evidence-backed candidate/parts and explain rubric scores.', judges.map(n => n.key), judgeModel, { ...input.brief, id: `${input.brief.id}.selection`, reportRequirements: { kind: 'selection', candidates: candidates.map(c => c.key) } }),
                node('integrate', 'integrator', 'Integrate only selected parts and rerun deterministic checks.', ['select'], models[0]),
                node('verify', 'verifier', 'Audit final combined artifact. Candidate passes cannot prove integrated code.', ['integrate'], judgeModel)];
            notes.push('This template uses per-candidate judge sessions.');
        }
    }
    validateGraph(nodes);
    planArtifacts(nodes);
    if (input.kind === 'autopilot-stack')
        notes.push('This DAG prepares local work, not a delivered PR stack. Use pstack-runner stack-plan/stack-open with independently verified linear worktree branches.');
    return { deliveryContract: input.kind === 'autopilot-stack' ? 'remote-stack-required' : 'local-dag', nodes, estimatedAgents: nodes.length, budget: input.budget, notes };
}
