# Quick start

Install the tarball into Pi using its normal package installation flow, or install into a project containing the official Pi peer SDK. Node >=22.19 is required.

1. In the repository, use `pstack_verify {"action":"fingerprint"}` to obtain repoId.
2. Fill `strict-brief.json` with that repoId, real paths and tests. Every strict node receives a full Brief. Legacy ordinary graph calls remain supported; legacy completed is never verified.
3. Operator-managed `verification-policy.json` lives under PSTACK_NATIVE_HOME (default `~/.pi/agent/pstack-native`). Copy the example only after reviewing the exact command argv. Agents cannot supply their own policy through a tool call.
4. Run or plan `pstack_workflow` with `contractLevel: strict`, nodes carrying `brief`, or a typed `template`.
5. Inspect `pstack_verify` ledger and `pstack_context`. After a commit, run `pstack_verify` action `run-pr` with workflow id, key, actual repo and PR number to bind new clean-commit evidence to the live head. A changed commit requires a matching structured report/contract and fresh verification.
6. `pstack_delivery` returns blockers only. Actual merge is `pstack-runner ship stack.json --approve --pr NUMBER`; without approval it is dry-run. Each next PR needs a new refreshed authorization. Babysit consists of querying these blockers, fixing via a new workflow and stopping at merge-ready.

## API examples

```json
{"action":"plan","mode":"arena","template":{"kind":"arena","brief":"REPLACE_WITH_FULL_BRIEF_OBJECT","models":["provider/model-a","provider/model-b"],"judgeModel":"provider/model-judge","rubric":[{"criterion":"correctness","weight":1}],"candidateCount":2}}
```

The placeholder must be replaced by a full JSON object, not a reference string. `swarm` requires swarmMode race/partition. `review` reviewers are readonly. `autopilot-stack` takes strict slice briefs and builds sequential writers; `autopilot-full` takes slices and isolated PR-owner implementation lanes followed by integration/verification. Actual PR creation remains explicit CLI.

## CLI

```sh
pstack-runner migrate                 # preview
pstack-runner migrate --apply         # backups; quiescent records only
pstack-runner run runner.json --once
pstack-runner run runner.json         # supervised polling; SIGINT/SIGTERM stop polling
pstack-runner approve-gate /repo brief.json approve --approve
pstack-runner ship stack.json         # dry-run
pstack-runner ship stack.json --approve --pr 123
pstack-runner open-pr /repo VERIFICATION_ID pr-details.json
pstack-runner open-pr /repo VERIFICATION_ID pr-details.json --approve
pstack-runner export audit.json
```

Runner config: `{ "agentDir": "/absolute/dedicated/pi-agent", "model": "provider/model", "workflowIds": ["wf_..."], "pollMs": 5000 }`. Agent dir must have separately configured SDK auth/models; do not rely on an interactive session's implicit credentials.

Stack config: `{ "id":"my-stack", "repoId":"FINGERPRINT_REPO_ID", "repo":"owner/repository", "numbers":[123,124], "owner":"YOUR_SCOPE", "requireReview":true, "requireBehavior":true }` in dependency order. PR details: `{ "repo":"owner/repository", "base":"main", "head":"feature-branch", "title":"Describe verified change" }`.

## Benchmark

```sh
npm run benchmark -- --agent-dir /absolute/dedicated/pi-agent --model provider/model --output /absolute/benchmark-output
```

Twenty seeded bug-fix repositories and immutable independent tests are generated. Each case uses the same test/contract protocol and records execution, current verification and provider usage. Missing credentials remain blocked. The supplied fixtures measure simple bug fixes, not Cursor parity or complex multi-PR efficacy. For full comparative research use identical models/snapshots, repeated trials and additional cross-module, arena and real PR tasks.
