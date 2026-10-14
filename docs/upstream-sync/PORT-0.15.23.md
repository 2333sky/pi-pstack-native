# Proposed pstack 0.15.23 behavior ports

Reviewed baseline: 978ca6e9c0e012047cd5058b8e829240336e704e (0.15.17).
Candidate: 837067b75aa20ab58d7b2a2f6c0531e37118c596 (0.15.23).
Native implementation base: ee8acfe5f65a44545a1334eae7e3a4de7f14c75b.

Status is **proposed**, not integrated. UPSTREAM.json and PARITY.json retain the
reviewed baseline. [The candidate receipt](candidate-0.15.23.json) accounts for
all 35 pinned changed files, linking upstream blobs to implementation files,
rationale, retained differences and pending semantic review. Available candidate
Skills do not imply reviewed parity. No source count or CI pass is an equivalence
percentage. Existing stronger native isolation and SHA verification are retained.

## 1. Resource access and evidence boundaries

Read-only children now have an explicit active SDK allowlist of confined
read/ls/find/grep plus pstack_skill and pstack_evidence. The old empty allowlist
prevented even the custom read tools from being activated. A real SDK + local
protocol fixture verifies the model receives the six safe tools without shell,
edit/write tools. Another fixture actually reads a bundled Skill, reads a parent
issue snapshot and attempts an outside-worktree read; the outside secret is not
returned. Traversal, symlink, script and arbitrary-resource cases are separately
tested. No filesystem root was added to the ordinary read/search tools.

The Skill tool provides only curated bundled Markdown, including scoped how
and why templates. Resources are paginated with totalLines/hasMore. Poteto
profiles require full Skill/playbook/leaf reading and preserve parent ownership,
fresh-task default and costly-state recovery. This is a prompt contract, not a
claim that every real model always follows the instructions.

External evidence is a bounded, typed, per-category parent snapshot, persisted
in AgentRecord/WorkflowCall and forwarded on recovery. Available/empty/
unavailable/inconclusive are distinct. Seven categories have native source
playbooks and epistemic/synthesis contracts. Excerpts are untrusted data,
provenance is parent-supplied and not independently verified, and the parent
must verify decisive citations against authorized sources. No MCP token/tool
forwarding, network browsing in a read-only child or credential discovery occurs.
Credential-bearing URLs/patterns in supplied packets are refused. Native gate
logs now redact userinfo-only URLs and bare known token prefixes; the previously
TODO credential regression is enabled and passes.

## 2. PR-stack delivery and native watcher

The legacy autopilot-stack DAG remains usable as local preparation and now
returns deliveryContract=remote-stack-required. A completed DAG is not a
completed PR stack. The new stack-plan/stack-open CLI operates on separate,
clean, already published, linearly based worktree branches. Every lane requires
current accepted behavior evidence against its exact parent; plans contain
stable patch IDs and known remote refs. Only the first PR targets trunk.
Opening is dry-run by default; --approve is explicit remote creation authority,
never merge authority. Existing open ready PRs are reused only when head/base
match. Unknown/moved refs, wrong ancestry, dirty/hidden-index flags, unrelated
repository identities, empty patches, old ledgers and topology drift block.
No automatic branch pushing, rebasing, force-pushing or retargeting is added.
Those topology operations stay with the root and require their existing authority.

The GitHub adapter paginates all review threads, refuses incomplete/looping
cursors or conflicting page observations, and rechecks head/base after the read.
Frontier blocks unresolved or unqueried review threads, draft state, bad merge
state and stale verification even when CI/review rollups look green. It checks
both parent SHA and parent branch when available. The pinned trunk and review/
behavior policy are included in the authorization digest. After a lower merge,
the next frontier must be prepared against trunk; it cannot silently land into
the old parent branch. Native snapshots are waiting/reviewable/advance/complete/
closed, not synthetic Cursor READY verdicts; auto-merge requested is not queue
readiness. Server-side branch protection remains the final merge constraint.

