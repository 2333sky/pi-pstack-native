# Autopilot-stack

**Goal:** Drive independent PRs/branches to reviewable green state but stop before merge or shipping.

## Steps

1. Use the same durable owner-lane model as Autopilot-full: one owner per change, isolated worktree, early publish when authorized, proof, review, and CI follow-up.
2. Keep changes independently reviewable. If one lane truly depends on another, model that dependency explicitly and do not hide it as an implicit stacked-branch assumption.
3. Arm a periodic `/pstack-loop` audit for long-running CI/review waits. Each tick reads current remote state and workflow records before deciding whether to resume, steer, or replace an owner.
4. Do not merge. The finish condition is that each lane is green/reviewable with its evidence and dependency state clear.
5. Hand back PR/branch identifiers, head SHAs, checks, review status, verification evidence, and the exact order or conditions for later shipping.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
