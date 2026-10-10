# Session pickup

**Goal:** Resume existing work from durable Pi/workflow/git evidence without redoing completed investigation or implementation.

## Steps

1. Locate the prior trail: active Pi session, pstack workflow/agent records, branch/worktree, commits/diff, PR, and any show-me-your-work log. Stay inside the relevant repository/session; do not crawl unrelated chats.
2. Reconstruct operational state: goal, branch/worktree, completed units, verification already performed, open todos, decisions, and failed/reverted approaches.
3. Compare done versus pending. Durable workflow nodes marked completed are authoritative state; inspect their artifacts rather than rerunning them from scratch.
4. Name one exact resume point and route the remaining work to the matching playbook. Session pickup ends there; the routed playbook owns new execution.
5. Before relying on an inherited success claim, verify it against the original goal/current artifact when cheap. Distinguish stale evidence from still-valid evidence.
6. Report current state, resume point, next playbook, and any uncertainty that could change the next safe action.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
