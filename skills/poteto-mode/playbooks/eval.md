# Eval

**Goal:** Compare agents, skills, prompts, or implementations with a blinded rubric and evidence from what actually happened, not candidate self-report.

## Steps

1. State the variant under test and write a 3-6 item concrete judging rubric. Keep the rubric from candidates when revealing it would bias behavior.
2. Create equivalent isolated environments for candidates. Seed only context an organic task would normally provide.
3. Write one natural user prompt with no hint about what is being measured.
4. Run N candidates in parallel, ideally across the intended model mix. Keep labels/model identities hidden from the judge when practical.
5. Run a separate read-only judge on sanitized candidate labels and the held-back rubric.
6. Inspect candidate Pi session/workflow evidence yourself: files actually read/changed, commands/checks, and outputs. Do not grade chain-following from a candidate claim that it read something.
7. Read all final outputs and compare with the judge. Disagreement means either bias, ambiguous rubric, or overlooked evidence; resolve it before reporting a winner.
8. Report trial count, model/variant matrix, rubric, failures, variance, and limits. Do not generalize from one lucky run.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
