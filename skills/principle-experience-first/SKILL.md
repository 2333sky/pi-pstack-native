---
name: principle-experience-first
description: "When product and implementation convenience conflict, optimize for the user-visible experience and ship fewer polished capabilities rather than more rough ones."
disable-model-invocation: true
---

# Experience First

When product and implementation convenience conflict, optimize for the user-visible experience and ship fewer polished capabilities rather than more rough ones.

## Pattern

- State the user outcome before the implementation constraint.
- Prefer a smaller coherent feature over a broader experience with broken edges.
- Treat setup friction, latency, error recovery, and clarity as product behavior.
- Only expose implementation constraints to the user when they are real constraints, not shortcuts.

## Avoid

- Making the user perform bookkeeping because it is easier for code.
- Shipping many half-supported modes instead of one reliable path.

## Proof

Drive the feature as a user and verify the happy path plus the most likely recovery path.
