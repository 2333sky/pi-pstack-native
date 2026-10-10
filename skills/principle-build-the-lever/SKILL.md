---
name: principle-build-the-lever
description: "For non-trivial repeated or error-prone work, build the tool that performs or proves it so another reviewer can rerun the same operation."
disable-model-invocation: true
---

# Build the Lever

For non-trivial repeated or error-prone work, build the tool that performs or proves it so another reviewer can rerun the same operation.

## Pattern

- Before a manual sweep, ask what script, codemod, query, harness, generator, or skill could make the work deterministic.
- Make the lever small enough to inspect and rerun.
- Use the lever for the actual change or proof; do not build tooling that is never exercised.
- Keep one-off exploratory code only when it is cheaper than manual work and clearly disposable.

## Avoid

- Editing dozens of similar sites by hand.
- Reporting “I checked them all” with no rerunnable evidence.

## Proof

Rerun the lever from a clean state and show that it either makes the intended change deterministically or catches the intended failure.
