---
name: ml-development
disable-model-invocation: true
description: "Develop, debug, compare, evaluate, or reproduce machine learning and AI algorithms with explicit data splits, baselines, experiment budgets, and traceable evidence. Use for model training, algorithm implementation, hyperparameter tuning, evaluation, ablation, or reproducibility."
---

# ML algorithm development

Help the user carry a concrete ML task through the applicable stages below. This is a Pi-native addition, not an upstream pstack playbook or a promise of autonomous training infrastructure. Adapt it to the task: traditional ML, deep learning, LLM/agent evaluation, or a user-provided algorithm. Do not fabricate measurements, data access, experiment runs, or claims of improvement.

## Route and read

1. Inspect the repository and existing instructions first. Find the data sources, code, configs, splits, metrics, commands, tracking system, and relevant hardware using available evidence; state what is unknown. Prefer existing project conventions and tools over introducing frameworks.
2. Read the complete relevant bundled files, including every page when using `pstack_skill`:
   - Goals, constraints or missing setup: `ml-development/playbooks/01-scope.md`.
   - Data or split design: `ml-development/playbooks/02-data.md`.
   - Baseline or implementation: `ml-development/playbooks/03-baseline.md`.
   - Experiments, tuning or performance improvement: `ml-development/playbooks/04-experiments.md`.
   - Model/LLM evaluation or comparison: `ml-development/playbooks/05-evaluation.md`.
   - Reproduction, handoff or run audit: `ml-development/playbooks/06-reproducibility.md`.
3. For a broad development request use the stages in order. For a narrow request, start at the relevant stage and check its prerequisites; do not manufacture missing results. If required data, labels, hardware, permission or a metric is unavailable, continue independent work and mark the dependent stage blocked or inconclusive.
4. Keep decisions in the project's existing tracker or a project-local record. Use `references/run-record.md` as a minimum evidence schema and `references/experiment-matrix.md` for a concrete experiment plan. Paths and identifiers are examples, not permission to overwrite existing artifacts.

## Rules for execution

- Follow the user's scope, resource budget and repository instructions. Establish dataset access, storage, expected duration, compute availability, and an execution budget before paid, long-running or shared-resource jobs. Use authorization already given; if a material limit is missing, prepare a bounded plan and obtain the missing constraint before launching dependent work. Do not publish data, models or results or start remote jobs without authorization.
- Pi child-agent token, cost and elapsed-time limits are not GPU-hour limits or operating-system supervision of spawned training processes. Without an authorized, bounded execution surface that can terminate and account for the full training process tree, prepare commands and a plan instead of launching long-running, remote or potentially unbounded training. A small, clearly bounded local smoke may run if permitted. Never report an unenforced budget as enforced.
- Separate code tests, smoke runs, validation-set selection and final test evaluation. Never tune on the final test set. If an existing test set has influenced selection, disclose it and avoid claiming a clean independent test.
- Fix the comparison protocol before experiments: dataset/version and split, primary metric and direction, baseline, budgets, train/eval commands, seeds, checkpoint selection, and acceptance thresholds or decision criteria. For paired comparisons use the same data and protocol; list differences that cannot be controlled.
- Use appropriate split units and check leakage: group entities, timestamps, duplicates and related samples as the task requires; fit preprocessing on training data only. For LLMs also track prompts, decoding, model/provider versions and possible evaluation contamination.
- Run a small, low-cost smoke only when within the user's scope. Record failures, timeouts, missing dependencies and partial runs; never present a partial or unavailable check as passed. Use repeated runs and uncertainty estimates when feasible, with the unit of independence stated. A single run is preliminary.
- Keep training, evaluation, checkpoint and hardware evidence traceable. Models or datasets from the network are optional and require the access needed by the task. A seed alone does not guarantee determinism across devices, kernels, versions or distributed execution.
- Treat verification-policy allowlists, role permissions and worktree boundaries as they actually exist. A worktree is not an OS sandbox; never use hidden credentials or private data in public artifacts. Ask for missing access only when necessary.
- Do not conflate a passing code test, a completed training job, a passing benchmark metric and an accepted deployment decision. Report each separately with measured outcomes and limitations. Do not claim superiority from one noisy run or from unsupported metrics.

## Pi integration

Start explicitly with `/skill:ml-development <task>`; this Skill opts out of model-initiated discovery (`disable-model-invocation: true`) and ordinary ML requests do not auto-select it. `/poteto-mode <task>` does not automatically select these playbooks; explicitly request both when needed. Reuse existing `scout` and `architect` for investigation/design, `worker` for permitted changes, and read-only `reviewer` or `verifier` for evidence inspection. Read-only roles cannot run training or shell verification; use an authorized execution lane for checks and have the verifier inspect actual results. Use `pstack_workflow` only for real independent subagent tasks, not one agent per stage. No new ML role or training executor is provided by this Skill. Never infer that an upstream pstack skill has reviewed or approved this suite.
