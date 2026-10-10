---
name: principle-outcome-oriented-execution
description: "During planned migrations and rewrites, converge on the target architecture rather than optimizing for smooth but throwaway intermediate states."
disable-model-invocation: true
---

# Outcome-Oriented Execution

During planned migrations and rewrites, converge on the target architecture rather than optimizing for smooth but throwaway intermediate states.

## Pattern

- Write the target state and phase gates first.
- Make each phase end in a coherent verifiable state.
- Delete temporary compatibility paths as soon as their phase is complete.
- Judge progress by the target predicate, not lines changed or artifacts produced.

## Avoid

- Permanent code added only to make one migration step comfortable.
- Calling a phase done because work happened even though the target invariant is not closer.

## Proof

At each checkpoint, show which target invariant is now true and which temporary mechanism was removed.
