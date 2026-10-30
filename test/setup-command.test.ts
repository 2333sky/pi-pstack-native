import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import extension from '../src/extension.ts';
import { loadModels, saveModels } from '../src/runtime/config.ts';

const claude = { provider: 'anthropic', id: 'claude-opus-4', reasoning: true, thinkingLevelMap: { xhigh: 'high', max: 'high' } };
const grok = { provider: 'xai', id: 'grok-4', reasoning: true, thinkingLevelMap: { xhigh: 'high', max: 'high' } };
const claudeId = 'anthropic/claude-opus-4', grokId = 'xai/grok-4';
type Choose = (title: string, options: string[], call: number) => string | undefined;

async function setup(choose: Choose, models: any[] = [claude, grok], parent: any = claude, registryModels = models, scopedModels: any[] = []) {
  const commands = new Map<string, any>(), messages: Array<{ text: string; options: any }> = [];
  extension({ registerCommand: (name: string, value: any) => commands.set(name, value), registerTool() {}, on() {}, sendUserMessage: (text: string, options: any) => messages.push({ text, options }) } as any);
  const notices: string[] = [], titles: string[] = [], optionLists: string[][] = [];
  const ctx = {
    hasUI: true, model: parent, scopedModels, isIdle: () => true,
    modelRegistry: { getAvailable: () => models, find: (provider: string, id: string) => registryModels.find(m => m.provider === provider && m.id === id) },
    ui: { select: (title: string, options: string[]) => { titles.push(title); optionLists.push(options); assert(titles.length < 100, 'wizard must make progress'); return choose(title, options, titles.length); }, notify: (message: string) => notices.push(message) },
  };
  await commands.get('setup-pstack').handler('', ctx);
  return { notices, titles, optionLists, messages };
}
async function withHome(fn: (home: string) => Promise<void>) {
  const old = process.env.PSTACK_NATIVE_HOME, home = mkdtempSync(join(tmpdir(), 'pstack-setup-'));
  process.env.PSTACK_NATIVE_HOME = home;
  try { await fn(home); } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
}
const save: Choose = (title, options) => title.startsWith('Child reasoning') ? options[0] : options.includes('Save settings') ? 'Save settings' : undefined;

test('fresh setup defaults to the upstream large budget, previews all mappings in pages, and offers verification through the agent', async () => withHome(async () => {
  const { notices, titles, optionLists, messages } = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) { assert.equal(options[0], 'large — xhigh reasoning'); assert(options.includes('Cancel setup')); return options[0]; }
    return options.includes('Next page →') ? 'Next page →' : 'Save settings';
  });
  const all = titles.join('\n');
  for (const text of ['Role worker: xai/grok-4', 'feature: role default (xai/grok-4)', 'how explainer:', 'swarm workers:', 'arena runners 1:', 'arena cross-judge pool 1:', 'architect runners 2:', 'interrogate reviewers 2:']) assert(all.includes(text), text);
  assert(all.includes('Pi maps xhigh to high'));
  assert(optionLists.every(options => options.length <= 8));
  const config = loadModels();
  assert.equal(config.thinkingLevel, 'xhigh');
  assert.equal(config.roles.worker, grokId);
  assert.deepEqual(config.panels?.interrogate, [claudeId, grokId]);
  assert.equal(config.workflows?.reflect.tooling, grokId);
  assert.match(notices.at(-1)!, /Saved pstack settings/);
  assert.equal(messages.length, 1);
  assert.match(messages[0]!.text, /existing harness.*not merely unit tests/);
  assert.match(messages[0]!.text, /ask and wait for the user's answer/);
  assert.match(messages[0]!.text, /create-formal-verification-skill/);
  assert.equal(messages[0]!.options.expandPromptTemplates, true);
}));

