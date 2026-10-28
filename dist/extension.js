import { registerSemanticTool } from "./compatibility/tool.js";
import { createResourceTools } from "./agent/resources.js";
import { upstreamVersion } from "./runtime/upstream.js";
import { registerProtocolTools } from "./tools/protocol.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentHost } from "./agent/host.js";
import { LoopScheduler } from "./loop/scheduler.js";
import { formatInterval, parseInterval } from "./loop/store.js";
import { availableModelSelectors, lowerSupportedThinking, resolveModelSelector, supportsThinking } from "./models/router.js";
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
    return rows.map((a) => `${a.id} ${a.profile} ${a.state}${a.model ? ` ${a.model}` : ""}${a.modelSelection?.notes.length ? `\n  ${a.modelSelection.notes.join(' ')}` : ''}${a.worktree ? `\n  ${a.worktree}` : ""}`).join("\n");
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
    registerSemanticTool(pi);
    pi.registerTool(createResourceTools(SKILLS)[0]);
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
            "- When delegating a named task, pass its playbook name to pstack_agents or pstack_workflow so configured task-specific role models apply. For arena, architect and interrogate use the configured panels and inspect the planned seats before dispatch.",
            "- Core pstack entrypoints retain the pinned upstream body. Read pi-adapter.md with pstack_skill for explicit overrides; resolve original references as upstream/skills/<skill>/... . No unavailable capability may silently count as completed. Use pstack_semantics to check model panels and round receipts; native ledger/Frontier gates still apply.",
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
            const choices = [
                { value: "inherit-parent", label: "inherit-parent — use the parent session's model" },
                { value: "auto", label: "auto — use the parent session's model" },
                ...available.map((value) => ({ value, label: `${value} — use this available model` })),
            ];
            let config;
            try {
                config = loadModels();
            }
            catch (error) {
                ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
                return;
            }
            const roles = {
                worker: "implementation", architect: "design and implementation", reviewer: "read-only review",
                scout: "read-only exploration", verifier: "read-only verification", synthesizer: "reconcile results",
                integrator: "combine work", "poteto-agent": "delegated Poteto task", "comment-sicko": "comment and workaround review",
            };
            const thinkingChoices = [
                { value: "inherit-parent", label: "inherit-parent — use the parent session's reasoning level" },
                { value: "max", label: "unlimited — max reasoning" },
                { value: "xhigh", label: "large — extra-high reasoning" },
                { value: "high", label: "medium budget — high reasoning" },
                { value: "medium", label: "small budget — medium reasoning" },
                { value: "off", label: "off — disable reasoning" },
                { value: "minimal", label: "minimal — least reasoning effort, if supported" },
                { value: "low", label: "low — lower reasoning effort, if supported" },
            ];
            const thinkingLabel = await ctx.ui.select(`child reasoning budget (current level: ${config.thinkingLevel})`, thinkingChoices.map((choice) => choice.label));
            if (thinkingLabel === undefined) {
                ctx.ui.notify("Setup cancelled; nothing was written.", "info");
                return;
            }
            const thinkingLevel = thinkingChoices.find((choice) => choice.label === thinkingLabel)?.value;
            if (!thinkingLevel) {
                ctx.ui.notify("Invalid reasoning selection; nothing was written.", "error");
                return;
            }
            const fallbackChoices = [
                { value: 'disabled', label: 'disabled — block unavailable models or unsupported reasoning' },
                { value: 'same-family', label: 'same-family — use a matching model from the same provider or lower supported reasoning and report it' },
            ];
            const orderedFallbackChoices = [...fallbackChoices].sort((a, b) => Number(b.value === config.fallbackPolicy) - Number(a.value === config.fallbackPolicy));
            const fallbackLabel = await ctx.ui.select(`model fallback policy (current: ${config.fallbackPolicy ?? 'disabled'})`, orderedFallbackChoices.map(choice => choice.label));
            if (fallbackLabel === undefined) {
                ctx.ui.notify("Setup cancelled; nothing was written.", "info");
                return;
            }
            const fallbackPolicy = fallbackChoices.find(choice => choice.label === fallbackLabel)?.value;
            if (!fallbackPolicy) {
                ctx.ui.notify("Invalid fallback selection; nothing was written.", "error");
                return;
            }
            const next = { ...config, roles: { ...config.roles }, panels: { ...config.panels }, thinkingLevel, fallbackPolicy };
            const validateChoice = (role, value) => {
                if (thinkingLevel === "inherit-parent")
                    return true;
                let model;
                try {
                    model = resolveModelSelector(ctx, role, value);
                }
                catch (error) {
                    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
                    return false;
                }
                if (!model) {
                    ctx.ui.notify(`No parent model available for ${role}; select an available model or cancel and choose inherit-parent reasoning.`, "error");
                    return false;
                }
                if (!supportsThinking(model, thinkingLevel)) {
                    const lower = fallbackPolicy === 'same-family' ? lowerSupportedThinking(model, thinkingLevel) : undefined;
                    if (lower) {
                        ctx.ui.notify(`${value} will use ${lower} reasoning for ${role} because ${thinkingLevel} is unavailable.`, 'info');
                        return true;
                    }
                    ctx.ui.notify(`${value} does not support ${thinkingLevel} reasoning for ${role}; choose another model or cancel and select another reasoning level.`, "error");
                    return false;
                }
                return true;
            };
            for (const [role, description] of Object.entries(roles)) {
                const current = next.roles[role] ?? "inherit-parent";
                for (;;) {
                    const selected = await ctx.ui.select(`${role} — ${description} (current: ${current})`, choices.map((choice) => choice.label));
                    if (selected === undefined) {
                        ctx.ui.notify("Setup cancelled; nothing was written.", "info");
                        return;
                    }
                    const value = choices.find((choice) => choice.label === selected)?.value;
                    if (!value) {
                        ctx.ui.notify("Invalid model selection; nothing was written.", "error");
                        return;
                    }
                    if (!validateChoice(role, value))
                        continue;
                    next.roles[role] = value;
                    break;
                }
            }
            const taskChoice = await ctx.ui.select("Task-specific model overrides", ["Keep current task models", "Configure task models"]);
            if (taskChoice === undefined) {
                ctx.ui.notify("Setup cancelled; nothing was written.", "info");
                return;
            }
            if (taskChoice === "Configure task models") {
                next.workflows = Object.fromEntries(Object.entries(config.workflows ?? {}).map(([key, values]) => [key, { ...values }]));
                const taskRoles = [
                    { names: ["feature", "refactoring"], profile: "worker", description: "feature and refactoring" },
                    { names: ["bug-fix"], profile: "worker", description: "bug-fix" },
                    { names: ["perf-issue"], profile: "worker", description: "performance issue" },
                    { names: ["hillclimb"], profile: "worker", description: "hillclimb" },
                    { names: ["how"], profile: "scout", description: "how explorer" },
                    { names: ["how"], profile: "synthesizer", description: "how explainer" },
                    { names: ["why"], profile: "scout", description: "why investigator" },
                    { names: ["why"], profile: "synthesizer", description: "why synthesizer" },
                    { names: ["swarm"], profile: "worker", description: "swarm worker" },
                ];
                for (const taskRole of taskRoles) {
                    const inherit = `Use ${taskRole.profile} role default`;
                    const current = next.workflows[taskRole.names[0]]?.[taskRole.profile] ?? inherit;
                    for (;;) {
                        const selected = await ctx.ui.select(`${taskRole.description} (current: ${current})`, [inherit, ...choices.map(choice => choice.label)]);
                        if (selected === undefined) {
                            ctx.ui.notify("Setup cancelled; nothing was written.", "info");
                            return;
                        }
                        const value = selected === inherit ? undefined : choices.find(choice => choice.label === selected)?.value;
                        if (selected !== inherit && !value) {
                            ctx.ui.notify("Invalid model selection; nothing was written.", "error");
                            return;
                        }
                        if (value && !validateChoice(taskRole.description, value))
                            continue;
                        for (const name of taskRole.names) {
                            const mapped = { ...next.workflows[name] };
                            if (value)
                                mapped[taskRole.profile] = value;
                            else
                                delete mapped[taskRole.profile];
                            if (Object.keys(mapped).length)
                                next.workflows[name] = mapped;
                            else
                                delete next.workflows[name];
                        }
                        break;
                    }
                }
            }
            else if (taskChoice !== "Keep current task models") {
                ctx.ui.notify("Invalid task model selection; nothing was written.", "error");
                return;
            }
            const panelRoles = [
                { name: "arena", description: "arena runners", min: 2 },
                { name: "arena-judges", description: "arena judge pool", min: 1 },
                { name: "architect", description: "architect runners", min: 2 },
                { name: "interrogate", description: "interrogate reviewers", min: 1 },
            ];
            for (const panel of panelRoles) {
                const current = next.panels[panel.name];
                const keep = current?.length ? "Keep current panel" : "Leave panel unconfigured";
                const edit = "Configure panel";
                const action = await ctx.ui.select(`${panel.description} (current: ${current?.join(", ") || "not configured"})`, [keep, edit]);
                if (action === undefined) {
                    ctx.ui.notify("Setup cancelled; nothing was written.", "info");
                    return;
                }
                if (action === keep)
                    continue;
                if (action !== edit) {
                    ctx.ui.notify("Invalid panel selection; nothing was written.", "error");
                    return;
                }
                const seats = [];
                for (;;) {
                    const done = "Finish panel";
                    const selected = await ctx.ui.select(`${panel.description}: seat ${seats.length + 1}; selected: ${seats.join(", ") || "none"}`, [done, ...choices.map((choice) => choice.label)]);
                    if (selected === undefined) {
                        ctx.ui.notify("Setup cancelled; nothing was written.", "info");
                        return;
                    }
                    if (selected === done) {
                        if (seats.length < panel.min) {
                            ctx.ui.notify(`${panel.description} requires at least ${panel.min} seat${panel.min === 1 ? "" : "s"}.`, "error");
                            continue;
                        }
                        break;
                    }
                    const value = choices.find((choice) => choice.label === selected)?.value;
                    if (!value) {
                        ctx.ui.notify("Invalid model selection; nothing was written.", "error");
                        return;
                    }
                    if (!validateChoice(panel.description, value))
                        continue;
                    seats.push(value);
                    if (seats.length >= 16)
                        break;
                }
                next.panels[panel.name] = seats;
            }
            saveModels(next);
            ctx.ui.notify("Saved pstack-native role models and panels. Unconfigured panels require setup before use.", "info");
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
            ctx.ui.notify(`pstack ${parity.upstream ?? PSTACK_VERSION} inventory coverage (not behavioral parity)\nskills: ${skills.length}\nplaybooks: ${playbooks.length}\npending in listed scope: ${pending}\ncursor-only: ${(parity.cursorOnly ?? []).join(", ") || "none"}\nfile-level auxiliary audit: ${parity.coverage?.fileLevelAudit ?? "not-claimed"}`, pending ? "warning" : "info");
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
