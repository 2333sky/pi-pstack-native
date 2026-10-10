# Visual parity

**Goal:** Compare the actual rendered UI with a target under controlled state/viewport, fix meaningful differences, and recapture evidence.

## Steps

1. Define the target image/spec/state and the exact viewport, theme, data, locale, and interaction state. Without matched conditions, a pixel/layout comparison is invalid.
2. Capture the current real render using the project verification/control surface. Do not compare a mock component when the user sees an integrated page.
3. Classify differences: layout/geometry, typography, color/token, asset/content, interaction/state. Ignore antialiasing/noise only when it is demonstrably non-semantic.
4. Fix the smallest source/token/layout owner that explains the difference. Avoid screenshot-specific magic numbers that break other states.
5. Recapture under the same conditions and compare again. Also exercise nearby responsive/interactive states so matching one screenshot does not regress behavior.
6. Report before/after evidence, remaining intentional differences, and the real-surface checks used.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
