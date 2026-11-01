import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveModels } from '../src/runtime/config.ts';
import { registerAgentTool } from '../src/tools/agents.ts';
import { registerWorkflowTool } from '../src/tools/workflow.ts';
import { WorkflowEngine } from '../src/workflow/engine.ts';

test('global task roles route explicit selections without changing existing playbook precedence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pstack-global-roles-'));
  const old = process.env.PSTACK_NATIVE_HOME;
  process.env.PSTACK_NATIVE_HOME = root;
  try {
    saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: { judgment: 'p/judgment', hardest: 'p/hardest' }, workflows: { feature: { worker: 'p/code' }, reflect: { judgment: 'p/reflect' } } });
    const registered: any[] = [];
    const pi: any = { registerTool: (tool: any) => registered.push(tool) };
    const host: any = { run: async (spec: any) => spec, start: (spec: any) => spec };
    const engine = new WorkflowEngine(host);
    registerAgentTool(pi, host); registerWorkflowTool(pi, engine);
    const agent = registered.find(tool => tool.name === 'pstack_agents');
    const workflow = registered.find(tool => tool.name === 'pstack_workflow');
    const ctx: any = { cwd: root, sessionManager: { getSessionId: () => 'parent' } };
    const call = (params: any) => agent.execute('x', { profile: 'worker', task: 'task', ...params }, undefined, undefined, ctx);
    assert.equal((await call({ action: 'run', modelRole: 'judgment' })).details.model, 'p/judgment');
    assert.equal((await call({ action: 'start', playbook: 'feature', modelRole: 'hardest' })).details.model, 'p/hardest');
    assert.equal((await call({ action: 'run', playbook: 'feature' })).details.model, 'p/code');
    assert.equal((await call({ action: 'run', playbook: 'reflect', modelRole: 'judgment' })).details.model, 'p/reflect');
    assert.equal((await call({ action: 'run', modelRole: 'hardest', model: 'p/explicit' })).details.model, 'p/explicit');
    const nodes = [{ key: 'a', task: 'task', modelRole: 'hardest' }, { key: 'b', task: 'task', modelRole: 'judgment', model: 'p/explicit' }];
    const plan = await workflow.execute('x', { action: 'plan', playbook: 'feature', nodes }, undefined, undefined, ctx);
    assert.deepEqual(plan.details.nodes.map((node: any) => node.model), ['p/hardest', 'p/explicit']);
    const record = engine.build({ cwd: root, playbook: 'feature', nodes });
    assert.equal(record.calls.a.model, 'p/hardest');
    assert.equal(record.calls.b.model, 'p/explicit');
    saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, workflows: { feature: { worker: 'p/code' } } });
    assert.equal((await call({ action: 'run', playbook: 'feature', modelRole: 'hardest' })).details.model, 'p/code');
    assert.equal((await call({ action: 'run', modelRole: 'hardest' })).details.model, undefined);
  } finally {
    if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});
