# Refactoring

**Goal:** Change structure without changing intended behavior: pin the contract, name the target shape, subtract legacy paths, migrate in verifiable units, and prove equivalence.

## Steps

1. Run `/skill:how` and pin current behavior with a characterization test, snapshot, equivalence harness, or real-surface script. Typecheck/lint alone is not a behavior pin.
2. Name the missing domain structure and the target call/type/module shape. Use `/skill:architect` if the reshape crosses ownership/API boundaries.
3. Subtract first: dead code, one-caller wrappers, redundant validators, stale adapters, and orphan references. Do not add a new abstraction beside removable old structure.
4. Move in small behavior-preserving units. After each unit, run the pin. For internal API changes, migrate callers and delete the old path in the same wave rather than leaving indefinite compatibility shims.
5. Delegate mechanical edits only with precise names/files and a fixed behavior contract. Search strings/docs/tests after renames; compiler coverage is not enough.
6. Verify the real artifact and run independent review. The final code should reduce reader load/invalid states, not merely move lines around.
7. If publishing, order commits so each remains understandable and verified, then follow Opening a PR.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
