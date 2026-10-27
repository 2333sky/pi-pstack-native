# Contributing

This is a Pi-native adaptation of pstack. Please open an issue describing the problem, a minimal reproduction, expected behavior, and the Pi SDK/Node versions before large changes.

## Local development

Use Node.js >=22.19.0 and a compatible `@earendil-works/pi-coding-agent` SDK.

```bash
npm install
npm run check
npm run check:types
npm run build
npm run check:host
npm run benchmark:smoke
```

The host check creates a Pi AgentSession but does **not** test a paid/live model. Remote PR tests must use a disposable repository and never run destructive commands on third-party repositories.

## Pull requests

- Preserve upstream pstack attribution and MIT notices.
- Include regression tests for any workflow, safety, artifact, or ledger behavior changed.
- State whether your test used a loopback provider or authenticated inference.
- Include failure and restart paths when modifying persistence, recovery, locks, or shipping logic.
- Keep compatibility for legacy graph/chain/parallel usage unless the change is explicitly breaking.
- Avoid committing secrets, `node_modules`, local `~/.pi` data, or benchmark outputs.

See [SECURITY.md](SECURITY.md) before reporting security issues.
