---
name: architect
description: "Design types, signatures, ownership, and module boundaries before implementation, then keep the implementation aligned with the chosen shape."
disable-model-invocation: true
---
# Architect

Use this before a non-trivial change would lock in ownership, data shape, API boundaries, or module layout.

## Phase A: Ground the problem

1. Read the current call path, public types, state owners, and tests around the requested change.
2. State the user-visible requirement and the invariants that must remain true.
3. Separate constraints that come from the product, an external protocol, or existing compatibility from accidental structure in the current code.
4. Name the decision that architecture must settle. If there is no real structural decision, stop and implement directly.

## Phase B: Explore shapes

For a narrow design, sketch one candidate directly. For a contested or cross-cutting design, run 2-3 read-only architect candidates in parallel with the same brief. Each candidate returns:

- core types and their invariants;
- ownership of mutable state;
- public signatures and module boundaries;
- data/control flow;
- migration order;
- what becomes simpler or disappears;
- risks and verification hooks.

Do not let candidates edit the same checkout while exploring.

## Phase C: Choose

Compare candidates by reader load, illegal states, boundary clarity, migration cost, and how directly the shape serves the requirement. Prefer the shape that removes decisions from downstream code. Record rejected alternatives when their trade-off is not obvious.

If the user asked for a checkpoint, present the chosen sketch and stop before implementation. Otherwise continue.

## Phase D: Implement against the sketch

Turn the design into small verifiable units. Use a native workflow when units can run independently. After each unit, compare the diff to the design rather than letting implementation drift redefine the architecture.

If implementation evidence disproves the sketch, change the sketch first. Do not preserve a broken design just because code already exists.

## Output

Return:

1. chosen architecture in plain language;
2. key types/signatures/owners;
3. implementation status;
4. verification evidence;
5. rejected alternatives or unresolved risks.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
