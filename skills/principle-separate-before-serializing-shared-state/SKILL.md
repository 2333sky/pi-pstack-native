---
name: principle-separate-before-serializing-shared-state
description: "When concurrent actors collide, remove unnecessary shared writers before adding locks, queues, or global serialization."
disable-model-invocation: true
---

# Separate Before Serializing Shared State

When concurrent actors collide, remove unnecessary shared writers before adding locks, queues, or global serialization.

## Pattern

- Identify the exact resource being shared: file, branch, key, object, process, or environment.
- Give workers separate worktrees/files/keys/instances when ownership can be partitioned.
- Use serialization only where one shared writer is a true domain invariant.
- Keep merge/integration as a distinct ownership step.

## Avoid

- Putting a mutex around a design that could give each worker its own state.
- Multiple agents editing the same checkout because coordination seems easier than isolation.

## Proof

Run the concurrent workflow and show independent writers no longer touch the same mutable resource.
