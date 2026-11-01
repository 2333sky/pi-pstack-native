import { readFileSync } from "node:fs";
import { availableModelSelectors, lowerSupportedThinking, modelFamily, supportsThinking, suggestedPanels } from "../models/router.js";
import { loadModels, saveModels } from "../runtime/config.js";
import { modelConfigPath } from "../runtime/home.js";
const ROLE_DESCRIPTIONS = {
    worker: "implementation", architect: "design and implementation", reviewer: "read-only review",
    scout: "read-only exploration", verifier: "read-only verification", synthesizer: "reconcile results",
    integrator: "combine work", "poteto-agent": "delegated Poteto task", "comment-sicko": "comment and workaround review",
};
const TASK_ROLES = [
    { name: "feature", role: "worker", label: "feature", defaultRole: "worker" },
    { name: "refactoring", role: "worker", label: "refactoring", defaultRole: "worker" },
    { name: "bug-fix", role: "worker", label: "bug-fix", defaultRole: "worker" },
    { name: "perf-issue", role: "worker", label: "performance issue", defaultRole: "worker" },
    { name: "hillclimb", role: "worker", label: "hillclimb", defaultRole: "worker" },
    { name: "how", role: "scout", label: "how explorer", defaultRole: "scout" },
    { name: "how", role: "synthesizer", label: "how explainer", defaultRole: "synthesizer" },
    { name: "why", role: "scout", label: "why investigators", defaultRole: "scout" },
    { name: "why", role: "synthesizer", label: "why synthesizer", defaultRole: "synthesizer" },
    { name: "swarm", role: "worker", label: "swarm workers", defaultRole: "worker" },
    { name: "reflect", role: "tooling", label: "reflect tooling" },
    { name: "reflect", role: "judgment", label: "reflect judgment" },
    { name: "reflect", role: "divergent", label: "reflect divergent" },
    { name: "reflect", role: "synthesizer", label: "reflect synthesizer" },
];
const PANEL_INFO = {
    arena: { label: "arena runners", min: 2 },
    "arena-judges": { label: "arena cross-judge pool", min: 1 },
    architect: { label: "architect runners", min: 2 },
    interrogate: { label: "interrogate reviewers", min: 1 },
};
const BUDGETS = [
    { value: "max", label: "unlimited — max reasoning" },
    { value: "xhigh", label: "large — xhigh reasoning" },
    { value: "high", label: "medium — high reasoning" },
    { value: "medium", label: "small — medium reasoning" },
    { value: "inherit-parent", label: "inherit-parent — use the parent session's reasoning level" },
    { value: "off", label: "off — disable reasoning" },
    { value: "minimal", label: "minimal — least reasoning effort" },
    { value: "low", label: "low — lower reasoning effort" },
];
// Keep the English text stable for integrations while showing Chinese beside it.
const ZH_OPTIONS = {
    "Next page →": "下一页 →", "← Previous page": "← 上一页",
    "Cancel setup": "取消配置", "Back to review": "返回检查", "Back": "返回",
    "Save settings": "保存设置", "Edit a role": "编辑通用角色", "Edit a task model": "编辑任务模型",
    "Edit a panel": "编辑模型面板", "Change budget": "修改推理预算", "Change fallback": "修改回退策略",
    "Done editing panel": "完成面板编辑", "Add a seat": "添加席位", "Change model": "更换模型",
    "Remove seat": "删除席位", "Move up": "上移", "Move down": "下移", "Back to panel": "返回面板",
    "Use role default": "使用角色默认模型",
    "inherit-parent — parent model": "inherit-parent — 使用父会话模型", "auto — parent model": "auto — 使用父会话模型",
    "unlimited — max reasoning": "不限 — max 推理", "large — xhigh reasoning": "大 — xhigh 推理",
    "medium — high reasoning": "中 — high 推理", "small — medium reasoning": "小 — medium 推理",
    "inherit-parent — use the parent session's reasoning level": "inherit-parent — 使用父会话的推理级别",
    "off — disable reasoning": "off — 关闭推理", "minimal — least reasoning effort": "minimal — 最低推理强度",
    "low — lower reasoning effort": "low — 较低推理强度",
    "disabled — block unsupported reasoning": "disabled — 禁止不支持的推理级别",
    "same-family — allow reported lower reasoning and model fallback": "same-family — 允许降低推理级别并回退模型",
};
const ZH_NAMES = {
    worker: "执行开发", architect: "设计和开发", reviewer: "只读审查", scout: "只读探索",
    verifier: "只读验证", synthesizer: "汇总结果", integrator: "合并工作",
    "poteto-agent": "执行 Poteto 委派任务", "comment-sicko": "审查注释和变通方案",
    feature: "功能开发", refactoring: "代码重构", "bug-fix": "修复错误", "performance issue": "性能问题",
    hillclimb: "迭代改进", "how explorer": "探索实现方式", "how explainer": "解释实现方式",
    "why investigators": "调查原因", "why synthesizer": "汇总原因", "swarm workers": "并行执行任务",
    "reflect tooling": "反思：工具分析", "reflect judgment": "反思：判断", "reflect divergent": "反思：发散分析",
    "reflect synthesizer": "反思：汇总", "arena runners": "arena 方案执行", "arena cross-judge pool": "arena 交叉评委池",
    "architect runners": "architect 方案执行", "interrogate reviewers": "interrogate 审查",
};
function chineseName(name) {
    return ZH_NAMES[name] ? `${name}（${ZH_NAMES[name]}）` : name;
}
function optionChinese(option) {
    if (ZH_OPTIONS[option])
        return ZH_OPTIONS[option];
    const seat = /^Seat (\d+): (.+)$/.exec(option);
    if (seat)
        return `席位 ${seat[1]}：${seat[2]}`;
    const count = /^(.+) — (\d+) seats$/.exec(option);
    if (count)
        return `${chineseName(count[1])} — ${count[2]} 个席位`;
    const role = /^(.+) — (.+)$/.exec(option);
    if (role)
        return `${chineseName(role[1])} — 当前模型：${role[2] === "role default" ? "角色默认模型" : role[2]}`;
    return undefined;
}
function titleChinese(title) {
    if (title.startsWith("Child reasoning budget"))
        return "子代理推理预算。large 对应原版默认值；current 表示当前值。";
    if (title.startsWith("Review pstack settings"))
        return "检查 pstack 设置。need attention 表示需要处理。通用角色提供默认模型；任务模型覆盖对应任务的默认模型。";
    if (title.startsWith("Choose role"))
        return "选择要编辑的通用角色。任务模型没有单独设置时，使用对应角色的模型。";
    if (title.startsWith("Choose task model"))
        return "选择要编辑的任务模型。任务设置会覆盖对应角色的默认模型。";
    if (title.startsWith("Choose panel"))
        return "选择要编辑的模型面板。执行和审查面板的每个席位运行一个子代理。arena 评委池只选一名评委。父模型家族已知时，评委必须来自不同家族；父模型别名不担任评委。";
    if (title.startsWith("Model fallback policy"))
        return "模型回退策略";
    if (title.startsWith("Add seat to "))
        return "为面板添加席位。评委池按顺序选择一名评委。其他面板的每个席位运行一个子代理。";
    if (title.startsWith("Model for "))
        return `选择模型：${chineseName(title.slice("Model for ".length))}`;
    if (title.startsWith("Seat "))
        return "编辑席位";
    if (/\(\d+ seats; \d+–16 allowed\)/.test(title))
        return `编辑面板：${chineseName(title.slice(0, title.indexOf(" (")))}。评委池按顺序选择一名评委。其他面板的每个席位运行一个子代理。席位数量必须在显示的范围内。`;
    return undefined;
}
async function selectBilingual(ctx, title, options) {
    const chinese = titleChinese(title);
    const lines = title.split("\n").map((line, index) => {
        if (index === 0)
            return line;
        const translation = reviewRowChinese(line);
        return translation ? `${line} / ${translation}` : line;
    });
    const labels = options.map(option => {
        const translation = optionChinese(option);
        return translation ? `${option} / ${translation}` : option;
    });
    const selected = await ctx.ui.select(chinese ? `${lines.join("\n")}\n${chinese}` : lines.join("\n"), labels);
    const index = labels.indexOf(selected ?? "");
    // Accept the English value as well for existing UI integrations.
    return index >= 0 ? options[index] : selected;
}
function reviewRowChinese(row) {
    if (row.startsWith("Budget:"))
        return "推理预算与回退策略";
    const label = /^([^:]+):/.exec(row)?.[1];
    const role = label?.startsWith("Role ") ? label.slice(5) : undefined;
    const name = role ?? label?.replace(/ \d+$/, "");
    const description = name && ZH_NAMES[name] ? `${role ? "通用角色：" : ""}${ZH_NAMES[name]}` : undefined;
    let status;
    if (row.includes("not available; choose a model"))
        status = "模型不可用，请重新选择模型";
    else {
        const unsupported = /does not support (\S+) reasoning/.exec(row);
        const fallback = /uses (\S+) reasoning \(fallback\)/.exec(row);
        const seatCount = /: (\d+) seats \[needs (\d+–16)\]/.exec(row);
        if (unsupported)
            status = `模型不支持 ${unsupported[1]} 推理，请选择其他模型或调整推理预算`;
        else if (row.includes("[needs choice:"))
            status = "需要重新选择模型或调整推理预算";
        else if (row.includes("parent model not selected yet"))
            status = "尚未选择父模型";
        else if (fallback)
            status = `回退到 ${fallback[1]} 推理级别`;
        else if (row.includes("Pi maps "))
            status = "Pi 会将推理级别映射到显示的级别";
        else if (row.includes("role default"))
            status = "使用角色默认模型";
        else if (seatCount)
            status = `当前 ${seatCount[1]} 个席位，需要 ${seatCount[2]} 个席位`;
        else if (row.includes("repeated model seats"))
            status = "重复模型不会增加模型多样性";
        else if (row.includes("parent aliases do not judge"))
            status = "父模型别名不担任评委";
    }
    return [description, status].filter(Boolean).join("；") || undefined;
}
function notifyBilingual(ctx, message, type) {
    let chinese;
    if (message.startsWith("Invalid selection"))
        chinese = "选择无效，请重试。";
    else if (message.startsWith("Setup cancelled"))
        chinese = "配置已取消，未写入文件。";
    else if (message.startsWith("/setup-pstack requires"))
        chinese = "/setup-pstack 需要交互界面。";
    else if (message.startsWith("No available Pi models"))
        chinese = "未检测到可用的 Pi 模型。仍可选择父模型别名；配置 Pi 模型后可重新运行。";
    else if (message.startsWith("A panel can have"))
        chinese = "一个面板最多有 16 个席位。";
    else if (message.startsWith("Cannot save yet")) {
        const count = /Cannot save yet: (.+) needs (\d+–16) seats/.exec(message);
        const details = count ? `${chineseName(count[1])} 需要 ${count[2]} 个席位` : reviewRowChinese(message);
        chinese = `暂时无法保存。${details ?? "请修改相关选项或推理预算"}。`;
    }
    else if (message.startsWith("models.json changed"))
        chinese = "models.json 在配置期间发生变化。未写入文件，请重新运行配置。";
    else if (message.startsWith("Could not save"))
        chinese = "无法保存 pstack 设置。";
    else if (message.startsWith("Saved pstack settings"))
        chinese = `已保存 pstack 设置。${message.includes("Repeated seats") ? "重复模型不会增加模型多样性。" : ""}${message.includes("Checking optional") ? "接下来检查可选的项目验证。" : "请选择父模型，再按需使用验证技能。"}`;
    else if (message.startsWith("Cannot read"))
        chinese = "无法读取配置文件。请先修复无效的 JSON。";
    else if (message.startsWith("Cannot safely edit"))
        chinese = "无法安全编辑配置文件。请先修复无效的模型配置。";
    ctx.ui.notify(chinese ? `${message}\n${chinese}` : message, type);
}
// Pi's standard selector renders every option, without scrolling. Page long lists
// so they remain usable for users with a large model registry and in RPC mode.
async function pick(ctx, title, items, backLabel) {
    const size = 5;
    let page = 0;
    for (;;) {
        const pages = Math.max(1, Math.ceil(items.length / size));
        const visible = items.slice(page * size, (page + 1) * size);
        const options = visible.map(item => item.label);
        if (page + 1 < pages)
            options.push("Next page →");
        if (page > 0)
            options.push("← Previous page");
        options.push(backLabel);
        const selected = await selectBilingual(ctx, `${title}${pages > 1 ? ` (${page + 1}/${pages})` : ""}`, options);
        if (selected === undefined)
            return { kind: "cancel" };
        if (selected === "Next page →") {
            page++;
            continue;
        }
        if (selected === "← Previous page") {
            page--;
            continue;
        }
        if (selected === backLabel)
            return { kind: "back" };
        const item = visible.find(candidate => candidate.label === selected);
        if (item)
            return { kind: "choice", value: item.value };
        notifyBilingual(ctx, "Invalid selection; try again.", "error");
    }
}
function snapshot() {
    try {
        return readFileSync(modelConfigPath(), "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
// loadModels also serves legacy runtime callers. Validate the setup input here
// before it can be rewritten, including malformed JSON and malformed maps.
function parseExisting(raw) {
    if (raw === undefined)
        return {};
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new Error(`Cannot read ${modelConfigPath()}: invalid JSON. Fix the file before running setup.`);
    }
    const strings = (map) => isRecord(map) && Object.values(map).every(item => typeof item === "string" && item.trim());
    if (!isRecord(value) || (value.version !== undefined && value.version !== 1)
        || (value.roles !== undefined && !strings(value.roles))
        || (value.workflows !== undefined && (!isRecord(value.workflows) || !Object.values(value.workflows).every(strings)))
        || (value.panels !== undefined && (!isRecord(value.panels) || !Object.values(value.panels).every(seats => Array.isArray(seats) && seats.every(item => typeof item === "string" && item.trim()))))) {
        throw new Error(`Cannot safely edit ${modelConfigPath()}: invalid model configuration. Fix the file before running setup.`);
    }
    return value;
}
function taskRoles(config) {
    const result = TASK_ROLES.map(role => ({ ...role }));
    for (const [name, roles] of Object.entries(config.workflows)) {
        for (const role of Object.keys(roles)) {
            if (!result.some(item => item.name === name && item.role === role))
                result.push({ name, role, label: `${name} / ${role}` });
        }
    }
    return result;
}
function roleKeys(config) {
    return [...new Set([...Object.keys(ROLE_DESCRIPTIONS), ...Object.keys(config.roles)])];
}
function panelKeys(config) {
    return [...new Set([...Object.keys(PANEL_INFO), ...Object.keys(config.panels)])];
}
function modelStatus(ctx, available, config, value) {
    const alias = value === "inherit-parent" || value === "auto";
    if (!alias && !available.has(value))
        return { error: "not available; choose a model" };
    const slash = value.indexOf("/");
    const model = alias ? ctx.model : slash > 0 ? ctx.modelRegistry.find(value.slice(0, slash), value.slice(slash + 1)) : undefined;
    if (!model)
        return alias ? { note: "parent model not selected yet" } : { error: "not available; choose a model" };
    const level = config.thinkingLevel;
    if (level === "inherit-parent")
        return {};
    if (!supportsThinking(model, level)) {
        const lower = config.fallbackPolicy === "same-family" ? lowerSupportedThinking(model, level) : undefined;
        return lower ? { note: `uses ${lower} reasoning (fallback)` } : { error: `does not support ${level} reasoning` };
    }
    const mapped = model.thinkingLevelMap?.[level];
    return mapped && mapped !== level ? { note: `Pi maps ${level} to ${mapped}` } : {};
}
function describe(ctx, available, config, label, value) {
    const status = modelStatus(ctx, available, config, value);
    return { text: `${label}: ${value}${status.error ? ` [needs choice: ${status.error}]` : status.note ? ` [${status.note}]` : ""}`, error: status.error && `${label}: ${status.error}` };
}
function reviewRows(ctx, available, config) {
    const rows = [{ text: `Budget: ${config.thinkingLevel}; fallback: ${config.fallbackPolicy ?? "disabled"}` }];
    for (const role of roleKeys(config))
        rows.push(describe(ctx, available, config, `Role ${role}`, config.roles[role] ?? "inherit-parent"));
    for (const task of taskRoles(config)) {
        const value = config.workflows[task.name]?.[task.role];
        if (value)
            rows.push(describe(ctx, available, config, task.label, value));
        else
            rows.push({ text: `${task.label}: role default${task.defaultRole ? ` (${config.roles[task.defaultRole] ?? "inherit-parent"})` : " (dispatch profile)"}` });
    }
    for (const name of panelKeys(config)) {
        const seats = config.panels[name] ?? [];
        const info = PANEL_INFO[name] ?? { label: name, min: 1 };
        if (seats.length < info.min || seats.length > 16)
            rows.push({ text: `${info.label}: ${seats.length} seats [needs ${info.min}–16]`, error: `${info.label} needs ${info.min}–16 seats` });
        const actual = seats.map(value => value === "auto" || value === "inherit-parent" ? ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "parent" : value);
        if (name !== "arena-judges" && new Set(actual).size < actual.length)
            rows.push({ text: `${info.label}: repeated model seats do not add model diversity` });
        if (name === "arena-judges" && seats.some(value => value === "auto" || value === "inherit-parent"))
            rows.push({ text: "Judge pool: parent aliases do not judge" });
        seats.forEach((value, index) => rows.push(describe(ctx, available, config, `${info.label} ${index + 1}`, value)));
    }
    return rows;
}
async function chooseBudget(ctx, current, fresh, initial = false) {
    const ordered = [...BUDGETS].sort((a, b) => Number(b.value === current) - Number(a.value === current));
    return pick(ctx, `Child reasoning budget (${fresh ? "large matches upstream defaults" : `current: ${current}`})`, ordered, initial ? "Cancel setup" : "Back to review");
}
async function chooseModel(ctx, available, title, current, roleDefault = false) {
    const items = [
        { value: "inherit-parent", label: "inherit-parent — parent model" },
        { value: "auto", label: "auto — parent model" },
        ...available.map(value => ({ value, label: value })),
    ];
    if (roleDefault)
        items.unshift({ value: undefined, label: "Use role default" });
    items.sort((a, b) => Number(b.value === current) - Number(a.value === current));
    return pick(ctx, title, items, "Back");
}
async function editPanel(ctx, config, name, available) {
    const info = PANEL_INFO[name] ?? { label: name, min: 1 };
    const seats = [...(config.panels[name] ?? [])];
    for (;;) {
        const items = [
            { value: "done", label: "Done editing panel" },
            { value: "add", label: "Add a seat" },
            ...seats.map((value, index) => ({ value: String(index), label: `Seat ${index + 1}: ${value}` })),
        ];
        const chosen = await pick(ctx, `${info.label} (${seats.length} seats; ${info.min}–16 allowed)`, items, "Back to review");
        if (chosen.kind === "cancel")
            return false;
        if (chosen.kind === "back")
            return true;
        if (chosen.value === "done") {
            config.panels[name] = seats;
            return true;
        }
        if (chosen.value === "add") {
            if (seats.length >= 16) {
                notifyBilingual(ctx, "A panel can have at most 16 seats.", "error");
                continue;
            }
            const model = await chooseModel(ctx, available, `Add seat to ${info.label}`);
            if (model.kind === "cancel")
                return false;
            if (model.kind === "choice" && model.value)
                seats.push(model.value);
            continue;
        }
        const index = Number(chosen.value);
        const action = await selectBilingual(ctx, `Seat ${index + 1}: ${seats[index]}`, ["Change model", "Remove seat", "Move up", "Move down", "Back to panel"]);
        if (action === undefined)
            return false;
        if (action === "Remove seat")
            seats.splice(index, 1);
        else if (action === "Move up" && index > 0)
            [seats[index - 1], seats[index]] = [seats[index], seats[index - 1]];
        else if (action === "Move down" && index + 1 < seats.length)
            [seats[index], seats[index + 1]] = [seats[index + 1], seats[index]];
        else if (action === "Change model") {
            const model = await chooseModel(ctx, available, `Model for ${info.label} seat ${index + 1}`, seats[index]);
            if (model.kind === "cancel")
                return false;
            if (model.kind === "choice" && model.value)
                seats[index] = model.value;
        }
    }
}
const VERIFICATION_FOLLOWUP = [
    "Complete the optional verification part of /setup-pstack for the current project.",
    "First inspect the project for a project-local verify-* skill or an existing harness that drives the real app (not merely unit tests).",
    "If neither exists, offer once to create a project-local verification skill using /skill:create-verification-skill; ask and wait for the user's answer before creating anything.",
    "Separately check for a project-local skill that runs a model checker, proof, or other formal verifier against the code. If none exists, offer once to create one using /skill:create-formal-verification-skill; ask and wait for the user's answer.",
    "Do not count the bundled create-* instructions as existing project verification. Respect a no or cancellation, and do not claim a skill ran unless it was actually invoked. If a requested skill is unavailable, say so.",
    "When speaking to the user, provide both Chinese and English.",
].join(" ");
export async function runSetup(pi, ctx) {
    if (!ctx.hasUI) {
        notifyBilingual(ctx, "/setup-pstack requires an interactive UI.", "error");
        return;
    }
    let original, config, raw;
    try {
        original = snapshot();
        raw = parseExisting(original);
        config = loadModels();
    }
    catch (error) {
        notifyBilingual(ctx, error instanceof Error ? error.message : String(error), "error");
        return;
    }
    let available = availableModelSelectors(ctx);
    if (!available.length)
        notifyBilingual(ctx, "No available Pi models detected. Parent aliases are still selectable; configure Pi models and rerun setup to choose explicit models.", "warning");
    const next = {
        ...raw, ...config, roles: { ...config.roles },
        panels: Object.fromEntries(Object.entries(config.panels ?? {}).map(([name, seats]) => [name, [...seats]])),
        workflows: Object.fromEntries(Object.entries(config.workflows ?? {}).map(([name, values]) => [name, { ...values }])),
    };
    for (const [name, seats] of Object.entries(suggestedPanels(ctx)))
        next.panels[name] ??= seats;
    if (original === undefined && available.length) {
        const code = available.find(model => modelFamily(model) === "grok") ?? available[0];
        const parent = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
        const judgment = available.find(model => modelFamily(model) === "claude") ?? (available.includes(parent) ? parent : available[0]);
        next.roles.worker = code;
        for (const role of ["architect", "reviewer", "verifier", "synthesizer", "integrator", "poteto-agent", "comment-sicko"])
            next.roles[role] = judgment;
        next.roles.scout = code;
        next.workflows.reflect = { tooling: code, judgment, divergent: judgment, synthesizer: judgment };
    }
    const first = await chooseBudget(ctx, original === undefined ? "xhigh" : next.thinkingLevel, original === undefined, true);
    if (first.kind !== "choice") {
        notifyBilingual(ctx, "Setup cancelled; nothing was written.", "info");
        return;
    }
    next.thinkingLevel = first.value;
    let page = 0;
    for (;;) {
        available = availableModelSelectors(ctx);
        const rows = reviewRows(ctx, new Set(available), next);
        const size = 4, pages = Math.max(1, Math.ceil(rows.length / size));
        page = Math.min(page, pages - 1);
        const invalid = rows.filter(row => row.error);
        const title = `Review pstack settings (${page + 1}/${pages})${invalid.length ? ` — ${invalid.length} need attention` : ""}\n${rows.slice(page * size, (page + 1) * size).map(row => row.text).join("\n")}`;
        const actions = ["Save settings", "Edit a role", "Edit a task model", "Edit a panel", "Change budget", "Change fallback"];
        if (page + 1 < pages)
            actions.push("Next page →");
        if (page > 0)
            actions.push("← Previous page");
        const action = await selectBilingual(ctx, title, actions);
        if (action === undefined) {
            notifyBilingual(ctx, "Setup cancelled; nothing was written.", "info");
            return;
        }
        if (action === "Next page →") {
            page++;
            continue;
        }
        if (action === "← Previous page") {
            page--;
            continue;
        }
        if (action === "Change budget") {
            const selected = await chooseBudget(ctx, next.thinkingLevel, false);
            if (selected.kind === "cancel") {
                notifyBilingual(ctx, "Setup cancelled; nothing was written.", "info");
                return;
            }
            if (selected.kind === "choice")
                next.thinkingLevel = selected.value;
            continue;
        }
        if (action === "Change fallback") {
            const policies = [
                { value: "disabled", label: "disabled — block unsupported reasoning" },
                { value: "same-family", label: "same-family — allow reported lower reasoning and model fallback" },
            ];
            policies.sort((a, b) => Number(b.value === next.fallbackPolicy) - Number(a.value === next.fallbackPolicy));
            const selected = await pick(ctx, "Model fallback policy", policies, "Back to review");
            if (selected.kind === "cancel") {
                notifyBilingual(ctx, "Setup cancelled; nothing was written.", "info");
                return;
            }
            if (selected.kind === "choice")
                next.fallbackPolicy = selected.value;
            continue;
        }
        if (action === "Edit a role") {
            const selected = await pick(ctx, "Choose role to edit", roleKeys(next).map(value => ({ value, label: `${value} — ${next.roles[value] ?? "inherit-parent"}` })), "Back to review");
            if (selected.kind === "cancel") {
                notifyBilingual(ctx, "Setup cancelled; nothing was written.", "info");
                return;
            }
            if (selected.kind === "choice") {
                const model = await chooseModel(ctx, available, `Model for ${selected.value}`, next.roles[selected.value]);
                if (model.kind === "cancel") {
                    notifyBilingual(ctx, "Setup cancelled; nothing was written.", "info");
                    return;
                }
                if (model.kind === "choice" && model.value)
                    next.roles[selected.value] = model.value;
            }
            continue;
        }
        if (action === "Edit a task model") {
            const selected = await pick(ctx, "Choose task model to edit", taskRoles(next).map(value => ({ value, label: `${value.label} — ${next.workflows[value.name]?.[value.role] ?? "role default"}` })), "Back to review");
            if (selected.kind === "cancel") {
                notifyBilingual(ctx, "Setup cancelled; nothing was written.", "info");
                return;
            }
            if (selected.kind === "choice") {
                const task = selected.value;
                const model = await chooseModel(ctx, available, `Model for ${task.label}`, next.workflows[task.name]?.[task.role], true);
                if (model.kind === "cancel") {
                    notifyBilingual(ctx, "Setup cancelled; nothing was written.", "info");
                    return;
                }
                if (model.kind === "choice") {
                    const values = { ...next.workflows[task.name] };
                    if (model.value)
                        values[task.role] = model.value;
                    else
                        delete values[task.role];
                    if (Object.keys(values).length)
                        next.workflows[task.name] = values;
                    else
                        delete next.workflows[task.name];
                }
            }
            continue;
        }
        if (action === "Edit a panel") {
            const selected = await pick(ctx, "Choose panel to edit", panelKeys(next).map(value => ({ value, label: `${PANEL_INFO[value]?.label ?? value} — ${(next.panels[value] ?? []).length} seats` })), "Back to review");
            if (selected.kind === "cancel") {
                notifyBilingual(ctx, "Setup cancelled; nothing was written.", "info");
                return;
            }
            if (selected.kind === "choice" && !await editPanel(ctx, next, selected.value, available)) {
                notifyBilingual(ctx, "Setup cancelled; nothing was written.", "info");
                return;
            }
            continue;
        }
        if (action !== "Save settings") {
            notifyBilingual(ctx, "Invalid selection; try again.", "error");
            continue;
        }
        // Registry/auth state may change while a dialog is open; recheck just before saving.
        const finalRows = reviewRows(ctx, new Set(availableModelSelectors(ctx)), next);
        const finalInvalid = finalRows.filter(row => row.error);
        if (finalInvalid.length) {
            page = Math.floor(finalRows.findIndex(row => row.error) / size);
            notifyBilingual(ctx, `Cannot save yet: ${finalInvalid[0].error}. Edit the affected choice or change the budget.`, "error");
            continue;
        }
        try {
            if (snapshot() !== original) {
                notifyBilingual(ctx, "models.json changed during setup; nothing was written. Rerun setup to review the current settings.", "error");
                return;
            }
            saveModels(next);
        }
        catch (error) {
            notifyBilingual(ctx, `Could not save pstack settings: ${error instanceof Error ? error.message : String(error)}`, "error");
            return;
        }
        const duplicates = panelKeys(next).filter(name => name !== "arena-judges" && (() => {
            const values = (next.panels[name] ?? []).map(value => value === "auto" || value === "inherit-parent" ? ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "parent" : value);
            return new Set(values).size < values.length;
        })());
        notifyBilingual(ctx, `Saved pstack settings to ${modelConfigPath()}.${duplicates.length ? ` Repeated seats do not add model diversity: ${duplicates.join(", ")}.` : ""}${ctx.model ? " Checking optional project verification next." : " Select a parent model and use /skill:create-verification-skill or /skill:create-formal-verification-skill if needed."}`, "info");
        if (ctx.model)
            pi.sendUserMessage(VERIFICATION_FOLLOWUP, ctx.isIdle() ? { expandPromptTemplates: true } : { expandPromptTemplates: true, deliverAs: "followUp" });
        return;
    }
}
