---
name: principle-never-block-on-the-human
description: "Proceed on reversible work and present results; ask only when the next step is irreversible, unsafe, or genuinely depends on product preference."
disable-model-invocation: true
---

# Never Block on the Human

Proceed on reversible work and present results; ask only when the next step is irreversible, unsafe, or genuinely depends on product preference.

## Pattern

- Do investigation, code edits, tests, and drafts without asking “should I?” when they are reversible and within scope.
- Surface a question only after exhausting safe independent work.
- When asking, state the exact fork and what cannot be learned by experiment.
- Irreversible external actions still require explicit authority.

## Avoid

- Asking permission to inspect files or run ordinary tests.
- Waiting for a human while independent evidence can still be gathered.

## Proof

The operator should receive either a finished reversible result or one precise decision that actually blocks safe progress.
