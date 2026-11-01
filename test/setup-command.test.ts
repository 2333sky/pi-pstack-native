import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExtensionSelectorComponent, initTheme } from '@earendil-works/pi-coding-agent';
import extension from '../src/extension.ts';
import { loadModels, saveModels } from '../src/runtime/config.ts';

const claude = { provider: 'anthropic', id: 'claude-opus-4', reasoning: true, thinkingLevelMap: { xhigh: 'high', max: 'high' } };
const grok = { provider: 'xai', id: 'grok-4', reasoning: true, thinkingLevelMap: { xhigh: 'high', max: 'high' } };
const claudeId = 'anthropic/claude-opus-4', grokId = 'xai/grok-4';
type Choose = (title: string, options: string[], call: number) => string | undefined;

async function setup(choose: Choose, models: any[] = [claude, grok], parent: any = claude) {
  const commands = new Map<string, any>(), messages: Array<{ text: string; options: any }> = [];
  extension({ registerCommand: (name: string, value: any) => commands.set(name, value), registerTool() {}, on() {}, sendUserMessage: (text: string, options: any) => messages.push({ text, options }) } as any);
  const notices: string[] = [], titles: string[] = [], optionLists: string[][] = [];
  const ctx = {
    hasUI: true, model: parent, scopedModels: [], isIdle: () => true,
    modelRegistry: { getAvailable: () => models, find: (provider: string, id: string) => models.find(m => m.provider === provider && m.id === id) },
    ui: { select: (title: string, options: string[]) => {
      titles.push(title); optionLists.push(options); assert(titles.length < 100, 'wizard must make progress');
      // Return a displayed value exactly as Pi does, including its Chinese text.
      const selected = choose(title, options, titles.length);
      if (selected !== undefined) assert(options.includes(selected), `selection must be a displayed option: ${selected}`);
      return selected;
    }, notify: (message: string) => notices.push(message) },
  };
  await commands.get('setup-pstack').handler('', ctx);
  return { notices, titles, optionLists, messages };
}
async function withHome(fn: (home: string) => Promise<void>) {
  const old = process.env.PSTACK_NATIVE_HOME, home = mkdtempSync(join(tmpdir(), 'pstack-setup-'));
  process.env.PSTACK_NATIVE_HOME = home;
  try { await fn(home); } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
}
function option(options: string[], prefix: string): string {
  const labels: Record<string, string> = {
    'Save settings': '保存设置', 'Next page →': '下一页 →', 'Advanced settings': '高级设置',
    'Back to review': '返回检查', 'Change fallback': '修改回退策略', 'Done editing panel': '完成面板编辑',
    'Change model': '更换模型', 'Seat 2:': '席位 2：',
    'unlimited —': '不限 —', 'large —': '大 —', 'medium —': '中 —', 'small —': '小 —',
  };
  const displayed = labels[prefix] ?? (prefix === 'feature —' ? '功能开发（feature）' : prefix);
  const found = options.find(value => value.startsWith(displayed));
  assert(found, `missing option ${prefix} in ${options.join(', ')}`);
  return found;
}
const save: Choose = (title, options) => title.startsWith('Child reasoning') ? options[0] : option(options, 'Save settings');

test('fresh setup offers the four upstream budgets and the complete editable role table in Chinese', async () => withHome(async () => {
  const seen: string[] = [];
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) {
      assert.match(title, /large matches upstream defaults/);
      assert.deepEqual(options.slice(0, 4), ['大 — xhigh 推理', '不限 — max 推理', '中 — high 推理', '小 — medium 推理']);
      assert(options.some(value => value.includes('取消配置')));
      return options[0];
    }
    seen.push(...options);
    return options.find(value => value.startsWith('下一页 →')) ?? option(options, 'Save settings');
  });
  for (const label of ['feature', 'refactoring', 'bug-fix', 'performance issue', 'hillclimb', 'judgment and prose', 'hardest tasks', 'how explorer', 'how explainer', 'why investigators', 'why synthesizer', 'reflect tooling', 'reflect judgment', 'reflect divergent', 'reflect synthesizer', 'arena runners', 'arena cross-judge pool', 'swarm workers', 'architect runners', 'interrogate reviewers']) {
    assert(seen.some(value => value.includes(`（${label}）`) && /[\u4e00-\u9fff]/.test(value)), label);
  }
  assert(seen.some(value => value.startsWith('功能开发（feature）') && value.includes(grokId)), 'show the effective model');
  assert(seen.includes('高级设置'));
  assert(result.titles.every(title => /[\u4e00-\u9fff]/.test(title)));
  assert.equal(loadModels().thinkingLevel, 'xhigh');
  assert.equal(loadModels().roles.worker, grokId);
  assert.deepEqual(loadModels().panels?.interrogate, [claudeId, grokId]);
  assert.match(result.notices.at(-1)!, /Saved pstack settings/);
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0]!.text, /existing harness.*not merely unit tests/);
  assert.match(result.messages[0]!.text, /ask and wait for the user's answer/);
  assert.match(result.messages[0]!.text, /create-formal-verification-skill/);
  assert.match(result.messages[0]!.text, /Chinese/);
  assert.equal(result.messages[0]!.options.expandPromptTemplates, true);
}));

