# Hillclimb

**Goal:** Iteratively optimize one trustworthy metric with a frozen harness, one mechanism-backed hypothesis per attempt, and keep/revert discipline.

## Steps

1. Ground the realistic workload with `/skill:how`. Choose a case that reproduces the complaint and define one metric, direction, target, and minimum attempt count so one lucky run cannot end the search.
2. Build the measurement harness and prove it can distinguish meaningful contrasting workloads. Run `/skill:benchmark-checklist`; include error/work counts. Freeze the harness once trustworthy.
3. Record baseline distribution and regression gates before changing code. Start a decision trail with one row per attempt.
4. For each attempt, name a mechanism-backed hypothesis tied to the measured limiter. Change one meaningful factor, run the frozen metric and regression gates, then keep or revert. Never leave “might help” changes accumulated.
5. Periodically re-profile because the limiter can move after an improvement. A new limiter requires a new hypothesis, not tuning the old one forever.
6. Stop only when the target and minimum evidence floor are met, or a genuine measured ceiling/dead end is demonstrated. Report baseline, final distribution, kept/reverted attempts, limiter changes, and end-to-end relevance.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
