export const CONFIG_MODULES = ["run", "routes", "workflow", "subagents", "permissions", "other", "state"];
export const moduleTitle = (module) => `module:${module}`;
export function moduleFor(path) {
    const key = path.split(".")[0];
    if (["defaultActive", "modules", "modelParameters", "runtime"].includes(key))
        return "run";
    if (["roleRouting", "runtimePolicy", "runtimeRecovery"].includes(key))
        return "routes";
    if (["workflow", "roles", "skills", "presets", "businessLocale", "locale", "promptOrder", "plannerRootEnabled"].includes(key))
        return "workflow";
    if (key === "subagents")
        return "subagents";
    if (["permissionControl", "guards"].includes(key))
        return "permissions";
    return "other";
}
export function editableConfigField(key, layer) {
    return !["lsp", "modeName", "section"].includes(key)
        && !(key === "modules" && layer === "profile") && !(key === "runtime" && layer === "global");
}
export function moduleFields(schema, module, layer) {
    return Object.entries(schema.fields ?? {}).filter(([key]) => editableConfigField(key, layer) && moduleFor(key) === module);
}
//# sourceMappingURL=deployment-modules.js.map