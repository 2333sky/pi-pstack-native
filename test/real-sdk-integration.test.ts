import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { AgentHost } from "../src/agent/host.ts";
import { resolveRoleModel } from "../src/models/router.ts";

function listen(server: Server): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePort((server.address() as { port: number }).port);
    });
  });
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("real Pi AgentSession loads pstack tools, routes models, and exercises child success, failure, cancellation, and recovery", { timeout: 20_000 }, async () => {
  const root = mkdtempSync(join(process.cwd(), ".real-sdk-integration-"));
  const agentDir = join(root, "pi-agent");
  const pstackHome = join(root, "pstack-native");
  const cwd = join(root, "checkout");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(pstackHome, { recursive: true });
  mkdirSync(cwd, { recursive: true });

  const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
  const oldPstackHome = process.env.PSTACK_NATIVE_HOME;
  let mode: "hold" | "fail" | "success" = "hold";
  let holdRequestSeen = false;
  let failureRequestSeen = false;
  let successRequestSeen = false;
  let server: Server | undefined;
  const childRequests:any[]=[];
  let parentSession: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  const host = new AgentHost();

  try {
    const testServer = createServer((request, response) => {
      let requestBody="";request.on("data",chunk=>{requestBody+=chunk;});request.on("end",()=>{try{childRequests.push(JSON.parse(requestBody));}catch{}});
      request.resume();
      if (mode === "hold") {
        holdRequestSeen = true;
        // Keep the provider response open until AgentSession.abort() cancels the request.
        return;
      }
      if (mode === "fail") {
        failureRequestSeen = true;
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "integration injected provider failure" } }));
        return;
      }
      successRequestSeen = true;
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const id = "chatcmpl-pstack-integration";
      response.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 1, model: "stalled-test-model", choices: [{ index: 0, delta: { role: "assistant", content: "real Pi SDK local-protocol success" }, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 1, model: "stalled-test-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
      response.end("data: [DONE]\n\n");
    });
    server = testServer;
    const port = await listen(testServer);
    writeFileSync(join(agentDir, "models.json"), JSON.stringify({
      providers: {
        "pstack-integration": {
          baseUrl: `http://127.0.0.1:${port}/v1`,
          api: "openai-completions",
          apiKey: "local-test-only",
          models: [{ id: "stalled-test-model", name: "stalled-test-model", reasoning: false, contextWindow: 4096, maxTokens: 128, input: ["text"] }],
        },
      },
    }));
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.PSTACK_NATIVE_HOME = pstackHome;

    const extensionPath = resolve("src/extension.ts");
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      noExtensions: true,
      additionalExtensionPaths: [extensionPath],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    await resourceLoader.reload();
    const { session, extensionsResult } = await createAgentSession({
      cwd,
      agentDir,
      model: undefined,
      thinkingLevel: "off",
      sessionManager: SessionManager.inMemory(),
      resourceLoader,
      noTools: "builtin",
    });
    parentSession = session;

    assert.equal(extensionsResult.errors.length, 0, "Pi must load the actual extension without diagnostics");
    assert.equal(extensionsResult.extensions.some((extension) => extension.path === extensionPath), true);
    const registeredTools = session.getAllTools().map((tool) => tool.name);
    for (const name of ["pstack_agents", "pstack_workflow", "pstack_graph", "pstack_worktrees", "pstack_verify", "pstack_delivery", "pstack_context", "pstack_program"]) {
      assert.ok(registeredTools.includes(name), `Pi AgentSession registered ${name}`);
      assert.ok(session.getActiveToolNames().includes(name), `Pi AgentSession activated ${name}`);
    }
    assert.equal(session.isStreaming, false);
    await session.abort();
    assert.equal(session.isStreaming, false, "idle AgentSession abort is safe");

    const model = session.modelRuntime.getModel("pstack-integration", "stalled-test-model");
    assert.ok(model, "real Pi ModelRuntime loads the isolated compatible test model");
    const modelRegistry = new ModelRegistry(session.modelRuntime);
    const ctx = {
      sessionManager: session.sessionManager,
      modelRegistry,
      model,
      thinkingLevel: "off" as const,
      scopedModels: [],
    };
    const selector = `${model.provider}/${model.id}`;
    const explicit = resolveRoleModel(ctx as never, "worker", selector);
    const inherited = resolveRoleModel(ctx as never, "worker");
    assert.equal(explicit.model?.provider, model.provider);
    assert.equal(explicit.model?.id, model.id);
    assert.equal(inherited.model, model, "default role routing inherits the actual Pi parent model");
    assert.throws(() => resolveRoleModel(ctx as never, "worker", "missing-provider/missing-model"), /not available/);

    const cancelId = "ag_real_sdk_cancel";
    const cancelRun = host.run({ id: cancelId, profile: "reviewer", task: "Wait for the provider request to be cancelled.", cwd, isolation: "readonly" }, ctx as never);
    await waitFor(() => holdRequestSeen, "Pi child request at local test provider");
    const running = host.get(cancelId);
    assert.equal(running?.state, "running");
    assert.ok(running?.sessionFile && existsSync(running.sessionFile), "the child Pi session is persisted on the real filesystem");
    const stopped = await host.stop(cancelId);
    const settled = await cancelRun;
    assert.equal(stopped.state, "cancelled");
    assert.equal(settled.state, "cancelled", "an in-flight AgentSession abort settles the pstack agent as cancelled");

    mode = "fail";
    const failureId = "ag_real_sdk_failure";
    const failed = await host.run({ id: failureId, profile: "reviewer", task: "Exercise the injected provider failure.", cwd, isolation: "readonly" }, ctx as never);
    assert.equal(failureRequestSeen, true);
    assert.equal(failed.state, "failed");
    assert.match(failed.error?.message ?? "", /integration injected provider failure/);
    assert.equal(host.get(failureId)?.state, "failed");

    // A second real AgentSession run after the injected provider exception proves
    // AgentHost released its per-run state and can complete another turn.
    mode = "success";
    const recovered = await host.run({ id: "ag_real_sdk_recovery", profile: "reviewer", task: "Return the successful integration response.", cwd, isolation: "readonly" }, ctx as never);
    assert.equal(successRequestSeen, true);
    assert.equal(recovered.state, "completed");
    assert.match(recovered.result ?? "", /real Pi SDK local-protocol success/);
    assert.equal(host.get("ag_real_sdk_recovery")?.state, "completed");
    const names=childRequests.at(-1)?.tools?.map((t:any)=>t.function?.name) ?? [];
    for(const name of ["read","ls","find","grep","pstack_skill","pstack_evidence"])assert.ok(names.includes(name),`readonly SDK exposes ${name}`);
    for(const name of ["bash","edit","write"])assert.ok(!names.includes(name),`readonly SDK excludes ${name}`);
  } finally {
    parentSession?.dispose();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
    }
    if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
    if (oldPstackHome === undefined) delete process.env.PSTACK_NATIVE_HOME;
    else process.env.PSTACK_NATIVE_HOME = oldPstackHome;
    rmSync(root, { recursive: true, force: true });
  }
});
