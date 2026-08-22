import Schema from "@deepseek-ai/schemastery";
import type { DshContext } from "./dsh-types.js";
export type DeepseekCalibration = "off" | "auto" | "strict";
export type MvpSkillName = "brainstorming" | "writing-plans" | "requesting-code-review" | "receiving-code-review";
export interface DsmmPluginConfig {
    modeName?: string;
    section?: string;
    deepseekV4ProCalibration?: DeepseekCalibration;
    defaultActive?: boolean;
    promptOrder?: number;
    skills?: Partial<Record<MvpSkillName, boolean>>;
}
export interface DsmmSettings {
    modeName: string;
    defaultActive: boolean;
    promptOrder: number;
    deepseekV4ProCalibration: DeepseekCalibration;
    skills: Record<MvpSkillName, boolean>;
}
export declare const DSMM_SETTINGS_NAMESPACE = "dsmm";
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
    }>, Schemastery.ObjectT<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
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
    }>, Schemastery.ObjectT<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
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
    }>, Schemastery.ObjectT<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
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
    }>, Schemastery.ObjectT<{
        brainstorming: Schema<boolean, boolean>;
        "writing-plans": Schema<boolean, boolean>;
        "requesting-code-review": Schema<boolean, boolean>;
        "receiving-code-review": Schema<boolean, boolean>;
    }>>;
}>>;
export declare function resolveConfig(config?: DsmmPluginConfig): DsmmSettings;
export declare function registerSettings(ctx: DshContext, config?: DsmmPluginConfig): () => DsmmSettings;
//# sourceMappingURL=settings.d.ts.map