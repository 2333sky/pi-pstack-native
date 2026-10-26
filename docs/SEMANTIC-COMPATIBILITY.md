# Core semantic compatibility

Issue #16 separates behavior source, platform adaptation and exercised evidence. The reviewed baseline remains pstack 0.15.17 at `978ca6e9c0e012047cd5058b8e829240336e704e`. The inventory target 0.15.32 is not an approved behavioral baseline.

## Source and adapter

`vendor/upstream/0.15.17/pstack/` contains 107 original Skill/playbook/reference Markdown files and the upstream MIT license. Every file is checked by its original Git blob ID and byte length. Images, scripts, other plugins, cloud infrastructure and private tools are excluded.

The five core Skills (`poteto-mode`, `architect`, `arena`, `swarm`, `interrogate`) and six core playbooks (`bug-fix`, `feature`, `autopilot-full`, `autopilot-stack`, `babysit`, `shipping`) are generated entrypoints. Their upstream body is retained verbatim. The separate [Pi adapter](PI-SEMANTIC-ADAPTER.md) explains tool substitutions, model selection, paths, worktrees, loop limitations, read-only verification, template choreography differences, authority boundaries and unsupported operations.

Regenerate after an intentional adapter/source change:

```sh
node --experimental-strip-types scripts/semantics/generate.mjs --write
npm run upstream:contracts
```

Read-only children and the parent can read original Markdown with `pstack_skill`, including `upstream/skills/poteto-mode/playbooks/shipping.md` and original `references/` paths. Reads are paginated; every page is required. Script execution and arbitrary paths are rejected. The snapshot is not a separately discovered Skill tree.

`pstack_semantics` checks explicit capability requests, maps declared task intents to playbooks, preflights independent model panels, and evaluates supplied round receipts. Its checks are deterministic and do not attest that an evidence file is true. Native AgentSession/DAG execution, verification ledgers, Frontier checks and human merge authorization remain the execution gates. The adapter does not execute, publish or merge anything itself.

## Reviewable drift

`SEMANTICS.json` contains exact source ranges and hashes, per-file/per-step fingerprints, critical-rule mappings, status, Pi mapping, rationale, scope and test names. Status is one of `equivalent`, `adapted-with-deviation`, `unsupported`, `not-yet-verified`. A source-preservation test is explicitly not a model-behavior test. The mappings audit selected critical rules; every sentence has not been behaviorally exercised.

```sh
npm run check:semantics
npm run test:semantics
npm run check:semantics -- --from /path/to/cursor-plugins --commit <40-character-commit>
```

The scheduled upstream scan also writes this semantic report beside its inventory report and uploads it as a CI artifact. The last command reads committed Git objects, reports before/after file and numbered-step/section fingerprints and text, and exits 3 for unreviewed relevant changes. Core files and their architect/interrogate/poteto-mode references are relevant. Other vendored Markdown changes are reported without failing this scoped gate. Newly introduced core reference files are detected. This is not a claim that changes outside the audited scope are safe.

A `driftReviews` receipt must identify `commit`, `path`, exact `before`/`after` Git blob IDs (null for additions/deletions), `status: signed-off`, a named `reviewer`, `rationale`, and bound `tests` file paths. It acknowledges that exact candidate change; it does not update the snapshot or baseline. Changes to local source, adapter, runtime implementations or bound tests fail the local fingerprint gate. After reviewing a local change, update its `reviewedFiles` SHA-256, affected mapping/tests and generated entrypoints together. A hash update alone supplies no semantic approval.

Advancing the baseline requires a new source snapshot and mappings/tests plus explicit maintainer semantic sign-off. No scan, generation, test, inventory command or drift acknowledgement advances UPSTREAM.json. The initial audit remains `pending-maintainer-signoff`.

## Evidence tiers

| Tier | What it establishes | What it cannot establish |
|---|---|---|
| PARITY inventory | Available names and dispositions | Equivalent decisions or execution |
| SEMANTICS mapping and generated-body check | Exact upstream traceability and explicit overrides | Model instruction following |
| Offline semantic fixtures | Routing, panel requirements, receipt freshness/independence, no silent skip, merge boundaries, negative mappings and drift blocking | Truth of caller-supplied receipts or real-surface proof |
| Existing real Pi SDK / fake-provider E2E | Actual AgentSession tools, isolated writers, integration, exact artifacts, SIGKILL recovery and stale shipping rejection | External model reasoning or live GitHub parity |
| Opt-in real Pi + model probe | Source reading, unsupported-capability rejection and status routing through one configured model | Complete workflow, independent review quality, live UI/CLI proof or merge behavior |

CI runs semantic fixtures through `npm test`, the semantic fingerprint gate through `npm run check`, and existing offline/fake-provider E2E through `npm run check:e2e` on Node 22.19 and 24. No network credentials are required for those tiers.

## Limited real-model smoke

Use existing authorized Pi credentials and an explicit available provider/model. This probe only enables two read-only tools in a temporary checkout. It does not enable shell/write, dispatch workers or contact a forge:

```sh
npm run smoke:semantics:real -- --model provider/model
```

The JSON receipt includes the model, actual inference flag, source-read coverage, unsupported-operation result, routing result and evidence boundary. No raw model output or credentials are persisted. A missing model/auth is `blocked`, exit 2, never a fake-provider success. A failure or incomplete read is exit 1. Archive the receipt with the source commit when a maintainer runs it.

For this change the authenticated real-model tier is **not run**: the managed environment reports no configured model credentials. Existing real SDK tests use a loopback provider. Do not promote those to real-model parity evidence. Full live-surface implementation/review/merge scenarios still require separately authorized fixtures and evidence.
