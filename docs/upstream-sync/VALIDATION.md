# Validation evidence — continuous-sync implementation

Local environment: Node 22.19.0 (npm-exec supplied runtime) and Node 24.19.0.
No live model/provider credentials were used. Commands run from the repository.

| Check | Node 22.19.0 | Node 24.19.0 |
|---|---|---|
| `npm run check` (source/package/parity/playbooks, upstream tests, runtime tests, review) | passed | passed (final sequential repeat) |
| `npm run check:types` | passed | passed |
| `npm run build` | passed | passed |
| `npm run check:host` | passed | passed |
| `npm run check:e2e` | passed (offline/fake only) | passed (offline/fake only) |
| `npm run benchmark:smoke` | passed (20 fixtures; no external model) | passed |
| `npm run smoke:installed` | passed (actual tarball install + SDK 1.2.0) | passed |
| `node --test docs/parity.test.mjs` | included in playbook check | passed: 10 tests |
| `npm run test:upstream` | passed: 10 tests | passed: 10 tests |

The aggregate command was `npm run check:release` on both runtimes; no gates
were removed or skipped. Offline E2E has 7 passing tests and 2 existing TODOs;
fake-provider E2E has 6 passing tests. These TODOs remain unimplemented, not
counted as passes. The Node 22.19.0/24.x GitHub CI matrix remains in place and
will independently run after PR creation.

## Failures retained for review

The first Node 24 aggregate attempt failed in the pre-existing
`test/protocol.test.ts` coordinator test (`8 !== 12` reconciled units). A
subsequent full run passed all 135 runtime tests and all release gates. Another
Node 24 run executed concurrently with the Node 22 release suite failed in the
same existing test (`PROGRAM_CLOSE_BLOCKED: unit4,unit5`). No runtime/test
assertions were weakened or changed. This indicates intermittent existing
coordinator/verification behavior under load; its exact cause has not been
established. The final sequential Node 24 release command passed all seven gates. Passing reruns
do not establish that the intermittent failure has been fixed.

## Real upstream and parsing evidence

Network and local Git scans both returned:

```json
{"status":"changes_detected","syncId":"978ca6e9c0e0_837067b75aa2","changes":35}
```

Pinned candidate is `837067b75aa20ab58d7b2a2f6c0531e37118c596` (0.15.23).
The result includes added `in-your-own-words`, all auxiliary changes and 59
old/new seam hits. Repeated scans preserve fingerprint and timestamp;
`upstream:plan` regenerates the same task package. The real report was parsed
and fingerprint-validated by `validateReport`. Workflow YAML parsed successfully;
`git diff --check` passed.

## Not run / not claimed

- Real upstream 35-item semantic port: pending; report gates `not_run`.
- Live credentialed LLM/GitHub E2E, actual candidate draft/push and merge:
  `not_run`; smoke and fake APIs do not substitute for these.
- New scheduled workflow and opt-in Issue notification in the target repository:
  `not_run` before merge/default-branch deployment.
- Maintainer semantic approval and integration: `not_run`; UPSTREAM.json and
  PARITY.json remain unchanged at the reviewed 0.15.17 baseline.

Full local logs are retained in the implementation session. This document
records exit results/test counts rather than arbitrary tool output or credentials.

Final hardening reuses the native artifact fingerprint for optional candidate commands, including index-flag/submodule rejection and pre/post-gate source equality. The upstream CLI regression suite and syntax checks were rerun after this change on Node 24, and the upstream suite was rerun on Node 22.19.0.

## Remote delivery blocked

GitHub connector create-tree and create-branch both returned HTTP 403
`Resource not accessible by integration`. Direct Git push failed because the
workspace has no GitHub login credentials. No remote branch/PR or remote CI
run was created, and none is claimed as successful. The connected plugin is
installed but its current integration cannot perform these repository writes.
A maintainer must supply an appropriately authorized GitHub connection to
complete remote delivery. No credentials were requested in prompts or logged.

After the user reconnected GitHub, creating the isolated feature branch succeeded. Remote delivery is now being resumed; the earlier HTTP 403 failures are retained above as historical evidence.
