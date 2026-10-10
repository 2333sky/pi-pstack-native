---
name: principle-boundary-discipline
description: "Validate and translate at external boundaries; keep trusted internal code typed, direct, and free of repeated defensive checks."
disable-model-invocation: true
---

# Boundary Discipline

Validate and translate at external boundaries; keep trusted internal code typed, direct, and free of repeated defensive checks.

## Pattern

- Parse CLI/config/network/database/external API input once at entry.
- Translate boundary representations into domain concepts before business logic.
- Inside the trusted core, rely on types and ordinary error propagation rather than revalidating every hop.
- Keep vendor/framework quirks in adapters, not scattered through the domain.

## Avoid

- Nil-checks everywhere because no layer owns validation.
- Leaking wire-format or framework objects into core logic.

## Proof

Feed invalid external input and confirm it fails at the boundary; feed valid parsed data and confirm internal code needs no duplicate guard.
