import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { factor, modules } from "../src/index.mjs";

const dir = join(import.meta.dirname, "../src/modules");

test("no module adds a constant after scaling", async () => {
  for (const name of modules) {
    const mod = await import(join(dir, `${name}.mjs`));
    assert.equal(mod.scale(0), 0, name);
    assert.equal(mod.scale(1000000), 1000000 * factor, name);
  }
});

test("the anomalous module is not the only one repaired", async () => {
  const mod = await import(join(dir, "mod-017.mjs"));
  assert.equal(mod.scale(3), 3 * factor);
});
