import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { capture, fingerprint, ownerOf } from '../src/artifacts/fingerprint.ts';
import { createCandidateTool } from '../src/agent/candidates.ts';
import { reportSatisfies } from '../src/contracts/brief.ts';
import { registerSemanticTool } from '../src/compatibility/tool.ts';
import { saveModels } from '../src/runtime/config.ts';
import { buildTemplate } from '../src/templates/build.ts';
import { planArtifacts } from '../src/workflow/artifacts.ts';
import { registerWorkflowTool } from '../src/tools/workflow.ts';
import { registerAgentTool } from '../src/tools/agents.ts';
import { WorkflowEngine } from '../src/workflow/engine.ts';
import { verify } from '../src/verification/runner.ts';
import type { TaskBrief } from '../src/contracts/types.ts';

test('configured review panels resolve models, plan, and dispatch one reviewer per seat', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pstack-panels-'));
  const old = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = join(root, 'home');
  const cwd = join(root, 'repo');
  mkdirSync(cwd);
  const git = (...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  writeFileSync(join(cwd, 'source.txt'), 'baseline\n'); git('add', '.'); git('commit', '-qm', 'baseline');
  const a = { provider: 'a', id: 'one', reasoning: true }, b = { provider: 'b', id: 'two', reasoning: true };
  const ctx: any = {
    cwd, model: a, thinkingLevel: 'off', scopedModels: [], sessionManager: { getSessionId: () => 'parent' },
    modelRegistry: { find: (provider: string, id: string) => [a, b].find(m => m.provider === provider && m.id === id) },
  };
  const brief: TaskBrief = {
    id: 'panel', revision: 1, contractLevel: 'strict', goal: 'Review source',
    scope: { repoId: fingerprint(cwd).repoId, include: ['**'], exclude: [] }, contextRefs: [],
    acceptance: [{ id: 'present', description: 'source exists', required: true, gateIds: ['file'] }],
    verification: [{ id: 'file', kind: 'file', path: 'source.txt', pattern: 'baseline' }],
    forbidden: [], standingOrders: [], reportFormat: 'task-report-v1', timeboxSeconds: 30,
  };
  const dispatched: any[] = [], agents = new Map<string, any>();
  const host: any = {
    get: (id: string) => agents.get(id),
    async run(spec: any) {
      dispatched.push(spec);
      const baseline = capture(spec.cwd, undefined, [], 'working', { kind: 'baseline', owner: ownerOf(spec.brief, { workflowId: spec.workflowId, callKey: spec.callKey }) }).fingerprint;
      const report = { status: 'completed', base: baseline.commitSha, head: baseline.commitSha, artifactRefs: [], commandsRun: [], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [], findings: [] };
      const agent = { ...spec, state: 'completed', cwd: spec.cwd, baseline, report, result: 'reviewed' };
      agents.set(spec.id, agent);
      return agent;
    },
  };
  try {
    saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, workflows: { feature: { worker: 'b/two' }, swarm: { worker: 'b/two' }, reflect: { tooling: 'b/two', judgment: 'a/one' } }, panels: {
      interrogate: ['inherit-parent', 'b/two'], arena: ['inherit-parent', 'b/two'],
      architect: ['inherit-parent', 'b/two'], 'arena-judges': ['inherit-parent', 'b/two'],
    } });
    const registered: any[] = [];
    const pi: any = { registerTool: (tool: any) => registered.push(tool) };
    const engine = new WorkflowEngine(host);
    registerSemanticTool(pi); registerWorkflowTool(pi, engine);
    registerAgentTool(pi, { run: async (spec: any) => spec } as any);
    const semantic = registered.find(t => t.name === 'pstack_semantics');
    const workflow = registered.find(t => t.name === 'pstack_workflow');
    const agentTool = registered.find(t => t.name === 'pstack_agents');
    const child = await agentTool.execute('x', { action: 'run', profile: 'worker', playbook: 'feature', task: 'implement' }, undefined, undefined, ctx);
    assert.equal(child.details.model, 'b/two');
    const override = await agentTool.execute('x', { action: 'run', profile: 'worker', playbook: 'feature', model: 'a/one', task: 'implement' }, undefined, undefined, ctx);
    assert.equal(override.details.model, 'a/one');
    const reflect = await agentTool.execute('x', { action: 'run', profile: 'reviewer', playbook: 'reflect', modelRole: 'tooling', task: 'review tooling' }, undefined, undefined, ctx);
    assert.equal(reflect.details.model, 'b/two');
    const reflectPlan = await workflow.execute('x', { action: 'plan', playbook: 'reflect', nodes: [{ key: 'lens', profile: 'reviewer', modelRole: 'judgment', task: 'review judgment' }] }, undefined, undefined, ctx);
    assert.equal(reflectPlan.details.nodes[0].model, 'a/one');
    const taskPlan = await workflow.execute('x', { action: 'plan', playbook: 'feature', nodes: [{ key: 'work', task: 'implement' }] }, undefined, undefined, ctx);
    assert.equal(taskPlan.details.nodes[0].model, 'b/two');
    const explicitPlan = await workflow.execute('x', { action: 'plan', playbook: 'feature', nodes: [{ key: 'work', task: 'implement', model: 'a/one' }] }, undefined, undefined, ctx);
    assert.equal(explicitPlan.details.nodes[0].model, 'a/one');
    const preflight = await semantic.execute('x', { action: 'panel', name: 'interrogate' }, undefined, undefined, ctx);
    assert.deepEqual(preflight.details.models, ['a/one', 'b/two']);
    const request = { action: 'plan', template: { kind: 'interrogate', brief } };
    const planned = await workflow.execute('x', structuredClone(request), undefined, undefined, ctx);
    assert.deepEqual(planned.details.nodes.filter((n: any) => n.profile === 'adversary').map((n: any) => n.model), ['a/one', 'b/two']);
    const done = await workflow.execute('x', { ...request, action: 'run' }, undefined, undefined, ctx);
    assert.equal(done.details.state, 'completed');
    assert.deepEqual(dispatched.filter(n => n.profile === 'adversary').map(n => n.model).sort(), ['a/one', 'b/two']);
    assert.equal(done.details.type, 'review');
    const arena = buildTemplate({ kind: 'arena', brief, rubric: [{ criterion: 'correctness', weight: 1 }] }, ctx);
    assert.deepEqual(arena.nodes.filter(n => n.key.startsWith('candidate-')).map(n => n.model), ['a/one', 'b/two']);
    assert.deepEqual(arena.nodes.filter(n => n.profile === 'cross-judge').map(n => n.model), ['b/two']);
    assert.deepEqual(arena.nodes.find(n => n.key === 'cross-judge')?.dependsOn, ['candidate-1', 'candidate-2']);
    assert.deepEqual(arena.nodes.find(n => n.key === 'integrate')?.dependsOn, ['candidate-1', 'candidate-2', 'cross-judge']);
    const swarm = buildTemplate({ kind: 'swarm', swarmMode: 'race', candidateCount: 2, brief, judgeModel: 'a/one', rubric: [{ criterion: 'correctness', weight: 1 }] }, ctx);
    assert.deepEqual(swarm.nodes.filter(n => n.key.startsWith('candidate-')).map(n => n.model), ['b/two', 'b/two']);
    const recovered = buildTemplate({ kind: 'interrogate', brief }, { ...ctx, modelRegistry: { find: () => undefined } });
    assert(recovered.notes.some(n => n.includes('dropped')));
    assert.deepEqual(recovered.nodes.filter(n => n.profile === 'adversary').map(n => n.model), ['a/one', 'a/one']);
    assert.equal(dispatched.filter(n => n.profile === 'adversary').length, 2);
    saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, panels: { interrogate: ['auto', 'inherit-parent'] } });
    const same = await semantic.execute('x', { action: 'panel', name: 'interrogate' }, undefined, undefined, ctx);
    assert.equal(same.details.modelDiversity, false);
    assert.equal(same.details.authentication, 'not-checked');
    assert(buildTemplate({ kind: 'interrogate', brief }, ctx).notes.some(n => n.includes('fewer than two distinct models')));
  } finally {
    if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});

