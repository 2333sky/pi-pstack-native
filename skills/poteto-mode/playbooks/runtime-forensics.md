# Runtime forensics

**Goal:** Use live runtime artifacts to isolate a performance, leak, loop, or state mechanism before touching source.

## Steps

1. Capture a real signal on the matching surface: CPU profile, heap snapshot, trace, process/thread state, request log, or other runtime artifact.
2. Reduce large artifacts in a read-only child and keep only the smoking gun in the parent: hot function, retainer chain, repeated timer, blocked syscall, or state transition.
3. Prove the mechanism with the cheapest controlled runtime experiment or instrumentation. Avoid broad code edits before the mechanism reproduces.
4. Map the runtime finding back to exact source symbols/files and the ownership boundary that should fix it.
5. Keep this playbook read-only. Hand the proven mechanism to Bug fix, Perf issue, or Refactoring for implementation.
6. Report artifact, reduction method, mechanism, source anchor, confidence, and what would falsify the conclusion.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
