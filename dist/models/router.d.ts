import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevelName } from "../runtime/types.js";
export type ResolvedModel = {
    selector: string;
    model: ExtensionContext["model"];
    thinkingLevel: ExtensionContext["thinkingLevel"] | ThinkingLevelName | undefined;
};
export declare function supportsThinking(model: ExtensionContext["model"], level: ThinkingLevelName): boolean;
export declare function resolveModelSelector(ctx: ExtensionContext, role: string, selector: string): ExtensionContext["model"];
export declare function resolveRoleModel(ctx: ExtensionContext, role: string, explicit?: string, taskThinking?: ThinkingLevelName): ResolvedModel;
export declare function availableModelSelectors(ctx: ExtensionContext): string[];
