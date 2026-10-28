import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer, request, type Server } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const OFFLINE = "[offline]";
export const FAKE_PROVIDER = "[fake-provider]";
export const LIVE = "[live]";
export const MODEL = "loopback-model";

export function listen(server: Server): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolvePort((server.address() as { port: number }).port); });
  });
}

export function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

export function post(port: number, path: string, body: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolvePost, reject) => {
    const payload = JSON.stringify(body ?? {});
    const req = request({ host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        try { resolvePost({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : {} }); }
        catch { reject(new Error(`Non-JSON response from ${path}: ${text.slice(0, 200)}`)); }
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}

export function readBody(source: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let text = "";
    source.on("data", (chunk) => { text += chunk; });
    source.on("end", () => resolveBody(text));
    source.on("error", reject);
  });
}

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim();
}

export function initFixtureRepo(dir: string, remote: string, files: Record<string, string> = { "base.txt": "base\n" }): string {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  git(dir, ["config", "user.email", "e2e@example.invalid"]);
  git(dir, ["config", "user.name", "e2e fixture"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  git(dir, ["config", "core.hooksPath", join(dir, ".git", "hooks-disabled")]);
  for (const [path, content] of Object.entries(files)) writeFileSync(join(dir, path), content);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "fixture"]);
  git(dir, ["remote", "add", "origin", remote]);
  return git(dir, ["rev-parse", "HEAD"]);
}

export function writeModelConfig(agentDir: string, port: number, modelIds: string[] = [MODEL]): void {
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "models.json"), JSON.stringify({
    providers: {
      loopback: {
        baseUrl: `http://127.0.0.1:${port}/v1`,
        api: "openai-completions",
        apiKey: "loopback-token-not-a-secret",
        models: modelIds.map(id => ({ id, name: id, reasoning: false, contextWindow: 16_384, maxTokens: 1_024, input: ["text"] })),
      },
    },
  }));
}

export function writeVerificationPolicy(home: string, commands: string[][]): void {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "verification-policy.json"), JSON.stringify({ commands }));
}

export interface ModelStep { tool?: { name: string; args: unknown }; text?: string; hold?: boolean }
export interface ModelCall { node: string; step: number; model: string; tools: string[]; messages: any[] }
export interface ModelServer { port: number; calls: ModelCall[]; close(): Promise<void> }

function messageText(message: any): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part?.text === "string" ? part.text : "").join("");
  return "";
}

export function taskMarker(text: string): string {
  return text.match(/TASK:([a-z0-9-]+)/i)?.[1] ?? "unknown";
}

export function toolResultText(messages: any[]): string {
  return messages.filter((message) => message?.role === "tool").map(messageText).join("\n");
}

export async function startModelServer(script: (call: ModelCall) => ModelStep): Promise<ModelServer> {
  const calls: ModelCall[] = [];
  const server = createServer(async (req, res) => {
    const body = JSON.parse(await readBody(req));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userMessages = messages.filter((message) => message.role === "user");
    const node = taskMarker(userMessages.length ? messageText(userMessages.at(-1)) : "");
    const step = messages.filter((message) => message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length).length;
    const call: ModelCall = { node, step, model: body.model, tools: (body.tools ?? []).map((tool: any) => tool.function?.name), messages };
    calls.push(call);
    const next = script(call);
    if (next.hold) return;
    const chunk = (delta: unknown, finish: string | null = null) => ({ id: "chatcmpl-e2e", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] });
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    if (next.tool) {
      const args = JSON.stringify(next.tool.args ?? {});
      res.write(`data: ${JSON.stringify(chunk({ role: "assistant", content: "" }))}\n\n`);
      res.write(`data: ${JSON.stringify(chunk({ tool_calls: [{ index: 0, id: `call_${node}_${step}`, type: "function", function: { name: next.tool.name, arguments: args } }] }))}\n\n`);
      res.end(`data: ${JSON.stringify(chunk({}, "tool_calls"))}\n\ndata: [DONE]\n\n`);
      return;
    }
    const text = next.text ?? "";
    res.write(`data: ${JSON.stringify(chunk({ role: "assistant", content: "" }))}\n\n`);
    if (text) res.write(`data: ${JSON.stringify(chunk({ content: text }))}\n\n`);
    res.end(`data: ${JSON.stringify(chunk({}, "stop"))}\n\ndata: [DONE]\n\n`);
  });
  const port = await listen(server);
  return { port, calls, close: () => closeServer(server) };
}

export interface GitHubView {
  reviewThreads?: {status:"checked";total:number;unresolved:number;bugbotUnresolved:number};
  number: number; headSha: string; baseSha: string; baseRef: string; state: "OPEN" | "MERGED" | "CLOSED"; draft: boolean; mergeState: string;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN"; ci: "passed" | "failed" | "pending" | "unknown";
  review: "approved" | "changes-requested" | "pending";
}

export interface GitHubCall { op: "read" | "merge" | "branch" | "open"; detail: string }

export interface GitHubServer {
  port: number; views: Map<number, GitHubView>; branches: Map<string, string>; calls: GitHubCall[];
  close(): Promise<void>;
}

