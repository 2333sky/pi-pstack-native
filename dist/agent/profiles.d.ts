import type { AgentProfile } from "../runtime/types.js";
export declare const PROFILES: Record<string, AgentProfile>;
export declare function getProfile(name: string): AgentProfile;
