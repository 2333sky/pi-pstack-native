# Upstream 0.15.17 review

## Verified material

The GitHub commit API returned `978ca6e9c0e012047cd5058b8e829240336e704e` for 0.15.17 and `00b14f1df36b32a8dd1529324a3a459f6563b127` for 0.15.16. The pinned archive's plugin manifest says `0.15.17`. All 165 pstack files matched the Git blob SHAs in the untruncated official tree. [The provenance file](upstream-provenance-0.15.17.json) records URLs, SHAs, and the complete changed-file list.

```bash
gh api repos/cursor/plugins/commits/978ca6e9c0e012047cd5058b8e829240336e704e
gh api repos/cursor/plugins/commits/00b14f1df36b32a8dd1529324a3a459f6563b127
curl -fsSL https://api.github.com/repos/cursor/plugins/tarball/978ca6e9c0e012047cd5058b8e829240336e704e -o /tmp/parity-upstream.tar.gz
mkdir -p /tmp/parity-upstream-01517
tar -xzf /tmp/parity-upstream.tar.gz --strip-components=1 -C /tmp/parity-upstream-01517
node scripts/sync-upstream.mjs --from /tmp/parity-upstream-01517/pstack --write-report docs/upstream-sync-0.15.17.json
```

The sync run passed with 52 skills, 23 playbooks, and no name drift. It reports runtime seams, not semantic approval. Counts come from the official tree, not ADAPTED labels.

## 0.15.16 wording review

The official commit is a prompt-distillation change. The review below covers its changed content by group. Local ports retain shorter Pi instructions rather than copying each prompt and auxiliary file. ADAPTED labels describe represented intent, not a behavioral audit.

| Upstream change group | Semantic point retained or strengthened | Intentional Pi difference |
|---|---|---|
| `architect`, `arena` | Ground the design, compare shapes, choose a base, graft deliberately, verify the final artifact. | Native roles and worktrees replace Cursor model defaults and Task calls. A narrow design can remain local. Runner templates are not vendored. |
| `benchmark-checklist`, `principle-explain-the-number` | Measure the limiter, tune both sides, count errors, confirm work ran, and compare end-to-end impact. | Local guidance asks for enough alternating trials rather than a universal five-run rule. A requested one-run ballpark is labeled. No performance claim is added. |
| `figure-it-out`, `how` | Keep the hypothesis loop, verifiable units, and complexity-based exploration. | Pi durable workflows replace Task fanout. A simple explanation can stay in the parent rather than require a child. |
| `interrogate` and reviewer/rubric references | Review execution against intent, trace callers and failure paths, reconcile independent findings, and separate blockers from preference. The PR playbook now names these checks. | Local reviewers may have distinct angles. Upstream favors model diversity over assigned personas. Auxiliary reviewer prompts are not vendored. |
| `poteto-mode` | Read leaf principles, keep investigations read-only, use prototypes for observable questions, apply prose checks, and declare PR status mode before polling. | The local skill now makes these triggers explicit. Native tools and the stricter external-write authorization rule remain. |
| `opening-a-pr` | Retain a short review brief, mandatory Scope, ready PRs, parent-targeted stacks, tool provenance, and deferred babysit. | GitHub API and CLI access do not implement Cursor's private PR-tool metadata. Cleanup is a diff reread without a mandatory Cursor plugin. Local Verification and other required headings cannot be dropped. |
| `trace-forensics` | A fixed capture stays read-only. A paired capture can confirm a finding. Without one, label the strongest supported hypothesis. | Use available parsers and Pi evidence. No Cursor control tool is required. |
| `principle-build-the-lever`, `principle-encode-lessons-in-structure` | Make evidence rerunnable and put recurring constraints in structure. | The local PR validator is a small deterministic check, not a new framework. |
| `principle-minimize-reader-load`, `principle-model-the-domain`, `principle-type-system-discipline` | Minimize hidden state and indirection. Model real states and parse at boundaries. | Local principles keep the compact Pattern/Avoid/Proof form instead of copying upstream examples. |
| `principle-never-block-on-the-human`, `principle-redesign-from-first-principles`, `principle-subtract-before-you-add`, `principle-test-behavior-not-implementation` | Proceed on reversible work, integrate requirements coherently, remove dead paths, and assert observed behavior. | Publishing and merges still need explicit authorization. Structural skill tests prove text and loader behavior only. |
| `reflect` and reviewer/synthesizer references | Keep workspace-bounded evidence, reject already-covered lessons, and require approval before skill edits. | Approval and routing are now explicit locally. Read-only Pi reviewers do not inherit Cursor agent-mode MCP behavior. Backlog writes also need authorization. Auxiliary role prompts are not vendored. |
| `technical-writing`, `unslop` | Keep complete sentences, real identifiers, one action word, short PR briefs, concrete claims, and no decorative metaphors. | Local writing skills now strengthen these checks but keep compact instructions instead of the full numbered catalog. |
| `why` and epistemics/investigator/source/synthesizer references | Keep historical citations, confidence separation, source gaps, and caution about telemetry correlation. | Local fact/inference/unknown labels are coarser than upstream's five tiers. Source-specific MCP instructions are not vendored. No access to absent sources is implied. |
| plugin manifest | The version moves to 0.15.16 before 0.15.17. | Pi package version remains independent of the upstream semantic baseline. |

## 0.15.17 ketchup port

The new skill uses `/skill:ketchup`, not a Cursor command. It finds the last user-authored message before the request. Role alone is not evidence of authorship. Notifications, scheduled prompts, and child completion messages do not move the cutoff. Unknown provenance is a stated gap, not a guessed cutoff.

Status rechecks are read-only. Only user-dependent decisions or steps are action items. Older unanswered items remain visible. Each summary names the affected work, choices, costs, recommendation, and unanswered default so it remains useful outside the chat.

## Evidence and limits

`node --test docs/parity.test.mjs` checks the official Pi skill loader, required ketchup text, PR-body validation, and fixture handoff negatives. [The stack guide](PR-PROTOCOL.md) includes a sample.

Chat behavior itself was not exercised. That harness belongs to issue #6. No credentialed model call ran. Live stack operations, independent model review behavior, and Cursor private platform behavior are not proven by these checks.

Upstream pstack is by Lauren Tan under MIT terms. Preserve [LICENSE](../LICENSE) and [NOTICE.md](../NOTICE.md). This independent port is not endorsed by Cursor.
