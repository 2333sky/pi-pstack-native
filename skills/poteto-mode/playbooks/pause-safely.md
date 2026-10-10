# Pause safely

**Goal:** Stop at a durable boundary without losing work, starting irreversible actions, or forcing the next session to reconstruct state from scratch.

## Steps

1. Stop spawning new work. Let the current atomic operation finish when safe, or abort it if continuing could create an unsafe partial side effect.
2. Do not push/open/merge/delete merely to make pausing convenient unless that action was already authorized and is the safe boundary.
3. Persist the state you already own: workflow/agent IDs, branch/worktree path, commits, dirty status, completed verification, and pending dependencies. The native runtime keeps workflow and child session records automatically.
4. If uncommitted edits are valuable, either make a clearly labeled local WIP commit when repository policy permits or leave the owned worktree intact and explicitly record that it is dirty. Never force cleanup.
5. Write a compact resume note containing intent, done predicate, what is complete, what is verified, exact next step, key files, and gotchas. Point at `show-me-your-work` evidence instead of duplicating logs.
6. On resume, use Session pickup. Do not rerun completed workflow nodes “to be safe”.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
