# Investigation

**Goal:** Answer an unknown-cause or architectural question with read-only evidence, separating facts, hypotheses, and recommendation.

## Steps

1. Route current-behavior questions through `/skill:how`; add `/skill:why` when motivation/history matters.
2. Keep the investigation read-only unless the operator explicitly asks to proceed into a fix. Parallelize only independent evidence categories or subsystems.
3. State hypotheses and the evidence that would distinguish them. Gather source/runtime/history facts and eliminate unsupported explanations.
4. For a choice between alternatives, compare trade-offs against the actual project constraints rather than generic best practices.
5. Produce the How-shaped model (overview, concepts, flow, locations, gotchas) or a recommendation with evidence and explicit uncertainty.
6. Run `/skill:unslop` on the final explanation. End with the most useful next experiment/action if the question remains unresolved.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
