import assert from "node:assert/strict";
import test from "node:test";
import { effects } from "../src/effects.mjs";
import { QUEUE } from "../src/queue.mjs";

test("no effect id is recorded twice", () => {
  const ids = effects();
  assert.deepEqual(ids, [...new Set(ids)]);
});

test("the committed queue order is preserved", () => {
  const recorded = effects().filter((id) => QUEUE.includes(id));
  assert.deepEqual(recorded, QUEUE);
});