export async function startGitHubServer(checks: "passed" | "failed" | "pending" | "unknown", review: GitHubView["review"]): Promise<GitHubServer> {
  const views = new Map<number, GitHubView>();
  const branches = new Map<string, string>();
  const calls: GitHubCall[] = [];
  const server = createServer(async (req, res) => {
    const body = req.method === "POST" ? JSON.parse(await readBody(req) || "{}") : {};
    const reply = (status: number, value: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
    const path = req.url ?? "";
    if (path === "/read") {
      calls.push({ op: "read", detail: String(body.number) });
      const view = views.get(Number(body.number));
      return view ? reply(200, {...view,reviewThreads:view.reviewThreads ?? {status:"checked",total:0,unresolved:0,bugbotUnresolved:0}}) : reply(404, { error: "unknown pull request" });
    }
    if (path === "/merge") {
      const view = views.get(Number(body.number));
      if (!view) { calls.push({ op: "merge", detail: "missing" }); return reply(404, { error: "unknown pull request" }); }
      if (view.headSha !== body.headSha) { calls.push({ op: "merge", detail: "head-moved" }); return reply(409, { error: "HEAD_MOVED" }); }
      calls.push({ op: "merge", detail: `${view.number}@${view.headSha.slice(0, 7)}` });
      view.state = "MERGED";
      return reply(200, view);
    }
    if (path === "/branch") {
      calls.push({ op: "branch", detail: String(body.branch) });
      const sha = branches.get(String(body.branch));
      return sha ? reply(200, { sha }) : reply(404, { error: "unknown branch" });
    }
    if (path === "/open") {
      const head = branches.get(String(body.head));
      const base = branches.get(String(body.base));
      if (!head || !base) { calls.push({ op: "open", detail: "unknown-ref" }); return reply(422, { error: "unknown ref" }); }
      const number = views.size + 1;
      views.set(number, { number, headSha: head, baseSha: base, baseRef: String(body.base), state: "OPEN", draft: false, mergeState: "CLEAN", mergeable: "MERGEABLE", ci: checks, review });
      calls.push({ op: "open", detail: `${number} ${body.base}<-${body.head}` });
      return reply(201, { number, url: `https://github.com/loopback-owner/lemn-disposable/pull/${number}` });
    }
    return reply(404, { error: "unsupported route" });
  });
  const port = await listen(server);
  const github: GitHubServer = {
    port, views, branches, calls,
    close: () => closeServer(server),
  };
  return github;
}

export interface MergeCrash { mode: "normal" | "crash-before" | "crash-after" }

export function githubClient(port: number, crash: MergeCrash["mode"] = "normal", repo = "loopback-owner/lemn-disposable") {
  const view = (value: any): GitHubView => ({ number: value.number, headSha: value.headSha, baseSha: value.baseSha, baseRef: value.baseRef, state: value.state, draft: value.draft, mergeState: value.mergeState, mergeable: value.mergeable, ci: value.ci, review: value.review, reviewThreads:value.reviewThreads });
  return {
    async read(target: string, number: number) {
      const { status, json } = await post(port, "/read", { repo: target, number });
      if (status !== 200) throw new Error(`read ${number} failed: ${status}`);
      return { ...view(json), repo: target };
    },
    async merge(pr: any) {
      if (crash === "crash-before") process.kill(process.pid, "SIGKILL");
      const { status, json } = await post(port, "/merge", { number: pr.number, headSha: pr.headSha });
      if (crash === "crash-after") process.kill(process.pid, "SIGKILL");
      if (status !== 200) throw new Error(json.error ?? `merge failed: ${status}`);
    },
    async branchHead(target: string, branch: string) {
      const { status, json } = await post(port, "/branch", { repo: target, branch });
      if (status !== 200) throw new Error(`branchHead ${branch} failed: ${status}`);
      if (json.sha) return String(json.sha);
      throw new Error("REMOTE_BRANCH_UNCERTAIN");
    },
    async open(target: string, base: string, head: string, title: string, bodyFile: string) {
      const { status, json } = await post(port, "/open", { repo: target, base, head, title, bodyFile });
      if (status !== 201) throw new Error(json.error ?? `open failed: ${status}`);
      return `https://github.com/${repo}/pull/${json.number}`;
    },
  };
}

export function reportText(base: string, head: string, commandsRun: string[][] = []): string {
  return `\`\`\`json\n${JSON.stringify({ status: "completed", artifactRefs: [], base, head, commandsRun, evidenceRefs: [], deviations: [], unresolved: [], nextActions: [] })}\n\`\`\``;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export async function waitFor(predicate: () => boolean, label: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await sleep(20);
  }
}

export interface ChildHandle {
  child: ChildProcess;
  stdout: string[];
  stderr: string[];
  exit: Promise<{ code: number | null; signal: string | null }>;
  waitForLine(prefix: string, timeoutMs?: number): Promise<string>;
}

export function cleanEnv(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;
  return env;
}

export function spawnChild(script: string, args: string[], env: Record<string, string | undefined>): ChildHandle {
  const child = spawn(process.execPath, ["--experimental-strip-types", script, ...args], { cwd: process.cwd(), env: cleanEnv(env), stdio: ["ignore", "pipe", "pipe"] });
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  child.stdout!.on("data", (chunk: string) => { stdout.push(...chunk.split("\n").filter(Boolean)); });
  child.stderr!.on("data", (chunk: string) => { stderr.push(...chunk.split("\n").filter(Boolean)); });
  const exit = new Promise<{ code: number | null; signal: string | null }>((resolveExit) => {
    child.on("exit", (code, signal) => resolveExit({ code, signal }));
  });
  const waitForLine = async (prefix: string, timeoutMs = 60_000): Promise<string> => {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const line = stdout.find((entry) => entry.startsWith(prefix));
      if (line) return line;
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${prefix}. stdout=${stdout.join(" | ")} stderr=${stderr.join(" | ")}`);
      await sleep(25);
    }
  };
  return { child, stdout, stderr, exit, waitForLine };
}

export function redactCaptured(text: string): string {
  return text
    .replace(/(gh[pousr]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|sk-[A-Za-z0-9-]{8,})/g, "[REDACTED]")
    .replace(/https?:\/\/[^/@\s]+@/g, "https://[REDACTED]@")
    .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,"'}]+/gi, "$1[REDACTED]");
}
