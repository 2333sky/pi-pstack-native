import { loadModels } from "../runtime/config.js";
function parseSelector(selector) {
    const slash = selector.indexOf("/");
    if (slash <= 0 || slash === selector.length - 1)
        return undefined;
    return { provider: selector.slice(0, slash), id: selector.slice(slash + 1) };
}
export function supportsThinking(model, level) {
    if (!model)
        return false;
    if (level === "off")
        return true;
    const candidate = model;
    if (!candidate.reasoning)
        return false;
    const mapped = candidate.thinkingLevelMap?.[level];
    if (mapped === null)
        return false;
    if ((level === "xhigh" || level === "max") && mapped === undefined)
        return false;
    return true;
}
const EFFORTS = ['max', 'xhigh', 'high', 'medium', 'low', 'minimal'];
export function lowerSupportedThinking(model, level) {
    const index = EFFORTS.indexOf(level);
    return index < 0 ? undefined : EFFORTS.slice(index + 1).find(candidate => supportsThinking(model, candidate));
}
/** Identify only recognizable model families; provider names alone do not establish family. */
export function modelFamily(selector) {
    const id = parseSelector(selector)?.id.toLowerCase() ?? '';
    for (const [family, pattern] of [
        ['claude', /(?:^|[\/_-])claude(?:[\d_-]|$)/],
        ['grok', /(?:^|[\/_-])(?:grok|composer)(?:[\d_.-]|$)/],
        ['gpt', /(?:^|[\/_-])gpt(?:[\d_.-]|$)/],
        ['gemini', /(?:^|[\/_-])gemini(?:[\d_.-]|$)/],
        ['deepseek', /(?:^|[\/_-])deepseek(?:[\d_.-]|$)/],
        ['qwen', /(?:^|[\/_-])qwen(?:[\d_.-]|$)/],
        ['llama', /(?:^|[\/_-])llama(?:[\d_.-]|$)/],
        ['mistral', /(?:^|[\/_-])mistral(?:[\d_.-]|$)/],
    ])
        if (pattern.test(id))
            return family;
    return undefined;
}
function sameFamilyFallback(ctx, selector) {
    const wanted = parseSelector(selector), family = modelFamily(selector);
    if (!wanted || !family)
        return undefined;
    const score = (candidate) => {
        const parsed = parseSelector(candidate);
        const a = wanted.id.toLowerCase(), b = parsed.id.toLowerCase();
        let prefix = 0;
        while (prefix < Math.min(a.length, b.length) && a[prefix] === b[prefix])
            prefix++;
        return (parsed.provider === wanted.provider ? 10_000 : 0) + prefix;
    };
    return availableModelSelectors(ctx).filter(candidate => candidate !== selector && parseSelector(candidate)?.provider === wanted.provider && modelFamily(candidate) === family)
        .sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0];
}
/** Prefer a known family different from the parent; never infer a family from provider names. */
export function selectJudgeFromPool(ctx, pool) {
    const notes = [];
    const choices = [];
    const parent = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
    const parentFamily = parent ? modelFamily(parent) : undefined;
    const eligible = (candidate) => parentFamily ? Boolean(modelFamily(candidate) && modelFamily(candidate) !== parentFamily) : candidate !== parent;
    const resolve = (selector) => {
        if (selector === 'inherit-parent' || selector === 'auto')
            return;
        try {
            const resolved = resolveRoleModel(ctx, 'judge', selector);
            if (!resolved.model)
                throw new Error(`Parent model unavailable for ${selector}`);
            notes.push(...resolved.notes);
            choices.push(`${resolved.model.provider}/${resolved.model.id}`);
        }
        catch (error) {
            notes.push(`Judge pool entry ${selector} unavailable: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    for (const selector of pool)
        resolve(selector);
    if (!choices.some(eligible) && typeof ctx.modelRegistry.getAvailable === 'function') {
        for (const selector of availableModelSelectors(ctx))
            if (!pool.includes(selector))
                resolve(selector);
    }
    const selected = choices.find(eligible);
    if (!parentFamily)
        notes.push('The parent model family is unknown; judge family independence cannot be established.');
    if (!selected)
        notes.push('No eligible cross-judge is available; the coordinator must compare and select the base.');
    return { model: selected, notes };
}
export function resolveModelSelector(ctx, role, selector) {
    let model;
    if (selector === "inherit-parent" || selector === "auto")
        model = ctx.model;
    else {
        const parsed = parseSelector(selector);
        if (!parsed)
            throw new Error(`Invalid model selector for ${role}: ${selector}. Use provider/model, inherit-parent, or auto.`);
        model = ctx.modelRegistry.find(parsed.provider, parsed.id);
        if (!model)
            throw new Error(`Model for ${role} is not available in this Pi session: ${selector}`);
    }
    return model;
}
export function resolveRoleModel(ctx, role, explicit, taskThinking) {
    const config = loadModels();
    const requested = explicit?.trim() || config.roles[role] || "inherit-parent";
    let selector = requested;
    const notes = [];
    const parsed = parseSelector(requested);
    if (config.fallbackPolicy === 'same-family' && parsed && !ctx.modelRegistry.find(parsed.provider, parsed.id)) {
        const fallback = sameFamilyFallback(ctx, requested);
        if (fallback) {
            selector = fallback;
            notes.push(`Model ${requested} is unavailable; using same-family ${fallback}.`);
        }
    }
    const model = resolveModelSelector(ctx, role, selector);
    const configuredThinking = taskThinking ?? config.thinkingLevel;
    let thinkingLevel = configuredThinking === "inherit-parent" ? ctx.thinkingLevel : configuredThinking;
    // Explicit pstack reasoning choices fail closed. `inherit-parent` intentionally delegates
    // compatibility/clamping to Pi's native AgentSession, just as the parent session does.
    if (configuredThinking !== "inherit-parent" && thinkingLevel && model && !supportsThinking(model, thinkingLevel)) {
        const lower = config.fallbackPolicy === 'same-family' ? lowerSupportedThinking(model, thinkingLevel) : undefined;
        if (!lower)
            throw new Error(`Configured pstack child reasoning level ${thinkingLevel} is not supported by ${model.provider}/${model.id}. Run /setup-pstack and choose another level or inherit-parent.`);
        notes.push(`Reasoning level ${thinkingLevel} is unavailable on ${model.provider}/${model.id}; using ${lower}.`);
        thinkingLevel = lower;
    }
    return { requestedSelector: requested, selector, model, thinkingLevel, notes };
}
export function availableModelSelectors(ctx) {
    const source = ctx.scopedModels.length ? ctx.scopedModels.map((x) => x.model) : ctx.modelRegistry.getAvailable();
    return [...new Set(source.map((m) => `${m.provider}/${m.id}`))].sort();
}
/** Suggest only models visible to this Pi session. Repeated seats are explicitly reported. */
export function suggestedPanels(ctx) {
    const available = availableModelSelectors(ctx);
    const parent = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
    const first = parent && available.includes(parent) ? parent : available[0] ?? 'inherit-parent';
    const family = modelFamily(first);
    const second = available.find(item => item !== first && family && modelFamily(item) && modelFamily(item) !== family)
        ?? available.find(item => item !== first) ?? first;
    const runners = [first, second];
    const judges = available.length ? available : ['inherit-parent'];
    return { arena: [...runners], architect: [...runners], interrogate: [...runners], 'arena-judges': [...judges] };
}
/** Drop unavailable configured seats, then retain the upstream minimum using a real survivor or parent. */
export function resolvePanelSeats(ctx, selectors, minimum, notes) {
    const models = selectors.flatMap(selector => {
        try {
            const resolved = resolveRoleModel(ctx, 'panel', selector);
            notes.push(...resolved.notes);
            if (!resolved.model)
                throw new Error(`PARENT_MODEL_UNAVAILABLE: ${selector}`);
            return [`${resolved.model.provider}/${resolved.model.id}`];
        }
        catch (error) {
            notes.push(`Panel seat ${selector} was dropped: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    });
    if (!models.length && ctx.model) {
        const parent = resolveRoleModel(ctx, 'panel', 'inherit-parent');
        if (parent.model) {
            models.push(`${parent.model.provider}/${parent.model.id}`);
            notes.push(`No configured panel seats resolved; using parent model ${models[0]}.`);
        }
    }
    if (!models.length)
        throw new Error('NO_AVAILABLE_PANEL_MODELS');
    while (models.length < minimum) {
        models.push(models[0]);
        notes.push('Repeated the remaining model to replace a dropped seat; model diversity is not established.');
    }
    return models;
}