test('each upstream budget saves its matching Pi reasoning level', async () => {
  for (const [label, level] of [['unlimited', 'max'], ['large', 'xhigh'], ['medium', 'high'], ['small', 'medium']]) {
    await withHome(async () => {
      await setup((title, options) => title.startsWith('Child reasoning') ? option(options, `${label} —`) : option(options, 'Save settings'));
      assert.equal(loadModels().thinkingLevel, level, label);
    });
  }
});

test('every setup role page fits Pi’s selector in an 80×24 terminal', async () => withHome(async () => {
  const original = Object.fromEntries(['isTTY', 'columns', 'rows'].map(key => [key, Object.getOwnPropertyDescriptor(process.stdout, key)]));
  for (const [key, value] of Object.entries({ isTTY: true, columns: 80, rows: 24 })) Object.defineProperty(process.stdout, key, { value, configurable: true });
  initTheme();
  const modelA = { provider: 'anthropic', id: `claude-${'a'.repeat(44)}`, reasoning: true, thinkingLevelMap: { xhigh: 'high' } };
  const modelB = { provider: 'xai', id: `grok-${'b'.repeat(44)}`, reasoning: true, thinkingLevelMap: { xhigh: 'high' } };
  const rendered: Array<{ title: string; lines: number }> = [];
  try {
    await setup((title, options) => {
      const selector = new ExtensionSelectorComponent(title, options, () => {}, () => {});
      const lines = selector.render(80).length;
      selector.dispose();
      rendered.push({ title, lines });
      assert(lines <= 24, `${title} rendered ${lines} lines in an 80×24 terminal`);
      if (title.startsWith('Child reasoning')) return options[0];
      return options.find(value => value === '下一页 →') ?? option(options, 'Save settings');
    }, [modelA, modelB], modelA);
    assert(rendered.filter(page => page.title.startsWith('Review pstack settings')).length > 1);
  } finally {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(process.stdout, key, descriptor);
      else delete (process.stdout as unknown as Record<string, unknown>)[key];
    }
  }
}));

test('rerun preserves a Pi-specific budget, custom mappings, panel order, and unknown metadata', async () => withHome(async home => {
  const path = join(home, 'models.json');
  writeFileSync(path, JSON.stringify({ version: 1, thinkingLevel: 'inherit-parent', fallbackPolicy: 'disabled', roles: { worker: 'auto', custom: grokId }, workflows: { feature: { worker: 'auto' }, custom: { worker: claudeId } }, panels: { arena: ['auto', claudeId], extra: [grokId] }, metadata: { keep: true } }));
  await setup((title, options) => {
    if (title.startsWith('Child reasoning')) { assert.match(title, /current: inherit-parent/); return option(options, 'inherit-parent —'); }
    return option(options, 'Save settings');
  });
  const config = loadModels();
  assert.equal(config.thinkingLevel, 'inherit-parent');
  assert.equal(config.roles.worker, 'auto');
  assert.deepEqual(config.panels?.arena, ['auto', claudeId]);
  assert.equal(config.workflows?.custom.worker, claudeId);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).metadata, { keep: true });
}));

test('editing feature directly leaves a separately customized refactoring model untouched', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, workflows: { feature: { worker: claudeId }, refactoring: { worker: grokId } } });
  let edited = false;
  await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (title.startsWith('Review pstack')) {
      if (!edited) { edited = true; return option(options, 'feature —'); }
      return option(options, 'Save settings');
    }
    if (title.startsWith('Model for feature')) return option(options, 'auto —');
    return undefined;
  });
  const config = loadModels();
  assert.equal(config.workflows?.feature.worker, 'auto');
  assert.equal(config.workflows?.refactoring.worker, grokId);
}));

