# Minimum run record

Use the existing experiment tracker if one is available; otherwise create a project-local record appropriate to the project. A record is evidence only when its fields reflect an actual run.

| Field | Record |
| --- | --- |
| Run ID and purpose | Baseline/candidate, hypothesis and linked task |
| Code | Full Git commit and clean/dirty state; if dirty, save an authorized, recoverable patch or source snapshot, not only its hash |
| Data | Immutable dataset ID, version or digest when available; recoverable split manifest with grouping/time cutoff and preprocessing fit scope; access/location rules |
| Configuration | Saved resolved config and actual commands/arguments, model/weights, seeds and decoding if relevant; link to code that consumes them |
| Environment | Dependency lockfile or environment export when available, OS, device/GPU, drivers and distributed setup |
| State | Run ID, start/end, process exit status, completed/failed/pruned/blocked/not run, errors and reason |
| Outcomes | Metric definitions, per-split scores, sample counts, runtime, memory/cost if measured |
| Artifacts | Stable local or authorized tracker paths for logs, evaluation output, checkpoint and recovery metadata; content digests if available |
| Caveats | Leakage/contamination checks, nondeterminism, missing data and deviations |

A hash without the underlying recoverable patch, dataset, config or artifact is not a reproducibility guarantee. If a dependency cannot be preserved, record its availability and limitation explicitly. An independent replay on the specified environment can support reproducibility; a synthetic smoke only supports pipeline operability, and an independent scientific replication is a distinct claim.

Never include credentials or raw private samples in a shareable record. Do not upload or copy restricted artifacts merely to satisfy a field. If a field is unknown, write `unknown` rather than guessing.
