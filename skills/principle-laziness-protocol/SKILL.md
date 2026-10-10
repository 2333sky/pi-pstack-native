---
name: principle-laziness-protocol
description: "Prefer deletion and the smallest sufficient direct change over new layers, wrappers, duplicated state, or signal plumbing."
disable-model-invocation: true
---

# Laziness Protocol

Prefer deletion and the smallest sufficient direct change over new layers, wrappers, duplicated state, or signal plumbing.

## Pattern

- Look for code/data you can delete before adding structure.
- Collapse wrappers with one caller or layers that do not change abstraction.
- Centralize repeated decisions in one source of truth.
- Question any new flag threaded across many APIs; seek a direct ownership boundary.
- Keep the diff no larger than the problem requires.

## Avoid

- “Clean architecture” layers that only forward the same parameters.
- Adding a compatibility adapter for an internal API that can be migrated in one wave.

## Proof

Compare before/after call graph and diff size. The change should reduce or concentrate decisions, not spread them.
