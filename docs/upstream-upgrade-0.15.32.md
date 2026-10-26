# pstack 0.15.32 and Pi SDK 1.4.0 upgrade

Checked on 2026-10-26. The active pstack source is cursor/plugins@99b609a72323b70204eab407c622f436e858e112, the upstream main pin at that check. npm latest is @earendil-works/pi-coding-agent 1.4.0. The dependency is locked exactly for development and the consumer peer minimum is ^1.4.0.

## What changed

All 57 supported Skills and all 23 playbooks now retain their latest source body. The 58th Skill, make-bot-ui, stays explicitly Cursor-only. Statechart now includes its full 27-file upstream toolchain; no top-level target Skill remains pending. The vendored registry contains 141 source artifacts and original blob IDs, while provenance verifies all 200 upstream files. The 0.15.17 source remains historical provenance.

The [machine-readable audit](upstream-upgrade-0.15.32.json) records all 118 changed upstream files with before/after blob IDs, section/step fingerprints, dispositions, native mappings and test references. It is an implementation audit, not maintainer approval or full model equivalence.

## Critical decisions

- Autopilot runs a full swarm for initial/major changes. A minor fix, conflict resolution or rebase can use a single new independent reviewer only with a clean prior full round. Fresh gates and live proof still cover the current head/base. Authors and replacement owners cannot countersign their own code.
- Native exact-head/base ledger invalidation remains stricter than upstream patch-ID/build-noise reuse. Old round receipts are not reused as current proof. The native full round retains two distinct diff lanes and trunk-context proof as additional safeguards.
- Stack topology has one owner. New upstream landing-in-flight rules are retained verbatim; coordinator duties and the distinction between local DAG preparation and remote stack delivery remain explicit.
- Model effort maps to explicit native thinkingLevel. Provider/model selectors stay explicit; Cursor fast-slug/family rewriting is not silently emulated.
- All changed references are pinned and readable. Cursor watcher, private provenance, cleanup and cloud runtime surfaces stay declared platform limits. Native DAG, AgentSession, worktree isolation, Frontier authorization and recovery are retained.

## Verification and boundary

The repository check passed 182 tests, plus its upstream-tooling and document-contract suites. Typecheck, all 15 offline/fake-provider E2E cases, SDK host creation, build and clean-tarball installation passed on Pi 1.4.0. The installed-package smoke read the pinned source through the public resource API and invoked the bundled statechart CLI. [Statechart validation](STATECHART.md) ran the unchanged upstream suite with real Java 21, checksummed TLC 1.7.4 and PNG rendering: 149 passed, zero failed, one mise-only discovery case skipped. CI adds a separate statechart toolchain job alongside Node 22.19/24 source, host, E2E and install checks.

The authenticated real-model tier remains not-run because no model credentials are configured. Source availability, deterministic gates, toolchain behavior, maintainer semantic sign-off and real-model evidence are separate claims. No approval is inferred from this upgrade request or from passing tests. See [acceptance status](SEMANTIC-COMPATIBILITY.md).
