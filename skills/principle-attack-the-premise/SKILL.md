---
name: principle-attack-the-premise
description: "After repeated fixes that share one assumption fail the same gate, inspect the assumption before trying another compensating fix."
disable-model-invocation: true
---

# Attack the Premise

After repeated fixes that share one assumption fail the same gate, inspect the assumption before trying another compensating fix.

## Pattern

- Write the shared premise in one falsifiable sentence.
- Build a rerunnable census that shows which actor/state owns the imbalance.
- Look for stable skew across runs; trace what assigns that role or imbalance.
- Remove or redistribute the asymmetry instead of adding another return path, rebalance loop, or patch that preserves the premise.

## Avoid

- A third timeout/guard/retry that assumes the same actor is inherently special.
- A “fix” that reduces the symptom but leaves the role assignment unchanged.

## Proof

Re-run the census and the original failing gate. The distribution or ownership that caused the failure must materially change.
