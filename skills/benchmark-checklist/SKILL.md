---
name: benchmark-checklist
description: "Vet a performance measurement before reporting or acting on it: limiter, tuning, limits, errors, repeatability, relevance, and whether the work actually ran."
disable-model-invocation: true
---
# Benchmark Checklist

Use this whenever a measured speedup, regression, throughput, latency, or eval-like performance number will drive a decision.

## Before the run

1. Write the exact claim the measurement is supposed to support.
2. Read the harness. Identify what it times, counts, excludes, warms, and caches.
3. Record machine/load conditions that can bias the run.
4. Make both sides comparable: release/debug mode, data, versions, batching, cache state, concurrency, database settings, and environment.

## Seven checks

1. **Name the limiter.** Ask why the result is not twice as good. Use a profiler or system counters during a non-reported diagnostic run and map the limiter back to source.
2. **Tune both sides.** A comparison of one tuned side with one default side is a configuration comparison, not an implementation verdict.
3. **Check physical limits.** Do arithmetic against CPU cores, disk/network bandwidth, request cost, and the fraction of end-to-end time the changed component owns.
4. **Count errors.** Confirm successful outputs, not just request count. Fast failures and retries distort timing.
5. **Reproduce.** For a decision, run enough alternating A/B trials to expose variance. Prefer median and range. If the gap is within noise, call it no measurable difference.
6. **Measure relevance.** Pair microbenchmarks with the user-visible end-to-end path. State the micro result as a share of the whole.
7. **Prove the work happened.** Confirm requests reached the target, rows/bytes were processed, lazy results were consumed, and outputs were used.

A one-run ballpark is allowed only when the operator asked for a ballpark. Still check errors and that the work actually happened, and label it one run.

## Report

Lead with one of: faster, slower, no measurable difference, or inconclusive. Include units, run count, range/variance, and the named limiter. Call the result inconclusive if the crucial evidence is missing.

For repeated optimization, combine this with the Hillclimb playbook and `principle-explain-the-number`.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
