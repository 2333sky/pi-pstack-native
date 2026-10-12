---
name: unslop
description: "Cut AI tells from writing: vague abstraction, canned transitions, fake emphasis, repetition, hedging, and jargon that does not add precision."
disable-model-invocation: true
---
# Unslop

Apply to the final prose, not to code semantics.

## Process

1. Identify the actual claims/actions the text must preserve.
2. Delete sentences that only announce what the next sentence will say.
3. Replace vague nouns and verbs with the concrete actor/action/result.
4. Collapse repeated points into the strongest single statement.
5. Remove fake emphasis, marketing language, and generic praise.
6. Remove hedges unless uncertainty is real and useful.
7. Keep necessary caveats close to the claim they qualify.
8. Read the result aloud in a plain conversational voice.

## Common patterns

Cut or rewrite:

- “It is important to note that…”;
- “robust”, “seamless”, “powerful”, “comprehensive” without evidence;
- repeated “Additionally/Furthermore/Moreover” transitions;
- “leveraging/utilizing” where “using” works;
- three summaries of the same conclusion;
- invented quotes, fake stakeholder language, or fabricated certainty;
- headings that merely repeat the first sentence;
- decorative jargon that hides a simple action.

Also remove abstract metaphors, decorative emoji, synonym cycling, and forced groups of three. Use periods instead of long dashes. Use a colon only before a list or example, not between two thoughts. Keep complete sentences with articles and verbs. Replace a feeling with the concrete mechanism or measured result.

Do not make precise technical prose shorter at the cost of losing conditions, units, failure modes, or attribution.

## Output

Return the cleaned text unless the operator asked for an edit report. Preserve code, commands, identifiers, and factual uncertainty.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
