# pstack 0.15.17 semantic port

The verified baseline is `cursor/plugins` commit `978ca6e9c0e012047cd5058b8e829240336e704e`. The official tree contains 52 top-level skills and 23 playbooks. [Provenance](docs/upstream-provenance-0.15.17.json) verifies the commit, manifest, and 165 pstack blobs. [The sync report](docs/upstream-sync-0.15.17.json) checks names and runtime seams. These counts do not prove behavioral parity.

The pinned target `0.15.32` (commit `99b609a72323b70204eab407c622f436e858e112`) contains 58 top-level skills and 23 playbooks. This package registers 57 of them. `statechart` stays pending because it needs its own work package: 27 files, a TLA+/TLC toolchain, and a 260 KB test fixture. [The target inventory](docs/upstream-inventory-0.15.32.json) records one disposition per upstream file.

This package represents upstream intent with Pi-native instructions. It does not claim byte-for-byte, auxiliary-file, or Cursor platform parity. `make-bot-ui` remains Cursor-only. Private Cursor PR-tool provenance, upstream watcher verdicts, and Cursor-only cleanup plugins remain unsupported. [The wording review](docs/UPSTREAM-0.15.17.md) records retained differences.

## Native additions 0.6.0-preview.1

Brief/Gate/Ledger/Frontier/Program and specialized DAG templates are native implementations. They do not prove full Cursor parity or benchmark superiority. See [IMPLEMENTATION.md](IMPLEMENTATION.md) and [ACCEPTANCE.md](ACCEPTANCE.md) for the proof boundary.

## Runtime mapping

| Upstream concept | Native implementation |
|---|---|
| Task subagent | Pi `AgentSession` through `AgentHost` |
| parallel Tasks | persistent DAG workflow engine |
| cloud agent | Pi child session; independent parallel writers use Git worktree isolation |
| model rule | `~/.pi/agent/pstack-native/models.json` |
| Custom Mode | sticky `/poteto-mode` |
| `/loop` | `/pstack-loop` session scheduler (active Pi session, one-run catch-up) |
| interrupted worker | reopen child Pi session and resume |
| several isolated writer outputs | explicit `integrator` node converges into target checkout |

## Skills

| Skill | Status |
|---|---|
| `architect` | ADAPTED |
| `arena` | ADAPTED |
| `automate-me` | ADAPTED |
| `benchmark-checklist` | ADAPTED |
| `blast-radius` | ADAPTED |
| `bro` | ADAPTED |
| `correct` | ADAPTED |
| `create-formal-verification-skill` | ADAPTED |
| `create-verification-skill` | ADAPTED |
| `figure-it-out` | ADAPTED |
| `how` | ADAPTED |
| `in-your-own-words` | ADAPTED |
| `interrogate` | ADAPTED |
| `ketchup` | ADAPTED |
| `ketchup-video` | ADAPTED |
| `maintain-formal-verification-skill` | ADAPTED |
| `maintain-verification-skill` | ADAPTED |
| `make-bot-ui` | CURSOR_ONLY |
| `no-comments` | ADAPTED |
| `poteto-help` | ADAPTED |
| `poteto-mode` | ADAPTED |
| `principle-attack-the-premise` | ADAPTED |
| `principle-boundary-discipline` | ADAPTED |
| `principle-build-the-lever` | ADAPTED |
| `principle-encode-lessons-in-structure` | ADAPTED |
| `principle-exhaust-the-design-space` | ADAPTED |
| `principle-experience-first` | ADAPTED |
| `principle-explain-the-number` | ADAPTED |
| `principle-fix-root-causes` | ADAPTED |
| `principle-foundational-thinking` | ADAPTED |
| `principle-guard-the-context-window` | ADAPTED |
| `principle-laziness-protocol` | ADAPTED |
| `principle-make-operations-idempotent` | ADAPTED |
| `principle-migrate-callers-then-delete-legacy-apis` | ADAPTED |
| `principle-minimize-reader-load` | ADAPTED |
| `principle-model-the-domain` | ADAPTED |
| `principle-never-block-on-the-human` | ADAPTED |
| `principle-outcome-oriented-execution` | ADAPTED |
| `principle-prove-it-works` | ADAPTED |
| `principle-redesign-from-first-principles` | ADAPTED |
| `principle-separate-before-serializing-shared-state` | ADAPTED |
| `principle-sequence-verifiable-units` | ADAPTED |
| `principle-subtract-before-you-add` | ADAPTED |
| `principle-test-behavior-not-implementation` | ADAPTED |
| `principle-type-system-discipline` | ADAPTED |
| `recall` | ADAPTED |
| `reflect` | ADAPTED |
| `setup-pstack` | ADAPTED |
| `sharpen` | ADAPTED |
| `show-me-your-work` | ADAPTED |
| `swarm` | ADAPTED |
| `tdd` | ADAPTED |
| `teach` | ADAPTED |
| `technical-writing` | ADAPTED |
| `typescript-best-practices` | ADAPTED |
| `unslop` | ADAPTED |
| `why` | ADAPTED |

