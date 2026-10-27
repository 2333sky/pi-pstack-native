# pi-pstack-native

[中文说明](README.zh-CN.md) · [Documentation index](docs/README.md) · [Runtime reference](docs/REFERENCE.md)

A Pi Coding Agent extension for coordinated development with pstack-inspired Skills, persistent child sessions, and evidence-based workflow verification.

> Independently maintained; not affiliated with or endorsed by Cursor or the upstream pstack maintainers. Requires Node.js **22.19+** and Pi Coding Agent **^1.4.0**.

## Why use it?

- **Delegate with purpose.** Use focused Pi child sessions for implementation, exploration, review, and integration. Configure the model and reasoning level for each role.
- **Coordinate parallel work.** Define dependencies in a workflow; isolate concurrent writers in Git worktrees and integrate their outputs before verification.
- **Keep work recoverable.** Persist child sessions, workflow state, and execution journals so interrupted work can be inspected and resumed without automatically replaying completed nodes.
- **Verify the artifact.** Task contracts, command gates, artifact fingerprints, and evidence ledgers make a completion claim distinguishable from verified results.
- **Adapt pstack to Pi.** Bundled Skills and playbooks retain the pinned upstream instructions with explicit platform adaptations, including Pi-native agent and workflow tools.

These mechanisms support disciplined workflows; they do not guarantee correctness or full Cursor compatibility. Worktrees and confined tools are not an operating-system sandbox. Review [compatibility and evidence boundaries](docs/SEMANTIC-COMPATIBILITY.md) before relying on them.

## Install

Install the Pi package from GitHub:

```bash
pi install git:github.com/2333sky/pi-pstack-native
```

Restart Pi, then run `/setup-pstack`. To update or remove it:

```bash
pi update git:github.com/2333sky/pi-pstack-native
pi remove git:github.com/2333sky/pi-pstack-native
```

Add `--local` to install for one trusted project. An unpinned Git source follows the default branch on update; append a tag or commit with `@` to pin it.

The npm package name is `pi-pstack-native`, but it has not been published to npm. For source development, clone the repository, run `npm ci` and `npm run build`, then run `pi install .` from the checkout.

## Get started

In Pi, choose role models and a child reasoning level:

```text
/setup-pstack
/poteto-mode Fix the login bug, run relevant tests, and report the evidence.
```

Both model aliases, `inherit-parent` and `auto`, use the parent session's model. A reasoning level of `inherit-parent` uses the parent's level. Explicit reasoning levels are checked against each selected role model; support varies by model. Cancel setup at any prompt to leave the configuration unchanged. Existing panel and workflow overrides are retained.

Poteto Mode remains active for the current session until `/poteto-mode off`. You can ask Pi naturally to use child agents for exploration, implementation, or review. Whether agents are launched depends on the request and model's tool calls.

## Inspect work

| Command | Purpose |
| --- | --- |
| `/pstack-agents` | List child agents owned by the current session. |
| `/pstack-workflows` | List workflows; use `status`, `pause`, `resume`, or `cancel` with a workflow ID. |
| `/pstack-worktrees` | List owned worktrees; use `cleanup <agent-id>` for a safe cleanup. |
| `/pstack-runtime` | Show runtime and dependency status. |
| `/pstack-upstream` / `/pstack-parity` | Inspect the pinned upstream revision and inventory coverage. |
| `/pstack-loop` | Manage session-local recurring tasks; an active Pi host is required. |

Workflow state defaults to `~/.pi/agent/pstack-native/`; set `PSTACK_NATIVE_HOME` to choose another directory. `/pstack-workflows status <id>` reports execution status, while evidence and acceptance should be checked separately. See the [runtime reference](docs/REFERENCE.md) for command details, verification policy, recovery, scheduling, and delivery boundaries.

## Validation and compatibility

The active source snapshot is Cursor pstack **0.15.32** at `99b609a72323b70204eab407c622f436e858e112`; the SDK lock is **1.4.0**. Inventory coverage, source provenance, deterministic tests, fake-provider tests, authenticated model runs, and maintainer semantic sign-off are different forms of evidence. Current records do not claim full behavioral parity or maintainer sign-off. See [upstream provenance](docs/upstream-provenance-0.15.32.json) and [semantic compatibility](docs/SEMANTIC-COMPATIBILITY.md).

The GitHub workflow runs Node 22/24 checks and focused Windows state/build tests. A user also reported real-model Windows testing, including 20/20 benchmark cases after local fixes; that checkout had no recorded commit, so the results are not tied to a specific repository revision. See the [Windows test record](docs/WINDOWS-MODEL-TEST.zh-CN.md). For local development:

```bash
npm ci
npm run check
npm run check:types
npm run build
npm run check:e2e
```

`npm run benchmark:smoke` is offline. The model-driven benchmark can incur substantial charges; its default is 20 cases, up to 200,000 tokens and 600 seconds per case. Start with `--limit 1` and choose a `--max-tokens` budget. No external model is needed for the checks above.

## Documentation

- [中文说明](README.zh-CN.md) — installation, daily use, and troubleshooting.
- [Documentation index](docs/README.md) — user, maintainer, and historical documents.
- [Runtime reference](docs/REFERENCE.md) — workflow, verification, recovery, and advanced operations.
- [Examples](examples/README.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md).

MIT licensed; retain upstream attribution and notices. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
