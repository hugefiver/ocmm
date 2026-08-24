export declare const DSMM_ROLE_IDS: readonly ["dsmm-orchestrator", "dsmm-planner", "dsmm-plan-critic", "dsmm-reviewer", "dsmm-code-search", "dsmm-doc-search", "dsmm-clarifier", "dsmm-media-reader"];
export type DsmmRoleId = (typeof DSMM_ROLE_IDS)[number];
export interface DsmmRoleDefinition {
    id: DsmmRoleId;
    name: string;
    description: string;
    order: number;
    enabledByDefault: boolean;
    persona: string;
}
export declare const DSMM_ROLES: readonly DsmmRoleDefinition[];
export declare function isDsmmRoleId(value: unknown): value is DsmmRoleId;
export declare function renderAgentCordis(role: DsmmRoleDefinition, skills?: readonly DsmmSkillName[]): string;
export declare function renderPresetMetadata(role: DsmmRoleDefinition): string;
import type { DsmmSkillName } from "./skills.js";
//# sourceMappingURL=roles.d.ts.map