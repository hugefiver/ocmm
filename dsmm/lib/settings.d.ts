import Schema from "@deepseek-ai/schemastery";
import type { DshContext } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
export type DeepseekCalibration = "off" | "auto" | "strict";
export type DsmmFinalReviewPolicy = "simple-oracle-complex-reviewer" | "reviewer-only" | "off";
export type DsmmGuardScope = "deepwork-or-dsmm-agent" | "always" | "off";
export type DsmmGitWritePolicy = "ask" | "deny" | "off";
export declare const DSMM_SKILL_NAMES: readonly ["brainstorming", "writing-plans", "requesting-code-review", "receiving-code-review", "subagent-driven-development", "dispatching-parallel-agents", "remove-ai-slops"];
export declare const MVP_SKILL_NAMES: readonly ["brainstorming", "writing-plans", "requesting-code-review", "receiving-code-review", "subagent-driven-development", "dispatching-parallel-agents", "remove-ai-slops"];
export type DsmmSkillName = (typeof DSMM_SKILL_NAMES)[number];
export type MvpSkillName = DsmmSkillName;
export interface DsmmWorkflowSettings {
    strictGates: boolean;
    reviewCap: number;
    finalReviewPolicy: DsmmFinalReviewPolicy;
}
export interface DsmmPresetSettings {
    materialize: boolean;
    root?: string;
}
export interface DsmmGuardSettings {
    scope: DsmmGuardScope;
    shellCommandSafety: boolean;
    gitWriteGuard: DsmmGitWritePolicy;
    toolOutputTruncation: {
        enabled: boolean;
        maxInlineBytes: number;
    };
    planFormatValidation: boolean;
    questionLabelHelper: {
        enabled: boolean;
        maxLabelChars: number;
    };
    todoDisciplineHelper: boolean;
}
type DsmmGuardConfig = Partial<Omit<DsmmGuardSettings, "toolOutputTruncation" | "questionLabelHelper">> & {
    toolOutputTruncation?: Partial<DsmmGuardSettings["toolOutputTruncation"]>;
    questionLabelHelper?: Partial<DsmmGuardSettings["questionLabelHelper"]>;
};
export interface DsmmPluginConfig {
    modeName?: string;
    section?: string;
    deepseekV4ProCalibration?: DeepseekCalibration;
    defaultActive?: boolean;
    promptOrder?: number;
    skills?: Partial<Record<DsmmSkillName, boolean>>;
    roles?: Partial<Record<DsmmRoleId, boolean>>;
    presets?: Partial<DsmmPresetSettings>;
    workflow?: Partial<DsmmWorkflowSettings>;
    guards?: DsmmGuardConfig;
}
export interface DsmmSettings {
    modeName: string;
    defaultActive: boolean;
    promptOrder: number;
    deepseekV4ProCalibration: DeepseekCalibration;
    skills: Record<DsmmSkillName, boolean>;
    roles: Record<DsmmRoleId, boolean>;
    presets: DsmmPresetSettings;
    workflow: DsmmWorkflowSettings;
    guards: DsmmGuardSettings;
}
export declare const DSMM_SETTINGS_NAMESPACE = "dsmm";
export interface RegisterSettingsOptions {
    onChange?: (settings: DsmmSettings) => void;
}
export declare const DEFAULT_DSMM_SETTINGS: DsmmSettings;
export declare const DSMM_CONFIG_SCHEMA: Schema<Schemastery.ObjectS<{
    modeName: Schema<string, string>;
    section: Schema<string, string>;
    defaultActive: Schema<boolean, boolean>;
    promptOrder: Schema<number, number>;
    deepseekV4ProCalibration: Schema<"off" | "auto" | "strict", "off" | "auto" | "strict">;
    skills: Schema<Schemastery.ObjectS<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
        "subagent-driven-development": Schema<boolean, boolean>;
        "dispatching-parallel-agents": Schema<boolean, boolean>;
        "remove-ai-slops": Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
        "subagent-driven-development": Schema<boolean, boolean>;
        "dispatching-parallel-agents": Schema<boolean, boolean>;
        "remove-ai-slops": Schema<boolean, boolean>;
    }>>;
    roles: Schema<Schemastery.ObjectS<{
        "dsmm-orchestrator": Schema<boolean, boolean>;
        "dsmm-planner": Schema<boolean, boolean>;
        "dsmm-plan-critic": Schema<boolean, boolean>;
        "dsmm-reviewer": Schema<boolean, boolean>;
        "dsmm-code-search": Schema<boolean, boolean>;
        "dsmm-doc-search": Schema<boolean, boolean>;
        "dsmm-clarifier": Schema<boolean, boolean>;
        "dsmm-media-reader": Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        "dsmm-orchestrator": Schema<boolean, boolean>;
        "dsmm-planner": Schema<boolean, boolean>;
        "dsmm-plan-critic": Schema<boolean, boolean>;
        "dsmm-reviewer": Schema<boolean, boolean>;
        "dsmm-code-search": Schema<boolean, boolean>;
        "dsmm-doc-search": Schema<boolean, boolean>;
        "dsmm-clarifier": Schema<boolean, boolean>;
        "dsmm-media-reader": Schema<boolean, boolean>;
    }>>;
    presets: Schema<Schemastery.ObjectS<{
        materialize: Schema<boolean, boolean>;
        root: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        materialize: Schema<boolean, boolean>;
        root: Schema<string, string>;
    }>>;
    workflow: Schema<Schemastery.ObjectS<{
        strictGates: Schema<boolean, boolean>;
        reviewCap: Schema<number, number>;
        finalReviewPolicy: Schema<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>, Schemastery.ObjectT<{
        strictGates: Schema<boolean, boolean>;
        reviewCap: Schema<number, number>;
        finalReviewPolicy: Schema<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>>;
    guards: Schema<Schemastery.ObjectS<{
        scope: Schema<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: Schema<boolean, boolean>;
        gitWriteGuard: Schema<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>>;
        planFormatValidation: Schema<boolean, boolean>;
        questionLabelHelper: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>>;
        todoDisciplineHelper: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        scope: Schema<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: Schema<boolean, boolean>;
        gitWriteGuard: Schema<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>>;
        planFormatValidation: Schema<boolean, boolean>;
        questionLabelHelper: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>>;
        todoDisciplineHelper: Schema<boolean, boolean>;
    }>>;
}>, Schemastery.ObjectT<{
    modeName: Schema<string, string>;
    section: Schema<string, string>;
    defaultActive: Schema<boolean, boolean>;
    promptOrder: Schema<number, number>;
    deepseekV4ProCalibration: Schema<"off" | "auto" | "strict", "off" | "auto" | "strict">;
    skills: Schema<Schemastery.ObjectS<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
        "subagent-driven-development": Schema<boolean, boolean>;
        "dispatching-parallel-agents": Schema<boolean, boolean>;
        "remove-ai-slops": Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
        "subagent-driven-development": Schema<boolean, boolean>;
        "dispatching-parallel-agents": Schema<boolean, boolean>;
        "remove-ai-slops": Schema<boolean, boolean>;
    }>>;
    roles: Schema<Schemastery.ObjectS<{
        "dsmm-orchestrator": Schema<boolean, boolean>;
        "dsmm-planner": Schema<boolean, boolean>;
        "dsmm-plan-critic": Schema<boolean, boolean>;
        "dsmm-reviewer": Schema<boolean, boolean>;
        "dsmm-code-search": Schema<boolean, boolean>;
        "dsmm-doc-search": Schema<boolean, boolean>;
        "dsmm-clarifier": Schema<boolean, boolean>;
        "dsmm-media-reader": Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        "dsmm-orchestrator": Schema<boolean, boolean>;
        "dsmm-planner": Schema<boolean, boolean>;
        "dsmm-plan-critic": Schema<boolean, boolean>;
        "dsmm-reviewer": Schema<boolean, boolean>;
        "dsmm-code-search": Schema<boolean, boolean>;
        "dsmm-doc-search": Schema<boolean, boolean>;
        "dsmm-clarifier": Schema<boolean, boolean>;
        "dsmm-media-reader": Schema<boolean, boolean>;
    }>>;
    presets: Schema<Schemastery.ObjectS<{
        materialize: Schema<boolean, boolean>;
        root: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        materialize: Schema<boolean, boolean>;
        root: Schema<string, string>;
    }>>;
    workflow: Schema<Schemastery.ObjectS<{
        strictGates: Schema<boolean, boolean>;
        reviewCap: Schema<number, number>;
        finalReviewPolicy: Schema<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>, Schemastery.ObjectT<{
        strictGates: Schema<boolean, boolean>;
        reviewCap: Schema<number, number>;
        finalReviewPolicy: Schema<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>>;
    guards: Schema<Schemastery.ObjectS<{
        scope: Schema<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: Schema<boolean, boolean>;
        gitWriteGuard: Schema<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>>;
        planFormatValidation: Schema<boolean, boolean>;
        questionLabelHelper: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>>;
        todoDisciplineHelper: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        scope: Schema<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: Schema<boolean, boolean>;
        gitWriteGuard: Schema<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>>;
        planFormatValidation: Schema<boolean, boolean>;
        questionLabelHelper: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>>;
        todoDisciplineHelper: Schema<boolean, boolean>;
    }>>;
}>>;
export declare const DSMM_SETTINGS_SCHEMA: Schema<Schemastery.ObjectS<{
    modeName: Schema<string, string>;
    defaultActive: Schema<boolean, boolean>;
    promptOrder: Schema<number, number>;
    deepseekV4ProCalibration: Schema<"off" | "auto" | "strict", "off" | "auto" | "strict">;
    skills: Schema<Schemastery.ObjectS<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
        "subagent-driven-development": Schema<boolean, boolean>;
        "dispatching-parallel-agents": Schema<boolean, boolean>;
        "remove-ai-slops": Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
        "subagent-driven-development": Schema<boolean, boolean>;
        "dispatching-parallel-agents": Schema<boolean, boolean>;
        "remove-ai-slops": Schema<boolean, boolean>;
    }>>;
    roles: Schema<Schemastery.ObjectS<{
        "dsmm-orchestrator": Schema<boolean, boolean>;
        "dsmm-planner": Schema<boolean, boolean>;
        "dsmm-plan-critic": Schema<boolean, boolean>;
        "dsmm-reviewer": Schema<boolean, boolean>;
        "dsmm-code-search": Schema<boolean, boolean>;
        "dsmm-doc-search": Schema<boolean, boolean>;
        "dsmm-clarifier": Schema<boolean, boolean>;
        "dsmm-media-reader": Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        "dsmm-orchestrator": Schema<boolean, boolean>;
        "dsmm-planner": Schema<boolean, boolean>;
        "dsmm-plan-critic": Schema<boolean, boolean>;
        "dsmm-reviewer": Schema<boolean, boolean>;
        "dsmm-code-search": Schema<boolean, boolean>;
        "dsmm-doc-search": Schema<boolean, boolean>;
        "dsmm-clarifier": Schema<boolean, boolean>;
        "dsmm-media-reader": Schema<boolean, boolean>;
    }>>;
    presets: Schema<Schemastery.ObjectS<{
        materialize: Schema<boolean, boolean>;
        root: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        materialize: Schema<boolean, boolean>;
        root: Schema<string, string>;
    }>>;
    workflow: Schema<Schemastery.ObjectS<{
        strictGates: Schema<boolean, boolean>;
        reviewCap: Schema<number, number>;
        finalReviewPolicy: Schema<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>, Schemastery.ObjectT<{
        strictGates: Schema<boolean, boolean>;
        reviewCap: Schema<number, number>;
        finalReviewPolicy: Schema<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>>;
    guards: Schema<Schemastery.ObjectS<{
        scope: Schema<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: Schema<boolean, boolean>;
        gitWriteGuard: Schema<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>>;
        planFormatValidation: Schema<boolean, boolean>;
        questionLabelHelper: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>>;
        todoDisciplineHelper: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        scope: Schema<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: Schema<boolean, boolean>;
        gitWriteGuard: Schema<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>>;
        planFormatValidation: Schema<boolean, boolean>;
        questionLabelHelper: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>>;
        todoDisciplineHelper: Schema<boolean, boolean>;
    }>>;
}>, Schemastery.ObjectT<{
    modeName: Schema<string, string>;
    defaultActive: Schema<boolean, boolean>;
    promptOrder: Schema<number, number>;
    deepseekV4ProCalibration: Schema<"off" | "auto" | "strict", "off" | "auto" | "strict">;
    skills: Schema<Schemastery.ObjectS<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
        "subagent-driven-development": Schema<boolean, boolean>;
        "dispatching-parallel-agents": Schema<boolean, boolean>;
        "remove-ai-slops": Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
        "subagent-driven-development": Schema<boolean, boolean>;
        "dispatching-parallel-agents": Schema<boolean, boolean>;
        "remove-ai-slops": Schema<boolean, boolean>;
    }>>;
    roles: Schema<Schemastery.ObjectS<{
        "dsmm-orchestrator": Schema<boolean, boolean>;
        "dsmm-planner": Schema<boolean, boolean>;
        "dsmm-plan-critic": Schema<boolean, boolean>;
        "dsmm-reviewer": Schema<boolean, boolean>;
        "dsmm-code-search": Schema<boolean, boolean>;
        "dsmm-doc-search": Schema<boolean, boolean>;
        "dsmm-clarifier": Schema<boolean, boolean>;
        "dsmm-media-reader": Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        "dsmm-orchestrator": Schema<boolean, boolean>;
        "dsmm-planner": Schema<boolean, boolean>;
        "dsmm-plan-critic": Schema<boolean, boolean>;
        "dsmm-reviewer": Schema<boolean, boolean>;
        "dsmm-code-search": Schema<boolean, boolean>;
        "dsmm-doc-search": Schema<boolean, boolean>;
        "dsmm-clarifier": Schema<boolean, boolean>;
        "dsmm-media-reader": Schema<boolean, boolean>;
    }>>;
    presets: Schema<Schemastery.ObjectS<{
        materialize: Schema<boolean, boolean>;
        root: Schema<string, string>;
    }>, Schemastery.ObjectT<{
        materialize: Schema<boolean, boolean>;
        root: Schema<string, string>;
    }>>;
    workflow: Schema<Schemastery.ObjectS<{
        strictGates: Schema<boolean, boolean>;
        reviewCap: Schema<number, number>;
        finalReviewPolicy: Schema<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>, Schemastery.ObjectT<{
        strictGates: Schema<boolean, boolean>;
        reviewCap: Schema<number, number>;
        finalReviewPolicy: Schema<"off" | "simple-oracle-complex-reviewer" | "reviewer-only", "off" | "simple-oracle-complex-reviewer" | "reviewer-only">;
    }>>;
    guards: Schema<Schemastery.ObjectS<{
        scope: Schema<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: Schema<boolean, boolean>;
        gitWriteGuard: Schema<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>>;
        planFormatValidation: Schema<boolean, boolean>;
        questionLabelHelper: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>>;
        todoDisciplineHelper: Schema<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        scope: Schema<"off" | "deepwork-or-dsmm-agent" | "always", "off" | "deepwork-or-dsmm-agent" | "always">;
        shellCommandSafety: Schema<boolean, boolean>;
        gitWriteGuard: Schema<"deny" | "ask" | "off", "deny" | "ask" | "off">;
        toolOutputTruncation: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxInlineBytes: Schema<number, number>;
        }>>;
        planFormatValidation: Schema<boolean, boolean>;
        questionLabelHelper: Schema<Schemastery.ObjectS<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>, Schemastery.ObjectT<{
            enabled: Schema<boolean, boolean>;
            maxLabelChars: Schema<number, number>;
        }>>;
        todoDisciplineHelper: Schema<boolean, boolean>;
    }>>;
}>>;
export declare function resolveConfig(config?: DsmmPluginConfig): DsmmSettings;
export declare function isRoleEnabled(settings: DsmmSettings, role: DsmmRoleId): boolean;
export declare function resolveGuardSettings(config: DsmmPluginConfig["guards"]): DsmmGuardSettings;
export declare function registerSettings(ctx: DshContext, config?: DsmmPluginConfig, options?: RegisterSettingsOptions): () => DsmmSettings;
export {};
//# sourceMappingURL=settings.d.ts.map