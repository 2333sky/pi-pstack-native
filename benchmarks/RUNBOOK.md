# Runbook: running the task sets against a real provider

This file states what a credentialed run needs and what it would cost. Nothing in it was measured against a provider, because no credentialed model call is allowed in this work lane. Every number below is either a declared cap or a labelled machine measurement of the harness itself.

## What a credentialed run needs

1. A Pi agent directory containing `auth.json` with credentials for the provider, and a `models.json` whose registry resolves the exact model id in `task.json` under `expects.model`. The runner compares the id as a string and refuses a mismatch.
2. Network access from the machine that runs the harness.
3. Enough disk for one workspace per task set per run under `--output`, plus the protocol store, evidence logs and agent records. A measured offline pass over all seven task sets writes about 3 MB, of which the generated 120 module fixture is about 1.3 MB. A real run adds the provider's session transcripts.
4. Enough wall clock for the declared caps. The declared caps are the sum of every `budget.timeSeconds`: 7800 seconds, or 130 minutes, for one pass over all seven task sets at one repetition. Each repetition is a separate run with its own output directory.
5. Five or more repetitions before any rate or interval is published. The report refuses an interval below five samples and reports `null` with a reason instead.
6. An operator to record interventions. The harness records only what `--interventions` states, and the report labels it as an operator input.

## Command shape

```bash
node scripts/benchmark.mjs --set tasks --provider configured \
  --agent-dir /absolute/path/to/pi-agent \
  --model anthropic/claude-sonnet-4-5 \
  --output /absolute/results/run-1
```

Run it once per model and per repetition. A run for one model must cover every task set, because the report is per run and the comparison is between runs.

## What it would cost

The harness measures tokens and cost only when the provider reports them per call. When it does, the report sums them and marks them measured. When it does not, the metric is `null` with the reason, never zero.

No price table is bundled, and no price is assumed. The cost of a real run is therefore:

```text
cost = sum over calls of (input tokens x operator input price + output tokens x operator output price)
```

The operator supplies the two prices. The declared token caps give the ceiling the harness will not exceed per run:

| Task set | Declared time cap | Declared token cap | Declared cost cap |
|---|---|---|---|
| `cross-module-feature` | 900 s | 300000 | 2.50 |
| `integration-conflict` | 1200 s | 450000 | 4.00 |
| `stacked-pull-request` | 1200 s | 500000 | 5.00 |
| `crash-recovery` | 900 s | 350000 | 3.00 |
| `adversarial-review-finding` | 900 s | 300000 | 3.50 |
| `long-context-program` | 1800 s | 900000 | 8.00 |
| `interface-api-regression` | 900 s | 300000 | 3.00 |
| **Declared cap for one full pass** | **7800 s** | **3100000 tokens** | **29.00 USD** |

Those are caps. They are not a spend estimate and not a measurement. The workflow engine stops a run at `maxTokens`, `maxCost` or `maxTimeSeconds` and reports `BUDGET_EXCEEDED`, so the caps bound one pass at 3100000 tokens and 29.00 USD only if the operator's price table makes the cost cap bind first. At a price of 3 USD per million tokens the token cap alone would cost about 9.30 USD for the pass, which is arithmetic on a declared cap with an assumed price, not a measurement. Five repetitions multiply whatever one pass costs.

## What to capture

- `report.json` from each run, unchanged.
- The operator's price table, so the cost arithmetic can be rechecked.
- The number of operator interventions and what each one was.
- Anything the run could not do, in the operator's own words, next to the run's `measurement.mode`.

## What to publish, and what not to

Publish the verified task success count with the sample size, the retries, the interventions, the latency, the tokens, the cost, the integration failures and the recovery side effects, all from `report.json`. Publish the taxonomy category for every failure.

Do not publish a rate or an interval below five repetitions. Do not publish tokens or cost from a run whose report marks them unmeasured. Do not compare against Cursor cloud for anything other than the capabilities listed in `baselines.json`, which run on a different substrate. Do not claim overall superiority.

## What has been run here

- `npm run benchmark:smoke`: the entry links, 20 smoke fixtures validate, 7 task sets validate and generate byte identical workspaces, the offline fake run verifies 7 of 7 task sets through the real entry, and one mutant control exits non-zero under its declared category.
- `--provider fake` over every task set, plus one mutant per task set: reference plans verify, mutant plans are classified under their declared category.
- `--provider configured` with no credentials: `AUTHENTICATION_UNAVAILABLE`, exit 1, every task unverified, no usage claimed.

Measured machine fact, for context only: the offline fake pass over all seven task sets takes about 20 seconds on the machine used here, and writes about 3 MB. That is harness overhead. It is not model latency and it says nothing about a real run.
