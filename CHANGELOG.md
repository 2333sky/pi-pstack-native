# Changelog

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
- Keep unproven rows explicit: 121 files are marked as not reviewed, every file has `evidence: not_run`, and the six missing skills stay pending.


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
