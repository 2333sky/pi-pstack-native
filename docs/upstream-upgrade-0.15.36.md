# pstack 0.15.36 upgrade

The active source is `cursor/plugins` commit `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`. The full 573-file Git tree was hashed against the checkout; the [provenance record](upstream-provenance-0.15.36.json) and [inventory](upstream-inventory-0.15.36.json) separate source metadata from executable Pi capabilities. The 0.15.32 and 0.15.17 snapshots remain historical records.

The update includes the new Interrogate, Arena judge rules, agentic Orchestrate instructions, and the rewritten TypeScript Statechart runtime and corpus. Pi-specific execution behavior and remaining limits are documented in [the adapter](PI-SEMANTIC-ADAPTER.md). The source upgrade is not maintainer semantic sign-off and does not prove that a model obeyed the instructions.

The compiled 0.15.36 Statechart CLI was smoke-tested with Java 17 and checksummed TLC 1.7.4 on the upstream Counter example, including from an installed package under node_modules. Real-model inference and live remote PR delivery for this revision require separate evidence. The complete upstream Statechart test suite may require Java/TLC, a working process-inspection environment, and optional runtime tools; skipped or environment-blocked tests do not count as passes.
