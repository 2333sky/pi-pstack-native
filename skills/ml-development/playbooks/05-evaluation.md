# Evaluation and comparison

## Inputs
Frozen candidate and baseline, predeclared metrics, locked evaluation split or cases, inference settings and available labels.

## Steps
1. Evaluate baseline and candidate using the same dataset version, split, preprocessing, metric implementation and output definition. For stochastic methods record seeds, sampling parameters and number of repeats. If any setting differs, disclose the confound rather than treating it as a controlled comparison.
2. Report primary and relevant secondary metrics, denominator and unit; include failure/error cases and important slices with sample sizes. Use confidence intervals or paired comparisons appropriate to the sampling design where feasible; do not treat repeated predictions on one case as independent cases.
3. For LLMs/agents record model/provider version, prompt or template, decoding, context, tool access, evaluation dataset and execution environment. Separate task pass rate from report format, tool availability, timeout, cost and operator acceptance. Inspect contamination and label uncertainty. A model judge is not ground truth without calibration.
4. Report baseline and candidate latency, throughput, memory and cost only if actually measured, with hardware, batch size, warm-up and measurement method. Avoid extrapolating training throughput from one unrepresentative run.
5. Freeze the choice before final holdout evaluation. If final evaluation is unavailable, contaminated, repeatedly inspected or insufficient for the decision, report that limitation and avoid claiming independent generalization.

## Output and gate
A compact comparison table with dataset/split, metrics, sample size, uncertainty, resource costs, evidence paths and failed or missing runs. Indicate whether thresholds and constraints are satisfied; never turn missing evidence into a pass.
