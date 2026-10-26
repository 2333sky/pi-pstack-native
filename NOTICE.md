# Notices

`pi-pstack-native` / npm package `2333` is a Pi-native semantic port of **pstack**.

- **pstack** by Lauren Tan — MIT. Upstream repository: `cursor/plugins`, path `pstack`. It is the source specification for skill names, playbook concepts, principles, and workflow semantics.
- **Pi** by Earendil Works / contributors — official runtime APIs used by this package through `@earendil-works/pi-coding-agent`.

The 0.6.0-preview.1 runtime does not include or require `@whamp/pi-pstack`, `pi-subagents`, `pi-durable-subagents`, or `pi-agents`.

This project does not claim authorship of upstream pstack. Upstream copyright and MIT terms remain in effect for copied or substantially derived pstack material. The Pi-native runtime, state engine, scheduler, worktree manager, and adaptation code are original implementation work in this package.

The baseline skill Markdown and references under `vendor/upstream/0.15.17/pstack/` are copied verbatim from cursor/plugins commit `978ca6e9c0e012047cd5058b8e829240336e704e`. The upstream MIT notice is retained at `vendor/upstream/0.15.17/pstack/LICENSE`. Core entrypoints are mechanically generated from this source plus the separate Pi adapter.

The active source snapshot is `vendor/upstream/0.15.32/pstack/` at cursor/plugins commit `99b609a72323b70204eab407c622f436e858e112`. It retains the upstream MIT license and includes Skill Markdown, references and the statechart toolchain. Generated supported entrypoints retain those upstream bodies. The earlier 0.15.17 snapshot is kept for historical provenance.
