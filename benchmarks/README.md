# Benchmark

Two sets live here. The smoke set is the arithmetic fixtures in `cases.json`. The task sets are in `tasks/` and measure orchestration, not arithmetic.

Everything in this directory runs offline. No model call happens in `npm run benchmark:smoke` or in the default task-set run. `benchmarks/RUNBOOK.md` states what a credentialed run needs and what it would cost.

## Smoke set

`cases.json` holds 20 single function exercises. Each one seeds a broken function, runs the workflow engine against a real verification command, and checks the ledger. It proves the harness imports, the fixture structure, the verification path and the fail-closed exit policy. It measures nothing about a model.

## Task sets

Seven task sets, one per orchestration problem named in issue #7. Each one is a directory under `tasks/<id>` with a declarative `task.json`, a fixed fixture, a reference plan, at least one mutant plan, and independent artifact tests.

| Task set | What it measures | Fixture | Artifact tests (independent) | Ground truth |
|---|---|---|---|---|
| `cross-module-feature` | One feature landed across two modules by two dependent workers | fixed repo snapshot, `repo/` | `checks/core.test.mjs`, `checks/surface.test.mjs` | the workflow ledger |
| `integration-conflict` | A real git conflict between two landed branches, resolved without losing either intent | snapshot plus two branch fixtures in `fixture.branches` | `checks/pricing.test.mjs` | the ledger plus the merge commit showing two parents and no unresolved paths |
| `stacked-pull-request` | Three ordered layers, each building on the previous commit | snapshot plus `layers/layer-1..3` | `checks/layer-1..3.test.mjs` | the ledger plus commit ancestry of the three layer heads |
| `crash-recovery` | A durable side effect recorded once when an interrupted call is resumed | snapshot plus a seeded dead process state | `checks/recorder.test.mjs`, `checks/effects.test.mjs`, `checks/order.test.mjs` | the durable effect log, counted for repeated ids |
| `adversarial-review-finding` | Whether review names the planted defect and invents nothing | snapshot with a planted sort comparator defect and a clean control module | `checks/findings.test.mjs` (shape), plus a hidden ground truth check the agent cannot read | the planted location and the clean control |
| `long-context-program` | Work across a generated 120 module program | deterministic generator (`fixture.generate`) | `checks/invariant.test.mjs`, `checks/anomaly.test.mjs` | the ledger |
| `interface-api-regression` | An internal fix that must not move the public surface | snapshot plus a recorded `api-surface.json` | `checks/surface.test.mjs`, `checks/consumer.test.mjs` | the ledger |

Each `task.json` declares:

- `successCriteria`, the human readable conditions.
- `expects`, the provider, model id and effort a real run must use. The runner refuses a different model or effort unless `--allow-model-override` is passed, and the report records that.
- `budget`, the declared time, cost and token caps in seconds, USD and tokens. These are caps, not measurements.
- `gates`, the artifact tests. A gate is a command that runs in the task workspace, or a `diff` gate with `maxFiles` that proves a read-only step changed nothing.
- `nodes`, the workflow shape, each node's scope globs and its artifact gates.
- `failureModes`, the taxonomy categories this set can produce.
- `fixture`, the snapshot or generator, the mutant plans and the ground truth data.

## How a task set is decided

The workflow engine runs each node through an `AgentRunner`. The runner under test calls `verify()` for every node with a brief, which runs the declared artifact test commands as real subprocesses and writes a ledger with the evidence, the exit codes and the artifact fingerprint. A task passes only when every node with a brief is accepted by that ledger and the per-kind ground truth check also passes. The agent's own task report is never the verdict. On a strict brief the report must still match the ledger, and a mismatch is reported as an agent failure.

Two provider paths exist:

- `--provider fake` runs a deterministic stand-in that applies the recorded reference plan for each node. It proves the harness, the fixtures, the gates, the recovery path and the report schema. It measures no model. The reference plan for a task is the intended solution; a mutant plan is a deliberate wrong solution.
- `--provider configured` runs the real `runnerOnce` path with a Pi agent directory and a model. Without credentials it reports `AUTHENTICATION_UNAVAILABLE` and exits non-zero, which is the fail-closed behavior proved in the smoke gate.

