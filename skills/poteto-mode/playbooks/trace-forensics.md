# Trace forensics

**Goal:** Diagnose an existing profiling artifact without rerunning or changing the process.

## Steps

1. Identify the capture format. Use an available parser for a CPU profile, compressed trace, heap snapshot, or spindump. Keep this investigation read-only.
2. Transform large captures into a queryable shape, such as a table of samples, frames, or nodes. Use read-only scouts for large artifacts and retain source pointers.
3. Find the hot call path, heap retainer chain, or blocked thread and wait reason. Report the evidence, not only the largest number.
4. Map the finding to a file, symbol, and line through the artifact's symbols. Resolve missing symbols or state that the capture cannot locate source.
5. If a paired capture exists, compare before and after to confirm. Without one, label the finding as the strongest hypothesis the artifact supports, not a confirmed cause. Do not add live instrumentation in this playbook.
6. Return a cited diagnosis. Do not implement a fix unless asked. Route further work to Bug fix or Perf issue. Use Runtime forensics when the task requires a live capture.
7. Report the artifact path and format, reduced finding, source location, and whether a paired capture confirmed it.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
