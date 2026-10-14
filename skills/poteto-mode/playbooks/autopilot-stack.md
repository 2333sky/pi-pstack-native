# Autopilot-stack

**Goal:** Deliver one linear parent-base PR stack with current per-unit evidence, and stop before merge or shipping.

## Steps

1. Use the same durable owner-lane model as Autopilot-full: one owner per change, isolated worktree, early publish when authorized, proof, review, and CI follow-up.
2. The root is the sole topology owner. Prepare each branch in a separate worktree on the exact parent head; only the root PR targets trunk. Verify each unit relative to that parent, publish only authorized branch writes, then use pstack-runner stack-plan and stack-open to validate/open the chain. These commands never rebase, force-push, retarget or merge automatically. The autopilot-stack DAG template is local preparation, not delivery of the remote stack. Keep changes independently reviewable. If one lane truly depends on another, model that dependency explicitly and do not hide it as an implicit stacked-branch assumption.
3. Arm a periodic `/pstack-loop` audit for long-running CI/review waits. Each tick reads current remote state and workflow records before deciding whether to resume, steer, or replace an owner.
4. Independently verify each branch/parent patch and check current review threads and CI. Head/base changes invalidate native ledgers even if a patch ID is unchanged; this conservative policy deliberately does not reuse the upstream build-noise verdict exception. Do not merge. The finish condition is that each lane is green/reviewable with its evidence and dependency state clear.
5. Hand back PR/branch identifiers, head SHAs, checks, review status, verification evidence, and the exact order or conditions for later shipping.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
