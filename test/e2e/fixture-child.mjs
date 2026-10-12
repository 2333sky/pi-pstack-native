const [mode, ...rest] = process.argv.slice(2);

if (mode === "ship") {
  const [port, checkout, home, repoId, repo, number, token, crash] = rest;
  process.env.PSTACK_NATIVE_HOME = home;
  const { ship } = await import("../../src/delivery/frontier.ts");
  const { githubClient } = await import("./harness.ts");
  const spec = { id: `e2e-ship-${number}`, repoId, repo, numbers: [Number(number)], owner: "e2e-operator" };
  try {
    const result = await ship(spec, githubClient(Number(port), crash, repo), { token, dryRun: false });
    process.stdout.write(`SHIPPED ${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(`SHIP-FAILED ${error.message}\n`);
    process.exitCode = 1;
  }
} else if (mode === "workflow") {
  const [port, home, agentDir, checkout, sessionDir] = rest;
  process.env.PSTACK_NATIVE_HOME = home;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const { AgentHost } = await import("../../src/agent/host.ts");
  const { WorkflowEngine } = await import("../../src/workflow/engine.ts");
  const { openParentContext, strictWorkflowSpec, SIGKILL_SESSION_ID } = await import("./parent-context.ts");
  const parent = await openParentContext({ agentDir, cwd: checkout, sessionDir, modelPort: Number(port), sessionId: SIGKILL_SESSION_ID });
  const engine = new WorkflowEngine(new AgentHost());
  const record = engine.create(strictWorkflowSpec(checkout, parent.ctx.sessionManager.getSessionId()));
  process.stdout.write(`WORKFLOW ${record.id}\n`);
  const finished = await engine.run(record.id, parent.ctx);
  process.stdout.write(`COMPLETED ${finished.state}\n`);
  parent.dispose();
} else {
  process.stderr.write(`unknown fixture child mode: ${mode}\n`);
  process.exit(2);
}
