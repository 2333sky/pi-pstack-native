## Why

The existing upstream audit checks only manifest/name drift and cannot detect same-version content changes or auxiliary updates. This adds a continuous, auditable Cursor pstack → Pi-native synchronization mechanism with review-gated baseline handling.

## What changed

- M1: pinned Git tree/blob diffs, rename/delete detection, complete file categories, seam evidence, deterministic reports, bounded untrusted-data inspection and dynamic parity assertions.
- M2: per-file migration mappings, pending evidence/risk/acceptance tasks and developer prompt exports.
- M3: daily/manual read-only scan with opt-in deduplicated tracking Issues in a separate least-privilege job.
- M4: clean isolated worktree preparation, native artifact fingerprint checks, seven-gate verification and explicitly authorized deduplicated draft proposals.

## Scope

17 implementation/report files plus these review handoff notes. No runtime, Skill or Playbook refactor. UPSTREAM.json and PARITY.json remain at reviewed pstack 0.15.17; the observed 0.15.23 changes remain pending.

## Blast Radius

Maintainer tooling, parity checks and optional CI notifications. Network and local scans reproduced 35 changes at 837067b75aa20ab58d7b2a2f6c0531e37118c596, including in-your-own-words. All mapping/seam classifications are advisory. Worktree isolation is not an OS sandbox. Opt-in writes never merge, publish or mark integrated.

## Verification

All seven release gates passed on Node 22.19.0 and Node 24.19.0. New upstream tests: 10 passed on both; docs/parity tests: 10 passed. Native fingerprint hardening was followed by upstream suite reruns on both and syntax validation. Workflow YAML and git diff checks passed. Full details and limitations: docs/upstream-sync/VALIDATION.md.

Pre-existing coordinator test intermittently failed during initial/concurrent runs (8/12 units; PROGRAM_CLOSE_BLOCKED unit4,unit5); sequential reruns passed. Exact root cause remains unverified and assertions were not weakened. Offline E2E retains 2 TODOs. Live LLM/GitHub/candidate-merge E2E and scheduled opt-in notification are not_run. Review and integration remain pending.
