import Schema from "@deepseek-ai/schemastery";
import type { DshContext } from "./dsh-types.js";
import type { DsmmRoleId } from "./roles.js";
export type DeepseekCalibration = "off" | "auto" | "strict";
export type DsmmFinalReviewPolicy = "simple-oracle-complex-reviewer" | "reviewer-only" | "off";
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
}>>;
export declare function resolveConfig(config?: DsmmPluginConfig): DsmmSettings;
export declare function isRoleEnabled(settings: DsmmSettings, role: DsmmRoleId): boolean;
export declare function registerSettings(ctx: DshContext, config?: DsmmPluginConfig, options?: RegisterSettingsOptions): () => DsmmSettings;
//# sourceMappingURL=settings.d.ts.map