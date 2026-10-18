import { parseDsmmInvocationView } from "../profile-remote.js";
/** Presentation keys only; this table does not describe callable admission. */
export const roleToolKeys = {
    dsmm_planner: "dsmm-planner", dsmm_plan_critic: "dsmm-plan-critic", dsmm_builder: "dsmm-builder",
    dsmm_reviewer: "dsmm-reviewer", dsmm_oracle: "dsmm-oracle", dsmm_oracle_2nd: "dsmm-oracle-2nd",
    dsmm_code_search: "dsmm-code-search", dsmm_doc_search: "dsmm-doc-search", dsmm_clarifier: "dsmm-clarifier",
    dsmm_media_reader: "dsmm-media-reader",
};
const categories = new Set(["dsmm-creative", "dsmm-frontend", "dsmm-hard-reasoning", "dsmm-research", "dsmm-quick", "dsmm-coding", "dsmm-normal-task", "dsmm-complex", "dsmm-deep", "dsmm-documenting", "dsmm-cross-cutting"]);
const roles = new Set(Object.values(roleToolKeys));
export function roleToolArguments(raw) {
    try {
        const value = JSON.parse(raw);
        return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
    }
    catch {
        return undefined;
    }
}
export function requestedRoleTool(toolName, raw) {
    const args = roleToolArguments(raw), kind = toolName === "dsmm_category" ? "category" : "role";
    const fixed = Object.hasOwn(roleToolKeys, toolName) ? roleToolKeys[toolName] : undefined;
    const candidate = fixed ?? args?.[kind];
    const target = typeof candidate === "string" && (kind === "category" ? categories : roles).has(candidate) ? candidate : undefined;
    const level = typeof args?.level === "string" && ["normal", "low", "high", "max"].includes(args.level) ? args.level : undefined;
    return { kind, target, level, description: typeof args?.description === "string" ? args.description : undefined };
}
/** Read during render: the native owner republishes changes to these lazy answers. */
export function preparingRoleTool(toolName, args) {
    const received = Object.fromEntries(args.keys().flatMap(key => {
        const value = args.text(key) ?? args.value(key);
        return value === undefined ? [] : [[key, value]];
    }));
    const complete = Object.fromEntries(Object.entries(received).filter(([key]) => args.complete(key)));
    return { requested: requestedRoleTool(toolName, args.invalid ? "" : JSON.stringify(complete)),
        preview: Object.keys(received).length === 0 ? "" : JSON.stringify(received, null, 2) };
}
export function actualRoleTool(toolName, meta, failed) {
    if (failed)
        return undefined;
    try {
        const value = parseDsmmInvocationView(meta);
        return (toolName === "dsmm_category" ? categories : roles).has(value.role) ? value : undefined;
    }
    catch {
        return undefined;
    }
}
export function roleToolDisplay(target) {
    return target.slice("dsmm-".length).split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
//# sourceMappingURL=RoleToolView-data.js.map