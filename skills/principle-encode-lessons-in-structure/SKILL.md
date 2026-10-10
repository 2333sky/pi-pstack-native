---
name: principle-encode-lessons-in-structure
description: "When a correction recurs, encode it in architecture, metadata, types, checks, or tooling instead of adding more prose."
disable-model-invocation: true
---

# Encode Lessons in Structure

When a correction recurs, encode it in architecture, metadata, types, checks, or tooling instead of adding more prose.

## Pattern

- Classify the correction as one-off, recurring, or systemic.
- For recurring behavior, choose the strongest enforceable layer: structure/type > lint/check > test > skill text.
- Make the failure message name the supported path when a check rejects bad code.
- Close the loop now or create one concrete tracked action; do not merely record the lesson.

## Avoid

- Adding the same AGENTS.md sentence after the rule was already ignored.
- A hidden tribal rule with no executable enforcement.

## Proof

Recreate a past mistake and show the new structure/check blocks it.
