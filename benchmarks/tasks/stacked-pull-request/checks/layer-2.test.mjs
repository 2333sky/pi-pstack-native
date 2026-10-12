import assert from "node:assert/strict";
import test from "node:test";
import { byCustomer, summarize } from "../src/report.mjs";

const rows = [
  { customer: "a", amount: 3 },
  { customer: "b", amount: 4 },
  { customer: "a", amount: 5 },
];

test("the totals layer still works after the grouping layer lands", () => {
  assert.equal(summarize(rows).total, 12);
});

test("byCustomer groups and sums per customer", () => {
  assert.deepEqual(byCustomer(rows), { a: 8, b: 4 });
});

test("grouping an empty report yields no groups", () => {
  assert.deepEqual(byCustomer([]), {});
});
