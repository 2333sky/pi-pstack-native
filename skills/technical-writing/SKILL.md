---
name: technical-writing
description: "Write or review technical prose with the right document mode, short direct sentences, consistent terms, explicit conditions, and task-oriented instructions."
disable-model-invocation: true
---
# Technical Writing

Use for docs, RFCs, READMEs, PR descriptions, runbooks, migration guides, and commit messages.

## Pick the document mode first

Do not mix purposes accidentally:

- **tutorial:** learning by doing, guided path;
- **how-to:** steps to accomplish a known goal;
- **explanation:** concepts, rationale, trade-offs;
- **reference:** precise facts, options, contracts.

A document can link between modes, but each section should know what job it is doing.

## Write for the reader

- Start with what the reader can do or understand after reading.
- Use active voice when the actor matters.
- Use the shortest precise everyday word.
- One sentence should carry one main action or claim.
- Put conditions before instructions when they change whether the step applies.
- Use one term for one concept. Do not rotate synonyms for style.
- Name commands, files, flags, states, and error messages exactly.
- Delete throat-clearing, fake importance, repeated conclusions, and empty transitions.

## Instructions

Use imperative steps. Put prerequisites before the first step. State expected output or success condition where ambiguity is likely. A troubleshooting branch names symptom → cause/check → action.

## Technical claims

Separate fact, inference, recommendation, and example. Give units and boundaries for numbers. Do not say “safe”, “fast”, “simple”, or “supported” without the condition that makes it true.

## PRs and commit messages

Apply every writing layer except document-mode selection. A PR body is a one-minute briefing. Keep articles and verbs. Use one word for each action and a plain verb instead of an unnecessary `-ing` form. Use real symbols and commands instead of invented labels. Do not repeat a commit subject in its body. Link long logs and SHA lists rather than pasting them. Follow [opening-a-pr](../poteto-mode/playbooks/opening-a-pr.md) for required headings.

## Final pass

Run `/skill:unslop`. Read for ambiguity: pronoun referents, overloaded terms, hidden subject, unclear “this/that”, and sentences that join unrelated actions.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
