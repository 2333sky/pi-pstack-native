# Baseline and implementation

## Inputs
Decision contract, usable training/validation splits, project environment and executable baseline or source implementation.

## Steps
1. Capture the original code revision and dirty state, dataset/split IDs, command, configuration, dependency and hardware versions. Do not reset or overwrite user work.
2. Choose a simple or existing baseline that can actually run under the same split and metric; state why it is relevant. When reproducing a paper, separate reported settings from inferred substitutions and identify gaps before implementation.
3. Implement the smallest meaningful vertical slice: loader, model or algorithm, loss/objective, train/update, checkpoint, inference and evaluation. Preserve user conventions. Use one writer or isolated writers and an explicit integrator when parallel changes must be combined.
4. Add meaningful checks for shapes, dtype, labels and edge cases; test loss/gradient finiteness, a tiny overfit or known synthetic case when appropriate, and ensure evaluation mode and preprocessing are consistent. A fake or synthetic check is not a real-data result.
5. Run a bounded smoke only when resources and permissions allow; record exact invocation, actual output, runtime and failure. If there is no runnable data or hardware, deliver the implementation and a reproducible plan with the missing run marked not performed.

## Output and gate
Baseline evidence, implementation and test results. Do not call an algorithm reproduced or improved solely because code compiles, a smoke test passes, or a model describes the result.
