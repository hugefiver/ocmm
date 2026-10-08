import { DSMM_RATE_LIMIT_BOUNDS, normalizeRateLimitOverrides, normalizeRateLimitPolicy, normalizeRoutingStrategy } from "./routing-policy.js";
const errorCodes = new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit", "busy", "maintenance", "disposed", "not-owned", "unavailable", "cancelled"]);
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const revisionPattern = /^[a-f0-9]{64}$/u;
const rolePattern = /^dsmm-(?:orchestrator|planner|plan-critic|builder|reviewer|oracle|oracle-2nd|creative|code-search|doc-search|clarifier|media-reader|frontend|hard-reasoning|research|quick|coding|normal-task|complex|deep|documenting|cross-cutting)$/u;
/** Shared wire grammar for native codec validation and local form feedback. */
export function isProfileId(value) {
    return typeof value === "string" && idPattern.test(value)
        && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu.test(value);
}
function fail(field) { throw new TypeError(`Invalid Deepwork profile wire field: ${field}`); }
function text(value, field, maximum = 1024) {
    if (typeof value !== "string" || value.length > maximum)
        fail(field);
    return value;
}
function id(value) {
    const result = text(value, "id", 64);
    if (!isProfileId(result))
        fail("id");
    return result;
}
function revision(value) {
    const result = text(value, "revision", 64);
    if (!revisionPattern.test(result))
        fail("revision");
    return result;
}
function selectionRevision(value) { return value === "absent" ? value : revision(value); }
/** Opaque native identities are never interpreted as paths. */
export function isNativeSessionId(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 256
        && !/[\u0000-\u001f\u007f]/u.test(value)
        && new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value)) === value;
}
function sessionId(value) {
    if (!isNativeSessionId(value))
        fail("sessionId");
    return value;
}
function boolean(value, field) {
    if (typeof value !== "boolean")
        fail(field);
    return value;
}
function integer(value, field, maximum = Number.MAX_SAFE_INTEGER) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum)
        fail(field);
    return value;
}
function routeText(value, field, maximum) {
    const result = text(value, field, maximum);
    if (result.trim() === "" || /[\u0000-\u001f\u007f]/u.test(result)
        || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(result)) !== result)
        fail(field);
    return result;
}
function role(value) {
    if (typeof value !== "string" || !rolePattern.test(value))
        fail("role");
    return value;
}
function object(value, required, optional = []) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        fail("object");
    const result = value;
    if (Object.keys(result).some((key) => !required.includes(key) && !optional.includes(key))
        || required.some((key) => !Object.hasOwn(result, key)))
        fail("object keys");
    return result;
}
function optional(value, key, parse) {
    return Object.hasOwn(value, key) ? { [key]: parse(value[key]) } : {};
}
function errorInfo(value) {
    const item = object(value, ["code", "message"], ["field"]);
    const code = text(item.code, "code");
    if (!errorCodes.has(code))
        fail("code");
    return { code: code, message: text(item.message, "message", 4096), ...optional(item, "field", (input) => text(input, "field", 256)) };
}
function readResult(value) {
    const item = object(value, ["id", "revision", "content"], ["label"]);
    return { id: id(item.id), revision: revision(item.revision), content: content(item.content), ...optional(item, "label", (input) => text(input, "label", 120)) };
}
function content(value) {
    const result = text(value, "content", 128 * 1024);
    if (new TextEncoder().encode(result).byteLength > 128 * 1024)
        fail("content");
    return result;
}
function snapshot(value) {
    const item = object(value, ["profiles", "selectedId", "appliedRevision", "selectionRevision"], ["selectionError", "roles", "editorDefaults", "origin", "readOnly", "writeRestriction"]);
    if (!Array.isArray(item.profiles) || item.profiles.length > 128)
        fail("profiles");
    return {
        profiles: item.profiles.map((input) => {
            const row = object(input, ["id", "revision"], ["label", "error"]);
            return { id: text(row.id, "id", 64), revision: row.revision === null ? null : revision(row.revision), ...optional(row, "label", (input) => text(input, "label", 120)), ...optional(row, "error", errorInfo) };
        }),
        selectedId: item.selectedId === null ? null : id(item.selectedId),
        appliedRevision: item.appliedRevision === null ? null : revision(item.appliedRevision),
        selectionRevision: item.selectionRevision === "unavailable" && Object.hasOwn(item, "selectionError") ? "unavailable" : selectionRevision(item.selectionRevision),
        ...optional(item, "selectionError", errorInfo),
        ...optional(item, "roles", (input) => {
            if (!Array.isArray(input) || input.length > 22)
                fail("roles");
            const result = input.map((value) => {
                const row = object(value, ["id", "label", "enabled"], ["runtimePolicy"]);
                return { id: role(row.id), label: text(row.label, "label", 120), enabled: boolean(row.enabled, "enabled"), ...optional(row, "runtimePolicy", (input) => {
                        const policy = object(input, [], ["strategy", "rateLimit"]);
                        return { ...optional(policy, "strategy", normalizeRoutingStrategy), ...optional(policy, "rateLimit", normalizeRateLimitOverrides) };
                    }) };
            });
            if (new Set(result.map((row) => row.id)).size !== result.length)
                fail("roles");
            return result;
        }),
        ...optional(item, "editorDefaults", runtimePolicy),
        ...optional(item, "origin", (input) => { if (!["central", "legacy", "explicit"].includes(String(input)))
            fail("origin"); return input; }),
        ...optional(item, "readOnly", (input) => boolean(input, "readOnly")),
        ...optional(item, "writeRestriction", (input) => text(input, "writeRestriction", 1024)),
    };
}
function rateLimit(value) {
    const item = object(value, Object.keys(DSMM_RATE_LIMIT_BOUNDS));
    return normalizeRateLimitPolicy(item);
}
function runtimePolicy(value) {
    const item = object(value, ["strategy", "rateLimit"]);
    return { strategy: normalizeRoutingStrategy(item.strategy), rateLimit: rateLimit(item.rateLimit) };
}
function rolePolicy(value) {
    const item = object(value, ["strategy", "rateLimit", "retries", "rateLimitFailures", "switches", "totalDelayMs"], ["role", "route"]);
    return {
        ...runtimePolicy({ strategy: item.strategy, rateLimit: item.rateLimit }),
        retries: integer(item.retries, "retries", 10),
        rateLimitFailures: integer(item.rateLimitFailures, "rateLimitFailures"),
        switches: integer(item.switches, "switches", 10),
        totalDelayMs: integer(item.totalDelayMs, "totalDelayMs", 120000),
        ...optional(item, "role", role),
        ...optional(item, "route", modelRoute),
    };
}
function modelRoute(value) {
    const route = object(value, ["provider", "model"], ["reasoningEffort"]);
    const provider = routeText(route.provider, "provider", 128);
    const model = routeText(route.model, "model", 512);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(provider) || model.includes("://"))
        fail("route");
    return { provider, model, ...optional(route, "reasoningEffort", (input) => routeText(input, "reasoningEffort", 64)) };
}
function selectionState(value) {
    const item = object(value, ["selectedId", "appliedRevision", "selectionRevision"]);
    return { selectedId: item.selectedId === null ? null : id(item.selectedId), appliedRevision: item.appliedRevision === null ? null : revision(item.appliedRevision), selectionRevision: selectionRevision(item.selectionRevision) };
}
function sessionSnapshot(value) {
    const item = object(value, ["sessionId", "globalDefault", "selection", "scope", "admissionEpoch", "switchAllowed"], ["admittedSelection", "switchUnavailableReason", "rolePolicy", "profileModel", "deepwork"]);
    if (typeof item.scope !== "string" || !["global-default", "session-override", "deployment-baseline"].includes(item.scope))
        fail("scope");
    return {
        sessionId: sessionId(item.sessionId), globalDefault: selectionState(item.globalDefault), selection: selectionState(item.selection),
        scope: item.scope, admissionEpoch: revision(item.admissionEpoch), switchAllowed: boolean(item.switchAllowed, "switchAllowed"),
        ...optional(item, "admittedSelection", selectionState),
        ...optional(item, "switchUnavailableReason", (input) => {
            if (typeof input !== "string" || !["busy", "maintenance", "disposed", "not-owned", "unavailable"].includes(input))
                fail("switchUnavailableReason");
            return input;
        }),
        ...optional(item, "rolePolicy", rolePolicy),
        ...optional(item, "profileModel", modelRoute),
        ...optional(item, "deepwork", (input) => {
            const mode = object(input, ["active", "explicit", "locked", "revision"]);
            return { active: boolean(mode.active, "active"), explicit: boolean(mode.explicit, "explicit"), locked: boolean(mode.locked, "locked"), revision: revision(mode.revision) };
        }),
    };
}
function saveRequest(value) {
    const item = object(value, ["id", "content", "expectedRevision"]);
    return { id: id(item.id), content: content(item.content), expectedRevision: item.expectedRevision === null ? null : revision(item.expectedRevision) };
}
function selectRequest(value) {
    const item = object(value, ["id", "expectedSelectionRevision"], ["expectedRevision"]);
    const result = { id: item.id === null ? null : id(item.id), expectedSelectionRevision: selectionRevision(item.expectedSelectionRevision), ...optional(item, "expectedRevision", revision) };
    if (result.id !== null && result.expectedRevision === undefined)
        fail("expectedRevision");
    if (result.id === null && result.expectedRevision !== undefined)
        fail("expectedRevision");
    return result;
}
function sessionSelectRequest(value) {
    const item = object(value, ["sessionId", "id", "expectedSelectionRevision", "expectedAdmissionEpoch"], ["expectedRevision"]);
    const { sessionId: inputSessionId, expectedAdmissionEpoch, ...profileRequest } = item;
    return { ...selectRequest(profileRequest), sessionId: sessionId(inputSessionId), expectedAdmissionEpoch: revision(expectedAdmissionEpoch) };
}
function modeSelectRequest(value) {
    const item = object(value, ["sessionId", "active", "expectedModeRevision", "expectedAdmissionEpoch"]);
    return { sessionId: sessionId(item.sessionId), active: boolean(item.active, "active"), expectedModeRevision: revision(item.expectedModeRevision), expectedAdmissionEpoch: revision(item.expectedAdmissionEpoch) };
}
function codec(symbol, parse) {
    return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse }) };
}
function descriptor(method, result, parameter) {
    return { id: `@dsmm/dsmm#dsmmProfiles/${method}`, service: "dsmmProfiles", namespace: "dsmmProfiles", method, invocation: { kind: "direct" }, parameters: parameter === undefined ? [] : [{ name: parameter.name, wire: parameter.name, source: "json", codec: parameter.codec }], result };
}
function jsonData(value, depth = 0, active = new Set()) {
    if (depth > 32)
        fail("JSON depth");
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return value;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value !== "object" || value === null || active.has(value))
        fail("JSON value");
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
        fail("JSON object");
    active.add(value);
    const result = Array.isArray(value) ? value.map((child) => jsonData(child, depth + 1, active)) : Object.fromEntries(Object.entries(value).map(([key, child]) => {
        if (["__proto__", "prototype", "constructor"].includes(key))
            fail("JSON key");
        return [key, jsonData(child, depth + 1, active)];
    }));
    active.delete(value);
    return result;
}
function globalSnapshot(value) {
    const row = object(value, ["config", "revision"]);
    object(row.config, [], Object.keys(row.config));
    return { config: jsonData(row.config), revision: selectionRevision(row.revision) };
}
function globalSaveRequest(value) {
    const row = object(value, ["expectedRevision", "edits"]);
    if (!Array.isArray(row.edits) || row.edits.length > 128)
        fail("edits");
    return { expectedRevision: selectionRevision(row.expectedRevision), edits: row.edits.map((value) => {
            const edit = object(value, ["op", "path"], ["value"]);
            if (!Array.isArray(edit.path) || edit.path.length < 1 || edit.path.length > 8)
                fail("field path");
            const path = edit.path.map((part) => { const key = text(part, "field", 128); if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/u.test(key) || ["constructor", "prototype", "__proto__"].includes(key))
                fail("field"); return key; });
            if (edit.op === "unset" && !Object.hasOwn(edit, "value"))
                return { op: "unset", path };
            if (edit.op !== "set" || !Object.hasOwn(edit, "value"))
                fail("edit");
            return { op: "set", path, value: jsonData(edit.value) };
        }) };
}
function configDescriptor(method, parameter) {
    return { id: `@dsmm/dsmm#dsmmConfig/${method}`, service: "dsmmConfig", namespace: "dsmmConfig", method, invocation: { kind: "direct" },
        parameters: parameter === undefined ? [] : [{ name: "request", wire: "request", source: "json", codec: parameter }], result: codec("GlobalConfigSnapshot", globalSnapshot) };
}
/** Explicit strict Host contract; no SRC fallback or browser-supplied authority. */
export const TYPERT_REMOTE = {
    package: "@dsmm/dsmm",
    descriptors: [
        configDescriptor("describe"),
        configDescriptor("save", codec("GlobalConfigSaveRequest", globalSaveRequest)),
        {
            ...descriptor("selectMode", codec("SessionProfileSnapshot", sessionSnapshot)),
            parameters: [
                { name: "sessionId", wire: "sessionId", source: "json", codec: codec("NativeSessionId", sessionId) },
                { name: "request", wire: "request", source: "json", codec: codec("SessionModeSelectRequest", modeSelectRequest) },
            ],
        },
        descriptor("describe", codec("ProfileSnapshot", snapshot)),
        descriptor("read", codec("ProfileReadResult", readResult), { name: "id", codec: codec("ProfileId", id) }),
        descriptor("save", codec("ProfileReadResult", readResult), { name: "request", codec: codec("ProfileSaveRequest", saveRequest) }),
        descriptor("select", codec("ProfileSnapshot", snapshot), { name: "request", codec: codec("ProfileSelectRequest", selectRequest) }),
        {
            ...descriptor("describeSession", codec("SessionProfileSnapshot", sessionSnapshot)),
            parameters: [{ name: "sessionId", wire: "sessionId", source: "json", codec: codec("NativeSessionId", sessionId) }],
        },
        {
            ...descriptor("selectSession", codec("SessionProfileSnapshot", sessionSnapshot)),
            parameters: [
                { name: "sessionId", wire: "sessionId", source: "json", codec: codec("NativeSessionId", sessionId) },
                { name: "request", wire: "request", source: "json", codec: codec("SessionProfileSelectRequest", sessionSelectRequest) },
            ],
        },
    ],
};
export const TYPERT_HOST = {
    package: "@dsmm/dsmm", face: "host", schemas: [],
    model: { services: [], events: [], objects: [] }, invocations: TYPERT_REMOTE.descriptors,
};
export default TYPERT_REMOTE;
//# sourceMappingURL=profile-remote.js.map