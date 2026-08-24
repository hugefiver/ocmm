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
        "subagent-driven-development": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dispatching-parallel-agents": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "remove-ai-slops": import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        brainstorming: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "writing-plans": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "requesting-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "receiving-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "subagent-driven-development": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dispatching-parallel-agents": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "remove-ai-slops": import("@deepseek-ai/schemastery").default<boolean, boolean>;
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
    workflow: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        strictGates: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        reviewCap: import("@deepseek-ai/schemastery").default<number, number>;
        finalReviewPolicy: import("@deepseek-ai/schemastery").default<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>, Schemastery.ObjectT<{
        strictGates: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        reviewCap: import("@deepseek-ai/schemastery").default<number, number>;
        finalReviewPolicy: import("@deepseek-ai/schemastery").default<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>>;
    guards: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        scope: import("@deepseek-ai/schemastery").default<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        gitWriteGuard: import("@deepseek-ai/schemastery").default<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxInlineBytes: import("@deepseek-ai/schemastery").default<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxInlineBytes: import("@deepseek-ai/schemastery").default<number, number>;
        }>>;
        planFormatValidation: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        questionLabelHelper: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxLabelChars: import("@deepseek-ai/schemastery").default<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxLabelChars: import("@deepseek-ai/schemastery").default<number, number>;
        }>>;
        todoDisciplineHelper: import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        scope: import("@deepseek-ai/schemastery").default<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        gitWriteGuard: import("@deepseek-ai/schemastery").default<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxInlineBytes: import("@deepseek-ai/schemastery").default<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxInlineBytes: import("@deepseek-ai/schemastery").default<number, number>;
        }>>;
        planFormatValidation: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        questionLabelHelper: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxLabelChars: import("@deepseek-ai/schemastery").default<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxLabelChars: import("@deepseek-ai/schemastery").default<number, number>;
        }>>;
        todoDisciplineHelper: import("@deepseek-ai/schemastery").default<boolean, boolean>;
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
        "subagent-driven-development": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dispatching-parallel-agents": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "remove-ai-slops": import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        brainstorming: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "writing-plans": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "requesting-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "receiving-code-review": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "subagent-driven-development": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "dispatching-parallel-agents": import("@deepseek-ai/schemastery").default<boolean, boolean>;
        "remove-ai-slops": import("@deepseek-ai/schemastery").default<boolean, boolean>;
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
    workflow: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        strictGates: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        reviewCap: import("@deepseek-ai/schemastery").default<number, number>;
        finalReviewPolicy: import("@deepseek-ai/schemastery").default<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>, Schemastery.ObjectT<{
        strictGates: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        reviewCap: import("@deepseek-ai/schemastery").default<number, number>;
        finalReviewPolicy: import("@deepseek-ai/schemastery").default<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>>;
    guards: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
        scope: import("@deepseek-ai/schemastery").default<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        gitWriteGuard: import("@deepseek-ai/schemastery").default<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxInlineBytes: import("@deepseek-ai/schemastery").default<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxInlineBytes: import("@deepseek-ai/schemastery").default<number, number>;
        }>>;
        planFormatValidation: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        questionLabelHelper: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxLabelChars: import("@deepseek-ai/schemastery").default<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxLabelChars: import("@deepseek-ai/schemastery").default<number, number>;
        }>>;
        todoDisciplineHelper: import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        scope: import("@deepseek-ai/schemastery").default<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        gitWriteGuard: import("@deepseek-ai/schemastery").default<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxInlineBytes: import("@deepseek-ai/schemastery").default<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxInlineBytes: import("@deepseek-ai/schemastery").default<number, number>;
        }>>;
        planFormatValidation: import("@deepseek-ai/schemastery").default<boolean, boolean>;
        questionLabelHelper: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxLabelChars: import("@deepseek-ai/schemastery").default<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: import("@deepseek-ai/schemastery").default<boolean, boolean>;
            maxLabelChars: import("@deepseek-ai/schemastery").default<number, number>;
        }>>;
        todoDisciplineHelper: import("@deepseek-ai/schemastery").default<boolean, boolean>;
    }>>;
}>>;
export type { DeepworkSessionEventMap } from "./dsh-events.js";
export type { DsmmRoleDefinition, DsmmRoleId } from "./roles.js";
export { DSMM_ROLE_IDS, DSMM_ROLES, isDsmmRoleId, renderAgentCordis, renderPresetMetadata } from "./roles.js";
export { DSMM_MANAGED_PRESET_MARKER, materializeRolePresets, reconcileRolePresets, resolveManagedPresetRoot } from "./preset-materializer.js";
export { DSMM_GUARD_PREFIX, decidePostToolExecution, decidePreToolExecution, isSafetyScopeActive, registerSafetyGuards, truncateTextMiddle } from "./guards.js";
export { DSMM_SKILL_NAMES, DEFAULT_DSMM_SETTINGS, MVP_SKILL_NAMES, isRoleEnabled, resolveConfig, registerSettings } from "./settings.js";
export type { DsmmFinalReviewPolicy, DsmmGitWritePolicy, DsmmGuardScope, DsmmGuardSettings, DsmmPluginConfig, DsmmSettings, DsmmSkillName, DsmmWorkflowSettings, MvpSkillName } from "./settings.js";
export { DEEPWORK_MODE_EVENT, DeepworkModeController, hasOpenTurn, isDeepworkActive } from "./state.js";
export declare function apply(ctx: DshContext, config?: Config): void;
export default apply;
//# sourceMappingURL=index.d.ts.map