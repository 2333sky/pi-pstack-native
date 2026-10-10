# Feature

**Goal:** Implement new user-visible behavior from understood ownership through architecture, isolated implementation, real-surface proof, review, and PR-ready handoff.

## Steps

1. Run `/skill:how` over the affected subsystem. State the user outcome and the existing owner/boundary.
2. Use `/skill:architect` when the feature crosses a function/module boundary or admits materially different shapes. Settle the data/state model before implementation.
3. Write a throughput checkpoint: blocking prerequisites, independent workstreams, truly shared mutable state, and the smallest safe decomposition. Mark genuine non-applicable dimensions rather than silently dropping them.
4. Delegate implementation to one or more workers with disjoint scopes, explicit files/owners, data shape, and pass/fail criteria. Use `/skill:arena` if several implementation shapes are genuinely plausible.
5. Verify the real user surface. Pair each worker that needs independent checking with a direct verifier dependency.
6. Review the integrated diff for design drift, comments/slop, blast radius, and unnecessary compatibility code. Run `/skill:interrogate` when design is contested/high impact.
7. Organize commits/PR units so each is independently verifiable. If publishing, follow Opening a PR.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
