import type { DeploymentSchemaNode } from "../profile-types.js";
import type { DeploymentLocaleKey } from "./deployment-locales.js";
export const CONFIG_MODULES = ["run", "routes", "workflow", "subagents", "permissions", "other", "state"] as const;
export type ConfigModule = typeof CONFIG_MODULES[number];
export const moduleTitle = (module: ConfigModule): DeploymentLocaleKey => `module:${module}`;
export function moduleFor(path: string): Exclude<ConfigModule, "state"> {
  const key = path.split(".")[0];
  if (["defaultActive", "modules", "modelParameters", "runtime"].includes(key)) return "run";
  if (["roleRouting", "runtimePolicy", "runtimeRecovery"].includes(key)) return "routes";
  if (["workflow", "roles", "skills", "presets", "businessLocale", "locale", "promptOrder", "plannerRootEnabled"].includes(key)) return "workflow";
  if (key === "subagents") return "subagents";
  if (["permissionControl", "guards"].includes(key)) return "permissions";
  return "other";
}
export function editableConfigField(key: string, layer: "global" | "profile"): boolean {
  return !["lsp", "modeName", "section"].includes(key)
    && !(key === "modules" && layer === "profile") && !(key === "runtime" && layer === "global");
}
export function moduleFields(schema: DeploymentSchemaNode, module: ConfigModule, layer: "global" | "profile"): Array<[string, DeploymentSchemaNode]> {
  return Object.entries(schema.fields ?? {}).filter(([key]) => editableConfigField(key, layer) && moduleFor(key) === module);
}
