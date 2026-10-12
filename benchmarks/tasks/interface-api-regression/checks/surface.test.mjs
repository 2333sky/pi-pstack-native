import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as api from "../src/api.mjs";

const root = join(import.meta.dirname, "..");

test("the public surface matches the recorded interface", () => {
  const recorded = JSON.parse(readFileSync(join(root, "api-surface.json"), "utf8"));
  const actual = Object.fromEntries(Object.entries(api).filter(([, value]) => typeof value === "function").map(([name, fn]) => [name, fn.length]));
  assert.deepEqual(actual, recorded);
});
