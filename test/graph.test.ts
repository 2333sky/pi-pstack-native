import test from "node:test";
import assert from "node:assert/strict";
import { chainNodes, downstreamKeys, validateGraph } from "../src/workflow/graph.ts";

test("validateGraph accepts a DAG and chainNodes orders dependencies", () => {
  const nodes = chainNodes([
    { key: "a", task: "A" },
    { key: "b", task: "B" },
    { key: "c", task: "C" },
  ]);
  validateGraph(nodes);
  assert.deepEqual(nodes.map((n) => n.dependsOn), [[], ["a"], ["b"]]);
  assert.deepEqual([...downstreamKeys(Object.fromEntries(nodes.map((n) => [n.key, { dependsOn: n.dependsOn ?? [] }])), "a")].sort(), ["b", "c"]);
});

test("validateGraph rejects missing dependencies, duplicates, and cycles", () => {
  assert.throws(() => validateGraph([{ key: "a", task: "x", dependsOn: ["missing"] }]), /unknown node/);
  assert.throws(() => validateGraph([{ key: "a", task: "x" }, { key: "a", task: "y" }]), /Duplicate/);
  assert.throws(() => validateGraph([
    { key: "a", task: "x", dependsOn: ["b"] },
    { key: "b", task: "y", dependsOn: ["a"] },
  ]), /cycle/);
});