test('rerun keeps the current budget, aliases, panel order, custom mappings and unknown metadata', async () => withHome(async home => {
  const path = join(home, 'models.json');
  writeFileSync(path, JSON.stringify({ version: 1, thinkingLevel: 'max', fallbackPolicy: 'disabled', roles: { worker: 'auto', custom: grokId }, workflows: { feature: { worker: 'auto' }, custom: { worker: claudeId } }, panels: { arena: ['auto', claudeId], extra: [grokId] }, metadata: { keep: true } }));
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) { assert.match(title, /current: max/); assert.equal(options[0], 'unlimited — max reasoning'); return options[0]; }
    return 'Save settings';
  });
  const config = loadModels();
  assert.equal(config.thinkingLevel, 'max');
  assert.equal(config.roles.worker, 'auto');
  assert.deepEqual(config.panels?.arena, ['auto', claudeId]);
  assert.equal(config.workflows?.custom.worker, claudeId);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).metadata, { keep: true });
  assert(result.notices.some(notice => /Repeated seats.*arena/.test(notice)));
}));

test('unavailable models cannot be saved even with inherited reasoning and can be repaired in the same wizard', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: { worker: 'old/missing' } });
  let attempted = false, edited = false;
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (title.startsWith('Review pstack settings')) {
      if (!attempted) { attempted = true; return 'Save settings'; }
      if (!edited) { edited = true; assert.match(title, /needs choice: not available/); return 'Edit a role'; }
      return 'Save settings';
    }
    if (title.startsWith('Choose role')) return options.find(x => x.startsWith('worker —'));
    if (title.startsWith('Model for worker')) return options.find(x => x.startsWith('auto —'));
    return undefined;
  }, [claude], claude, [claude, { provider: 'old', id: 'missing', reasoning: true }]);
  assert(result.notices.some(notice => /Cannot save yet.*not available/.test(notice)));
  assert.equal(loadModels().roles.worker, 'auto');
  assert.equal(result.messages.length, 1);
}));

test('unsupported reasoning can be corrected without discarding model choices', async () => withHome(async () => {
  const basic = { provider: 'a', id: 'basic', reasoning: false };
  let attempt = 0;
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) {
      if (attempt === 0) return options.find(x => x.startsWith('unlimited'));
      return options.find(x => x.startsWith('off —')) ?? 'Next page →';
    }
    if (title.startsWith('Review pstack')) return ++attempt === 1 ? 'Save settings' : attempt === 2 ? 'Change budget' : 'Save settings';
    return undefined;
  }, [basic], basic);
  assert(result.notices.some(notice => /does not support max/.test(notice)));
  assert.equal(loadModels().thinkingLevel, 'off');
  assert.equal(loadModels().roles.worker, 'a/basic');
}));

test('edit one panel seat and preserve the rest and the feature/refactoring overrides', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, workflows: { feature: { worker: claudeId }, refactoring: { worker: grokId } }, panels: { arena: [claudeId, grokId], extra: [grokId] } });
  let step = 0;
  await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (title.startsWith('Review pstack')) return step++ === 0 ? 'Edit a panel' : 'Save settings';
    if (title.startsWith('Choose panel')) return options.find(x => x.startsWith('arena runners'));
    if (title.startsWith('arena runners')) return step === 1 ? (step++, options.find(x => x.startsWith('Seat 2:'))) : 'Done editing panel';
    if (title.startsWith('Seat 2:')) return 'Change model';
    if (title.startsWith('Model for arena runners')) return options.find(x => x.startsWith('auto —'));
    return undefined;
  });
  const config = loadModels();
  assert.deepEqual(config.panels?.arena, [claudeId, 'auto']);
  assert.deepEqual(config.panels?.extra, [grokId]);
  assert.equal(config.workflows?.feature.worker, claudeId);
  assert.equal(config.workflows?.refactoring.worker, grokId);
}));