## Report

`report.json` is written to the output directory and validated before it is written. `benchmarks/lib/report.mjs` owns the schema.

Every metric is an object with `value`, `measured`, `reason` and `scope`. A measured metric must be a finite number. An unmeasured metric must be `null` with a reason, so an unknown token count can never be reported as zero. A run with `credentialedCalls: 0` cannot report tokens or cost, and a run whose runner was blocked cannot report a success rate.

The runner supports one pass with one observation per task. `runTaskSets` refuses any explicit `repetitions` value other than `1` with `UNSUPPORTED_REPETITIONS`, before creating output or executing tasks. The report validator refuses a repetition count other than `1`. `aggregate.sampleSize` counts task rows, not repeated trials. `aggregate.verified` counts verified rows, and `aggregate.verifiedTaskSuccess.value` is their observed fraction for this pass. The validator rejects a count or fraction that disagrees with the rows. This fraction is not a repeated-trial success rate.

`aggregate.interval95` is always `null` with a reason and no method. An interval needs repeated observations of the same task. Different task sets are not repetitions of one task.

Recorded per task: verified success, retries, human interventions, latency, tokens, cost, integration failures and recovery side effects. Recorded once for the run: measurement mode, provider, model, effort, repetition count, credentialed call count, the declared budget total, the baselines, and `claims.overallSuperiority`, which is always `null`.

Latency in an offline fake run is the harness wall clock. It is labelled that way and it is not provider latency.

## Failure taxonomy

`taxonomy.json` lists the categories with the observation each one requires. The classifier in `lib/run.mjs` derives a category from evidence: a failed required gate, a ledger reason, the workflow error code or a ground truth result. It does not read the operator's summary.

A mutant run is a self test of the classifier. The mutant declares the category it must produce, and the report schema rejects a report whose category disagrees with the mutant category.

## Baselines

`baselines.json` declares the three baselines from issue #7: Pi single agent, this project, and Cursor pstack. All three are marked `not-run` with the reason. No baseline number exists in this repository.

Cursor cloud only capabilities are listed separately under `cursorCloudOnly` with `comparability: "not-comparable"`. They run on a different substrate with different tooling and billing, so no overall superiority claim follows from them. `claims.overallSuperiority` is always `null`.

## Commands

```bash
npm run benchmark:smoke
node scripts/benchmark.mjs --set tasks --provider fake
node scripts/benchmark.mjs --set tasks --provider fake --only crash-recovery
node scripts/benchmark.mjs --set tasks --provider fake --plan recovery-duplicate-side-effect --only crash-recovery
node scripts/benchmark.mjs --set tasks --provider configured --agent-dir /absolute/path/to/pi-agent --model anthropic/claude-sonnet-4-5
npm run benchmark -- --agent-dir /absolute/path/to/pi-agent --model provider/model --output /absolute/results
```

`--plan` takes `reference` or a mutant key or category. `--only` takes one or more task set ids. `--effort` and `--interventions` are recorded as run inputs; an effort that differs from the declared expectation is refused.

## Limits

- Shared isolation. Every node in a task set runs in one checkout. Worktree isolation and concurrent writers are not exercised by these fixtures.
- The artifact tests are visible to the model under test, since they live in the checks directory of the workspace. The brief scope excludes them, so changing one is a scope violation or a coverage failure, and the scope rule is enforced by the ledger. The hidden ground truth check for the review task set is the one check the model cannot read.
- `latencyMs`, `tokens` and `costUsd` in an offline run measure nothing about a model.
- Sample size counts task rows in one pass. The report declares `measurement.repetitions: 1` and publishes no interval. The runner refuses repeated runs in one invocation. Separate output directories do not create a combined report or interval.
- No credentialed run has happened here, so no success rate, cost or speed comparison exists.
