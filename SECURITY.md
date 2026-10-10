# Security policy

## Supported versions

`0.6.0-preview.1` is a preview; it is **not** production certified. There is no guaranteed security-support window yet.

## Reporting

Do not disclose a usable exploit, token, or private repository data in a public issue. Until the repository owner enables GitHub private vulnerability reporting, contact the project maintainer through a private channel you already trust. The repository maintainer should enable **Settings → Security → Private vulnerability reporting** immediately after creating the GitHub repository.

## Threat model and limitations

- Worktrees are Git checkout isolation, not sandboxing; external side effects and shell tools retain the process's OS access.
- Local journal and lease state coordinate cooperating processes, not malicious peers.
- Write/merge operations remain subject to GitHub credentials, repository branch protection, and human authorization.
- Recovery does not guarantee exactly-once delivery of remote side effects.
- Do not run against confidential source code or production branches without OS-level isolation and a reviewed command/credential policy.
