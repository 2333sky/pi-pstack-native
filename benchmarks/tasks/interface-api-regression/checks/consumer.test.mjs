import assert from "node:assert/strict";
import test from "node:test";
import { count } from "../src/api.mjs";
import { page, total } from "../src/consumer.mjs";

const records = [
  { id: 1, active: true },
  { id: 2, active: false },
  { id: 3, active: true },
  { id: 4, active: true },
];

test("page honours the requested limit", () => {
  assert.deepEqual(page(records, 1).map((record) => record.id), [1]);
  assert.deepEqual(page(records, 2).map((record) => record.id), [1, 3]);
});

test("an unlimited consumer still sees every active record", () => {
  assert.equal(total(records), 3);
  assert.equal(count(records), 3);
});

test("an unknown limit falls back to every active record", () => {
  assert.equal(page(records, undefined).length, 3);
});
