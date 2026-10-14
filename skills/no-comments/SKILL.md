---
name: no-comments
description: "Run a hostile read-only comment review, remove narration and stale workaround prose, and preserve only comments that encode constraints code cannot express."
disable-model-invocation: true
---
# No Comments

Use this to strip unnecessary comments before review without blindly deleting useful contracts.

## Scope

Run a read-only `comment-sicko` reviewer over the requested files or current diff. The reviewer may flag comments and refactor targets but must not edit application code.

## Keep only comments that earn their place

Accept comments for:

- legal/license headers;
- public API contracts where the language contract belongs in docs;
- non-obvious constraints imposed by an external dependency, platform, vendor, protocol, or generated boundary;
- narrowly justified lint/formatter directives when code cannot express the constraint;
- issue/RFC links that preserve externally relevant context.

Narration, section banners, commented-out code, stale TODO explanations, and prose that excuses confusing internal code should normally go.

## Steps

1. Spawn the read-only reviewer on the exact scope.
2. Inspect each flag in context. Reject out-of-scope changes, protected-exception deletions, false MUST KILL reasons and findings without scoped proof. Look up lint/TypeScript suppression rules; suppressions hiding correctness or safety bugs require an exact-symbol MUST KILL finding. For IMPORTANT/do-not-remove claims, inspect the live path with how/why rather than trusting the comment. Rerun one rejected report with the failure named; a second rejection remains failed/open.
3. Delete accepted comment-only noise.
4. When a comment reveals that internal code itself is surprising, prefer a rename/extraction/type/architecture fix rather than shortening the explanation. Keep that code change separate and verify it.
5. Re-run formatting/lint/tests appropriate to touched files.
6. Report deletions, kept exceptions, and any code reshape that remains necessary.

Do not remove a comment if doing so would erase a real external constraint that cannot be inferred from code.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
