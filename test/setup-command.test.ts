import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import extension from '../src/extension.ts';
import { loadModels, saveModels } from '../src/runtime/config.ts';

const claude = { provider: 'anthropic', id: 'claude-opus-4', reasoning: true, thinkingLevelMap: { xhigh: 'high', max: 'high' } };
const grok = { provider: 'xai', id: 'grok-4', reasoning: true, thinkingLevelMap: { xhigh: 'high', max: 'high' } };
async function setup(choose: (title: string, options: string[]) => string | undefined, models: any[] = [claude, grok], parent: any = claude) {
  const commands = new Map<string, any>();
  extension({ registerCommand: (name: string, value: any) => commands.set(name, value), registerTool() {}, on() {} } as any);
  const notices: string[] = [], titles: string[] = [];
  const ctx = { hasUI: true, model: parent, scopedModels: [], modelRegistry: { getAvailable: () => models, find: (provider: string, id: string) => models.find(m => m.provider === provider && m.id === id) }, ui: { select: (title: string, options: string[]) => { titles.push(title); return choose(title, options); }, notify: (message: string) => notices.push(message) } };
  await commands.get('setup-pstack').handler('', ctx);
  return { notices, titles };
}
async function withHome(fn: () => Promise<void>) {
  const old = process.env.PSTACK_NATIVE_HOME, home = mkdtempSync(join(tmpdir(), 'pstack-setup-'));
  process.env.PSTACK_NATIVE_HOME = home;
  try { await fn(); } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
}
const normal = (title: string, options: string[]) => title.startsWith('child reasoning') ? options[0] : title.startsWith('model fallback') ? options[0] : options.find(x => x === 'Save settings');

test('setup presents available-model defaults and saves panels in three prompts', async () => withHome(async () => {
  const { notices, titles } = await setup(normal);
  assert.equal(titles.length, 3);
  assert.match(titles[2], /arena=\[anthropic\/claude-opus-4, xai\/grok-4\]/);
  const config = loadModels();
  assert.equal(config.roles.worker, 'xai/grok-4');
  assert.equal(config.roles.reviewer, 'anthropic/claude-opus-4');
  assert.deepEqual(config.panels?.interrogate, ['anthropic/claude-opus-4', 'xai/grok-4']);
  assert.equal(config.workflows?.reflect.tooling, 'xai/grok-4');
  assert.match(notices.at(-1)!, /Saved/);
}));

test('setup permits editing one role, task model and panel while preserving unrelated config', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: { worker: 'auto' }, workflows: { custom: { worker: 'anthropic/claude-opus-4' } }, panels: { extra: ['xai/grok-4'] } });
  const actions = ['Edit a role', 'Edit a task model', 'Edit a panel', 'Save settings'];
  await setup((title, options) => {
    if (title.startsWith('child reasoning') || title.startsWith('model fallback')) return options[0];
    if (title.startsWith('Review pstack settings')) return actions.shift();
    if (title === 'Choose role to edit') return options.find(x => x.startsWith('worker —'));
    if (title === 'Choose task model to edit') return options.find(x => x.startsWith('reflect tooling '));
    if (title === 'Choose panel to edit') return options.find(x => x.startsWith('interrogate reviewers '));
    if (title.includes(': seat 2;')) return options.find(x => x.startsWith('xai/grok-4 —'));
    if (title.includes(': seat 3;')) return options[0];
    if (title.includes(': seat 1;')) return options.find(x => x.startsWith('anthropic/claude-opus-4 —'));
    return options.find(x => x.startsWith('xai/grok-4 —'));
  });
  const config = loadModels();
  assert.equal(config.roles.worker, 'xai/grok-4');
  assert.equal(config.workflows?.reflect.tooling, 'xai/grok-4');
  assert.equal(config.workflows?.custom.worker, 'anthropic/claude-opus-4');
  assert.deepEqual(config.panels?.interrogate, ['anthropic/claude-opus-4', 'xai/grok-4']);
  assert.deepEqual(config.panels?.extra, ['xai/grok-4']);
}));

test('setup preserves existing mappings and reports repeated seats for one model', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: { worker: 'auto' }, panels: { arena: ['auto', 'auto'] }, workflows: { feature: { worker: 'auto' } } });
  const { notices } = await setup(normal, [claude]);
  const config = loadModels();
  assert.equal(config.roles.worker, 'auto');
  assert.deepEqual(config.panels?.arena, ['auto', 'auto']);
  assert.equal(config.workflows?.feature.worker, 'auto');
  assert.match(notices.at(-1)!, /Repeated model seats/);
}));

test('cancelling setup during editing never writes any settings', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'off', roles: { worker: 'auto' } });
  const before = readFileSync(join(process.env.PSTACK_NATIVE_HOME!, 'models.json'), 'utf8');
  for (let stop = 1; stop <= 5; stop++) {
    let calls = 0;
    const result = await setup((title, options) => {
      if (++calls === stop) return undefined;
      if (title.startsWith('Review pstack settings')) return 'Edit a role';
      return options[0];
    });
    assert.match(result.notices.at(-1)!, /cancelled/);
    assert.equal(readFileSync(join(process.env.PSTACK_NATIVE_HOME!, 'models.json'), 'utf8'), before);
  }
}));

test('setup refuses to save an unsupported reasoning level unless fallback is enabled', async () => withHome(async () => {
  const basic = { provider: 'a', id: 'basic', reasoning: false };
  const { notices } = await setup((title, options) => title.startsWith('child reasoning') ? options.find(x => x.startsWith('unlimited')) : title.startsWith('model fallback') ? options.find(x => x.startsWith('disabled')) : options[0], [basic], basic);
  assert(notices.some(x => /does not support max/.test(x)));
  assert.equal(loadModels().thinkingLevel, 'inherit-parent');
}));
