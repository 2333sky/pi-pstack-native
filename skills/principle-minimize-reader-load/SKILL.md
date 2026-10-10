---
name: principle-minimize-reader-load
description: "Reduce layers, hidden mutable state, and repeated decisions between a reader’s question and the code that answers it."
disable-model-invocation: true
---

# Minimize Reader Load

Reduce layers, hidden mutable state, and repeated decisions between a reader’s question and the code that answers it.

## Pattern

- Collapse one-caller wrappers and pass-through adapters.
- Require adjacent layers to compress or transform complexity, not mirror each other.
- Shrink mutable state from global → module → field → local → return value where possible.
- Put an invariant at one boundary instead of teaching every consumer.
- Prefer names and data shapes that make the next operation obvious.

## Avoid

- A broad interface that hides almost nothing.
- A reader must trace four files to understand one local decision.

## Proof

Ask a reviewer to trace a representative behavior; the path should cross fewer layers and require less hidden state than before.
