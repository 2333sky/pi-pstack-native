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
    const selector = explicit?.trim() || config.roles[role] || "inherit-parent";
    const model = resolveModelSelector(ctx, role, selector);
    const configuredThinking = taskThinking ?? config.thinkingLevel;
    const thinkingLevel = configuredThinking === "inherit-parent" ? ctx.thinkingLevel : configuredThinking;
    // Explicit pstack reasoning choices fail closed. `inherit-parent` intentionally delegates
    // compatibility/clamping to Pi's native AgentSession, just as the parent session does.
    if (configuredThinking !== "inherit-parent" && thinkingLevel && model && !supportsThinking(model, thinkingLevel)) {
        throw new Error(`Configured pstack child reasoning level ${thinkingLevel} is not supported by ${model.provider}/${model.id}. Run /setup-pstack and choose another level or inherit-parent.`);
    }
    return { selector, model, thinkingLevel };
}
export function availableModelSelectors(ctx) {
    const source = ctx.scopedModels.length ? ctx.scopedModels.map((x) => x.model) : ctx.modelRegistry.getAvailable();
    return [...new Set(source.map((m) => `${m.provider}/${m.id}`))].sort();
}
