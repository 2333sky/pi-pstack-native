# Scope and decision contract

## Inputs
User objective and success criteria; project code and prior results; dataset and label availability; constraints on compute, time, cost, privacy and deployment. Distinguish user-specified values from inferred assumptions.

## Steps
1. Identify the task, unit of prediction and intended use. For LLM or agent work define the task, model/provider, prompt and decoding, tool calls, evaluation cases and what counts as success.
2. Define the primary metric, direction and a meaningful target or decision rule; list secondary metrics, failure costs and resource constraints. If data or the metric cannot be inferred, request what is essential while continuing a plan or code inspection.
3. Locate a credible existing baseline or define a simple baseline and fair comparison protocol. Record current evidence and dependencies; do not infer a baseline from project claims.
4. Define available data, split strategy, hardware, execution environment, run budget, reproducibility and outputs. Separate local CPU smoke work from costly GPU, remote or provider calls. Do not launch an unbounded sweep.
5. Write a concise plan: stages, expected artifacts, checks, stop conditions, risks and blocked decisions. Reuse existing pipelines, test suites and experiment tracking when appropriate.

## Output and gate
A decision contract containing goal, metrics, baseline, data/split, constraints, budget, environment and evidence locations. If a required item is unknown, label it unknown and do not claim the dependent stage is ready. Continue tasks that do not need that item.
