---
name: recall
description: "Reconstruct recent working context from the active Pi session, repository state, and available project evidence, then return a compact current-state brief."
disable-model-invocation: true
---
# Recall

Use this for “catch me up”, “where did I leave off?”, or before resuming a topic after context was lost.

## Evidence order

Prefer evidence closest to the actual work:

1. current branch/worktree, `git status`, diff, recent commits;
2. pstack workflow/agent records under `~/.pi/agent/pstack-native/`;
3. active or explicitly relevant Pi session history;
4. PR/issues/docs/chat only when the environment exposes them and they are relevant.

Do not crawl unrelated user sessions or repositories.

For a long transcript, delegate one read-only scout to reduce it to decisions, evidence, and open work. Do not paste raw transcript into the parent context.

## Reconstruct

Separate:

- completed/merged work;
- open PR or in-flight branch;
- verified but uncommitted work;
- reverted attempts;
- planned but not started work;
- recurring problems and failed approaches.

Verify inherited claims against repository state before presenting them as current.

## Output contract

- **Capsule:** at most five bullets for what the work is and overall state.
- **Threads:** one line each with a status tag such as `[merged]`, `[open PR]`, `[in flight]`, `[verified, uncommitted]`, `[reverted]`, `[planned]`.
- **Problems:** up to five recurring problems or failed approaches that matter next.
- **Next move:** one concrete highest-value action.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
