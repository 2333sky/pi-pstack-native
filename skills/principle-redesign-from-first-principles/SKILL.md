---
name: principle-redesign-from-first-principles
description: "When a new requirement does not fit the current shape, redesign as if it had been foundational instead of bolting on another special case."
disable-model-invocation: true
---

# Redesign From First Principles

When a new requirement does not fit the current shape, redesign as if it had been foundational instead of bolting on another special case.

## Pattern

- Restate the requirement independent of the current implementation.
- List foundational invariants that would exist if building today.
- Sketch the simplest structure that naturally supports both old and new requirements.
- Plan a migration from current shape to that target; avoid permanent bridges unless externally required.

## Avoid

- A new mode implemented as flags around every old path.
- Adding exceptions until the original abstraction means nothing.

## Proof

Compare the target design with a clean-slate explanation: the new requirement should look ordinary, not exceptional.
