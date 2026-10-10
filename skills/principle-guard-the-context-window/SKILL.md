---
name: principle-guard-the-context-window
description: "Keep the parent context focused: delegate bulky reads and return compact evidence-backed handoffs instead of raw payloads."
disable-model-invocation: true
---

# Guard the Context Window

Keep the parent context focused: delegate bulky reads and return compact evidence-backed handoffs instead of raw payloads.

## Pattern

- Send long logs, huge files, screenshots, and broad searches to bounded read-only children.
- Ask each child for conclusions plus file/line/artifact pointers, not copied source dumps.
- Keep content needed every invocation inline in the skill; do not force repeated reads of tiny critical rules.
- Bound phases and file counts before fan-out.

## Avoid

- Pasting a 20k-line log into the coordinator.
- Repeating the same large reference in every child prompt.

## Proof

Check that the parent can make the next decision from compact handoffs without re-reading the bulk data.
