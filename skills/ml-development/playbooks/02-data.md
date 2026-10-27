# Data and leakage checks

## Inputs
Accessible data and data dictionary, labels, split definitions, preprocessing and allowed use. Avoid copying raw private data into logs, issues or model prompts.

## Steps
1. Record dataset identity/version or immutable digest where available, source, license/access boundary, label definition, sample and group units, timestamp range, and any known label or collection biases. Count missing, duplicate, malformed and out-of-range values using safe aggregates.
2. Identify independent units and split according to the task: grouped subjects/users, chronological cutoff for forecasting, or another justified split. Document stratification only if appropriate and feasible. Verify no group, duplicate or future information crosses the protected boundary.
3. Split before fitting normalization, imputation, feature selection, tokenizers learned from task data, or other learned transforms; fit on training data only. Use the same transform for held-out examples. Do not treat arbitrary train/test random splitting as valid for time-series or grouped data.
4. Reserve validation for model selection and a final test set for the predeclared final assessment. If the test set has already influenced decisions, record contamination and use an independent holdout if available; otherwise mark the conclusion limited.
5. For generated/LLM evaluations, record case source/version, prompts, reference policy and potential benchmark contamination; separate deterministic checks from LLM-as-judge and calibrate any judge against labeled examples where available.

## Output and gate
A data/split manifest, checks and remaining risks. If splits, target leakage or the evaluation unit cannot be verified, stop claims about generalization; make the missing evidence explicit.
