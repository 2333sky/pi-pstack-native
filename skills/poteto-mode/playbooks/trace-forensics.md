# Trace forensics

**Goal:** Follow one request/task across process/service boundaries and timestamps to find the first divergence between expected and actual behavior.

## Steps

1. Choose one concrete trace/request/job with a correlation key, timestamp window, or reproducible trigger. Define the expected path.
2. Collect boundary evidence in order: ingress, queue/IPC, service/function transitions, storage/external call, response/ack. Normalize clocks/IDs before comparing timing.
3. Build a sequence of expected versus observed events. The first divergence is more useful than the loudest later error.
4. Use read-only scouts for independent services or large logs, each returning only ordered events and source pointers.
5. Confirm the suspected divergence with a second trace or targeted instrumentation so coincidence does not become causality.
6. Map it to source ownership and hand the mechanism to Bug fix/Perf issue/Runtime forensics as appropriate.
7. Report trace identifier/window, first divergence, downstream symptoms, source anchor, and confidence.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
