# Core semantic compatibility

Issue #16 separates behavior source, platform adaptation and exercised evidence. The active source is pstack 0.15.36 at `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`, on Pi SDK 1.4.0. The source pin and availability inventory are current; maintainer semantic approval and a commit-bound authenticated model receipt remain separate pending records. A user reported Windows real-model runs, including an independent rerun at commit `4d75ea0b`; see [the test record](WINDOWS-MODEL-TEST.zh-CN.md).

## Implementation and acceptance status

[PR #17](https://github.com/2333sky/pi-pstack-native/pull/17) merged on 2026-10-26 as commit [`f355eaed`](https://github.com/2333sky/pi-pstack-native/commit/f355eaedcabbcee6c1429f8a5341974b6833dd22). Its tested head, `a4e04df4128bf83e60404ef54329bf8814aa6cbc`, passed [CI on Node 22.19 and 24](https://github.com/2333sky/pi-pstack-native/actions/runs/40299080693).

| Item | Recorded status | Evidence boundary |
|---|---|---|
| Pinned source, Pi adapter, 11 core entrypoints and 35 critical-rule mappings | Merged | Source traceability and declared adaptations |
| Semantic checks, negative fixtures, typecheck and build | Passed | Deterministic local/CI behavior |
| Real Pi SDK lifecycle, offline/fake-provider E2E and installed-package smoke | Passed | Actual SDK/session integration with scripted model responses; no authenticated external inference |
| User-reported Windows real-model runs | Reported: 13/20 workflow acceptance and 20/20 independent tests at `4d75ea0b` | Full original result files have not been attached to the repository; see the [Windows record](WINDOWS-MODEL-TEST.zh-CN.md) |
| Limited real Pi + real-model probe | `not-run` | No passing real-model receipt is recorded |
| Maintainer semantic review record | `pending-maintainer-signoff` | The merge did not automatically update the review fields in `SEMANTICS.json` |

The latest-source upgrade retains the evidence tiers below and adds [statechart toolchain validation](STATECHART.md). The [upgrade audit](upstream-upgrade-0.15.36.md) records changed source files and mapping decisions. The merged PR/CI links above document the earlier foundation, not a test of every later source change.

The managed environment check on 2026-10-26 found zero configured authorized models through the real Pi SDK. The SDK itself is installed and usable. This is a missing provider-authorization prerequisite, rather than a requirement to run the test on a personal computer. Environment configuration may change; check the SDK's available models again before a new run.

A probe of an unavailable model returned `blocked` with `inference: false`. That verifies the unavailable-model path and supplies no real-model inference evidence. Inventory coverage, mapped rules, exercised SDK behavior and model behavior remain separate claims.

## Source and adapter

`vendor/upstream/0.15.36/pstack/` contains 141 pinned source artifacts: Skill/playbook/reference Markdown, the statechart runtime, the manifest and upstream MIT license. The statechart test corpus is available in the installed Skill tree. Every vendored file is checked against its original Git blob ID and length; the source provenance report additionally verifies all 573 upstream files. Images, other plugins, Cursor runtime scripts, cloud infrastructure and private tools are outside the executable Pi port. The earlier 0.15.17 snapshot remains historical evidence.

The five core Skills (`poteto-mode`, `architect`, `arena`, `swarm`, `interrogate`) and six core playbooks (`bug-fix`, `feature`, `autopilot-full`, `autopilot-stack`, `babysit`, `shipping`) retain critical-rule mappings. All 57 supported Skills and all 23 playbooks are generated entrypoints whose upstream body is retained verbatim. The separate [Pi adapter](PI-SEMANTIC-ADAPTER.md) explains tool substitutions, model selection, paths, worktrees, loop limitations, read-only verification, template choreography differences, authority boundaries and unsupported operations.

Regenerate after an intentional adapter/source change:

```sh
node --experimental-strip-types scripts/semantics/generate.mjs --write
npm run upstream:contracts
```

Read-only children and the parent can read original Markdown with `pstack_skill`, including `upstream/skills/poteto-mode/playbooks/shipping.md` and original `references/` paths. Reads are paginated; every page is required. Script execution and arbitrary paths are rejected. The snapshot is not a separately discovered Skill tree.

`pstack_semantics` checks explicit capability requests, maps declared task intents to playbooks, preflights independent model panels, and evaluates supplied round receipts. Its checks are deterministic and do not attest that an evidence file is true. Native AgentSession/DAG execution, verification ledgers, Frontier checks and human merge authorization remain the execution gates. The adapter does not execute, publish or merge anything itself.

## Reviewable drift

`SEMANTICS.json` contains exact source ranges and hashes, per-file/per-step fingerprints, critical-rule mappings, status, Pi mapping, rationale, scope and test names. Every platform override also has its own upstream source range, status, mapping, rationale, scope and bound tests. Status is one of `equivalent`, `adapted-with-deviation`, `unsupported`, `not-yet-verified`. A source-preservation test is explicitly not a model-behavior test. The mappings audit selected critical rules; every sentence has not been behaviorally exercised.

```sh
npm run check:semantics
npm run test:semantics
npm run check:semantics -- --from /path/to/cursor-plugins --commit <40-character-commit>
```

The scheduled upstream scan also writes this semantic report beside its inventory report and uploads it as a CI artifact. The last command reads committed Git objects, reports before/after file and numbered-step/section fingerprints and text, and exits 3 for unreviewed relevant changes. Core files, their architect/interrogate/poteto-mode references, statechart scripts, and upstream source paths cited by an explicit override are relevant. Other vendored Markdown changes are reported without failing this scoped gate. Newly introduced core reference files are detected. This is not a claim that changes outside the audited scope are safe.

A `driftReviews` receipt must identify `commit`, `path`, exact `before`/`after` Git blob IDs (null for additions/deletions), `status: signed-off`, a named `reviewer`, `rationale`, and bound `tests` file paths. It acknowledges that exact candidate change; it does not update the snapshot or baseline. Changes to local source, adapter, runtime implementations or bound tests fail the local fingerprint gate. After reviewing a local change, update its `reviewedFiles` SHA-256, affected mapping/tests and generated entrypoints together. A hash update alone supplies no semantic approval.

A source upgrade updates the snapshot, mappings, tests and active metadata together. It does not grant semantic approval. No scan, generation, test, inventory command or drift acknowledgement records maintainer approval. The review state is stored separately in `SEMANTICS.json.review`; it remains `pending-maintainer-signoff` after the implementation merge until a maintainer records their semantic review.

## Evidence tiers

| Tier | What it establishes | What it cannot establish |
|---|---|---|
| PARITY inventory | Available names and dispositions | Equivalent decisions or execution |
| SEMANTICS mapping and generated-body check | Exact upstream traceability and explicit overrides | Model instruction following |
| Offline semantic fixtures | Routing, panel requirements, receipt freshness/independence, no silent skip, merge boundaries, negative mappings and drift blocking | Truth of caller-supplied receipts or real-surface proof |
| Existing real Pi SDK / fake-provider E2E | Actual AgentSession tools, isolated writers, integration, exact artifacts, SIGKILL recovery and stale shipping rejection | External model reasoning or live GitHub parity |
| Opt-in real Pi + model probe | Source reading, unsupported-capability rejection and status routing through one configured model | Complete workflow, independent review quality, live UI/CLI proof or merge behavior |

CI runs semantic fixtures through `npm test`, the semantic fingerprint gate through `npm run check`, and existing offline/fake-provider E2E through `npm run check:e2e` on Node 22.19 and 24 with Pi 1.4.0. A separate Node 24 / Java 21 job runs the pinned upstream statechart suite with TLC 1.7.4. No model credentials are required for those tiers; the statechart job downloads its public toolchain and renderer packages.

## Limited real-model smoke

Use existing authorized Pi credentials and an explicit available provider/model. The command can run in this managed cloud environment once a provider credential is configured, or in another authorized Pi environment. ChatGPT access and GitHub authentication do not by themselves configure a Pi model provider.

For a managed cloud run:

1. Configure a provider credential through the environment's Secrets settings, using the variable supported by that provider, such as `OPENAI_API_KEY` for OpenAI. Ensure the selected model's API endpoint is allowed by the environment's network policy. Keep credential values out of the receipt and repository.
2. Start the test process after the updated environment configuration is active. Select the exact Pi `provider/model` identifier; `pi --list-models` lists available models when the Pi CLI is installed. An empty available-model list means the prerequisite is still unmet.
3. Run from the repository root on a clean checkout of the revision being verified. Install dependencies with `npm ci` if needed. Replace `provider/model` below with the selected identifier.

This probe only enables two read-only model tools in a temporary checkout. It does not enable shell/write tools, dispatch workers or contact a forge:

```sh
mkdir -p work/semantic-smoke
git rev-parse HEAD > work/semantic-smoke/source-commit.txt
npm run --silent smoke:semantics:real -- --model provider/model > work/semantic-smoke/result.json
```

Inspect the command's exit code and the JSON receipt together:

| Result | Exit code and receipt | Meaning |
|---|---|---|
| Passed | Exit 0; `status: "passed"`, `inference: true`, and all three probe checks true | One model completed the source-read, unsupported-capability and status-routing probe |
| Blocked | Exit 2; `status: "blocked"`, `inference: false` when the requested model/auth is unavailable | No authenticated model inference was exercised |
| Failed | Exit 1, a failed/incomplete probe, or a runtime error | Investigate; do not record a passing result |

The three probe checks are `completeSourceRead`, `unsupportedRefused` and `statusRoutedToBabysit`. The JSON receipt includes the model and evidence boundary. The harness does not persist raw model output or credentials. Preserve the receipt together with `source-commit.txt`; after checking the files, archive them in a stable repository evidence path or a linked CI artifact. A result applies to its tested commit and model. It is not proof of complete implementation, review-swarm quality, live UI/CLI behavior or merge safety.

The repository’s commit-bound authenticated real-model receipt remains **not run**. The separate user-reported Windows real-model runs, including a rerun at commit `4d75ea0b`, are recorded [here](WINDOWS-MODEL-TEST.zh-CN.md); full original result files are not recorded in this repository. Existing real SDK tests use a loopback provider. CI runs the repeatable offline/fake-provider tiers without provider credentials; it does not automatically run this authenticated probe.

## Completing issue #16

The remaining acceptance work is evidence and a review record. A documentation update alone completes neither item.

1. Run the limited real-model probe successfully and archive the receipt, tested source commit and model. Update `SEMANTICS.json.evidence.realModel` to record the actual result and a stable receipt reference; preserve its procedure link. Set `status: "passed"` only for a passing authenticated run. A blocked attempt leaves real-model verification unexercised.
2. Have the maintainer review the critical mappings and intentional deviations. Record that conclusion in `SEMANTICS.json.review` with `status: "signed-off"`, the actual `reviewer`, an ISO timestamp in `at`, and a concrete `rationale`, retaining the existing scope. Reference the review or merge decision if it records that conclusion. Do not infer or invent semantic approval solely from the merge event.
3. Submit the evidence and metadata update, run `npm run check:semantics` and `npm run test:semantics`, and require the normal CI checks on that revision. Review any intervening mapped source/runtime changes before reusing earlier evidence.
4. Recheck [issue #16](https://github.com/2333sky/pi-pstack-native/issues/16)'s acceptance criteria and record what the evidence establishes before closing it as completed. If a criterion is intentionally deferred, track it in a linked follow-up and explicitly agree the revised scope rather than checking it off as passed.

These steps do not require advancing the reviewed upstream baseline or claiming complete Cursor/Pi behavioral equivalence. Full live-surface implementation/review/merge scenarios remain separate evidence work.