test('cross-judge report covers every candidate and criterion and selects one base', () => {
  const brief: any = { reportRequirements: { kind: 'cross-evaluation', candidates: ['candidate-1', 'candidate-2'], criteria: ['correctness', 'design'] } };
  const entries = brief.reportRequirements.candidates.flatMap((candidate: string) => brief.reportRequirements.criteria.map((criterion: string) => ({ candidate, criterion, score: 8, evidence: ['file.ts:4'], weaknesses: [], selectedParts: [] })));
  const report: any = { crossEvaluation: entries, selection: { candidates: ['candidate-1'], selectedParts: [] } };
  assert.equal(reportSatisfies(brief, report), true);
  assert.equal(reportSatisfies(brief, { ...report, crossEvaluation: entries.slice(1) }), false);
  assert.equal(reportSatisfies(brief, { ...report, crossEvaluation: entries.map((e: any) => ({ ...e, evidence: [] })) }), false);
  assert.equal(reportSatisfies(brief, { ...report, crossEvaluation: [...entries, entries[0]] }), false);
  assert.equal(reportSatisfies(brief, { ...report, crossEvaluation: [null, ...entries] }), false);
  assert.equal(reportSatisfies(brief, { ...report, selection: { candidates: ['candidate-1', 'candidate-2'], selectedParts: [] } }), false);
});

