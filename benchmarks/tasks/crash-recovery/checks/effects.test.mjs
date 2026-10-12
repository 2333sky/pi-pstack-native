import assert from "node:assert/strict";
import test from "node:test";
import { effects } from "../src/effects.mjs";

test("the resumed effect is recorded exactly once", () => {
  assert.deepEqual(effects().filter((id) => id === "resume"), ["resume"]);
});

test("the completed effect from before the crash is still recorded once", () => {
  assert.deepEqual(effects().filter((id) => id === "harden"), ["harden"]);
});
