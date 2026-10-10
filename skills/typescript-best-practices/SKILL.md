---
name: typescript-best-practices
description: "Apply strict TypeScript boundaries, authoritative schemas, exhaustive variants, and types that make illegal states hard to represent."
disable-model-invocation: true
---
# TypeScript Best Practices

Apply whenever reading or editing `.ts` or `.tsx` code.

## Model the domain

- Prefer discriminated unions over bags of optional booleans/fields.
- Brand or wrap semantic primitives when mixing them would be a bug (`UserId` vs `OrderId`).
- Derive state instead of storing synchronized duplicates.
- Keep one authoritative schema/type source; derive related types when the tooling supports it.

## Boundaries

Treat JSON, API responses, env vars, CLI args, storage rows, and IPC as untyped until parsed. Parse once at the boundary into domain types; do not revalidate trusted internal values everywhere.

Never silence a real mismatch with `as unknown as`, broad `any`, or `@ts-ignore`. If a third-party type is wrong, isolate the assertion at the adapter and explain the external constraint.

## Functions and variants

- Make inputs/outputs reveal ownership and failure shape.
- Exhaust discriminated unions with a `never` check or equivalent.
- Avoid boolean parameters when named variants carry meaning better.
- Prefer pure transformations and narrow mutation scopes.
- Use `satisfies` when checking structure without widening away useful literal types.

## Async and errors

Do not forget promises. Preserve cancellation where the caller provides it. Convert external error shapes at boundaries; do not let `unknown` exceptions leak assumptions through the domain.

## Tests

Test public behavior and literal outcomes. Types are not a substitute for runtime validation at external boundaries, and runtime tests should not duplicate what the compiler already proves.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
