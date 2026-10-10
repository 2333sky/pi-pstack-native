# Autopilot-full

**Goal:** Drive a PR/program queue through implementation, proof, review, CI, and authorized landing with durable ownership and periodic audit.

## Steps

1. Require an explicit operator go before starting the program. Items the operator reserved remain theirs.
2. Create one durable owner lane per independent change. Each lane owns implementation, first publish, real-surface proof, review-finding fixes, CI follow-up, and final handoff. Use worktrees and stable workflow keys.
3. Open a decision trail early for long lanes. Record child IDs/workflow IDs, meaningful side effects, expected long-running checks, and evidence. Progress means a commit, push, PR/check delta, or verified artifact, not “still working”.
4. Run an audit tick on a real schedule with `/pstack-loop` when the program spans long waits. On each tick, inspect remote PR/check state before taking action, detect stuck lanes, and recover/replace only after confirming the prior owner is not still making progress.
5. Before a lane is landable, require independent verification of the actual head, concrete review resolution, and green required checks. Re-check after rebases or meaningful patch changes.
6. Merge/land only when the operator has already authorized that action. After landing, verify merged/default-branch state and clean only owned safe worktrees.
7. Finish with program counts, landed/remaining items, verification evidence, and any lane that stopped for a real blocker.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
