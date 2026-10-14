# Continuous upstream sync implementation

The reviewed baseline remains pstack 0.15.17 at
`978ca6e9c0e012047cd5058b8e829240336e704e`. No product runtime, Skill,
Playbook, UPSTREAM.json or PARITY.json was changed by this implementation.

## Architecture and milestones

- M1: `core.mjs` pins Git commits, compares only `pstack/`, records raw Git
  modes/blob evidence and renames, inventories names, classifies all file types,
  and scans old/new keyword seams without executing upstream data. Reports are
  fingerprinted independently of generatedAt. `parity.mjs` replaces version/count
  constants with consistent metadata and validated evidence while retaining
  pending/unsupported/file-existence/non-equivalence gates.
- M2: every change has a task ID, local mapping, advisory disposition, risk,
  owner placeholder, acceptance requirements and missing/pending evidence.
  Markdown reports/task exports prohibit treating upstream instructions as
  authorization. Report declarations are in `report.d.ts`; the parser is
  exercised with valid and invalid fixtures.
- M3: daily/manual read-only Actions scanning plus artifacts; explicitly enabled
  notification uses a separate issues-write job, trusted local notifier and
  all-state marker deduplication. No npm/LLM invocation in the scan job.
- M4: explicit prepare → exported developer prompt → local implementation →
  verify → dry-run/authorized draft proposal. Prepared branches use independent
  worktrees. Dirty/existing worktrees, missing gates, stale verification,
  history divergence and automatic baseline changes block proposals. Optional
  commands reuse the native artifact fingerprint, including hidden-index-flag
  rejection and pre/post-test source equality. No
  provider/model is selected and no automatic inference is started.

Seven local gates retain existing behavior; required Node CI matrix is unchanged.
Upstream test suite is included in `npm run check` and therefore both matrix jobs.

## Real pinned upstream example

`reports/978ca6e9c0e0_837067b75aa2.json` compares the reviewed baseline to
`837067b75aa20ab58d7b2a2f6c0531e37118c596`, manifest version 0.15.23.
It contains 35 changes: 1 manifest, 2 agents, 1 other, 1 docs, 12 Skills,
6 references, 2 Playbooks and 10 scripts. Skill `in-your-own-words` is added.
There are 59 old/new keyword seam observations. These are observations from
this pinned tree, not hard-coded assertions or completed semantic ports.

Reproduce using a full upstream Git clone or network mode:

```bash
npm run upstream:scan -- --candidate-ref 837067b75aa20ab58d7b2a2f6c0531e37118c596
npm run upstream:scan -- --from /path/to/cursor/plugins/pstack --candidate-ref 837067b75aa20ab58d7b2a2f6c0531e37118c596
npm run upstream:plan -- --report docs/upstream-sync/reports/978ca6e9c0e0_837067b75aa2.json
```

Network fetch and offline scans produced the same sync ID/fingerprint. A repeated
scan preserves the original timestamp and reports instead of duplicating them.
The real candidate tasks remain pending; report gates are `not_run` because they
refer to porting this upstream candidate, not testing the detector implementation.

## Validation evidence

See `VALIDATION.md` for final command outcomes and remaining limitations. The
new offline tests exercise fixed Git commits, unchanged input, same-version
changes, auxiliary-only changes, equal-count renames, deletions, new names,
missing refs/manifest, history divergence, binary/oversized/special Git modes,
symlink/traversal output safety, prompt-injection data, report tampering,
parity blockers, all-state Issue deduplication and API errors. CLI/worktree
integration tests execute actual npm gates in an isolated fixture and show that
failed builds cannot be proposed and a verified candidate only produces a
proposal, never integration or baseline updates.

## Limitations and remaining risks

- This delivers the synchronization mechanism, not the 35-item 0.15.23 semantic
  port. Every real change needs adaptation evidence and maintainer approval.
- Keyword seams and file mappings are advisory; text-only changes are not
  assumed low risk. Unsupported behavior stays visible. No behavioral or
  byte-level equivalence is inferred from names, counts or CI.
- Verification fingerprints are integrity checks, not signed attestations.
  CI must independently rerun checks and reviewers must inspect task evidence.
- Worktrees and cooperative path checks are not an OS sandbox against malicious
  code or concurrent filesystem tampering. Local tests run candidate code;
  untrusted Agent execution requires stronger external isolation.
- Live LLM inference, real notification writes, candidate push/draft creation
  and real merge E2E are `not_run`. Issue/API behavior is tested with a fake API;
  this cannot prove live credentials, rate-limit policy or repository settings.
- The new scheduled workflow starts after merge into the default branch. Write
  notifications require explicit repository configuration. GitHub Actions runs
  are subject to repository billing/permissions and external availability.
- No unattended M5 campaign, custom model integration, automatic retries of
  remote writes, baseline promotion CLI or credential provisioning is included.
  A failed run retries from the original baseline on the next scan. Proposal
  lookup is deduplicated; concurrency of manually launched proposals is a
  maintainer responsibility. Scheduled notification runs are serialized.
- Reports with one SHA pair but inconsistent local mappings fail explicitly;
  a deliberate remap requires separately reviewed report management.
- Existing normal shipping policy prefers ready PRs; only the optional upstream
  candidate workflow uses drafts as required by this PRD, without changing the
  existing shipping runtime or playbooks.

## Changed files

- `.github/workflows/upstream-sync.yml`
- `README.md`, `package.json`
- `scripts/sync-upstream.mjs`, `scripts/check-parity.mjs`
- `scripts/upstream/{core.mjs,cli.mjs,parity.mjs,report.d.ts}`
- `scripts/upstream/{core.test.mjs,notify.cjs,notify.test.mjs}`
- `docs/upstream-sync/{IMPLEMENTATION.md,VALIDATION.md}`
- `docs/upstream-sync/reports/978ca6e9c0e0_837067b75aa2.{json,md}`
- `docs/upstream-sync/tasks/978ca6e9c0e0_837067b75aa2.md`

Historical provenance/report documents are retained. The current upstream
baseline and Pi-native runtime source remain unchanged.
