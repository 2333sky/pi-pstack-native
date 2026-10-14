---
name: principle-fix-root-causes
description: "Reproduce the symptom, trace the causal chain to the earliest correct ownership boundary, and fix there instead of masking the failure downstream."
disable-model-invocation: true
---

# Fix Root Causes

Reproduce the symptom, trace the causal chain to the earliest correct ownership boundary, and fix there instead of masking the failure downstream.

## Pattern

- Reproduce before editing.
- Ask why repeatedly until the answer reaches ownership/state/data rather than another symptom.
- Use runtime evidence or a targeted experiment to falsify competing causes.
- If the deciding fact required a deep investigation, propose the cheap always-on signal that would reveal it immediately next time.
- Make the smallest fix at the layer that owns the invariant.

## Avoid

- Adding a null guard where the value should never be null.
- Retrying more often when duplicate work is the real bug.

## Proof

Re-run the original reproduction and a nearby edge case that would still fail if the root cause remained.
