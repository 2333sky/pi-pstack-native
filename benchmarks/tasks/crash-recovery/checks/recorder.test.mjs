import assert from "node:assert/strict";
import test from "node:test";
import { effects, record } from "../src/effects.mjs";

test("recording the same effect twice appends it once", () => {
  record("probe");
  record("probe");
  assert.deepEqual(effects().filter((id) => id === "probe"), ["probe"]);
});
