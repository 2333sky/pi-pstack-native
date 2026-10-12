import assert from "node:assert/strict";
import test from "node:test";
import { toCsv } from "../src/csv.mjs";
import { byCustomer, summarize } from "../src/report.mjs";

const rows = [
  { customer: "b", amount: 4 },
  { customer: "a", amount: 3 },
  { customer: "a", amount: 5 },
];

test("the earlier layers still work after the export layer lands", () => {
  assert.equal(summarize(rows).total, 12);
  assert.deepEqual(byCustomer(rows), { a: 8, b: 4 });
});

test("toCsv exports per customer totals and the overall total", () => {
  assert.equal(toCsv(rows), "customer,total\na,8\nb,4\nall,12");
});
