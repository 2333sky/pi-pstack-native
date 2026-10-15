---
name: how
description: "Explain how code works now: architecture, runtime flow, ownership, and where a new change belongs."
disable-model-invocation: true
---
# How

Use this for “how does X work?”, code walkthroughs, ownership/layering questions, or before changing a subsystem you do not yet understand. Use `/skill:why` for historical motivation.

## Step 1: Assess complexity

**Simple:** one function/module or a narrow call path. Explore and explain in one pass.

**Complex:** multiple packages/services, cross-cutting state, or unclear ownership. Fan out 2-4 read-only scouts by concern: entry points, data/state, side effects/integration, tests/config. Keep scopes disjoint. Use references/explorer-prompt.md through pstack_skill for each scout.

## Step 2: Trace the real path

Start from a user-visible or public entry point. Follow concrete calls/data through the system. Record:

- where data enters;
- how it changes shape;
- who owns state;
- where decisions are made;
- external boundaries and side effects;
- where errors/retries flow;
- which tests exercise the path.

Read source, do not infer architecture from directory names alone.

## Step 3: Synthesize

Build one mental model. Resolve contradictions between scouts by checking source. Name the smallest set of files/symbols a new contributor needs to understand.

For placement questions, answer which layer owns the new responsibility and why adjacent layers do not.

## Output

1. **Overview** — two or three sentences.
2. **Key concepts** — named data structures/owners.
3. **Runtime flow** — ordered path from entry to result.
4. **Where things live** — files/symbols.
5. **Gotchas** — hidden state, retries, caching, generated code, tests.
6. **Placement** — when asked, the recommended owner and boundary.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
