# Worktree cleanup

**Goal:** Clean only pstack-owned Git worktrees after inspecting ownership, dirty state, branch status, and durable workflow references.

## Steps

1. List `~/.pi/agent/pstack-native/worktrees/`, agent records, and `git worktree list`. Match every candidate path to a pstack agent/workflow record. Unknown paths are out of scope.
2. Use the optional worktree-audit CLI with an explicit comparison base when PRs target a parent branch. For each owned worktree, inspect `git status --porcelain`, branch, the explicitly chosen PR base/ref (not an assumed default), commits ahead of that base, remote/PR state when relevant, and whether a non-terminal workflow/agent still references it.
3. Do not remove dirty worktrees, active workflow worktrees, unpushed/unmerged valuable commits, or anything whose ownership is uncertain.
4. Remove only safe owned worktrees with `git worktree remove <path>` (no `--force` unless the user explicitly authorizes destruction after seeing the state).
5. Prune stale Git worktree metadata only after path-level cleanup. Delete pstack records only when doing so cannot break recovery/audit history.
6. Report removed paths, retained paths with reasons, and disk cleanup if measured.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
