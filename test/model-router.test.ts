import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadModels, saveModels } from "../src/runtime/config.ts";
import { resolveRoleModel } from "../src/models/router.ts";

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
