import assert from "node:assert/strict";
import test from "node:test";
import { formatDistance } from "../src/format.mjs";
import { toMeters, unitFactor, units } from "../src/units.mjs";

test("nautical miles convert with the exact factor", () => {
  assert.equal(unitFactor("nmi"), 1852);
  assert.equal(toMeters(2, "nmi"), 3704);
});

test("existing factors are unchanged", () => {
  assert.equal(toMeters(1, "km"), 1000);
  assert.equal(toMeters(1, "mi"), 1609.344);
});

test("nautical miles render through the shared formatter", () => {
  assert.equal(formatDistance(1852, "nmi"), "1.00 nmi");
});

test("unknown units still fail", () => {
  assert.throws(() => unitFactor("furlong"));
});

test("the unit list carries all three units", () => {
  assert.deepEqual(units().sort(), ["km", "mi", "nmi"]);
});
