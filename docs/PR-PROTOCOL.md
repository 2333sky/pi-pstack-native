# PR protocol checks

## Sample stack

The root branch `feature/validation-api` adds a small validation API. Its ready PR targets `main`. The child branch `feature/validation-cli` starts at the root branch's exact tip. Its ready PR targets `feature/validation-api`, not `main`. Independent work branches from `main` instead.

Publish both only after explicit authorization. Do not start a babysit after the root PR opens. Finish the stack and return both URLs. Queue a separate babysit pass when requested. An explicitly assigned full-autonomy owner with an assigned loop is the exception. Merge permission remains separate.

[The sample child body](stacked-pr-body.md) shows the required headings. Validate it without remote writes.

```bash
node docs/validate-pr.mjs docs/stacked-pr-body.md
node --test docs/parity.test.mjs
```

The first command prints `PR protocol ok`. The tests reject draft PRs, children with the wrong base, early babysit starts, missing Scope or Verification, empty sections, and headings hidden in fenced code. Tradeoffs is optional. The validator accepts heading case differences, including `Blast radius`.

## State snapshots

To check readiness and handoff as well as the body, pass a local JSON file as the second argument. This example describes the child before the stack is complete.

```json
{
  "isDraft": false,
  "base": "feature/validation-api",
  "parentBranch": "feature/validation-api",
  "trunk": "main",
  "babysit": false,
  "phaseComplete": false,
  "ownerFullAutonomy": false
}
```

A root uses `parentBranch: null` and targets `trunk`. Set `babysit` to true only after phase or stack completion, or for an explicitly assigned full-autonomy owner. This snapshot is fixture data. The validator does not contact a forge, authorize writes, verify a parent's exact commit, or prove an agent follows the playbook.

## Forge and provenance

Select `gh` once, or Origin when available and able to resolve the repository. Keep that forge for operations throughout the run. The GitHub API is the remote service. `gh pr` is a CLI client, and `gh api` calls the service directly.

Cursor's built-in PR tools track run-specific provenance. The API and CLI do not provide that metadata. When a harness supplies an owning PR tool, use it for create, edit, retarget, and mark-ready operations. Set `draft: false`. Use the selected forge only for operations that tool does not cover.

Pi does not implement Cursor's private PR-tool metadata or upstream watcher's merge-queue verdicts. These remain unsupported platform behavior. The local playbooks use read-only forge state and stop at merge-ready. Opening a PR and merging it both need explicit authorization.

## Proof boundary

The tests load ketchup with the official Pi skill loader and check its sections and cutoff wording. Chat behavior itself was not exercised. That harness belongs to issue #6. The PR tests check local bodies and fixture state only. They do not prove live review, stack handoff, or merge behavior.