test('long model registries are paginated and the suggested judge pool is bounded', async () => withHome(async () => {
  const models = Array.from({ length: 30 }, (_, i) => ({ provider: 'p', id: `model-${String(i).padStart(2, '0')}`, reasoning: true, thinkingLevelMap: { xhigh: 'high' } }));
  let edit = true;
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (title.startsWith('Review pstack')) { if (edit) { edit = false; return 'Edit a role'; } return 'Save settings'; }
    if (title.startsWith('Choose role')) return options.find(x => x.startsWith('worker —'));
    if (title.startsWith('Model for worker')) return options.find(x => x === 'p/model-13') ?? 'Next page →';
    return undefined;
  }, models, models[0]);
  assert.equal(loadModels().roles.worker, 'p/model-13');
  assert((loadModels().panels?.['arena-judges']?.length ?? 0) <= 16);
  assert(result.titles.filter(t => t.startsWith('Model for worker')).length > 2);
  assert(result.optionLists.every(options => options.length <= 8));
}));

test('editing feature leaves a separately customized refactoring model untouched', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, workflows: { feature: { worker: claudeId }, refactoring: { worker: grokId } } });
  let edited = false;
  await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (title.startsWith('Review pstack')) { if (!edited) { edited = true; return 'Edit a task model'; } return 'Save settings'; }
    if (title.startsWith('Choose task model')) return options.find(x => x.startsWith('feature —'));
    if (title.startsWith('Model for feature')) return options.find(x => x.startsWith('auto —'));
    return undefined;
  });
  const config = loadModels();
  assert.equal(config.workflows?.feature.worker, 'auto');
  assert.equal(config.workflows?.refactoring.worker, grokId);
}));

test('availability is rechecked immediately before saving', async () => withHome(async home => {
  const models = [claude, grok];
  let attempted = false;
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (!attempted) { attempted = true; models.splice(0, models.length); return 'Save settings'; }
    return undefined;
  }, models, claude);
  assert(result.notices.some(notice => /Cannot save yet.*not available/.test(notice)));
  assert.throws(() => readFileSync(join(home, 'models.json'), 'utf8'), { code: 'ENOENT' });
  assert.equal(result.messages.length, 0);
}));

test('cancel, malformed input, and concurrent edits never overwrite existing settings', async () => withHome(async home => {
  const path = join(home, 'models.json');
  saveModels({ version: 1, thinkingLevel: 'off', roles: { worker: 'auto' } });
  const before = readFileSync(path, 'utf8');
  for (let stop = 1; stop <= 4; stop++) {
    const result = await setup((title, options, call) => {
      if (call === stop) return undefined;
      if (title.startsWith('Review pstack')) return 'Edit a role';
      return options[0];
    });
    assert.match(result.notices.at(-1)!, /cancelled/);
    assert.equal(readFileSync(path, 'utf8'), before);
    assert.equal(result.messages.length, 0);
  }
  writeFileSync(path, '{broken');
  const corrupt = await setup(save);
  assert.match(corrupt.notices.at(-1)!, /invalid JSON/);
  assert.equal(readFileSync(path, 'utf8'), '{broken');
  writeFileSync(path, before);
  const concurrent = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    writeFileSync(path, `${before} `);
    return 'Save settings';
  });
  assert.match(concurrent.notices.at(-1)!, /changed during setup/);
  assert.equal(readFileSync(path, 'utf8'), `${before} `);
  assert.equal(concurrent.messages.length, 0);
}));

test('no detected models permits parent aliases and does not start a model turn without a parent', async () => withHome(async () => {
  const result = await setup(save, [], null);
  assert(result.notices.some(notice => /No available Pi models detected/.test(notice)));
  assert.equal(loadModels().roles.worker, 'inherit-parent');
  assert.equal(result.messages.length, 0);
}));

test('pstack-runtime reports the manifest version instead of a hardcoded one', async () => {
  const commands = new Map<string, any>(), notices: string[] = [];
  extension({ registerCommand: (name: string, value: any) => commands.set(name, value), registerTool() {}, on() {}, sendUserMessage() {} } as any);
  await commands.get('pstack-runtime').handler('', { ui: { notify: (message: string) => notices.push(message) } });
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(notices[0]!, new RegExp(`^pi-pstack-native ${manifest.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`));
  assert.doesNotMatch(notices[0]!, /npm: 2333/);
});
