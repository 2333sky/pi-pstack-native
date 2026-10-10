---
name: principle-sequence-verifiable-units
description: "Break multi-step changes, commits, and PRs into units that each end in a state a reviewer can independently verify."
disable-model-invocation: true
---

# Sequence Work Into Verifiable Units

Break multi-step changes, commits, and PRs into units that each end in a state a reviewer can independently verify.

## Pattern

- Define each unit by one observable outcome.
- Order prerequisite structure before dependent behavior.
- Give each unit its own check and evidence.
- Keep a failing/incomplete unit from hiding inside a later broad change.
- For parallel units, verify independently before integration.

## Avoid

- A huge migration where no intermediate commit is runnable.
- A PR stack whose upper layers are the only place lower behavior is tested.

## Proof

Check out each unit boundary or commit/PR and run its stated verification without needing future units.
