## Why

The CLI needs the validation API before it can report invalid PRs.

## What changed

- Add the CLI entry point on top of the validation API.

## Scope

This child PR covers the CLI. The parent PR covers the API. Live forge actions are not covered.

## Tradeoffs

A single PR would hide the separate API review.

## Blast Radius

Repository checks use this command. The example does not write to a forge.

## Verification

- This is a sample, not evidence of a real run. Validate it with `node docs/validate-pr.mjs docs/stacked-pr-body.md`.
