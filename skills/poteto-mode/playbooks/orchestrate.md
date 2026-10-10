# Orchestrate

**Goal:** Run a large program as durable verifiable units with a pilot, rolling bounded concurrency, worker-to-verifier handoffs, and explicit integration/landing ownership.

## Steps

1. Frame a countable done predicate, unit count/shape, rough effort, concurrency cap, wall-clock constraint, and major tracks. If one agent can finish comfortably, use Autonomous run instead.
2. Design unit briefs and verification contracts. Run one representative pilot end-to-end before scale; use it to falsify unit size, brief clarity, and verifier recipe.
3. Create a durable DAG. Each unit has one write-capable worker and, when verification is independent, a verifier depending directly on that worker. Shared integration steps depend on all required units.
4. Scale with a rolling window up to the shared concurrency cap. Refill a slot when a child settles; do not wait for fixed batches. Keep writers separated by worktree/ownership.
5. Drain results continuously. A worker result is a handoff, not proof. Failed verification routes to a bounded rework/retry decision; do not silently mark the unit complete.
6. Persist program decisions and evidence. For long waits, use `/pstack-loop` audit ticks to detect remote state changes and stuck lanes.
7. Integrate only verified units. Landing/merging remains an explicit authorized action. As deadline/budget approaches, stop spawning and harvest verified work instead of maximizing in-flight count.
8. Finish with unit counts by state, integrated/landed identifiers, evidence, failed/blocked units, and the exact next recovery action.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
