import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ModelConfig, ThinkingLevelName } from "../runtime/types.js";
/** Select a configured model without confusing task roles with permission profiles. */
export declare function selectTaskModel(config: ModelConfig, options: {
    model?: string;
    modelRole?: string;
    playbook?: string;
    profile: string;
}): string | undefined;
export type ResolvedModel = {
    requestedSelector: string;
    selector: string;
    model: ExtensionContext["model"];
    thinkingLevel: ExtensionContext["thinkingLevel"] | ThinkingLevelName | undefined;
    notes: string[];
};
export declare function supportsThinking(model: ExtensionContext["model"], level: ThinkingLevelName): boolean;
export declare function lowerSupportedThinking(model: ExtensionContext['model'], level: ThinkingLevelName): ThinkingLevelName | undefined;
/** Identify only recognizable model families; provider names alone do not establish family. */
export declare function modelFamily(selector: string): string | undefined;
/** Prefer a known family different from the parent; never infer a family from provider names. */
export declare function selectJudgeFromPool(ctx: ExtensionContext, pool: string[]): {
    model?: string;
    notes: string[];
};
export declare function resolveModelSelector(ctx: ExtensionContext, role: string, selector: string): ExtensionContext["model"];
export declare function resolveRoleModel(ctx: ExtensionContext, role: string, explicit?: string, taskThinking?: ThinkingLevelName): ResolvedModel;
export declare function availableModelSelectors(ctx: ExtensionContext): string[];
/** Suggest only models visible to this Pi session. Repeated seats are explicitly reported. */
export declare function suggestedPanels(ctx: ExtensionContext): Record<string, string[]>;
/** Drop unavailable configured seats, then retain the upstream minimum using a real survivor or parent. */
export declare function resolvePanelSeats(ctx: ExtensionContext, selectors: string[], minimum: number, notes: string[]): string[];
