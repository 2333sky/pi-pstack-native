# Prototype

**Goal:** Answer one risky design/behavior question with the smallest disposable artifact, compare alternatives when needed, then hand the decision to real implementation.

## Steps

1. State the decision the prototype must make. If there is no decision, use Feature instead.
2. When direction is open, gather a small amount of prior art or existing repository precedent before building.
3. Build in an isolated scratch directory/worktree with the lightest useful stack. No production abstractions, migrations, or broad tests.
4. If alternatives matter, put 2-3 variants behind one switch/entry point so they can be compared under the same conditions.
5. Observe the thing being decided on the matching surface: interaction/screenshot for UI, printed output/timing for behavior, request/result for service/API. The observation is the prototype test.
6. Present alternatives, trade-offs, recommendation, and the artifact/evidence. Delete or clearly quarantine throwaway code; do not silently ship the prototype as production.
7. Hand the chosen direction to Feature or Architect for the real build.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
