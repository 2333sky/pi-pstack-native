---
name: principle-model-the-domain
description: "Encode domain states, transitions, identities, and ownership explicitly instead of scattering assumptions across conditionals and optional fields."
disable-model-invocation: true
---

# Model the Domain

Encode domain states, transitions, identities, and ownership explicitly instead of scattering assumptions across conditionals and optional fields.

## Pattern

- List meaningful states and transitions before adding branches.
- Use discriminated variants/state machines/tables/registries when they make invalid combinations unrepresentable.
- Give each fact one authoritative representation.
- Derive secondary booleans/status fields instead of synchronizing them manually.

## Avoid

- Several booleans whose combinations imply undocumented states.
- The same shape assumption repeated across files.

## Proof

Try to construct an invalid state. If ordinary code can still create it easily, the model is too loose.
