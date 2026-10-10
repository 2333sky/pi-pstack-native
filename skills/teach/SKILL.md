---
name: teach
description: "Explain a subsystem or change so a person can build a correct mental model, combining current behavior and historical rationale when useful."
disable-model-invocation: true
---
# Teach

Use for “teach me”, “help me really understand this”, or a request to explain a change/subsystem rather than merely answer one narrow fact.

## Gather

Run `/skill:how` for current architecture/runtime behavior. Run `/skill:why` only when rationale/history materially improves understanding. For a small target, do both directly without unnecessary subagents.

## Build the explanation

Teach in layers:

1. **One-sentence model:** what the thing is for.
2. **Parts:** the 3-7 concepts the reader must hold.
3. **Flow:** one concrete request/data path end to end.
4. **Ownership/invariants:** where state lives and what must remain true.
5. **Why this shape:** only evidence-backed rationale, clearly marked if inferred.
6. **Failure/gotcha:** one or two common wrong mental models.
7. **Where to read next:** the smallest useful set of files/symbols.

Prefer one worked example over abstract vocabulary. Define jargon at first use. If the reader could not predict what happens on the next input, the explanation is incomplete.

## Output

Use diagrams/tables only when they reduce cognitive load. Keep source pointers close to the claims they support.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
