import assert from "node:assert/strict";
import test from "node:test";
import { assertCompatibleIsolation } from "../src/agent/isolation.ts";
import { getProfile } from "../src/agent/profiles.ts";

test("writable profiles cannot bypass locks via readonly isolation", () => {
  for (const name of ["worker", "architect", "poteto-agent", "integrator"]) {
    assert.throws(() => assertCompatibleIsolation(getProfile(name), "readonly"), /cannot use readonly isolation/);
  }
  assert.doesNotThrow(() => assertCompatibleIsolation(getProfile("worker"), "shared"));
  assert.doesNotThrow(() => assertCompatibleIsolation(getProfile("worker"), "worktree"));
});

test("integrators only write to the parent checkout; all read-only profiles exclude mutation-capable tools", () => {
  assert.throws(() => assertCompatibleIsolation(getProfile("integrator"), "worktree"), /must use shared isolation/);
  for (const name of ["reviewer", "verifier", "scout", "synthesizer", "comment-sicko"]) {
    const profile = getProfile(name);
    assert.equal(profile.writable, false);
    assert.deepEqual(profile.tools.filter((tool) => ["bash", "write", "edit", "pstack_agents", "pstack_workflow"].includes(tool)), []);
  }
});
