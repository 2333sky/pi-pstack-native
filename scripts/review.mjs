// This script deliberately avoids claiming that source-string matches prove
// runtime correctness. Behavioral verification lives in npm test / host smoke.
import { readFileSync, writeFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const known = [
  "The real SDK lifecycle test uses a loopback protocol fixture for completion, HTTP 401, cancellation, and recovery; it does not perform authenticated external LLM inference.",
  "A cross-process cancellation request is cooperative, not a preemptive OS sandbox. While cancellation is unconfirmed the state remains `cancelling`, and any already running external side effect may finish.",
  "Path-constrained read tools are not an operating-system sandbox: hard links, external extension side effects, and malicious filesystem races require OS-level isolation for untrusted agents.",
  "Regex execution is bounded with a killable worker; matching large repositories may time out rather than returning partial results.",
  "User-owned or agent-owned remote side effects cannot be made exactly-once solely by a local workflow journal.",
  "Loop occurrences are claimed before send for at-most-once dispatch attempts; a Pi host crash between the durable claim and accepted delivery can lose that occurrence. Disabling or deleting a loop cannot recall a message already submitted to Pi.",
  "Loop execution locks coordinate cooperating Pi processes and remain held through sendUserMessage settlement; lock-file storage must be on a filesystem with atomic exclusive file creation and rename semantics.",
  "Minimum supported Node is >=22.19.0; verification from an older local runtime must be repeated on an officially supported runtime.",
  "Project integrators remain probabilistic AI systems and need evidence-driven integration and test verification."
];
const md = `# v${pkg.version} review & validation\n\n` +
  `## Verified by the default local check\n\n` +
  `- JS/TS syntax checks and package/parity policy checks\n` +
  `- Unit and subprocess behavioral tests (not actual Pi inference)\n\n` +
  `## Additional release gates\n\n` +
  "- `npm run check:types` (needs installed Pi peer and TypeScript development dependencies)\n" +
  "- Real Pi AgentSession lifecycle integration and final installed-tarball load smoke\n" +
  "- Authenticated external LLM inference remains a separate gate when authorized credentials are available\n\n" +
  `## Residual risks\n\n${known.map((item) => `- ${item}`).join("\n")}\n`;
writeFileSync("REVIEW.md", md);
console.log(`Review metadata updated for ${pkg.version}; runtime truth is established by tests, not matching source snippets.`);
