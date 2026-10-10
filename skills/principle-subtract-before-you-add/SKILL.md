---
name: principle-subtract-before-you-add
description: "Remove dead code, redundant validators, obsolete paths, and stale references before adding the replacement mechanism."
disable-model-invocation: true
---

# Subtract Before You Add

Remove dead code, redundant validators, obsolete paths, and stale references before adding the replacement mechanism.

## Pattern

- Inventory legacy/dead paths related to the change.
- Delete or collapse what the new feature would otherwise need to route around.
- Then add the smallest new shape on the simpler base.
- Re-run searches to ensure stale references did not survive.

## Avoid

- Building a new abstraction beside dead old code.
- Keeping duplicate validators because deleting them feels risky despite one authoritative boundary.

## Proof

Compare the final system to the starting point: the new capability should not leave avoidable parallel mechanisms behind.
