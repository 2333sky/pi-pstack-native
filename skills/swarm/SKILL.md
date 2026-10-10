---
name: swarm
description: "Fan out bounded parallel workers over independent slices or independent attempts, drain them, and synthesize one evidence-backed report."
disable-model-invocation: true
---
# Swarm

Use when parallel coverage reduces wall-clock time or improves breadth: repository search, independent slices, a race of approaches, or a review gauntlet.

## Phase A: Frame

Choose one of two shapes:

- **coverage:** different workers own disjoint slices;
- **race:** workers receive the same brief and compare approaches.

Define N, scope, output schema, success criteria, and max concurrency. Do not parallelize shared writes merely because agents exist.

## Phase B: Fan out

Run workers with stable keys. Coverage workers get non-overlapping scope. Write-capable workers use separate worktrees. Read-only workers can share the repository.

Each worker returns compact evidence: findings/artifact, file pointers, checks run, and unresolved uncertainty.

## Phase C: Drain

Wait for all required workers. A failed slice is visible, not silently omitted. Decide whether the run is fail-fast or best-effort before starting.

For large swarms, refill slots as workers finish rather than using blocking batches.

## Phase D: Aggregate

Deduplicate overlaps, resolve contradictions by checking the source, and produce one report. A synthesizer must preserve meaningful disagreement instead of averaging it away.

## Output

State swarm shape, slices/attempts, failures, synthesis, and the evidence supporting the conclusion.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
