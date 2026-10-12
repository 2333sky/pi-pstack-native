import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { loadSkillsFromDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const body = "## Why\nReview a small change.\n## What changed\nAdd a check.\n## Scope\nOnly the check. No runtime change.\n## Blast Radius\nRepository checks only.\n## Verification\nThe fixture passed.\n";
const state = { isDraft: false, base: "feature/root", parentBranch: "feature/root", trunk: "main", babysit: false, phaseComplete: false, ownerFullAutonomy: false };
const validate = async (text, snapshot = state) => (await import("./validate-pr.mjs")).validatePR(text, snapshot);

test("ketchup loads with valid Pi frontmatter and required sections", () => {
  const source = read("skills/ketchup/SKILL.md");
  const { frontmatter } = parseFrontmatter(source);
  assert.equal(frontmatter.name, "ketchup");
  assert.equal(typeof frontmatter.description, "string");
  assert.ok(frontmatter.description.length > 0);
  assert.equal(frontmatter["disable-model-invocation"], true);
  const result = loadSkillsFromDir({ dir: resolve("skills/ketchup"), source: "path" });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.skills.map((skill) => skill.name), ["ketchup"]);
  for (const section of ["Find the cutoff", "Gather what changed", "Write the reply"]) {
    assert.ok(source.includes(`## ${section}`), `missing ketchup section ${section}`);
  }
  for (const rule of ["last user-authored message", "Notifications", "subagent completion", "read-only", "only the user", "out of context"]) {
    assert.ok(source.includes(rule), `missing ketchup rule ${rule}`);
  }
});

test("opening and babysit document ready stacked PRs and deferred handoff", () => {
  const opening = read("skills/poteto-mode/playbooks/opening-a-pr.md");
  for (const heading of ["Why", "What changed", "Scope", "Tradeoffs", "Blast Radius", "Verification"]) {
    assert.ok(opening.includes(`## ${heading}`), `missing PR heading ${heading}`);
  }
  for (const rule of ["ready, never as a draft", "parent branch", "built-in PR tool", "phase or stack", "full-autonomy", "GitHub API", "explicit authorization"]) {
    assert.ok(opening.includes(rule), `missing opening rule ${rule}`);
  }
  const babysit = read("skills/poteto-mode/playbooks/babysit.md");
  assert.ok(babysit.includes("Opening a PR does not start a babysit"));
  assert.ok(babysit.includes("full-autonomy"));
});

test("ready child targets its parent and waits for phase completion", async () => {
  assert.deepEqual(await validate(body), []);
  assert.deepEqual(await validate(body, { ...state, parentBranch: null, base: "main" }), []);
  assert.deepEqual(await validate(body, { ...state, babysit: true, phaseComplete: true }), []);
  assert.deepEqual(await validate(body, { ...state, babysit: true, ownerFullAutonomy: true }), []);
});

test("reject a draft PR", async () => {
  assert.deepEqual(await validate(body, { ...state, isDraft: true }), ["PR must be ready, not draft"]);
});

test("reject a child with the wrong base", async () => {
  assert.deepEqual(await validate(body, { ...state, base: "main" }), ["PR base must be feature/root"]);
});

test("reject premature babysit", async () => {
  assert.deepEqual(await validate(body, { ...state, babysit: true }), ["babysit must wait for phase or stack completion"]);
});

test("reject missing Scope or Verification", async () => {
  for (const heading of ["Scope", "Verification"]) {
    const incomplete = body.replace(new RegExp(`## ${heading}\\n[^#]+`), "");
    assert.deepEqual(await validate(incomplete), [`missing section ${heading}`]);
  }
});

test("reject empty sections and headings inside fenced code", async () => {
  assert.deepEqual(await validate(body.replace("Only the check. No runtime change.", "")), ["empty section Scope"]);
  assert.deepEqual(await validate(body.replace("## Scope", "```md\n## Scope").replace("## Blast Radius", "```\n## Blast Radius")), ["missing section Scope"]);
});

test("reject malformed snapshots instead of treating strings as authorization", async () => {
  assert.deepEqual(await validate(body, { ...state, ownerFullAutonomy: "false" }), ["invalid state ownerFullAutonomy"]);
  assert.deepEqual(await validate(body, { ...state, isDraft: null }), ["invalid state isDraft"]);
});

test("PR body CLI validates the sample file", () => {
  const result = spawnSync(process.execPath, ["docs/validate-pr.mjs", "docs/stacked-pr-body.md"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "PR protocol ok\n");
});
