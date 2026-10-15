---
name: why
description: "Explain why code or a decision has its current shape by combining source archaeology with available issue, docs, chat, incident, observability, and product evidence."
disable-model-invocation: true
---
# Why

Use for rationale, regressions, thresholds, “why did we choose X?”, or postmortem-style questions. Use `/skill:how` when the question is only current runtime behavior.

Read references/epistemics.md in full using pstack_skill.

## Operating posture

Do not treat the newest commit or current code as the whole rationale. Decisions accrete. Separate documented intent from inference.

## Step 1: Anchor the question

Identify the exact symbol/file/behavior and what “why” means: original motivation, later change, threshold choice, regression cause, or current trade-off.

## Step 2: Establish source history

Use available version-control evidence:

- blame relevant lines;
- inspect file/symbol history through renames;
- inspect commits and PR references around semantic changes;
- compare before/after behavior, not just commit messages.

## Step 3: Investigate other evidence in parallel

Use only sources available in the current environment. Candidate categories:

- issue tracker;
- long-form design docs;
- real-time team chat;
- incidents/postmortems;
- error/observability data;
- product analytics/warehouse.

Before spawning, build a coverage map for all seven categories from pstack_evidence: source-control, issues, documents, team-chat, observability, errors and analytics. The parent performs authorized live connector/Git queries and supplies evidencePackets per investigator; read-only children do not gain MCP access. Give each investigator references/investigator-prompt.md and its references/sources/<category>.md. For defensive code include incident-postmortem.md. Assign one read-only investigator per useful category when the question is complex. If a source category is unavailable, report that gap. Skip a category only when it is provably irrelevant.

## Step 4: Synthesize

Use references/synthesizer-prompt.md. The parent spot-checks decisive live citations; do not claim the child queried a connector. Build a timeline of decisions and constraints. Resolve conflicts by source proximity and date. Mark:

- **fact:** directly supported;
- **inference:** best explanation from evidence;
- **unknown:** evidence missing or contradictory.

## Output

Lead with the answer, then the evidence chain, trade-offs, what changed over time, and open uncertainty. Include source/file pointers appropriate to the environment.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
