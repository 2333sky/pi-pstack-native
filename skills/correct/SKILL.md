---
name: correct
description: "Find repeated agent mistake classes and make them structurally harder or impossible, preferring architecture and types over docs."
disable-model-invocation: true
---
# Correct

The operator keeps correcting the same class of mistake. Change the repository so the next agent is less able to make it.

## Find mistake classes

Read recent fixes/reverts, review comments, agent instructions, tests, lints, and nearby workaround comments. Group mistakes by underlying cause. Treat a class as recurring when there are at least two credible examples or one explicit operator statement that it must never recur.

## Fix at the highest effective layer

Try in this order:

1. **Architecture.** Give state one owner, expose one supported path, delete obsolete alternatives, derive duplicate data from one source.
2. **Types/schema.** Make the bad state or wrong semantic value impossible or difficult to construct.
3. **Lint/CI check.** If the pattern is syntactic or structural, fail with an error that names the correct replacement.
4. **Behavior test.** Exercise the public behavior and assert a literal outcome that the old mistake breaks.
5. **Docs/agent rule.** Use text only for judgment calls that cannot be encoded.

Do not add another instruction when the same instruction already existed and was ignored. That is evidence the rule belongs in structure.

## Prove the prevention

For each new guard, replay a real past mistake or a minimal equivalent and show the guard fails. Then show the corrected form passes. Keep the same command in local development and CI when possible.

## Rule table

Maintain a small project rule table pairing each recurring rule with the mechanism that enforces it. Remove prose rules once the repository structure makes them impossible.

## Output

For every class: evidence, chosen enforcement layer, why a higher layer was not practical, failing proof, passing proof, and any remaining judgment call.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
