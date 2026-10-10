# Perf issue

**Goal:** Find and fix a performance problem from trustworthy baseline evidence through limiter-focused implementation and end-to-end remeasurement.

## Steps

1. Capture a baseline on the matching real workload/surface. Run `/skill:benchmark-checklist`; if the baseline is invalid, fix the harness before code.
2. Use `/skill:how` to map the hot path and profile/counters to name the actual limiter. Do not infer a ceiling from source alone.
3. Form mechanism-specific hypotheses ordered by expected impact and cost. If a fix changes APIs/ownership, run `/skill:architect` first.
4. Delegate one bounded implementation with explicit metric and regression gates. Inspect the diff for behavior changes that could fake a speedup.
5. Rerun the same benchmark protocol and an end-to-end user path. Include errors, work counts, multiple trials, range/variance, and current limiter.
6. Call the result inconclusive if the run cannot explain its number. Cite the measurement/evidence in any PR, then follow Opening a PR if publishing.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
