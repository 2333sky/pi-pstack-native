# Opening a PR

**Goal:** Turn a verified local change into a reviewable PR with a truthful concise description and no hidden verification gaps.

## Steps

1. Inspect `git status`, branch/base, and the full diff. Remove accidental/generated/unrelated changes or explain why they belong.
2. Run the required local checks plus real-surface verification appropriate to the change. Record exact evidence and known gaps.
3. Run an independent review for non-trivial changes. Resolve blocking findings or state why a finding is dismissed with evidence.
4. Ensure commits are ordered and understandable. Avoid mixing unrelated cleanup into the PR.
5. Write a concise PR body: user-visible problem/outcome, key design decisions, verification evidence, risk/rollback, and any follow-up. Do not paste a tool diary.
6. Create or update the PR only when the task/user already authorizes publishing. Before retrying after interruption, check whether the PR already exists and whether the same head was already pushed.
7. Return PR identifier/URL when available, head/base, checks, verification, and any remaining reviewer decision.

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
