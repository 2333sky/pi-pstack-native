---
name: automate-me
description: "Turn repeated operator preferences and working habits into a concise reusable mode skill, using repeated evidence rather than one-off remarks."
disable-model-invocation: true
---
# Automate Me

Use this when the operator wants their recurring working style captured as a reusable skill.

## 0. Check for an existing skill

Search user/project skill locations for a matching `*-mode` skill. If one exists, revise it instead of creating a duplicate.

## 1. Mine evidence

Use available Pi session/repository evidence to find repeated preferences. Good evidence appears more than once or is stated explicitly by the operator. Look for:

- response length, tone, and formatting;
- autonomy versus confirmation preferences;
- investigation habits and preferred tools;
- subagent and parallelism habits;
- code/prose discipline;
- review and verification expectations;
- git/PR workflow;
- recurring corrections.

A one-off request is not automatically a preference.

## 2. Ask only for gaps that matter

If a missing preference changes the skill materially, ask one compact question. Otherwise draft from evidence and let the operator correct it.

## 3. Cluster

Group rules by behavior rather than conversation. Remove defaults and generic advice. A rule belongs only if it would change what an agent does.

## 4. Draft

Create a short operational skill:

- frontmatter name and trigger description;
- a small set of sections with imperative rules;
- references to existing skills instead of copying them;
- explicit verification and autonomy boundaries;
- `disable-model-invocation: true` unless the operator explicitly wants it always active.

## 5. Review and land

Run `/skill:unslop` on the prose. Check referenced files and commands. Show the proposed behavior changes and where the skill will live before any destructive replacement.

## Guardrails

Do not infer sensitive personal traits. Do not copy secrets or private transcript excerpts into the skill. Do not encode a correction that conflicts with current explicit instructions.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