test('cross-judge requires distinct directly owned candidate worktrees', () => {
  const nodes: any[] = [
    { key: 'a', profile: 'worker', isolation: 'worktree', task: 'write a' },
    { key: 'b', profile: 'worker', isolation: 'worktree', task: 'write b' },
    { key: 'judge', profile: 'cross-judge', isolation: 'readonly', task: 'compare', dependsOn: ['a', 'b'] },
  ];
  assert.doesNotThrow(() => planArtifacts(nodes));
  assert.throws(() => planArtifacts(nodes.map(n => n.key === 'b' ? { ...n, isolation: 'shared' } : n)), /requires distinct root worker worktrees/);
  assert.throws(() => planArtifacts(nodes.map(n => n.key === 'b' ? { ...n, profile: 'reviewer' } : n)), /requires distinct root worker worktrees/);
  assert.doesNotThrow(() => planArtifacts(nodes.map(n => n.key === 'judge' ? { ...n, dependsOn: ['a'] } : n)));
  assert.throws(() => planArtifacts(nodes.map(n => n.key === 'judge' ? { ...n, dependsOn: [] } : n)), /requires distinct root worker worktrees/);
});

test('candidate inspection rejects workspace escapes and stale verified artifacts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pstack-candidate-'));
  const old = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = join(root, 'home');
  const cwd = join(process.env.PSTACK_NATIVE_HOME, 'worktrees', 'repo'), outside = join(root, 'outside');
  mkdirSync(cwd, { recursive: true }); mkdirSync(outside); writeFileSync(join(outside, 'secret.txt'), 'outside');
  const git = (...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
  try {
    git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
    writeFileSync(join(cwd, 'source.txt'), 'baseline\n'); symlinkSync(outside, join(cwd, 'escape'));
    git('add', '.'); git('commit', '-qm', 'baseline');
    const brief: TaskBrief = {
      id: 'candidate-test', revision: 1, contractLevel: 'strict', goal: 'Verify source',
      scope: { repoId: fingerprint(cwd).repoId, include: ['**'], exclude: [] }, contextRefs: [],
      acceptance: [{ id: 'present', description: 'source exists', required: true, gateIds: ['file'] }],
      verification: [{ id: 'file', kind: 'file', path: 'source.txt', pattern: 'baseline' }],
      forbidden: [], standingOrders: [], reportFormat: 'task-report-v1', timeboxSeconds: 30,
    };
    const owner = ownerOf(brief, { workflowId: 'wf', callKey: 'candidate-1' });
    const baseline = capture(cwd, undefined, [], 'working', { kind: 'baseline', owner }).fingerprint;
    const report: any = { status: 'completed', base: baseline.commitSha, head: baseline.commitSha, artifactRefs: [], commandsRun: [], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [] };
    const ledger = await verify(cwd, brief, { before: baseline, owner, report });
    assert.equal(ledger.status, 'passed');
    const tool = createCandidateTool([{ key: 'candidate-1', agentId: 'agent', workspace: cwd, artifactId: ledger.artifactId, ledgerId: ledger.id, baseline }]);
    assert.match((await tool.execute('x', { action: 'read', candidate: 'candidate-1', path: 'source.txt' })).content[0].text, /baseline/);
    await assert.rejects(tool.execute('x', { action: 'read', candidate: 'candidate-1', path: '../outside/secret.txt' }), /escapes child workspace/);
    await assert.rejects(tool.execute('x', { action: 'read', candidate: 'candidate-1', path: 'escape/secret.txt' }), /escapes child workspace/);
    const other = join(process.env.PSTACK_NATIVE_HOME, 'worktrees', 'other');
    git('worktree', 'add', '--quiet', '--detach', other, 'HEAD');
    const wrongWorkspace = createCandidateTool([{ key: 'candidate-1', agentId: 'agent', workspace: other, artifactId: ledger.artifactId, ledgerId: ledger.id, baseline }]);
    await assert.rejects(wrongWorkspace.execute('x', { action: 'read', candidate: 'candidate-1', path: 'source.txt' }), /CANDIDATE_ARTIFACT_CHANGED/);
    writeFileSync(join(cwd, 'source.txt'), 'changed\n');
    await assert.rejects(tool.execute('x', { action: 'read', candidate: 'candidate-1', path: 'source.txt' }), /CANDIDATE_ARTIFACT_CHANGED/);
  } finally {
    if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});

