/** Optional installed-SDK smoke test; requires a configured model/provider for actual inference. */
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(), tools: [], customTools: [],
});
try {
  if (!Array.isArray(session.messages)) throw new Error("Pi AgentSession.messages contract changed");
  if (typeof session.prompt !== "function" || typeof session.abort !== "function") throw new Error("Pi AgentSession lifecycle contract changed");
  console.log("Pi SDK session creation contract: PASS (no provider inference performed)");
} finally { session.dispose(); }
