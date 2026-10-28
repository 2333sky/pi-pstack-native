import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevelName } from "../runtime/types.js";
export type ResolvedModel = {
    requestedSelector: string;
    selector: string;
    model: ExtensionContext["model"];
    thinkingLevel: ExtensionContext["thinkingLevel"] | ThinkingLevelName | undefined;
    notes: string[];
};
export declare function supportsThinking(model: ExtensionContext["model"], level: ThinkingLevelName): boolean;
export declare function lowerSupportedThinking(model: ExtensionContext['model'], level: ThinkingLevelName): ThinkingLevelName | undefined;
/** Prefer a known family different from the parent; never infer a family from provider names. */
export declare function selectJudgeFromPool(ctx: ExtensionContext, pool: string[]): {
    model: string;
    notes: string[];
};
export declare function resolveModelSelector(ctx: ExtensionContext, role: string, selector: string): ExtensionContext["model"];
export declare function resolveRoleModel(ctx: ExtensionContext, role: string, explicit?: string, taskThinking?: ThinkingLevelName): ResolvedModel;
export declare function availableModelSelectors(ctx: ExtensionContext): string[];