## Poteto playbooks

| Playbook | Status |
|---|---|
| `authoring-a-skill` | ADAPTED |
| `autonomous-run` | ADAPTED |
| `autopilot-full` | ADAPTED |
| `autopilot-stack` | ADAPTED |
| `babysit` | ADAPTED |
| `bug-fix` | ADAPTED |
| `eval` | ADAPTED |
| `feature` | ADAPTED |
| `hillclimb` | ADAPTED |
| `investigation` | ADAPTED |
| `multi-phase-plan` | ADAPTED |
| `opening-a-pr` | ADAPTED |
| `orchestrate` | ADAPTED |
| `pause-safely` | ADAPTED |
| `perf-issue` | ADAPTED |
| `prototype` | ADAPTED |
| `refactoring` | ADAPTED |
| `runtime-forensics` | ADAPTED |
| `session-pickup` | ADAPTED |
| `shipping` | ADAPTED |
| `trace-forensics` | ADAPTED |
| `visual-parity` | ADAPTED |
| `worktree-cleanup` | ADAPTED |

## Claim boundary

- `ADAPTED` means behavior is represented with Pi-native instructions. It is not a test result or proof of complete behavioral equivalence.
- Ketchup has official Pi loader and structural tests. Chat behavior itself was not exercised. That harness belongs to issue #6.
- PR-body and handoff tests use local fixture state. They do not prove live forge behavior.
- `CURSOR_ONLY` is explicit and never silently treated as working.
- `PENDING_PORT` must be zero before a release can claim its **listed top-level semantic coverage**.
- This release does **not** claim byte-for-byte or auxiliary-file parity with Cursor pstack.
- `PARITY.json.coverage.fileLevelAudit = "not-claimed"` keeps the 52/23 observed name count separate from auxiliary-file and behavioral coverage.

## Attribution

Upstream pstack is by Lauren Tan under MIT terms. This port is independent and is not endorsed by Cursor. Preserve upstream copyright and license obligations for derived material. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

## Proposed 0.15.23 ports (not integrated)

The reviewed metadata above remains at 0.15.17. The new restatement Skill,
chat catch-up/verification/Poteto rules, safe bundled-resource access,
external evidence snapshots, linear PR-stack CLI, all-page review-thread
checks and explicit-base worktree audit are candidate implementations.
[The candidate receipt](docs/upstream-sync/candidate-0.15.23.json) maps every
pinned diff to code/tests or an explicit platform limit. All entries await
maintainer semantic review. The active Skill loader can expose candidate
Skills; their availability does not advance the reviewed baseline.

Exact Cursor watcher/merge-queue verdicts, Bugbot pass-based dismissal policy,
Cursor manifests/cloud/private-tool provenance and Cursor transcript/simulator
cleanup remain unsupported. Local read-only investigation uses supplied
snapshots rather than implicit MCP access. Native head/base verification stays
stricter than the upstream patch-ID/noisy-build reuse rule.
