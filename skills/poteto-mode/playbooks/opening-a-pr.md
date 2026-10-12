# Opening a PR

**Goal:** Publish a verified, narrow change with a truthful review brief.

## Steps

1. Inspect `git status`, branch, base, and the full diff in a worktree off trunk. Remove unrelated changes. Keep small, ordered commits that can become independent PRs.
2. Run the required local checks and real-surface verification. Record exact commands, outcomes, and gaps.
3. Read [technical-writing](../../technical-writing/SKILL.md) for titles, bodies, and commit messages. Apply every layer except document-mode selection. Use one word per action, keep articles, and prefer plain verbs. Then apply [unslop](../../unslop/SKILL.md).
4. Reread the diff before commit and remove accidental code or prose. Use an available cleanup tool, but do not require Cursor-only plugins. Run [no-comments](../../no-comments/SKILL.md) before an independent read-only [interrogate](../../interrogate/SKILL.md) review of non-trivial changes. Review callers, failure paths, retries, shared state, and security. Resolve blockers or dismiss findings with evidence.
5. Write a Conventional Commit title such as `fix(pstack): correct the PR base`. Keep the body a one-minute briefing with the headings below. Commit bodies do not repeat their subject. Link long logs instead of pasting them.
6. Select the forge once before the first PR operation. Use `gh` by default. Prefer Origin only if `command -v origin` succeeds and it resolves this repository. Record a fallback and use the same forge for create, edit, view, checks, watch, and merge. A built-in PR tool takes precedence for operations it owns, as described below.
7. Publish only with explicit authorization. Inspect remote state before retrying a push, creation, or update. Open ready, never as a draft. Confirm the actual base and readiness with the selected forge before reporting the URL.
8. Post the URL, head, base, checks, and gaps. Opening a PR does not start a babysit. Finish the phase or stack, then queue a separate babysit pass when requested. A subagent returns to its parent without polling. An explicitly assigned full-autonomy owner may start its assigned babysit loop after its code-ready report. That exception does not authorize a merge.

## PR body

Use these `##` headings in order. All except Tradeoffs are required and must have content.

- `## Why` gives the problem and approach in one to three sentences.
- `## What changed` gives one to three bullets on the change. Name both sides of a rename or retarget.
- `## Scope` always states what this PR covers and deliberately leaves out. Do not write a file-by-file essay.
- `## Tradeoffs` is optional. Include only rejected alternatives that a reviewer would otherwise ask about.
- `## Blast Radius` states who or what the change affects and the risk. If trunk is red, state the cost of leaving it red.
- `## Verification` lists actual commands or run paths, their outcomes, and checks not performed. Do not imply mock tests prove live behavior.

Attach screenshots or videos only when they prove a claim. Keep SHA lists and long evidence in a linked artifact. Validate a body with `node docs/validate-pr.mjs <body.md>` from the repository checkout.

## Stacks and readiness

Prefer small independent PRs. A dependent stack is a base-branch chain. The root targets trunk. Each child starts from its parent's exact tip and targets the parent branch. Branch from trunk only for independent work. Reconcile trunk before substantial stack work without deleting unrelated work.

Without a built-in PR tool, use `gh pr create --base <parent-branch>` for a child and `gh pr edit <pr> --base <parent-branch>` to retarget. Omit `--draft`. With Origin, use `origin pr create --status open --base <parent-branch>`.

When a built-in PR tool owns creation, pass `draft: false` and use that tool to edit, retarget, or mark ready. Preserve its provenance. Do not replace its tracked PR with a CLI-created one. If a PR is still draft, use its owning tool to mark ready, or `gh pr ready <number>` or `origin pr ready <number>` when no tool owns it.

## API and tool boundary

The GitHub API is the remote REST or GraphQL service. `gh pr` is a CLI client. `gh api` accesses that service directly. Neither is Cursor's built-in PR tool, which tracks run-specific PR provenance. Use the selected forge for read operations or actions that the built-in tool does not cover. Pi does not supply Cursor's private PR metadata. That platform behavior stays unsupported unless the current harness provides its own equivalent.

External writes and merges require explicit authorization. Ready is not permission to merge. Never arm auto-merge merely because checks are green. Route an authorized merge request to [shipping](shipping.md).

## Native runtime rules

- Use `pstack_workflow` for parallel or dependent child work. Give calls stable keys and explicit dependencies.
- A single writer may use the target checkout. Independent parallel writers use separate worktrees; a writable chain stays in its predecessor workspace.
- If two or more writer artifacts must become one deliverable, add an `integrator` node depending on those writers, then make final verification depend on the integrator.
- A verifier should directly depend on the writer/integrator it verifies so the runtime places it on that exact checkout.
- Inspect durable workflow status after interruption; never duplicate a call already recorded completed.
- External side effects are not magically exactly-once. Before retrying a push, PR update, comment, or merge, inspect remote state first.
