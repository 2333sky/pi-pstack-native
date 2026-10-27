# Experiment matrix template

Fill from the task; the example illustrates a controlled comparison and is not evidence of a run.

| ID | Hypothesis / change | Comparison | Split / seeds | Budget | Outcome / decision |
| --- | --- | --- | --- | --- | --- |
| baseline | Existing or simple baseline | — | Fixed validation split; recorded seeds | User-defined | Not run |
| candidate-a | One justified algorithm change | baseline | Same split and matched seeds | User-defined | Not run |
| confirmation | Repeat the chosen comparison | baseline | Predeclared independent replicates | User-defined | Not run |

Before launch specify the primary metric and direction, acceptable regressions, limits on runtime/cost/compute, early-stop rule, and expected outputs. When interactions matter, record a factorial or other justified design rather than using this one-factor example. Keep the final test split outside iterative tuning.
