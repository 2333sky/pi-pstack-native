---
name: principle-prove-it-works
description: "Before declaring done, verify the real artifact or user-visible behavior rather than relying on compilation, a child self-report, or a proxy."
disable-model-invocation: true
---

# Prove It Works

Before declaring done, verify the real artifact or user-visible behavior rather than relying on compilation, a child self-report, or a proxy.

## Pattern

- Choose the surface the user actually depends on.
- Run the feature/command/request/render against the changed artifact.
- Inspect the output/state/diff directly.
- When possible, script the proof so a reviewer can rerun it.
- Call wrong-surface or missing evidence inconclusive, not pass.

## Avoid

- “Tests compile, so it is fixed.”
- Accepting “worker says done” without inspecting its worktree/result.

## Proof

Report the exact command/action, observed result, and artifact/state that proves the acceptance criterion.
