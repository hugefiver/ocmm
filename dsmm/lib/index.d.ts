import type { DshContext } from "./dsh-types.js";
import type { DsmmPluginConfig } from "./settings.js";
export declare const name = "dsmm";
export declare const inject: readonly ["systemPrompt"];
export type Config = DsmmPluginConfig;
export declare const Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
    modeName: import("@deepseek-ai/schemastery").default<string, string>;
    section: import("@deepseek-ai/schemastery").default<string, string>;
    defaultActive: import("@deepseek-ai/schemastery").default<boolean, boolean>;
    promptOrder: import("@deepseek-ai/schemastery").default<number, number>;
    deepseekV4ProCalibration: import("@deepseek-ai/schemastery").default<"off" | "auto" | "strict", "off" | "auto" | "strict">;
    skills: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        brainstorming: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "writing-plans": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "requesting-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "receiving-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        brainstorming: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "writing-plans": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "requesting-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "receiving-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>>;
    roles: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        "dsmm-orchestrator": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-planner": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-plan-critic": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-reviewer": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-code-search": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-doc-search": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-clarifier": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-media-reader": import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        "dsmm-orchestrator": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-planner": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-plan-critic": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-reviewer": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-code-search": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-doc-search": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-clarifier": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-media-reader": import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>>;
    presets: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        materialize: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        root: import("@deepseek-ai/schemastery").default<string, string>;
    }>, Schemastery.ObjectT<{
        materialize: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        root: import("@deepseek-ai/schemastery").default<string, string>;
    }>>;
}>, Schemastery.ObjectT<{
    modeName: import("@deepseek-ai/schemastery").default<string, string>;
    section: import("@deepseek-ai/schemastery").default<string, string>;
    defaultActive: import("@deepseek-ai/schemastery").default<boolean, boolean>;
    promptOrder: import("@deepseek-ai/schemastery").default<number, number>;
    deepseekV4ProCalibration: import("@deepseek-ai/schemastery").default<"off" | "auto" | "strict", "off" | "auto" | "strict">;
    skills: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        brainstorming: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "writing-plans": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "requesting-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "receiving-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        brainstorming: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "writing-plans": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "requesting-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "receiving-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>>;
    roles: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        "dsmm-orchestrator": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-planner": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-plan-critic": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-reviewer": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-code-search": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-doc-search": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-clarifier": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-media-reader": import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        "dsmm-orchestrator": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-planner": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-plan-critic": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-reviewer": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-code-search": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-doc-search": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-clarifier": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dsmm-media-reader": import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>>;
    presets: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        materialize: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        root: import("@deepseek-ai/schemastery").default<string, string>;
    }>, Schemastery.ObjectT<{
        materialize: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        root: import("@deepseek-ai/schemastery").default<string, string>;
    }>>;
}>>;
export type { DeepworkSessionEventMap } from "./dsh-events.js";
export type { DsmmRoleDefinition, DsmmRoleId } from "./roles.js";
export { DSMM_ROLE_IDS, DSMM_ROLES, isDsmmRoleId, renderAgentCordis, renderPresetMetadata } from "./roles.js";
export { DSMM_MANAGED_PRESET_MARKER, materializeRolePresets, reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
export { isRoleEnabled } from "./settings.js";
export declare function apply(ctx: DshContext, config?: Config): void;
export default apply;
//# sourceMappingURL=index.d.ts.map