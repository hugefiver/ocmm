import type { DeploymentSchemaNode } from "../profile-types.js";
import type { DeploymentLocaleKey } from "./deployment-locales.js";
export declare const CONFIG_MODULES: readonly ["run", "routes", "workflow", "subagents", "permissions", "other", "state"];
export type ConfigModule = typeof CONFIG_MODULES[number];
export declare const moduleTitle: (module: ConfigModule) => DeploymentLocaleKey;
export declare function moduleFor(path: string): Exclude<ConfigModule, "state">;
export declare function editableConfigField(key: string, layer: "global" | "profile"): boolean;
export declare function moduleFields(schema: DeploymentSchemaNode, module: ConfigModule, layer: "global" | "profile"): Array<[string, DeploymentSchemaNode]>;
//# sourceMappingURL=deployment-modules.d.ts.map