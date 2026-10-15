import { upstreamVersion } from "./runtime/upstream.js";
import { registerProtocolTools } from "./tools/protocol.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentHost } from "./agent/host.js";
import { LoopScheduler } from "./loop/scheduler.js";
import { formatInterval, parseInterval } from "./loop/store.js";
import { availableModelSelectors } from "./models/router.js";
import { loadConfig, loadModels, saveConfig, saveModels } from "./runtime/config.js";
import { ensureHome } from "./runtime/store.js";
import { registerAgentTool } from "./tools/agents.js";
import { registerGraphTool } from "./tools/graph.js";
import { registerWorkflowTool } from "./tools/workflow.js";
import { registerWorktreeTool } from "./tools/worktrees.js";
import { WorkflowEngine } from "./workflow/engine.js";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = join(ROOT, "skills");
const VERSION = "0.6.0-preview.1";
const PSTACK_VERSION = upstreamVersion();
const POTETO_RE = /(?<![a-z0-9._%+-])\$poteto-mode(?![a-z0-9_-]|\.[a-z0-9])/i;
function readJsonFile(name, fallback) {
    try {
        return JSON.parse(readFileSync(join(ROOT, name), "utf8"));
    }
    catch {
        return fallback;
    }
}
function lastMode(ctx) {
    const manager = ctx.sessionManager;
    const entries = manager.getBranch?.() ?? manager.getEntries?.() ?? [];
    let enabled = false;
    for (const entry of entries)
        if (entry.type === "custom" && entry.customType === "pstack-mode")
            enabled = Boolean(entry.data?.enabled);
    return enabled;
}
function workflowSummary(record) {
    if (!record)
        return "not found";
    const counts = new Map();
    for (const call of Object.values(record.calls))
        counts.set(call.state, (counts.get(call.state) ?? 0) + 1);
    return `${record.id} ${record.name ?? record.type}: ${record.state}\n${[...counts].map(([state, n]) => `${state}=${n}`).join(" · ")}`;
}
function agentSummary(agents, sessionId) {
    const rows = agents.list().filter((a) => a.parentSessionId === sessionId).slice(0, 30);
    if (!rows.length)
        return "No pstack-native agents yet.";
    return rows.map((a) => `${a.id} ${a.profile} ${a.state}${a.model ? ` ${a.model}` : ""}${a.worktree ? `\n  ${a.worktree}` : ""}`).join("\n");
}
export default function piPstackNative(pi) {
    ensureHome();
    const agents = new AgentHost();
    let currentCtx;
    let potetoMode = false;
    const workflows = new WorkflowEngine(agents, (record) => {
        if (!currentCtx || record.parentSessionId !== currentCtx.sessionManager.getSessionId())
            return;
        pi.sendMessage({
            customType: "pstack-workflow-result",
            display: true,
            content: `Pstack workflow ${record.id} ${record.state}.\n${workflowSummary(record)}`,
            details: { id: record.id, state: record.state },
        }, currentCtx.isIdle() ? { triggerTurn: true } : { triggerTurn: true, deliverAs: "followUp" });
    });
    const loops = new LoopScheduler(pi);
    registerAgentTool(pi, agents);
    registerWorkflowTool(pi, workflows);
    registerProtocolTools(pi, workflows);
    registerGraphTool(pi, workflows);
    registerWorktreeTool(pi, agents);
    pi.on("resources_discover", () => loadConfig().skillsEnabled ? { skillPaths: [SKILLS] } : { skillPaths: [] });
    pi.on("session_start", (_event, ctx) => {
        currentCtx = ctx;
        potetoMode = lastMode(ctx);
        loops.bind(ctx);
        const recovered = workflows.recoverSession(ctx.sessionManager.getSessionId(), ctx);
        if (ctx.mode === "tui") {
            ctx.ui.setStatus("pstack-native", potetoMode ? "pstack: poteto" : undefined);
            if (recovered.length)
                ctx.ui.notify(`Resuming ${recovered.length} pstack workflow${recovered.length === 1 ? "" : "s"}.`, "info");
        }
    });
    pi.on("session_shutdown", () => {
        loops.close();
        currentCtx = undefined;
    });
    pi.on("input", (event, ctx) => {
        if (event.source !== "extension" && (/^\/skill:poteto-mode(?:\s|$)/i.test(event.text) || POTETO_RE.test(event.text))) {
            potetoMode = true;
            pi.appendEntry("pstack-mode", { enabled: true });
            if (ctx.mode === "tui")
                ctx.ui.setStatus("pstack-native", "pstack: poteto");
        }
        return { action: "continue" };
    });
    pi.on("before_agent_start", (event) => {
        const contract = [
            "pi-pstack-native runtime contract:",
            "- Prefer pstack_workflow for multi-agent dependency graphs and pstack_agents for one bounded child.",
            "- One writer may use the target checkout. Independent parallel writers use worktrees; multi-writer delivery converges through an integrator. Reviewers are read-only; verifiers follow the directly dependent artifact.",
            "- Workflow state is durable. Do not manually repeat a completed call after resume.",
            "- Treat Cursor Task/cloud-agent/Custom-Mode/loop wording in upstream-derived skills as semantics; use the Pi-native tools and commands instead.",
            "- One simple writer may work in the target checkout. Independent parallel writers use worktrees. If several writer outputs form one deliverable, converge them through an integrator node before final verification.",
            potetoMode ? "- Poteto Mode is sticky for this session. Route non-trivial work through the matching pstack playbook and verify before declaring done." : "",
        ].filter(Boolean).join("\n");
        return { systemPrompt: `${event.systemPrompt}\n\n${contract}` };
    });
    pi.registerCommand("poteto-mode", {
        description: "Enable sticky Poteto Mode or run one Poteto task. Usage: /poteto-mode [task|off]",
        handler: async (args, ctx) => {
            const raw = args.trim();
            if (/^(off|disable|stop)$/i.test(raw)) {
                potetoMode = false;
                pi.appendEntry("pstack-mode", { enabled: false });
                ctx.ui.setStatus("pstack-native", undefined);
                ctx.ui.notify("Poteto Mode off.", "info");
                return;
            }
            potetoMode = true;
            pi.appendEntry("pstack-mode", { enabled: true });
            ctx.ui.setStatus("pstack-native", "pstack: poteto");
            ctx.ui.notify("Poteto Mode on. It stays on in this session until /poteto-mode off.", "info");
            if (raw)
                pi.sendUserMessage(`/skill:poteto-mode ${raw}`, ctx.isIdle() ? { expandPromptTemplates: true } : { expandPromptTemplates: true, deliverAs: "followUp" });
        },
    });
    pi.registerCommand("setup-pstack", {
        description: "Map pstack roles to models available in this Pi session.",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI) {
                ctx.ui.notify("/setup-pstack requires an interactive UI.", "error");
                return;
            }
            const available = availableModelSelectors(ctx);
            const choices = ["inherit-parent", "auto", ...available];
            const config = loadModels();
            const roles = ["worker", "architect", "reviewer", "scout", "verifier", "synthesizer", "integrator", "poteto-agent", "comment-sicko"];
            const thinkingChoices = ["inherit-parent", "off", "minimal", "low", "medium", "high", "xhigh", "max"];
            const thinkingLevel = await ctx.ui.select(`child reasoning level (current: ${config.thinkingLevel})`, thinkingChoices);
            if (thinkingLevel === undefined) {
                ctx.ui.notify("Setup cancelled; nothing was written.", "info");
                return;
            }
            const next = { version: 1, roles: { ...config.roles }, thinkingLevel: thinkingLevel };
            for (const role of roles) {
                const current = next.roles[role] ?? "inherit-parent";
                const selected = await ctx.ui.select(`${role} model (current: ${current})`, choices);
                if (selected === undefined) {
                    ctx.ui.notify("Setup cancelled; nothing was written.", "info");
                    return;
                }
                next.roles[role] = selected;
            }
            saveModels(next);
            ctx.ui.notify("Saved pstack-native model roles to ~/.pi/agent/pstack-native/models.json.", "info");
        },
    });
    pi.registerCommand("pstack", {
        description: "Show or toggle pstack skill discovery. Usage: /pstack [status|on|off]",
        handler: async (args, ctx) => {
            const token = args.trim().toLowerCase() || "status";
            const cfg = loadConfig();
            if (token === "status") {
                ctx.ui.notify(`pstack skills ${cfg.skillsEnabled ? "on" : "off"}; Poteto Mode ${potetoMode ? "on" : "off"}.`, "info");
                return;
            }
            if (!["on", "off"].includes(token)) {
                ctx.ui.notify("Usage: /pstack [status|on|off]", "error");
                return;
            }
            const enabled = token === "on";
            saveConfig({ ...cfg, skillsEnabled: enabled });
            ctx.ui.notify(`pstack skills ${enabled ? "on" : "off"}. Reloading resources.`, "info");
            await ctx.reload();
        },
    });
    pi.registerCommand("pstack-runtime", {
        description: "Show pi-pstack-native runtime and dependency status.",
        handler: async (_args, ctx) => {
            const upstream = readJsonFile("UPSTREAM.json", {});
            ctx.ui.notify([
                `pi-pstack-native ${VERSION} (npm: 2333)`,
                `upstream pstack ${upstream.version ?? PSTACK_VERSION}${upstream.commit ? ` @ ${upstream.commit.slice(0, 12)}` : ""}`,
                "agent runtime: native Pi AgentSession",
                "workflow runtime: native persistent DAG + Pi child sessions",
                "scheduler: native session scheduler",
                "third-party runtime dependencies: none",
            ].join("\n"), "info");
        },
    });
    pi.registerCommand("pstack-upstream", {
        description: "Show the pinned upstream pstack revision.",
        handler: async (_args, ctx) => ctx.ui.notify(JSON.stringify(readJsonFile("UPSTREAM.json", {}), null, 2), "info"),
    });
    pi.registerCommand("pstack-parity", {
        description: "Show pstack semantic parity summary.",
        handler: async (_args, ctx) => {
            const parity = readJsonFile("PARITY.json", {});
            const skills = parity.skills ? Object.values(parity.skills) : [];
            const playbooks = parity.playbooks ? Object.values(parity.playbooks) : [];
            const pending = [...skills, ...playbooks].filter((v) => v === "PENDING_PORT").length;
            ctx.ui.notify(`pstack ${parity.upstream ?? PSTACK_VERSION} semantic parity\nskills: ${skills.length}\nplaybooks: ${playbooks.length}\npending in listed scope: ${pending}\ncursor-only: ${(parity.cursorOnly ?? []).join(", ") || "none"}\nfile-level auxiliary audit: ${parity.coverage?.fileLevelAudit ?? "not-claimed"}`, pending ? "warning" : "info");
        },
    });
    pi.registerCommand("pstack-workflows", {
        description: "Inspect/control native workflows. Usage: /pstack-workflows [list|status <id>|pause <id>|resume <id>|cancel <id>|retry <id> <key>]",
        handler: async (args, ctx) => {
            const raw = args.trim();
            const sessionId = ctx.sessionManager.getSessionId();
            if (!raw || raw === "list") {
                const records = workflows.list(sessionId);
                ctx.ui.notify(records.length ? records.slice(0, 30).map((record) => workflowSummary(record)).join("\n\n") : "No pstack workflows in this session.", "info");
                return;
            }
            const parts = raw.split(/\s+/);
            const op = parts[0];
            const id = parts[1];
            if (!id) {
                ctx.ui.notify("Workflow id required.", "error");
                return;
            }
            const owned = workflows.get(id);
            if (!owned || owned.parentSessionId !== sessionId) {
                ctx.ui.notify(`Unknown workflow ${id} in this session.`, "error");
                return;
            }
            try {
                if (op === "status") {
                    ctx.ui.notify(workflowSummary(owned), "info");
                    return;
                }
                if (op === "pause") {
                    ctx.ui.notify(workflowSummary(workflows.pause(id)), "info");
                    return;
                }
                if (op === "resume") {
                    ctx.ui.notify(workflowSummary(workflows.resume(id, ctx)), "info");
                    return;
                }
                if (op === "cancel") {
                    ctx.ui.notify(workflowSummary(await workflows.cancel(id)), "info");
                    return;
                }
                if (op === "retry") {
                    const key = parts[2];
                    if (!key) {
                        ctx.ui.notify("retry requires a call key.", "error");
                        return;
                    }
                    const next = workflows.retry(id, key);
                    workflows.start(id, ctx);
                    ctx.ui.notify(workflowSummary(next), "info");
                    return;
                }
                ctx.ui.notify("Usage: /pstack-workflows [list|status <id>|pause <id>|resume <id>|cancel <id>|retry <id> <key>]", "error");
            }
            catch (error) {
                ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
            }
        },
    });
    pi.registerCommand("pstack-agents", {
        description: "List recent native pstack child agents.",
        handler: async (_args, ctx) => ctx.ui.notify(agentSummary(agents, ctx.sessionManager.getSessionId()), "info"),
    });
    pi.registerCommand("pstack-worktrees", {
        description: "List or safely clean pstack-owned worktrees. Usage: /pstack-worktrees [list|cleanup <agent-id>]",
        handler: async (args, ctx) => {
            const raw = args.trim();
            if (!raw || raw === "list") {
                const rows = agents.list().filter((a) => a.worktree && a.parentSessionId === ctx.sessionManager.getSessionId());
                ctx.ui.notify(rows.length ? rows.map((a) => `${a.id} ${a.state} ${a.branch ?? ""}\n  ${a.worktree}`).join("\n") : "No owned pstack worktrees.", "info");
                return;
            }
            const match = /^cleanup\s+(\S+)$/.exec(raw);
            if (!match) {
                ctx.ui.notify("Usage: /pstack-worktrees [list|cleanup <agent-id>]", "error");
                return;
            }
            try {
                const owned = agents.get(match[1]);
                if (!owned || owned.parentSessionId !== ctx.sessionManager.getSessionId())
                    throw new Error("Unknown agent in this session.");
                await agents.cleanupWorktree(match[1]);
                ctx.ui.notify(`Cleaned worktree owned by ${match[1]}.`, "info");
            }
            catch (error) {
                ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
            }
        },
    });
    pi.registerCommand("pstack-loop", {
        description: "Persistent session scheduler. Usage: /pstack-loop 1h <task> | list | status <id> | run <id> | pause <id> | resume <id> | stop <id>",
        handler: async (args, ctx) => {
            const raw = args.trim();
            const sessionId = ctx.sessionManager.getSessionId();
            if (!raw || raw === "list") {
                const items = loops.list(sessionId);
                ctx.ui.notify(items.length ? items.map((x) => `${x.id} ${x.enabled ? "on" : "paused"} every ${formatInterval(x.intervalMs)} next=${x.nextRunAt}\n  ${x.task}`).join("\n") : "No loops in this session.", "info");
                return;
            }
            const [op, id] = raw.split(/\s+/, 3);
            if (["status", "run", "pause", "resume", "stop"].includes(op)) {
                if (!id) {
                    ctx.ui.notify(`${op} requires a loop id.`, "error");
                    return;
                }
                if (op === "status") {
                    const item = loops.get(sessionId, id);
                    ctx.ui.notify(item ? JSON.stringify(item, null, 2) : `Unknown loop ${id}.`, item ? "info" : "error");
                    return;
                }
                if (op === "run") {
                    ctx.ui.notify(`Triggered ${loops.runNow(sessionId, id).id}.`, "info");
                    return;
                }
                if (op === "pause") {
                    ctx.ui.notify(`Paused ${loops.setEnabled(sessionId, id, false).id}.`, "info");
                    return;
                }
                if (op === "resume") {
                    ctx.ui.notify(`Resumed ${loops.setEnabled(sessionId, id, true).id}.`, "info");
                    return;
                }
                ctx.ui.notify(loops.remove(sessionId, id) ? `Stopped ${id}.` : `Unknown loop ${id}.`, "info");
                return;
            }
            const match = /^(\S+)\s+([\s\S]+)$/.exec(raw);
            const interval = match ? parseInterval(match[1]) : undefined;
            if (!match || interval === undefined) {
                ctx.ui.notify("Usage: /pstack-loop 20m|1h|1d <task> (minimum 1m, maximum 7d)", "error");
                return;
            }
            const loop = loops.create(sessionId, interval, match[2]);
            ctx.ui.notify(`Created ${loop.id}: every ${formatInterval(loop.intervalMs)}; next ${loop.nextRunAt}.`, "info");
        },
    });
}
