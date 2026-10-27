# Minimum run record

Use the existing experiment tracker if one is available; otherwise create a project-local record appropriate to the project. A record is evidence only when its fields reflect an actual run.

| Field | Record |
| --- | --- |
| Run ID and purpose | Baseline/candidate, hypothesis and linked task |
| Code | Full Git commit and dirty diff identity, or explicit non-Git snapshot |
| Data | Dataset/version, split IDs, grouping/time cutoff and preprocessing fit scope |
| Configuration | Model/weights, hyperparameters, actual commands, random seeds and decoding if relevant |
| Environment | Dependency versions, OS, device/GPU and distributed setup |
| State | Start/end, completed/failed/pruned/blocked, errors and reason |
| Outcomes | Metric definitions, per-split scores, sample counts, runtime, memory/cost if measured |
| Artifacts | Local or authorized tracker paths for logs, evaluation output and checkpoints |
| Caveats | Leakage/contamination checks, nondeterminism, missing data and deviations |

Never include credentials or raw private samples in a shareable record. If a field is unknown, write `unknown` rather than guessing.