A real Git fixture creates two dependent worktrees, executes native gates, opens
a simulated two-PR chain, then retries without duplicate writes. Wrong parent,
moved refs, missing/unresolved review evidence, and the post-merge trunk
transition are negative cases. Adapter fixtures exercise a second-page unresolved
thread, cursor errors and a head move. These are not live GitHub-stack E2E.

Native head/base changes always invalidate ledgers, even if patch IDs match.
This deliberately preserves the stricter native rule instead of importing the
upstream repeated-build/noise exception. Exact Cursor watcher/merge-queue verdict
protocol and Bugbot pass-based dismissal heuristics remain unsupported. All
unresolved threads are conservatively blocked, including Bugbot threads.

## 3. Candidate content ports

- Added in-your-own-words as a restatement-only Pi Skill with valid frontmatter.
- Ketchup carries the newer plain/brief/checked-number/available-visual/action
  rules while retaining Pi event-authorship and read-only boundaries.
- Verification Skill creation requires usable empty-data startup, migrations/
  seed preconditions, preserved proof after teardown and unverified stand-in
  setup differences. A missing precondition fails the journey; it is not waived.
- Poteto and comment-sicko profiles now carry the stronger delegation and scoped
  findings contracts. The native role name was already comment-sicko.
- How/why have readable scoped explorer/investigator/synthesizer/category
  templates and explicit null-source accounting through the evidence boundary.
- Root-cause guidance adds the cheap always-on deciding-fact signal.
- Help/recipes explain advice versus starting paid work, the new restatement
  Skill, resource/evidence boundaries and actual stack commands.
- The reviewed upstream check-plan tool/fence regressions are reused with Node
  assertions and a native loop marker. Bun bootstrap/lifecycle files are not
  imported. Its strict ten-lane format is opt-in and grants no model spend.
- Explicit-base worktree-audit reports head/base/dirty/ahead/merged without
  deleting files. Cursor pinned-chat/transcript/sidebar and simulator cleanup
  remain unsupported; owned/active/dirty cleanup rules stay in place.
- Mostly textual upstream principle reductions retain native scoped guidance;
  Cursor manifests are excluded from Pi package registration. These decisions
  are mapped as equivalent/platform exclusions pending maintainer review.

The scan reporter now permits intentional local mapping revisions for one SHA
pair: it retains original evidence and writes a fingerprint-suffixed revision.
Changed upstream evidence under the same ID remains an error. Read blob bytes
are independently checked against Git SHA-1. Workflow artifacts resolve the
validated reported revision path instead of assuming the original filename.
Runtime status/workflow metadata now reads the reviewed UPSTREAM version rather
than the obsolete hard-coded 0.15.15; it does not use the candidate version.

## Validation and limitations

Local release checks passed on Node 24.19.0, including 147 runtime tests,
11 upstream-tool tests, types/build/SDK/benchmark and actual installed tarball
smoke. Offline E2E has 9 passing tests and zero TODOs; fake E2E has 6 passing
cases. Node 22.19.0 is also run through the existing release gates. Final
remote matrix evidence is recorded in the PR description after it completes.
Frontier hardening is followed by targeted shipping/verification tests and a
fresh build. No existing gate or assertion is removed to manufacture success;
read-only fixture assertions now require exactly the six safe tools instead of
the old broken empty allowlist, with no shell/edit/write exposure.

Live external LLM inference, comparative Pi/Cursor tasks, real native CLI stack
creation/merge, and live Cursor-only platform behavior remain not_run. Maintainer
semantic approval is pending. Worktree/path checks are not an OS sandbox against
malicious code or concurrent filesystem attacks. Parent snapshots are not signed
source attestations. Some new content has structural discovery/contract tests,
not independently proven model conversational behavior. This PR does not claim
full upstream semantic equivalence or advance the reviewed baseline.
