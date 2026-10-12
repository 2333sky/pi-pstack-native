import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../src/cli.mjs";

test("--list prints every unit", () => {
  assert.equal(run(["--list"]), "km\nmi\nnmi");
});

test("--unit nmi formats through the shared formatter", () => {
  assert.equal(run(["--unit", "nmi", "3704"]), "2.00 nmi");
});

test("an unknown unit is rejected", () => {
  assert.equal(run(["--unit", "furlong", "1"]), "unknown unit furlong");
});
