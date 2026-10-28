import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension from "../src/extension.ts";
import { loadModels, saveModels } from "../src/runtime/config.ts";

async function runSetup(select: (title: string, options: string[]) => string | undefined, model: any = { provider: "example", id: "model — special", reasoning: true }, available: any[] = [model]) {
  const commands = new Map<string, any>();
  const pi = { registerCommand: (name: string, command: any) => commands.set(name, command), registerTool() {}, on() {} };
  extension(pi as any);
  const notifications: string[] = [];
  const ctx = { hasUI: true, model, scopedModels: [], modelRegistry: { getAvailable: () => available, find: (provider: string, id: string) => available.find((m) => provider === m.provider && id === m.id) }, ui: { select, notify: (message: string) => notifications.push(message) } };
  await commands.get("setup-pstack").handler("", ctx);
  return notifications;
}

test("setup describes each choice, saves exact values and preserves panels and workflows", async () => {
  const old = process.env.PSTACK_NATIVE_HOME;
  const home = mkdtempSync(join(tmpdir(), "pstack-setup-"));
  process.env.PSTACK_NATIVE_HOME = home;
  try {
    saveModels({ version: 1, roles: { worker: "auto" }, thinkingLevel: "off", panels: { arena: ["example/model"] }, workflows: { feature: { worker: "example/model" } } });
    const titles: string[] = [];
    const notifications = await runSetup((title, options) => {
      titles.push(title);
      if (titles.length === 1) {
        assert.equal(options.length, 8);
        assert.ok(options.every((value) => value.includes(" — ")));
        return options.find((value) => value.startsWith("medium budget — "));
      }
      if (titles.length === 2) return options.find((value) => value.startsWith('disabled — '));
      if (titles.length > 11) return options[0];
      assert.equal(options.length, 3);
      assert.match(options[0], /parent session's model/);
      assert.match(options[1], /parent session's model/);
      return titles.length === 3 ? options[2] : options[0];
    });
    assert.equal(titles.length, 16);
    assert.match(titles[2], /worker — implementation/);
    assert.match(titles[10], /comment-sicko — comment and workaround review/);
    const saved = loadModels();
    assert.equal(saved.thinkingLevel, "high");
    assert.equal(saved.roles.worker, "example/model — special");
    assert.equal(saved.roles.architect, "inherit-parent");
    assert.deepEqual(saved.panels, { arena: ["example/model"] });
    assert.deepEqual(saved.workflows, { feature: { worker: "example/model" } });
    assert.match(notifications.at(-1)!, /Saved/);
  } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
});

test("setup rejects an unsupported model and lets the user choose a compatible replacement", async () => {
  const old = process.env.PSTACK_NATIVE_HOME;
  const home = mkdtempSync(join(tmpdir(), "pstack-setup-"));
  process.env.PSTACK_NATIVE_HOME = home;
  try {
    const basic = { provider: "example", id: "basic", reasoning: false };
    const capable = { provider: "example", id: "reasoner", reasoning: true, thinkingLevelMap: { max: "max" } };
    let calls = 0;
    const notices = await runSetup((_title, choices) => {
      calls++;
      if (calls === 1) return choices.find((x) => x.startsWith("unlimited — "));
      if (calls === 2) return choices.find((x) => x.startsWith('disabled — '));
      if (calls === 3) return choices.find((x) => x.startsWith("example/basic — "));
      if (choices.length === 2) return choices[0];
      return choices.find((x) => x.startsWith("example/reasoner — "));
    }, basic, [basic, capable]);
    assert.match(notices[0], /does not support max/);
    assert.match(notices.at(-1)!, /Saved/);
    assert.equal(loadModels().thinkingLevel, "max");
    assert.equal(loadModels().roles.worker, "example/reasoner");
  } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
});

test("setup handles a missing parent model and can be cancelled without writing", async () => {
  const old = process.env.PSTACK_NATIVE_HOME;
  const home = mkdtempSync(join(tmpdir(), "pstack-setup-"));
  process.env.PSTACK_NATIVE_HOME = home;
  try {
    let calls = 0;
    const notices = await runSetup((_title, choices) => {
      calls++;
      if (calls === 1) return choices.find((x) => x.startsWith("off — "));
      if (calls === 2) return choices[0];
      if (calls === 3) return choices[1];
      return undefined;
    }, null, []);
    assert.match(notices[0], /No parent model available/);
    assert.match(notices.at(-1)!, /cancelled/);
    assert.equal(loadModels().thinkingLevel, "inherit-parent");
  } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
});

test("cancelling any setup prompt or returning an unknown label never writes config", async () => {
  const old = process.env.PSTACK_NATIVE_HOME;
  const home = mkdtempSync(join(tmpdir(), "pstack-setup-"));
  process.env.PSTACK_NATIVE_HOME = home;
  try {
    saveModels({ version: 1, roles: { worker: "auto" }, thinkingLevel: "off", panels: { arena: ["a/b"] } });
    const before = readFileSync(join(home, "models.json"), "utf8");
    for (let stop = 1; stop <= 16; stop++) {
      let count = 0;
      const notices = await runSetup((_title, choices) => ++count === stop ? undefined : choices[0]);
      assert.match(notices.at(-1)!, /cancelled/);
      assert.equal(readFileSync(join(home, "models.json"), "utf8"), before);
    }
    for (const stop of [1, 2]) {
      let count = 0;
      const notices = await runSetup((_title, choices) => ++count === stop ? "unexpected label" : choices[0]);
      assert.match(notices.at(-1)!, /Invalid/);
      assert.equal(readFileSync(join(home, "models.json"), "utf8"), before);
    }
  } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
});

test("setup records multiple seats per panel and cancellation leaves all settings unchanged", async () => {
  const old = process.env.PSTACK_NATIVE_HOME;
  const home = mkdtempSync(join(tmpdir(), "pstack-setup-panels-"));
  process.env.PSTACK_NATIVE_HOME = home;
  const a = { provider: "a", id: "one", reasoning: true };
  const b = { provider: "b", id: "two", reasoning: true };
  try {
    let prompt = 0;
    const notices = await runSetup((title, options) => {
      prompt++;
      if (prompt <= 11) return options[0];
      if (title === 'Task-specific model overrides') return options[0];
      if (!title.includes(': seat ')) return options[1];
      if (title.includes('seat 1;')) return options.find(x => x.startsWith('a/one — '));
      if (title.includes('seat 2;')) return options.find(x => x.startsWith('b/two — '));
      return options[0];
    }, a, [a, b]);
    assert.match(notices.at(-1)!, /Saved/);
    assert.deepEqual(loadModels().panels, {
      arena: ['a/one', 'b/two'], 'arena-judges': ['a/one', 'b/two'],
      architect: ['a/one', 'b/two'], interrogate: ['a/one', 'b/two'],
    });
    const before = readFileSync(join(home, 'models.json'), 'utf8');
    let count = 0;
    const cancelled = await runSetup((title, options) => {
      count++;
      if (title.includes(': seat 2;')) return undefined;
      if (count <= 11) return options[0];
      if (title === 'Task-specific model overrides') return options[0];
      return title.includes(': seat ') ? options[1] : options[1];
    }, a, [a, b]);
    assert.match(cancelled.at(-1)!, /cancelled/);
    assert.equal(readFileSync(join(home, 'models.json'), 'utf8'), before);
  } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
});

test("setup configures task-specific overrides while retaining unrelated mappings", async () => {
  const old = process.env.PSTACK_NATIVE_HOME;
  const home = mkdtempSync(join(tmpdir(), "pstack-setup-tasks-"));
  process.env.PSTACK_NATIVE_HOME = home;
  const a = { provider: "a", id: "one", reasoning: true };
  const b = { provider: "b", id: "two", reasoning: true };
  try {
    saveModels({ version: 1, roles: {}, thinkingLevel: 'inherit-parent', workflows: { custom: { reviewer: 'a/one' } } });
    let prompt = 0;
    const notices = await runSetup((title, options) => {
      prompt++;
      if (prompt <= 11) return options[0];
      if (title === 'Task-specific model overrides') return options[1];
      if (title.startsWith('feature and refactoring') || title.startsWith('swarm worker')) return options.find(x => x.startsWith('b/two — '));
      return options[0];
    }, a, [a, b]);
    assert.match(notices.at(-1)!, /Saved/);
    assert.deepEqual(loadModels().workflows, { custom: { reviewer: 'a/one' }, feature: { worker: 'b/two' }, refactoring: { worker: 'b/two' }, swarm: { worker: 'b/two' } });
  } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
});

test("setup reports a supported lower reasoning level when family fallback is selected", async () => {
  const old = process.env.PSTACK_NATIVE_HOME;
  const home = mkdtempSync(join(tmpdir(), "pstack-setup-fallback-"));
  process.env.PSTACK_NATIVE_HOME = home;
  const model = { provider: 'a', id: 'claude-opus', reasoning: true, thinkingLevelMap: { max: null, xhigh: 'xhigh' } };
  try {
    const notices = await runSetup((title, options) => {
      if (title.startsWith('child reasoning budget')) return options.find(x => x.startsWith('unlimited — '));
      if (title.startsWith('model fallback policy')) return options.find(x => x.startsWith('same-family — '));
      if (options.length === 2) return options[0];
      return options.find(x => x.startsWith('a/claude-opus — '));
    }, model, [model]);
    assert(notices.some(message => /will use xhigh reasoning/.test(message)));
    assert.equal(loadModels().fallbackPolicy, 'same-family');
    assert.match(notices.at(-1)!, /Saved/);
  } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
});
