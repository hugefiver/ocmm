import { parsePermissionRulesSave, permissionRevision, permissionRuleRow } from "./permission-rules.js";
import { resolvePermissionControl } from "./permission-settings.js";
function fail() { throw new TypeError("Invalid permission DTO."); }
function text(value, max = 512) {
    if (typeof value !== "string" || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value))
        fail();
    return value;
}
export function parsePermissionSessionId(value) { return text(value, 256); }
function parseRuntime(value) {
    const runtime = permissionRuleRow(value, ["savedRevision", "runtimeRevision", "state", "mounted", "restartRequired"]);
    if (!["synced", "updating", "unsynced"].includes(runtime.state) || typeof runtime.mounted !== "boolean" || typeof runtime.restartRequired !== "boolean")
        fail();
    return { savedRevision: permissionRevision(runtime.savedRevision), runtimeRevision: permissionRevision(runtime.runtimeRevision), state: runtime.state, mounted: runtime.mounted, restartRequired: runtime.restartRequired };
}
function parseCapabilities(value) {
    const input = permissionRuleRow(value, ["limits", "runtime", "tools"]);
    const limits = permissionRuleRow(input.limits, ["outsideReads", "finalInode", "scopedMemory", "webFetch", "webSearchDestinations", "proxyAddressBinding", "shellSockets", "providerAuthMcp"]);
    if (limits.outsideReads !== "tool-call-boundary" || limits.finalInode !== false || limits.scopedMemory !== "not-provided-by-native-rules"
        || limits.webFetch !== "native-public-only" || limits.webSearchDestinations !== "unsupported" || limits.proxyAddressBinding !== "native-proxy-dependent"
        || limits.shellSockets !== "native-executor-dependent" || limits.providerAuthMcp !== "not-covered")
        fail();
    if (!Array.isArray(input.tools) || input.tools.length > 1024)
        fail();
    const tools = [];
    const names = new Set();
    for (const value of input.tools) {
        const tool = permissionRuleRow(value, ["name", "kind", "approval", "scopedMemory"]), name = text(tool.name);
        if (!["read", "glob", "grep", "shell", "webSearch", "webFetch"].includes(tool.kind) || tool.approval !== "native-once" || tool.scopedMemory !== false || names.has(name))
            fail();
        names.add(name);
        tools.push({ name, kind: tool.kind, approval: "native-once", scopedMemory: false });
    }
    return { limits: { outsideReads: "tool-call-boundary", finalInode: false, scopedMemory: "not-provided-by-native-rules", webFetch: "native-public-only",
            webSearchDestinations: "unsupported", proxyAddressBinding: "native-proxy-dependent", shellSockets: "native-executor-dependent", providerAuthMcp: "not-covered" }, runtime: parseRuntime(input.runtime), tools };
}
export function parsePermissionRulesResult(value) {
    const input = permissionRuleRow(value, ["snapshot", "runtime"], ["capabilities"]), snapshot = permissionRuleRow(input.snapshot, ["revision", "policy"]);
    return { snapshot: { revision: permissionRevision(snapshot.revision), policy: resolvePermissionControl(snapshot.policy) }, runtime: parseRuntime(input.runtime),
        ...Object.hasOwn(input, "capabilities") ? { capabilities: parseCapabilities(input.capabilities) } : {} };
}
const codec = (name, parse) => ({ mode: "strict", typeSymbol: `@dsmm/dsmm#${name}`, create: () => ({ parse }) });
function descriptor(method, result, request) {
    return { id: `@dsmm/dsmm-permissions#dsmmPermissions/${method}`, service: "dsmmPermissions", namespace: "dsmmPermissions", method, invocation: { kind: "direct" },
        parameters: [{ name: "sessionId", wire: "sessionId", source: "json", codec: codec("PermissionSessionId", parsePermissionSessionId) },
            ...request === undefined ? [] : [{ name: "request", wire: "request", source: "json", codec: request }]], result };
}
export const PERMISSION_REMOTE = { package: "@dsmm/dsmm-permissions", descriptors: [
        descriptor("describeRules", codec("PermissionRulesResult", parsePermissionRulesResult)),
        descriptor("saveRules", codec("PermissionRulesResult", parsePermissionRulesResult), codec("PermissionRulesSaveRequest", parsePermissionRulesSave)),
    ] };
export const PERMISSION_HOST = { package: PERMISSION_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: PERMISSION_REMOTE.descriptors };
//# sourceMappingURL=permission-remote.js.map