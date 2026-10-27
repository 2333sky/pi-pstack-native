# Experiments and optimization

## Inputs
Runnable baseline and validation protocol, objective/constraints, run/time/compute/cost limits and available tracking system.

## Steps
1. Express each hypothesis, mechanism, variable(s), range, expected direction and falsifying observation. Select a small matrix within the actual budget; mark dependencies and invalid combinations. When multiple factors interact, use an appropriate factorial or other design rather than insisting every experiment changes only one factor.
2. Predefine the primary comparison and decision criteria, independent unit, seed/fold/replicate plan, and test budget. Compare baseline and candidate on matched splits and settings; separate exploratory tuning from confirmation. If the budget permits only one run, state that uncertainty remains.
3. For each trial capture revision/dirty diff, data and split IDs, config, environment, seed, hardware, started/finished state, logs, checkpoint, metrics, runtime and resource usage. Preserve failed, pruned and partial trials. Do not label a pruned trial as a completed model.
4. Run trials only within authorized resources. Use existing DVC, MLflow, Optuna or other tooling if present and appropriate; do not install or transmit data merely because this Skill mentions them. A shared GPU or remotely billed run must follow the user's stated limits.
5. Compare changes in a table with matched baselines, uncertainty or replicate spread, cost and failure modes. Investigate confounding, data leakage, selection bias and run-to-run variation. Record accepted and rejected hypotheses and their evidence; do not repeatedly select against the final test.

## Output and gate
Experiment matrix, per-run records and a decision with the evidence and limits. No improvement claim without the actual comparable results; no statistical significance claim without a suitable analysis and enough independent observations.
