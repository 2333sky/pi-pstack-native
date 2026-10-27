# Reproduction and handoff

## Inputs
Experiment records, selected candidate and baseline, code and artifact access, and evaluation evidence.

## Steps
1. Link each claim to a run ID and evidence: code commit plus dirty changes, data/split version, configuration, dependency versions, hardware, seeds, command, logs and checkpoint. Capture missing or unavailable information as such.
2. Where authorized and feasible, replay the selected run or a scaled-down verification on the stated surface and compare actual outputs to the recorded acceptance tolerance. A smoke replay shows the pipeline works at that scale; it does not prove the original metrics reproduce.
3. Record nondeterministic operations, hardware/software variance, failed runs, limitations of external data/model versions, access restrictions and differences between original and replay. Never promise bitwise reproducibility from seed alone.
4. Provide reproducible commands and paths, the measured baseline/candidate comparison, test evidence, unresolved risks and the next action. Separate an implementation-ready result from a validated model and from a deployment decision.

## Output and gate
A handoff that allows an authorized colleague to locate and reproduce the work, or a precise list of missing inputs and blocked steps. Do not upload datasets, checkpoints, logs or credentials without user authorization.
