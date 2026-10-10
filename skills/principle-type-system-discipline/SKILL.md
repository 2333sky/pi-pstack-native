---
name: principle-type-system-discipline
description: "Use static types to encode semantic distinctions and legal states; parse external data at boundaries and do not lie to the compiler."
disable-model-invocation: true
---

# Type System Discipline

Use static types to encode semantic distinctions and legal states; parse external data at boundaries and do not lie to the compiler.

## Pattern

- Use discriminated unions/ADTs for variants instead of contradictory optional-field bags.
- Construct types from valid values; make illegal values difficult to build.
- Brand/newtype semantic primitives that must not be mixed.
- Parse external/untyped data once at the boundary.
- Exhaust variants and derive types from authoritative schemas where possible.
- Isolate unavoidable assertions at adapters and explain the external mismatch.

## Avoid

- `as unknown as` across domain code.
- Boolean plus optional timestamp combinations that can contradict each other.
- Duplicated schema and hand-maintained type definitions that drift.

## Proof

Type-check the real callers, add boundary parsing tests, and prove an invalid state or wrong semantic ID no longer type-checks/builds.
