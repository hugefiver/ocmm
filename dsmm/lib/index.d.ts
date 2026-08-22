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
}>>;
export type { DeepworkSessionEventMap } from "./dsh-events.js";
export declare function apply(ctx: DshContext, config?: Config): void;
export default apply;
//# sourceMappingURL=index.d.ts.map