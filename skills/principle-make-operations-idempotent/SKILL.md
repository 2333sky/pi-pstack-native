---
name: principle-make-operations-idempotent
description: "Design commands and lifecycle steps to converge to the same end state when crashes, retries, duplicate messages, or resumes occur."
disable-model-invocation: true
---

# Make Operations Idempotent

Design commands and lifecycle steps to converge to the same end state when crashes, retries, duplicate messages, or resumes occur.

## Pattern

- Give a logical operation a stable identity/request key.
- Check current/remote state before repeating an external effect.
- Persist intent and durable receipts around non-local side effects when practical.
- Make “already done” a successful state, not an exceptional path.
- Separate retryable computation from irreversible publication.

## Avoid

- “Try again” creating a second issue/PR/payment.
- A resume path that blindly pushes/posts because the previous process might have died before recording success.

## Proof

Run the same logical request twice and verify the second run makes no harmful additional change.
