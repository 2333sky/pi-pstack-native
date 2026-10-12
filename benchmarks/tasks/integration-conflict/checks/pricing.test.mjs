import assert from "node:assert/strict";
import test from "node:test";
import { bulkThreshold, discount, tiers } from "../src/pricing.mjs";

test("the bulk intent survives integration", () => {
  assert.equal(discount(150, {}), 0.1);
  assert.equal(bulkThreshold(), 100);
});

test("the loyalty intent survives integration", () => {
  assert.equal(discount(5, { loyal: true }), 0.05);
});

test("loyalty keeps precedence over bulk", () => {
  assert.equal(discount(150, { loyal: true }), 0.05);
});

test("promo and standard are unchanged", () => {
  assert.equal(discount(25, {}), 0.02);
  assert.equal(discount(5, {}), 0);
});

test("the tier table carries every integrated tier", () => {
  assert.deepEqual(tiers(), { standard: 0, promo: 0.02, bulk: 0.1, loyalty: 0.05 });
});
