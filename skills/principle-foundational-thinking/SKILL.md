---
name: principle-foundational-thinking
description: "Choose core data structures, ownership, invariants, and concurrency shape before writing the logic that depends on them."
disable-model-invocation: true
---

# Foundational Thinking

Choose core data structures, ownership, invariants, and concurrency shape before writing the logic that depends on them.

## Pattern

- Identify the information that must exist and who owns each mutable piece.
- Choose representations that make common operations and invariants direct.
- Separate scaffolding that defines the shape from feature logic that fills it in.
- For concurrency, decide what is truly shared before adding coordination.

## Avoid

- Starting with handlers full of conditionals because no state model exists.
- Threading a new flag through many layers before asking whether the data shape is wrong.

## Proof

Explain the core structure in a few sentences, then show that downstream code becomes simpler because of it.
