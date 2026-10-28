import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadModels, saveModels } from "../src/runtime/config.ts";
import { resolveRoleModel, selectJudgeFromPool } from "../src/models/router.ts";

async function withHome(fn: () => void | Promise<void>) {
  const old = process.env.PSTACK_NATIVE_HOME;
  const dir = mkdtempSync(join(process.cwd(), ".pstack-model-"));
  process.env.PSTACK_NATIVE_HOME = dir;
  try { await fn(); } finally {
    if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old;
    rmSync(dir, { recursive: true, force: true });
  }
}

function ctx(model: any, available: any[] = [model], thinkingLevel: any = "high"): any {
  return {
    model,
    thinkingLevel,
    modelRegistry: {
      find: (provider: string, id: string) => available.find((m) => m.provider === provider && m.id === id),
      getAvailable: () => available,
    },
    scopedModels: [],
  };
}

test("model routing inherits parent model and reasoning by default", async () => withHome(() => {
  const parent = { provider: "test", id: "reasoner", reasoning: true, thinkingLevelMap: { high: "high" } };
  const resolved = resolveRoleModel(ctx(parent), "worker");
  assert.equal(resolved.model, parent);
  assert.equal(resolved.thinkingLevel, "high");
}));

test("explicit child reasoning fails closed when the resolved model cannot support it", async () => withHome(() => {
  const parent = { provider: "test", id: "reasoner", reasoning: true, thinkingLevelMap: { high: "high" } };
  const cheap = { provider: "test", id: "cheap", reasoning: false };
  saveModels({ version: 1, roles: { worker: "test/cheap" }, thinkingLevel: "high" });
  assert.throws(() => resolveRoleModel(ctx(parent, [parent, cheap]), "worker"), /not supported/);
}));

test("explicit xhigh requires the selected model to advertise an xhigh mapping", async () => withHome(() => {
  const parent = { provider: "test", id: "parent", reasoning: true, thinkingLevelMap: { high: "high" } };
  const noX = { provider: "test", id: "no-x", reasoning: true, thinkingLevelMap: { high: "high" } };
  saveModels({ version: 1, roles: { worker: "test/no-x" }, thinkingLevel: "xhigh" });
  assert.throws(() => resolveRoleModel(ctx(parent, [parent, noX]), "worker"), /not supported/);

  const yesX = { provider: "test", id: "yes-x", reasoning: true, thinkingLevelMap: { high: "high", xhigh: "xhigh" } };
  saveModels({ version: 1, roles: { worker: "test/yes-x" }, thinkingLevel: "xhigh" });
  const resolved = resolveRoleModel(ctx(parent, [parent, yesX]), "worker");
  assert.equal(resolved.model, yesX);
  assert.equal(resolved.thinkingLevel, "xhigh");
}));

test("inherit-parent reasoning delegates model-specific clamping to Pi instead of rejecting a cheaper role model", async () => withHome(() => {
  const parent = { provider: "test", id: "reasoner", reasoning: true, thinkingLevelMap: { high: "high" } };
  const cheap = { provider: "test", id: "cheap", reasoning: false };
  saveModels({ version: 1, roles: { worker: "test/cheap" }, thinkingLevel: "inherit-parent" });
  const resolved = resolveRoleModel(ctx(parent, [parent, cheap], "high"), "worker");
  assert.equal(resolved.model, cheap);
  assert.equal(resolved.thinkingLevel, "high");
}));

test("invalid configured reasoning fails before model routing, while absent values keep the default", async () => withHome(() => {
  const file = join(process.env.PSTACK_NATIVE_HOME!, "models.json");
  for (const value of ["ultra", "", null, 42, false]) {
    writeFileSync(file, JSON.stringify({ version: 1, roles: {}, thinkingLevel: value }));
    assert.throws(() => loadModels(), /Invalid thinkingLevel.*edit it/);
    assert.throws(() => resolveRoleModel(ctx({ provider: "test", id: "reasoner", reasoning: true }), "worker"), /Invalid thinkingLevel/);
  }
  writeFileSync(file, JSON.stringify({ version: 1, roles: {} }));
  assert.equal(loadModels().thinkingLevel, "inherit-parent");
}));

test("same-family fallback reports the selected model and nearest supported reasoning", async () => withHome(() => {
  const parent = { provider: 'provider', id: 'parent', reasoning: true };
  const similar = { provider: 'provider', id: 'claude-opus-4', reasoning: true, thinkingLevelMap: { xhigh: 'xhigh', max: null } };
  const other = { provider: 'provider', id: 'claude-sonnet-4', reasoning: true, thinkingLevelMap: { max: 'max' } };
  const elsewhere = { provider: 'other', id: 'claude-opus-5', reasoning: true, thinkingLevelMap: { max: 'max' } };
  saveModels({ version: 1, roles: { worker: 'provider/claude-opus-5' }, thinkingLevel: 'max', fallbackPolicy: 'same-family' });
  const resolved = resolveRoleModel(ctx(parent, [parent, similar, other, elsewhere]), 'worker');
  assert.equal(resolved.model, similar);
  assert.equal(resolved.thinkingLevel, 'xhigh');
  assert.equal(resolved.requestedSelector, 'provider/claude-opus-5');
  assert.equal(resolved.notes.length, 2);
  assert.match(resolved.notes[0]!, /using same-family provider\/claude-opus-4/);
  assert.match(resolved.notes[1]!, /using xhigh/);
}));

test("fallback does not guess unknown families, cross providers or silently disable reasoning", async () => withHome(() => {
  const parent = { provider: 'provider', id: 'parent', reasoning: true };
  const elsewhere = { provider: 'other', id: 'claude-opus-4', reasoning: true };
  const basic = { provider: 'provider', id: 'claude-opus-basic', reasoning: false };
  saveModels({ version: 1, roles: { worker: 'provider/unknown-model' }, thinkingLevel: 'high', fallbackPolicy: 'same-family' });
  assert.throws(() => resolveRoleModel(ctx(parent, [parent, elsewhere]), 'worker'), /not available/);
  saveModels({ version: 1, roles: { worker: 'provider/claude-opus-5' }, thinkingLevel: 'high', fallbackPolicy: 'same-family' });
  assert.throws(() => resolveRoleModel(ctx(parent, [parent, elsewhere]), 'worker'), /not available/);
  assert.throws(() => resolveRoleModel(ctx(parent, [parent, basic]), 'worker'), /not supported/);
  saveModels({ version: 1, roles: { worker: 'provider/claude-opus-5' }, thinkingLevel: 'high', fallbackPolicy: 'disabled' });
  assert.throws(() => resolveRoleModel(ctx(parent, [parent, basic]), 'worker'), /not available/);
}));

test("judge pool prefers a recognized family different from the parent and reports rejected seats", async () => withHome(() => {
  const parent = { provider: 'provider', id: 'claude-opus-5', reasoning: true };
  const same = { provider: 'provider', id: 'claude-sonnet-5', reasoning: true };
  const different = { provider: 'provider', id: 'grok-4', reasoning: true };
  saveModels({ version: 1, roles: {}, thinkingLevel: 'inherit-parent', fallbackPolicy: 'disabled' });
  const selected = selectJudgeFromPool(ctx(parent, [parent, same, different]), ['provider/not-registered', 'provider/claude-sonnet-5', 'provider/grok-4']);
  assert.equal(selected.model, 'provider/grok-4');
  assert(selected.notes.some(note => note.includes('not-registered') && note.includes('unavailable')));
}));
