# Changelog

## Unreleased

- Archive a commit-bound authenticated real-model receipt: three models passed the read-only probe on `5deb723`, and `SEMANTICS.json.evidence.realModel` records `status: "passed"` with that receipt.
- Validate live GitHub delivery against a disposable repository: create, read, close and merge now have a recorded run. Add an opt-in `--merge` gate to the live tier; it stays closed unless `PSTACK_E2E_LIVE_MERGE=1` is set with an explicit write target.
- Record the npm registry state: `pi-pstack-native` is unpublished, so `1.0.0` is unclaimed; no npm credentials exist in the validation environment.
- Record the maintainer semantic sign-off in `SEMANTICS.json.review` for the 11 core entrypoints and their declared deviations.
- State the 1.0.0 guarantee scope explicitly in `docs/PUBLISHING.md`, including the exclusion of Windows real-model workflow acceptance and of branch-protection, review, auto-merge and merge-queue behaviour.

- Prepare the `1.0.0` version in the package manifest and lockfile, while retaining explicit release approval and external validation gates; the version has **not** been published by this change.
- Align the package identity check with the manifest/lockfile, and document stable-channel installation and outstanding release evidence.

- Rename the repository and package to `pi-pstack-native` and document direct Pi Git installation.
- Upgrade the pinned pstack source to 0.15.36 and retain the 0.15.32 snapshot; keep maintainer semantic approval and authenticated-model evidence separate.
- Preserve panel and workflow configuration during setup and validate role-model reasoning selections.
- Preview available-model defaults and edit individual roles, task overrides and panels in `/setup-pstack`; route Reflect lens models with `modelRole`. Arena and Architect use an eligible cross-judge or return candidates for coordinator selection, and preserve verified candidates after a dropout.
- Use isolated adversary and independent reproduction sessions for Interrogate; copy staged, unstaged and untracked target changes and never integrate review worktrees automatically. Reports require command evidence and remain subject to coordinator inspection.
- Add first-pass and rank-all Swarm race templates and an Architect implementation phase. Include the pstack 0.15.36 Statechart TypeScript source and test corpus, plus a compiled runtime that works inside installed Node packages.
- Fix Windows atomic state writes, build paths, and lock contention; improve task-report diagnostics and benchmark controls.

Earlier entries below describe their original snapshots and may retain historical package names or validation boundaries.

## 0.6.0-preview.1 — Preview

- Add strict Brief, scope/report checks, Artifact, supervised Gate and immutable Ledger.
- Add GitHub Frontier, authorized SHA-bound shipping, templates, Program Inbox and context.
- Add panels/budgets, standalone Runner, migration, fault tests and benchmark harness.
- Preview: real authenticated model/GitHub E2E remain separate release gates.
- GitHub bootstrap: fix benchmark compiled imports; add offline benchmark smoke, CI, release documentation, and contribution/security guidance.
- Bind every baseline receipt to the consuming task. Foreign, stale-revision and ownerless baselines are refused with `BASELINE_NOT_OWNED` instead of being trusted on id and fingerprint alone.
- Commit a program unit's dispatch record with the unit link in one transaction, then rebuild the workflow file from it. Orphan workflow files and files that drifted from their dispatch are refused before a child starts.
- Redact evidence through one rule table over the joined buffer before tail truncation, and name the read-only tool allowlist once so a read-only profile cannot list a writing tool.
- Record the pinned upstream 0.15.32 tree and generate a 200-file inventory from it, with one disposition per file, a reference-closure list and a check that fails on drift.
- Keep unproven rows explicit: 116 files are marked as not reviewed and every file has `evidence: not_run`.
- Register `in-your-own-words` and `sharpen`, and port `ketchup-video`, `create-formal-verification-skill` and `maintain-formal-verification-skill` with their platform seams and dependency checks.
- Make the parity manifest able to say it is short of the pinned target: the pending set and its reasons are checked against the target snapshot, so a gap cannot disappear silently.
- Add behavior contracts for all 23 playbooks, derived from each playbook's numbered steps and roles, with `evidence: not_run` and a drift check in `npm run check`.
- Add a generated per-record registry for all 81 registered names, carrying source, port, requirements, contracts and evidence, with a validator that refuses a claim its own fields do not support.


## Earlier releases

## 0.3.4 — 2026-10-10 (Release Candidate)

- Contain synchronous and asynchronous timer callback failures, emit diagnostic logs, and use bounded exponential retry backoff for transient state-lock and execution-lock contention.
- Add generation-guarded `start()` / `stop()` lifecycle handling and serialize timer ticks so stopped callbacks cannot rearm and one scheduler cannot overlap its own run.
- Add per-loop cross-process execution locks held through Pi's asynchronous send. Contending processes preserve the due occurrence and retry after the active send settles.
- Add real-timer, multi-process regressions for crash isolation, recovery, backoff cadence, stop races, observable sync/async send failures, atomic occurrence claims, in-flight updates, disable, and deletion.
- Document the scheduler's at-most-once dispatch-attempt semantics: a host crash after durable claim but before Pi accepts the message can lose an occurrence; already submitted messages cannot be recalled.
- Retain package name `2333`, use the official Pi SDK peer, and align source and package metadata on `0.3.4`.

## 0.3.3 — 2026-10-10 (Release Candidate)

- Align the package, extension banner, package policy check, README, and review metadata on version 0.3.3; retain the npm package name `2333`.
- Extend real Pi SDK integration coverage with a successful AgentHost turn and a post-failure recovery run using a loopback-only OpenAI-compatible protocol fixture.
- Add an installed-tarball smoke script that loads the extension from `node_modules/2333` through the real Pi SDK and checks its registered tools.
- No production runtime behavior changes are intended in this release candidate; external authenticated LLM inference remains a separate validation gate.

## 0.3.2 — 2026-10-10

- Correct child turn success detection: only the current turn's final `stopReason: stop` yields success; provider errors, aborts, truncated output, missing messages, and tool continuations do not.
- Change cancellation into a persistent two-stage protocol (`cancelling` -> `cancelled` only after the affected work settles). Remote owners poll for persisted cancellation and invoke `session.abort()`; unknown remote status remains unconfirmed.
- Move workflow lifecycle and call writes into short cross-process file-locked state transactions with revision counters.
- Replace unrestricted readonly-agent tools with workspace-confined custom read/ls/find/grep and disable nested pstack extension loading for readonly agents.
- Execute potentially expensive JavaScript regex searches in a time-limited worker thread to avoid blocking the host event loop.
- Add behavioral regression tests, including independent process contention, cancellation and resume races, boundary/symlink checks, and provider outcome checks.
- Replace misleading source-string review PASS heuristics with explicit test and release-gate documentation; add TypeScript checking, an installed SDK session smoke test, and a CI workflow.
- Bring verifier documentation into line with the no-shell profile.

### Incomplete validation / risks

- A real authenticated Pi Host inference integration test is **not** included in the locally executed test results.
- `cancelling` intentionally remains non-terminal when remote shutdown cannot be confirmed; no implementation can guarantee immediate interruption of a non-cooperative external action without stronger isolation.
- Custom read-tool path confinement is not an operating system sandbox. Treat untrusted Agent workloads as needing OS-level constraints.
