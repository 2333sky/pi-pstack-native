import assert from "node:assert/strict";
import test from "node:test";
import { summarize } from "../src/report.mjs";

const rows = [
  { customer: "a", amount: 3 },
  { customer: "b", amount: 4 },
  { customer: "a", amount: 5 },
];

test("summarize reports the row count and the total", () => {
  const summary = summarize(rows);
  assert.equal(summary.count, 3);
  assert.equal(summary.total, 12);
  assert.deepEqual(summary.rows, rows);
});

test("an empty report totals zero", () => {
  assert.equal(summarize([]).total, 0);
});
