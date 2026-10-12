import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { factor, modules } from "../src/index.mjs";

const dir = join(import.meta.dirname, "../src/modules");

test("every module is present", () => {
  assert.equal(readdirSync(dir).filter((name) => name.endsWith(".mjs")).length, modules.length);
});

test("every module scales linearly by the shared factor", async () => {
  for (const name of modules) {
    const mod = await import(join(dir, `${name}.mjs`));
    assert.equal(mod.scale(1), factor, name);
    assert.equal(mod.scale(-3), -3 * factor, name);
  }
});

test("the module index matches the files on disk", () => {
  assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".mjs")).map((name) => name.replace(".mjs", "")).sort(), [...modules].sort());
});