test('arena continues with verified survivors and records a failed candidate dropout', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pstack-dropout-'));
  const old = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = join(root, 'home');
  const cwd = join(root, 'repo'); mkdirSync(cwd);
  const git = (...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  writeFileSync(join(cwd, 'source.txt'), 'baseline\n'); git('add', '.'); git('commit', '-qm', 'baseline');
  const a = { provider: 'p', id: 'claude-opus', reasoning: true }, b = { provider: 'p', id: 'grok-4', reasoning: true };
  const ctx: any = { cwd, model: a, thinkingLevel: 'off', scopedModels: [], sessionManager: { getSessionId: () => 'parent' }, modelRegistry: { getAvailable: () => [a, b], find: (_p: string, id: string) => [a, b].find(m => m.id === id) } };
  const brief: TaskBrief = { id: 'dropout', revision: 1, contractLevel: 'strict', goal: 'Create a candidate', scope: { repoId: fingerprint(cwd).repoId, include: ['**'], exclude: [] }, contextRefs: [], acceptance: [{ id: 'present', description: 'source exists', required: true, gateIds: ['file'] }], verification: [{ id: 'file', kind: 'file', path: 'source.txt', pattern: 'baseline' }], forbidden: [], standingOrders: [], reportFormat: 'task-report-v1', timeboxSeconds: 30 };
  const agents = new Map<string, any>();
  const host: any = { get: (id: string) => agents.get(id), async run(spec: any) {
    if (spec.callKey === 'candidate-2') { const result = { ...spec, state: 'failed', error: { code: 'DROPPED', message: 'candidate failed', retryable: false } }; agents.set(spec.id, result); return result; }
    const base = capture(spec.cwd, undefined, [], 'working', { kind: 'baseline', owner: ownerOf(spec.brief, { workflowId: spec.workflowId, callKey: spec.callKey }) }).fingerprint;
    const report: any = { status: 'completed', base: base.commitSha, head: base.commitSha, artifactRefs: [], commandsRun: [], evidenceRefs: [], deviations: [], unresolved: [], nextActions: [] };
    if (spec.profile === 'cross-judge') {
      assert.deepEqual(spec.brief.reportRequirements.candidates, ['candidate-1']);
      report.crossEvaluation = [{ candidate: 'candidate-1', criterion: 'correctness', score: 8, evidence: ['source.txt:1'], weaknesses: [], selectedParts: [] }];
      report.selection = { candidates: ['candidate-1'], selectedParts: [] };
    }
    const result = { ...spec, cwd: spec.cwd, state: 'completed', baseline: base, report, result: 'done' };
    agents.set(spec.id, result); return result;
  } };
  try {
    saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, panels: { arena: ['p/claude-opus', 'p/grok-4'], 'arena-judges': ['p/grok-4'] } });
    const plan = buildTemplate({ kind: 'arena', brief, rubric: [{ criterion: 'correctness', weight: 1 }] }, ctx);
    const engine = new WorkflowEngine(host);
    const created = engine.create({ type: 'arena', cwd, nodes: plan.nodes, parentSessionId: 'parent' });
    const done = await engine.run(created.id, ctx);
    assert.equal(done.state, 'completed');
    assert.equal(done.calls['candidate-2'].excludedFromSelection, true);
    assert.deepEqual(done.calls['cross-judge'].dependsOn, ['candidate-1']);
    assert(done.modelNotes?.some(note => note.includes('candidate-2')));
    assert.equal(done.calls.integrate.state, 'completed');
    assert.throws(() => engine.retry(done.id, 'candidate-2'), /Excluded candidates/);
    saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, panels: { arena: ['p/claude-opus', 'p/claude-opus'], 'arena-judges': ['p/claude-opus'] } });
    const sameFamilyCtx = { ...ctx, modelRegistry: { getAvailable: () => [a], find: (_p: string, id: string) => id === a.id ? a : undefined } };
    const noJudgePlan = buildTemplate({ kind: 'arena', brief: { ...brief, id: 'dropout-no-judge' }, rubric: [{ criterion: 'correctness', weight: 1 }] }, sameFamilyCtx);
    const candidateOnly = engine.create({ type: 'arena', deliveryContract: noJudgePlan.deliveryContract, cwd, nodes: noJudgePlan.nodes, parentSessionId: 'parent' });
    const result = await engine.run(candidateOnly.id, sameFamilyCtx);
    assert.equal(result.state, 'completed');
    assert.equal(result.deliveryContract, 'candidate-only');
    assert(result.modelNotes?.some(note => note.includes('candidate-2')));
  } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(root, { recursive: true, force: true }); }
});