test('reflect judgment shows the global judgment model when there is no task override', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: { judgment: grokId, reviewer: claudeId } });
  let row: string | undefined;
  await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    row ??= options.find(value => value.includes('（reflect judgment）'));
    return options.find(value => value === '下一页 →') ?? option(options, 'Save settings');
  });
  assert(row, 'reflect judgment must appear in the role table');
  assert(row.includes(grokId), `expected the configured judgment model: ${row}`);
  assert(!row.includes(claudeId), `must not show the reviewer model: ${row}`);
}));

test('a panel can be edited directly without changing unrelated mappings', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, workflows: { feature: { worker: claudeId }, refactoring: { worker: grokId } }, panels: { arena: [claudeId, grokId], extra: [grokId] } });
  let edited = false, seat = false;
  await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (title.startsWith('Review pstack')) {
      if (edited) return option(options, 'Save settings');
      const row = options.find(value => value.includes('（arena runners）'));
      if (row) { edited = true; return row; }
      return option(options, 'Next page →');
    }
    if (title.startsWith('arena runners')) { if (!seat) { seat = true; return option(options, 'Seat 2:'); } return option(options, 'Done editing panel'); }
    if (title.startsWith('Seat 2:')) return option(options, 'Change model');
    if (title.startsWith('Model for arena runners')) return option(options, 'auto —');
    return undefined;
  });
  const config = loadModels();
  assert.deepEqual(config.panels?.arena, [claudeId, 'auto']);
  assert.deepEqual(config.panels?.extra, [grokId]);
  assert.equal(config.workflows?.feature.worker, claudeId);
  assert.equal(config.workflows?.refactoring.worker, grokId);
}));

test('a panel with too few seats cannot be saved and can be repaired', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: {}, panels: { arena: [claudeId] } });
  let attempted = false, editing = false, added = false;
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (title.startsWith('Review pstack')) {
      if (!attempted) { attempted = true; return option(options, 'Save settings'); }
      if (added) return option(options, 'Save settings');
      const row = options.find(value => value.includes('（arena runners）'));
      if (row) { editing = true; return row; }
      return option(options, 'Next page →');
    }
    if (title.startsWith('arena runners') && editing) {
      if (!added) { added = true; return options.find(value => value === '添加席位'); }
      return option(options, 'Done editing panel');
    }
    if (title.startsWith('Add seat to arena runners')) return option(options, grokId);
    return undefined;
  });
  assert(result.notices.some(notice => /Cannot save yet.*arena runners needs 2–16 seats/.test(notice)));
  assert.deepEqual(loadModels().panels?.arena, [claudeId, grokId]);
}));

test('long model lists remain navigable when editing a role', async () => withHome(async () => {
  const models = Array.from({ length: 30 }, (_, i) => ({ provider: 'p', id: `model-${String(i).padStart(2, '0')}`, reasoning: true, thinkingLevelMap: { xhigh: 'high' } }));
  let edited = false;
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (title.startsWith('Review pstack')) { if (!edited) { edited = true; return option(options, 'feature —'); } return option(options, 'Save settings'); }
    if (title.startsWith('Model for feature')) return options.find(value => value === 'p/model-13') ?? option(options, 'Next page →');
    return undefined;
  }, models, models[0]);
  assert.equal(loadModels().workflows?.feature.worker, 'p/model-13');
  assert(result.titles.filter(title => title.startsWith('Model for feature')).length > 2);
  assert((loadModels().panels?.['arena-judges']?.length ?? 0) <= 16);
}));

test('advanced settings retain Pi-specific role and fallback controls', async () => withHome(async () => {
  let phase = 0;
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (title.startsWith('Review pstack')) return phase === 0 ? option(options, 'Advanced settings') : option(options, 'Save settings');
    if (title.startsWith('Advanced settings')) {
      if (phase === 0) { phase++; return option(options, 'Change fallback'); }
      return option(options, 'Back to review');
    }
    if (title.startsWith('Model fallback policy')) return option(options, 'same-family —');
    return undefined;
  });
  assert.equal(loadModels().fallbackPolicy, 'same-family');
  const advanced = result.optionLists[result.titles.findIndex(title => title.startsWith('Advanced settings'))]!;
  for (const label of ['编辑通用角色', '编辑任务模型', '编辑模型面板', '修改推理预算', '修改回退策略']) assert(advanced.includes(label), label);
}));

