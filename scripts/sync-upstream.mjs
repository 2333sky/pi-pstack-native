#!/usr/bin/env node
// Compatibility entry point: --from now requires Git history, not a loose snapshot.
process.argv.splice(2, 0, 'scan');
await import('./upstream/cli.mjs');
