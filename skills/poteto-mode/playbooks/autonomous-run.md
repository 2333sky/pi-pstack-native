# Autonomous run

**Goal:** Drive one bounded task unattended until a checkable predicate is true, persisting decisions and recovering from ordinary failures without relaxing the goal.

## Steps

1. Write the exit predicate before the first iteration. It must be observable: repro fixed, test/CI gate green, all N units verified, rendered diff within threshold, etc.
2. Choose the wake mechanism. For work that needs periodic re-checks while Pi is active, use `/pstack-loop`; for a finite dependency graph, use `pstack_workflow` instead of polling.
3. At each iteration, inspect current state first, make the smallest evidence-backed change, run the predicate, and keep only changes that advance it. Revert speculative belts-and-suspenders.
4. Own reversible side problems discovered during the run: flaky harness, broken skill, related bug, stale branch. Keep out-of-band fixes isolated so the main predicate remains legible.
5. Log material decisions with `/skill:show-me-your-work`. Record workflow IDs, commits/artifacts, predicate state, and any recovery after interruption.
6. Stop only when the predicate is met or a genuine blocker remains that no safe experiment can settle. Do not redefine the predicate to manufacture success.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
