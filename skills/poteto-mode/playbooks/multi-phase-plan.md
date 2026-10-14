# Multi-phase or multi-PR plan

**Goal:** Produce an execution-ready phased plan with dependencies, gates, rollback/cleanup, risks, and explicit non-goals; do not implement until asked.

## Steps

1. If the change is tiny and the approach is obvious, say a multi-phase plan is unnecessary and stop.
2. Settle high-impact unknowns with small prototypes or read-only investigation before planning. Ask the operator only for product/preference choices no experiment can resolve.
3. Use read-only scouts to gather entry points, conventions, file owners, verification commands, and migration constraints. Return compact pointers, not dumps.
4. Decompose into independently verifiable phases/PR units. For each unit state: goal, files/owner, dependencies, implementation steps, verification, rollback/cleanup, and done predicate.
5. Name the execution playbook: one bounded run, Orchestrate for a standing multi-unit program, Autopilot-full when authorized to land, or Autopilot-stack when it must stop before merge.
6. Include program-level ordering, integration gates, shared-state strategy, risks, prototypes/alternatives, and final cleanup. Temporary compatibility mechanisms need an explicit deletion phase.
7. For the strict upstream-style program checklist format, use `npm run check:plan -- <plan.md>`. It validates properly closed backtick/tilde code fences and expects native `/pstack-loop 1h` markers. Its ten-lane live-proof format is opt-in, not permission to start ten agents or exceed operator budgets. Run `/skill:technical-writing` and `/skill:unslop`. Hand back the plan and stop; implementation begins only on explicit go.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
