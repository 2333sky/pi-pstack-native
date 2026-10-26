# pstack 0.15.32 source integration on Pi 1.4

The active source is `cursor/plugins` commit `99b609a72323b70204eab407c622f436e858e112` (pstack 0.15.32). Pi SDK 1.4.0 is locked and the peer minimum is `^1.4.0`. [Provenance](docs/upstream-provenance-0.15.32.json) verifies all 200 upstream blobs; [source counts](docs/upstream-sync-0.15.32.json) record 58 Skills and 23 playbooks.

All upstream names are registered. The 57 supported Skills and all 23 playbooks are generated from unchanged upstream bodies plus a separate Pi adapter. `make-bot-ui` remains unsupported. Statechart includes all 27 upstream files, its CLI and external-tool requirements; see [statechart evidence](docs/STATECHART.md). The file inventory distinguishes local source, vendored source, unsupported operations and remaining platform-only work; name coverage is not full file or behavioral parity.

The 0.15.17 snapshot is historical provenance, not the active Skill source. The source upgrade does not grant maintainer semantic approval or fabricate authenticated model evidence. See [the upgrade audit](docs/upstream-upgrade-0.15.32.md) and [current evidence boundary](docs/SEMANTIC-COMPATIBILITY.md).

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
| `statechart` | ADAPTED |
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

## Historical 0.15.23 candidate (superseded)

This archived candidate predates the active 0.15.32 source integration. The restatement Skill,
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

## Core semantic compatibility audit (issue #16)

All supported entrypoints retain the latest pinned upstream body; the eleven core workflows have critical mappings and an explicit [Pi adapter](docs/PI-SEMANTIC-ADAPTER.md). [SEMANTICS.json](SEMANTICS.json) maps exact source lines and critical rules to test names and reviewed file fingerprints. The source snapshot contains all baseline Skill Markdown and references plus the license, checked against Git blob IDs. This is critical-rule mapping coverage, not a completed audit of every sentence or demonstrated model behavior.

`npm run check:semantics` fails on unreviewed local source, adapter, implementation or bound-test drift. `npm run check:semantics -- --from /path/to/cursor-plugins --commit <full-sha>` reports file/step diffs and blocks only unreviewed relevant upstream changes. Explicit per-file, exact-commit sign-off receipts may acknowledge a change without advancing the baseline. Inventory scans cannot advance semantic approval.

See [the evidence tiers and real-model procedure](docs/SEMANTIC-COMPATIBILITY.md). The active source and inventory target are both 0.15.32. Maintainer semantic sign-off remains separate from that source pin.

[PR #17](https://github.com/2333sky/pi-pstack-native-2/pull/17) has merged the core implementation. [Its CI](https://github.com/2333sky/pi-pstack-native-2/actions/runs/40299080693) passed on Node 22.19 and 24, including semantic checks and offline/fake-provider Pi SDK tests. This does not change `SEMANTICS.json.evidence.realModel.status = "not-run"` or `review.status = "pending-maintainer-signoff"`. See [the acceptance checklist](docs/SEMANTIC-COMPATIBILITY.md#completing-issue-16) for the remaining evidence and review record. Neither merging this implementation nor completing its CI advances the reviewed upstream baseline.
