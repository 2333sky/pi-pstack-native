# Shipping

**Goal:** Land only independently verified current patches with explicit merge authority, then verify merged state and clean owned resources safely.

## Steps

1. Resolve each target PR/branch and current head/base. Re-run required checks or read authoritative current CI/review state; do not rely on stale screenshots or old head SHAs.
2. Require independent verification of the actual patch for non-trivial changes. If a rebase/base change materially changes the diff, the old verdict is stale and must be reconsidered.
3. For dependent work, land only units whose prerequisites are already satisfied and whose own verification is current. Stop at the first unsafe dependency gap.
4. Address conflicts and actionable review findings on the owning branch. Re-run affected checks after any patch change.
5. Merge/land only when the user/program explicitly authorized it. Before retrying after interruption, inspect remote state so a completed merge/push is not repeated.
6. After merge, verify default-branch/production-facing state as appropriate. Remove only owned clean worktrees/branches according to policy; never force-delete unknown user work.
7. Report landed identifiers, final SHAs, verification, skipped/blocked items, and cleanup performed.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
