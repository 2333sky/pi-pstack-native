---
name: principle-migrate-callers-then-delete-legacy-apis
description: "For internal API changes, move all callers and remove the old path in the same migration wave instead of preserving parallel compatibility layers."
disable-model-invocation: true
---

# Migrate Callers Then Delete Legacy APIs

For internal API changes, move all callers and remove the old path in the same migration wave instead of preserving parallel compatibility layers.

## Pattern

- Find all callers and non-code references before changing the API.
- Introduce the new shape, migrate callers in verifiable units, then delete the old API.
- Keep a compatibility layer only when an external compatibility contract requires it.
- Search again after deletion for stale names, strings, docs, tests, and generated references.

## Avoid

- Keeping old and new internal APIs “temporarily” with no removal trigger.
- Adapters that make every future change support both representations.

## Proof

Build/test all migrated consumers and prove the old symbol/path is gone.
