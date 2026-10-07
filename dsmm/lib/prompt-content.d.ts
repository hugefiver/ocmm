import type { DsmmDelegationGroup, DsmmRoleMode } from "./roles.js";
export declare function readPromptAsset(path: string): string;
export interface SourceRoleContent {
    id: string;
    sourceId: string;
    kind: "role" | "category";
    name: string;
    description: string;
    order: number;
    mode: DsmmRoleMode;
    enabledByDefault: boolean;
    access: "read-only" | "write";
    delegation: DsmmDelegationGroup;
    allowedChildren: string[];
    childBuilderAllowedChildren?: string[];
    promptArtifact: string | null;
    terminalArtifact: string;
}
export declare const SOURCE_ROLE_CATALOG: readonly SourceRoleContent[];
export declare function splitCategory(text: string): {
    base: string;
    calibrations: Map<string, string>;
};
export declare function buildRolePersona(role: SourceRoleContent): string;
//# sourceMappingURL=prompt-content.d.ts.map