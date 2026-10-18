import type { DsmmInvocationView } from "../profile-types.js";
import type { ToolArgs } from "@deepseek-ai/dsh-client-ui-conversation/client";
/** Presentation keys only; this table does not describe callable admission. */
export declare const roleToolKeys: {
    readonly dsmm_planner: "dsmm-planner";
    readonly dsmm_plan_critic: "dsmm-plan-critic";
    readonly dsmm_builder: "dsmm-builder";
    readonly dsmm_reviewer: "dsmm-reviewer";
    readonly dsmm_oracle: "dsmm-oracle";
    readonly dsmm_oracle_2nd: "dsmm-oracle-2nd";
    readonly dsmm_code_search: "dsmm-code-search";
    readonly dsmm_doc_search: "dsmm-doc-search";
    readonly dsmm_clarifier: "dsmm-clarifier";
    readonly dsmm_media_reader: "dsmm-media-reader";
};
export declare function roleToolArguments(raw: string): Record<string, unknown> | undefined;
export declare function requestedRoleTool(toolName: string, raw: string): {
    readonly kind: "role" | "category";
    readonly target: string | undefined;
    readonly level: string | undefined;
    readonly description: string | undefined;
};
/** Read during render: the native owner republishes changes to these lazy answers. */
export declare function preparingRoleTool(toolName: string, args: ToolArgs): {
    requested: {
        readonly kind: "role" | "category";
        readonly target: string | undefined;
        readonly level: string | undefined;
        readonly description: string | undefined;
    };
    preview: string;
};
export declare function actualRoleTool(toolName: string, meta: unknown, failed: boolean): DsmmInvocationView | undefined;
export declare function roleToolDisplay(target: string): string;
//# sourceMappingURL=RoleToolView-data.d.ts.map