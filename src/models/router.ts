import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadModels } from "../runtime/config.ts";
import type { ThinkingLevelName } from "../runtime/types.ts";

export type ResolvedModel = {
  selector: string;
  model: ExtensionContext["model"];
  thinkingLevel: ExtensionContext["thinkingLevel"] | ThinkingLevelName | undefined;
};

function parseSelector(selector: string): { provider: string; id: string } | undefined {
  const slash = selector.indexOf("/");
  if (slash <= 0 || slash === selector.length - 1) return undefined;
  return { provider: selector.slice(0, slash), id: selector.slice(slash + 1) };
}

export function supportsThinking(model: ExtensionContext["model"], level: ThinkingLevelName): boolean {
  if (!model) return false;
  if (level === "off") return true;
  const candidate = model as unknown as { reasoning?: boolean; thinkingLevelMap?: Record<string, string | null | undefined> };
  if (!candidate.reasoning) return false;
  const mapped = candidate.thinkingLevelMap?.[level];
  if (mapped === null) return false;
  if ((level === "xhigh" || level === "max") && mapped === undefined) return false;
  return true;
}

export function resolveModelSelector(ctx: ExtensionContext, role: string, selector: string): ExtensionContext["model"] {
  let model: ExtensionContext["model"];
  if (selector === "inherit-parent" || selector === "auto") model = ctx.model;
  else {
    const parsed = parseSelector(selector);
    if (!parsed) throw new Error(`Invalid model selector for ${role}: ${selector}. Use provider/model, inherit-parent, or auto.`);
    model = ctx.modelRegistry.find(parsed.provider, parsed.id);
    if (!model) throw new Error(`Model for ${role} is not available in this Pi session: ${selector}`);
  }

  return model;
}

export function resolveRoleModel(ctx: ExtensionContext, role: string, explicit?: string, taskThinking?: ThinkingLevelName): ResolvedModel {
  const config = loadModels();
  const selector = explicit?.trim() || config.roles[role] || "inherit-parent";
  const model = resolveModelSelector(ctx, role, selector);
  const configuredThinking = taskThinking ?? config.thinkingLevel;
  const thinkingLevel = configuredThinking === "inherit-parent" ? ctx.thinkingLevel : configuredThinking;
  // Explicit pstack reasoning choices fail closed. `inherit-parent` intentionally delegates
  // compatibility/clamping to Pi's native AgentSession, just as the parent session does.
  if (configuredThinking !== "inherit-parent" && thinkingLevel && model && !supportsThinking(model, thinkingLevel as ThinkingLevelName)) {
    throw new Error(`Configured pstack child reasoning level ${thinkingLevel} is not supported by ${model.provider}/${model.id}. Run /setup-pstack and choose another level or inherit-parent.`);
  }
  return { selector, model, thinkingLevel };
}

export function availableModelSelectors(ctx: ExtensionContext): string[] {
  const source = ctx.scopedModels.length ? ctx.scopedModels.map((x) => x.model) : ctx.modelRegistry.getAvailable();
  return [...new Set<string>(source.map((m: {provider:string; id:string}) => `${m.provider}/${m.id}`))].sort();
}
