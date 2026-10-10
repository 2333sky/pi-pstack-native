---
name: principle-explain-the-number
description: "Before trusting a measurement, identify what limits it and rule out that the number measured errors, skipped work, caches, tuning differences, or noise."
disable-model-invocation: true
---

# Explain the Number

Before trusting a measurement, identify what limits it and rule out that the number measured errors, skipped work, caches, tuning differences, or noise.

## Pattern

- Ask “why not double?” and name a measured limiter from profiling/counters.
- List plausible alternative explanations for the number and rule them out with evidence.
- Keep run count, spread/variance, configuration, and limiter next to the reported number.
- Relate micro numbers to the end-to-end user path.

## Avoid

- One benchmark run with no error count.
- A speedup larger than the fraction of runtime the changed component could possibly own.

## Proof

Use `/skill:benchmark-checklist`; report a verdict only when the limiter and work/error checks support it.
