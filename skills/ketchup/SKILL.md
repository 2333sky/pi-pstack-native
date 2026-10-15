---
name: ketchup
description: "Catch the user up on this Pi chat since their last message. Give decisions that need the user enough context to act. Use for /skill:ketchup."
disable-model-invocation: true
---

# Ketchup

Catch up without starting new work. Use the plain voice of [bro](../bro/SKILL.md), without its restatement step.

## Find the cutoff

Use the last user-authored message before the current `/skill:ketchup` request as the cutoff. The current request is not the cutoff. Notifications, tool results, scheduled prompts, and subagent completion messages must not move it, even if Pi delivers them with a user role. Determine authorship from the active chat and its event provenance, not from the role alone. Read only this workspace's active session if earlier messages are missing. If authorship cannot be established, state the gap. Do not guess a cutoff.

Assume the user remembers that message and nothing after it. Use names for PRs, branches, and agents that the user knows.

## Gather what changed

Keep the status recheck read-only. Collect this chat's work, child reports, and other messages after the cutoff. Recheck the current state of each PR, CI run, workflow, and agent this chat touched. Use read-only status tools. Do not edit, resume, retry, push, comment, start a babysit, or merge. Name work still running and checks you could not perform.

An action item is a decision or step only the user can take. Include approvals, product choices, irreversible actions, and missing access. Include older items still waiting on the user. Work you can do yourself is not an action item.

## Write the reply

Open with the number of action items, or say there are none. If nothing changed and nothing waits on the user, say so and stop.

Keep the reply well under 150 words including labels in visuals. Use plain sentences; omit hashes, paths, build numbers and counts unless the user needs them to act. Check every number against its source. Use at most four compact boxes to show the outcomes of requested work, never mark work done while it awaits the user, and never repeat a fact in both prose and a visual. Use available screenshots for visible changes; otherwise mark the missing screenshot and describe the visible change. A Mermaid diagram can represent nonvisual work. Do not start an app or job to manufacture a visual.

List the important results first. Say what each result means for the user. Skip steps that changed nothing. Name work you can still do yourself in one line.

Give each action item a recommendation and why, followed by what happens if the user does not answer. For choices, show the real options or before/after in a small visual with their costs; skip visuals for access requests and unasked irreversible steps. Never invent an action item just to fill a format.

Give each action item a short summary that stays useful out of context. Name the affected work, the decision, why it matters now, the options and their costs, your recommendation, and the default if the user does not answer. State unknown facts instead of guessing. Link to detail when available, but include enough context to decide without opening it.
