# Babysit

**Goal:** Keep an existing PR or small PR set moving through CI, review feedback, and conflicts until the requested stop condition.

## Steps

1. Declare mode: `check` for one status pass, `drive` for active work to merge-ready, `threads-only` for review-comment fixes only, or `background` for non-blocking triage while another program owns execution.
2. Resolve the target PR/head and read current checks, review threads, conflict/base state, and owning workflow before editing. Do not start a duplicate babysitter for the same lane.
3. Work the lowest blocking condition first: conflict/base issue, failing required check, actionable review finding, then cosmetic/non-blocking feedback. Do not churn unrelated upper work while the blocking frontier is red.
4. Fix on the owning branch/worktree. Do not silently retarget bases, rewrite unrelated history, or force-push unless the parent workflow/user explicitly owns that action.
5. After each fix, verify locally where possible, publish if authorized, then wait/recheck using a reasonable `/pstack-loop` cadence rather than tight polling.
6. Stop at merge-ready unless merge/ship was explicitly requested. Report head SHA, required checks, unresolved threads, conflicts, and the next blocking condition.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
