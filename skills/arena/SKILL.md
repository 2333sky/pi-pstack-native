---
name: arena
description: "Give the same brief to independent candidates, cross-judge them, choose a base, graft only the strongest ideas, and verify the result."
disable-model-invocation: true
---
# Arena

Use Arena when one first attempt would prematurely lock in a design, implementation, test strategy, explanation, or other non-trivial artifact.

## Phase A: Frame

Write one brief shared by every candidate:

- exact outcome;
- constraints and non-goals;
- files or surface in scope;
- pass/fail checks;
- what candidates may change.

Do not tell candidates what answer you expect.

## Phase B: Fan out

Run 2-4 independent candidates in parallel. For code-writing candidates, use separate worktrees. For design-only candidates, use read-only or isolated sessions. Give all candidates the same evidence and success criteria.

Each candidate must return its artifact plus the decisions it made and how it verified them.

## Phase C: Cross-judge

Run a read-only reviewer or judge after the candidates finish. Hide model identity when practical. Judge against the brief, not style preference. Ask which candidate is the best base and which concrete parts of the others are worth grafting.

## Phase D: Pick a base and graft

Choose one base. Incorporate only improvements that remain independently defensible. Do not merge every idea. A graft that adds complexity without improving the acceptance criteria is rejected.

For code, one owner performs the final integration in one worktree. Do not make several candidates concurrently edit the chosen base.

## Phase E: Verify

Run the real acceptance checks on the integrated result. If the arena was for architecture, verify that the implementation still follows the chosen shape. If the judge and direct evidence disagree, direct evidence wins.

## Output

Report the candidate set, winning base, grafted ideas, rejected ideas, and final verification.

## Pi-native execution contract

- Use `pstack_agents` for one bounded independent child.
- Use `pstack_workflow` for parallel or dependent work. Give every node a stable key and a narrow task.
- A write-capable worker normally gets its own Git worktree. A reviewer is read-only. A verifier that directly depends on one worker is placed on that worker checkout.
- Completed workflow nodes are durable. After resume, inspect workflow status before starting replacement work.
- Model roles come from `~/.pi/agent/pstack-native/models.json`; do not hard-code provider-specific slugs in a skill.
- Cursor `Task`, cloud-agent, Custom Mode, and `/loop` wording describes intent only. Use the native tools and `/pstack-loop` instead.