test('arena without an independent family returns candidates for coordinator selection', () => {
  const root = mkdtempSync(join(tmpdir(), 'pstack-no-judge-')); const old = process.env.PSTACK_NATIVE_HOME; process.env.PSTACK_NATIVE_HOME = root;
  const parent = { provider: 'p', id: 'claude-opus', reasoning: true };
  const ctx: any = { model: parent, thinkingLevel: 'off', scopedModels: [], modelRegistry: { getAvailable: () => [parent], find: () => parent } };
  const brief: any = { id: 'single-family', revision: 1, contractLevel: 'strict', goal: 'Create candidates', scope: { repoId: 'repo', include: ['**'], exclude: [] }, contextRefs: [], acceptance: [{ id: 'ok', description: 'ok', required: true, gateIds: ['file'] }], verification: [{ id: 'file', kind: 'file', path: 'source.txt' }], forbidden: [], standingOrders: [], reportFormat: 'task-report-v1', timeboxSeconds: 30 };
  try {
    saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, panels: { arena: ['p/claude-opus', 'p/claude-opus'], 'arena-judges': ['inherit-parent', 'p/claude-opus'] } });
    const plan = buildTemplate({ kind: 'arena', brief, rubric: [{ criterion: 'correctness', weight: 1 }] }, ctx);
    assert.equal(plan.nodes.length, 2);
    assert.equal(plan.deliveryContract, 'candidate-only');
    assert(plan.nodes.every(node => node.profile === 'worker'));
    assert(plan.notes.some(note => note.includes('coordinator must inspect')));
    const unknown = { provider: 'p', id: 'unknown-model', reasoning: true };
    const unknownCtx = { ...ctx, modelRegistry: { getAvailable: () => [parent, unknown], find: (_provider: string, id: string) => [parent, unknown].find(m => m.id === id) } };
    const uncertain = buildTemplate({ kind: 'arena', brief, judgeModel: 'p/unknown-model', rubric: [{ criterion: 'correctness', weight: 1 }] }, unknownCtx);
    assert.equal(uncertain.deliveryContract, 'candidate-only');
  } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(root, { recursive: true, force: true }); }
});
