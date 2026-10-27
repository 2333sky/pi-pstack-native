import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension from "../src/extension.ts";
import { loadModels, saveModels } from "../src/runtime/config.ts";

async function runSetup(select: (title: string, options: string[]) => string | undefined) {
  const commands = new Map<string, any>();
  const pi = { registerCommand: (name: string, command: any) => commands.set(name, command), registerTool() {}, on() {} };
  extension(pi as any);
  const notifications: string[] = [];
  const ctx = { hasUI: true, scopedModels: [], modelRegistry: { getAvailable: () => [{ provider: "example", id: "model — special" }] }, ui: { select, notify: (message: string) => notifications.push(message) } };
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
        return options.find((value) => value.startsWith("high — "));
      }
      assert.equal(options.length, 3);
      assert.match(options[0], /parent session's model/);
      assert.match(options[1], /parent session's model/);
      return titles.length === 2 ? options[2] : options[0];
    });
    assert.equal(titles.length, 10);
    assert.match(titles[1], /worker — implementation/);
    assert.match(titles[9], /comment-sicko — comment and workaround review/);
    const saved = loadModels();
    assert.equal(saved.thinkingLevel, "high");
    assert.equal(saved.roles.worker, "example/model — special");
    assert.equal(saved.roles.architect, "inherit-parent");
    assert.deepEqual(saved.panels, { arena: ["example/model"] });
    assert.deepEqual(saved.workflows, { feature: { worker: "example/model" } });
    assert.match(notifications.at(-1)!, /Saved/);
  } finally { if (old === undefined) delete process.env.PSTACK_NATIVE_HOME; else process.env.PSTACK_NATIVE_HOME = old; rmSync(home, { recursive: true, force: true }); }
});

test("cancelling any setup prompt or returning an unknown label never writes config", async () => {
  const old = process.env.PSTACK_NATIVE_HOME;
  const home = mkdtempSync(join(tmpdir(), "pstack-setup-"));
  process.env.PSTACK_NATIVE_HOME = home;
  try {
    saveModels({ version: 1, roles: { worker: "auto" }, thinkingLevel: "off", panels: { arena: ["a/b"] } });
    const before = readFileSync(join(home, "models.json"), "utf8");
    for (let stop = 1; stop <= 10; stop++) {
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
