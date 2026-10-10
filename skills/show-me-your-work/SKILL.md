---
name: show-me-your-work
description: "Keep a compact reviewable decision trail for long-running work: what changed, why, evidence, and result."
disable-model-invocation: true
---
# Show Me Your Work

Use for autonomous, multi-phase, or expensive work a human may review after stepping away.

## Format

Use one TSV row per material decision:

```text
ts	phase	decision	why	evidence	result
```

Fields:

- `ts`: ISO-8601 timestamp;
- `phase`: stable workstream/phase name;
- `decision`: one-line action or choice;
- `why`: plain reason;
- `evidence`: a short pointer such as commit SHA, PR, `file:line`, workflow ID, trace or screenshot path;
- `result`: observed outcome such as `tests green`, `reverted`, `inconclusive`, `open`.

## Rules

- Log decisions, not narration. “Read file X” is not a decision.
- Evidence is a pointer, not a pasted log.
- Record reversals as new rows; do not rewrite history.
- Keep the trail local by default. Commit it only when a reviewer needs it as part of the artifact.
- Never place secrets or private transcript content in the trail.

## Audit

Before handoff, compare the trail with the actual workflow journal, commits, and current diff. Missing consequential decisions get a row. Rows whose evidence no longer exists are fixed or marked stale.

For a high-risk run, use a read-only reviewer to challenge whether the trail supports the claimed result.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
