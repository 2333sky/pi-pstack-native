# Bug fix

**Goal:** Reproduce the defect, isolate its mechanism, make the smallest root-cause fix, prove the original behavior, and protect it when a cheap regression test exists.

## Steps

1. Reproduce the bug on the closest real user surface. If the normal surface cannot reach it, instrument or synthesize the trigger; explain any unavoidable gap.
2. Use `/skill:how` to trace the affected runtime path and `/skill:why` when regression history or a past design decision could explain the shape.
3. List competing hypotheses and eliminate them with runtime evidence. Prefer the experiment that cuts the most remaining uncertainty. Do not edit until one mechanism survives.
4. If the fix crosses an API/function/module ownership boundary, run `/skill:architect`. Then delegate one bounded implementation worker with exact scope and success criteria.
5. When a cheap stable regression test exists, use `/skill:tdd`: demonstrate the failing test before the fix and green after. Skip fake or expensive tests and state why.
6. Run a verifier on the worker checkout, then reproduce the original bug on the same surface. Wrong-surface or inconclusive evidence is not a pass.
7. Review the final diff for blast radius and unnecessary workaround code. If publishing, follow Opening a PR.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