test('availability is checked again before saving', async () => withHome(async home => {
  const models = [claude, grok]; let attempted = false;
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (!attempted) { attempted = true; models.splice(0, models.length); return option(options, 'Save settings'); }
    return undefined;
  }, models);
  assert(result.notices.some(notice => /Cannot save yet.*not available/.test(notice)));
  assert.throws(() => readFileSync(join(home, 'models.json'), 'utf8'), { code: 'ENOENT' });
  assert.equal(result.messages.length, 0);
}));

test('an unavailable model blocks saving and can be repaired in the same wizard', async () => withHome(async () => {
  saveModels({ version: 1, thinkingLevel: 'inherit-parent', roles: { worker: 'old/missing' } });
  let attempted = false, repaired = false;
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) return options[0];
    if (title.startsWith('Review pstack')) {
      if (!attempted) { attempted = true; return option(options, 'Save settings'); }
      return repaired ? option(options, 'Save settings') : option(options, 'Advanced settings');
    }
    if (title.startsWith('Advanced settings')) return repaired ? option(options, 'Back to review') : option(options, '编辑通用角色');
    if (title.startsWith('Choose role')) return option(options, '执行开发（worker）');
    if (title.startsWith('Model for worker')) { repaired = true; return option(options, 'auto —'); }
    return undefined;
  });
  assert(result.notices.some(notice => /Cannot save yet.*not available/.test(notice)));
  assert.equal(loadModels().roles.worker, 'auto');
  assert.equal(result.messages.length, 1);
}));

test('unsupported reasoning can be corrected through advanced budget settings', async () => withHome(async () => {
  const basic = { provider: 'a', id: 'basic', reasoning: false };
  let attempted = false, changed = false;
  const result = await setup((title, options) => {
    if (title.startsWith('Child reasoning')) {
      if (!attempted) return option(options, 'unlimited —');
      return options.find(value => value.startsWith('off —')) ?? option(options, 'Next page →');
    }
    if (title.startsWith('Review pstack')) {
      if (!attempted) { attempted = true; return option(options, 'Save settings'); }
      return changed ? option(options, 'Save settings') : option(options, 'Advanced settings');
    }
    if (title.startsWith('Advanced settings')) {
      if (!changed) { changed = true; return option(options, '修改推理预算'); }
      return option(options, 'Back to review');
    }
    return undefined;
  }, [basic], basic);
  assert(result.notices.some(notice => /does not support max/.test(notice)));
  assert.equal(loadModels().thinkingLevel, 'off');
  assert.equal(loadModels().roles.worker, 'a/basic');
}));

test('without detected models setup keeps parent aliases and does not start a follow-up', async () => withHome(async () => {
  const result = await setup(save, [], null);
  assert(result.notices.some(notice => /No available Pi models detected/.test(notice)));
  assert.equal(loadModels().roles.worker, 'inherit-parent');
  assert.equal(result.messages.length, 0);
}));

test('cancel, malformed input, and concurrent edits never overwrite existing settings', async () => withHome(async home => {
  const path = join(home, 'models.json');
  saveModels({ version: 1, thinkingLevel: 'off', roles: { worker: 'auto' } });
  const before = readFileSync(path, 'utf8');
  for (let stop = 1; stop <= 3; stop++) {
    const result = await setup((title, options, call) => {
      if (call === stop) return undefined;
      if (title.startsWith('Review pstack')) return option(options, 'feature —');
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
    return option(options, 'Save settings');
  });
  assert.match(concurrent.notices.at(-1)!, /changed during setup/);
  assert.equal(readFileSync(path, 'utf8'), `${before} `);
  assert.equal(concurrent.messages.length, 0);
}));

test('pstack-runtime reports the manifest version', async () => {
  const commands = new Map<string, any>(), notices: string[] = [];
  extension({ registerCommand: (name: string, value: any) => commands.set(name, value), registerTool() {}, on() {}, sendUserMessage() {} } as any);
  await commands.get('pstack-runtime').handler('', { ui: { notify: (message: string) => notices.push(message) } });
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(notices[0]!, new RegExp(`^pi-pstack-native ${manifest.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`));
});
