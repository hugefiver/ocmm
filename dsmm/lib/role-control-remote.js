import { parseDsmmInvocationView, parseDsmmRoleRouteComparison, parseSubagentRuntimeAdmissionView, isNativeSessionId } from "./profile-remote.js";
import { parseChildAdmissionEvidenceView } from "./child-evidence.js";
import { ROLE_CONTROL_DISABLED_REASONS, ROLE_CONTROL_ERROR_CODES, ROLE_CONTROL_ERROR_FIELDS } from "./role-control-types.js";
function fail() { throw new TypeError("Invalid Deepwork child control DTO."); }
/** Reject executable/non-JSON shapes before accessing any properties. */
function json(value, depth = 0, active = new Set()) {
    if (depth > 24)
        fail();
    if (value === null || typeof value === "boolean" || typeof value === "string")
        return value;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value !== "object" || value === null || active.has(value))
        fail();
    const isArray = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype) && (isArray || Object.getPrototypeOf(value) !== null))
        fail();
    if (Object.getOwnPropertySymbols(value).length)
        fail();
    for (const [key, property] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
        if (isArray && key === "length")
            continue;
        if (!Object.hasOwn(property, "value") || !property.enumerable || ["__proto__", "prototype", "constructor"].includes(key)
            || isArray && !/^(0|[1-9][0-9]*)$/u.test(key))
            fail();
    }
    if (isArray && Object.keys(value).length !== value.length)
        fail();
    active.add(value);
    const result = isArray ? value.map(child => json(child, depth + 1, active)) : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, json(child, depth + 1, active)]));
    active.delete(value);
    return result;
}
function object(value, required, optional = []) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        fail();
    const row = value;
    if (required.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !required.includes(key) && !optional.includes(key)))
        fail();
    return row;
}
function choice(value, choices) { if (!choices.includes(value))
    fail(); return value; }
function text(value, max) {
    if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)
        || new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(new TextEncoder().encode(value)) !== value)
        fail();
    return value;
}
function identity(value) { if (!isNativeSessionId(value))
    fail(); return value; }
function epoch(value) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value))
    fail(); return value; }
function array(value, max = 4096) { if (!Array.isArray(value) || value.length > max)
    fail(); return value; }
function bool(value) { if (typeof value !== "boolean")
    fail(); return value; }
function depth(value) { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 4096)
    fail(); return value; }
function availability(value) {
    const row = object(value, ["enabled"], ["reason"]);
    if (row.enabled === true && !Object.hasOwn(row, "reason"))
        return { enabled: true };
    if (row.enabled !== false)
        fail();
    return { enabled: false, reason: choice(row.reason, ROLE_CONTROL_DISABLED_REASONS) };
}
function capabilities(value) {
    const row = object(value, ["background", "prompt", "interrupt", "images", "runtime"]);
    return { background: availability(row.background), prompt: availability(row.prompt), interrupt: availability(row.interrupt), images: availability(row.images), runtime: parseSubagentRuntimeAdmissionView(row.runtime) };
}
function run(value) {
    const row = object(value, ["sessionId", "toolCallId", "state", "background"], ["invocation"]);
    const state = choice(row.state, ["starting", "running", "background", "settled", "cancelled"]);
    const invocation = Object.hasOwn(row, "invocation") ? parseDsmmInvocationView(row.invocation) : undefined;
    if (state === "starting" && invocation !== undefined || invocation !== undefined && (invocation.mode !== "one-shot" || invocation.runId === undefined)
        || ["running", "background", "settled"].includes(state) && invocation === undefined)
        fail();
    return { sessionId: identity(row.sessionId), toolCallId: identity(row.toolCallId), state, background: availability(row.background), ...(invocation === undefined ? {} : { invocation }) };
}
function child(value) {
    const row = object(value, ["id", "parentSessionId", "mode", "activity", "readonly", "controls"], ["label", "invocation", "routeComparison", "evidence"]);
    const controls = object(row.controls, ["prompt", "interrupt"]);
    const mode = choice(row.mode, ["one-shot", "continuable", "unknown"]);
    const prompt = availability(controls.prompt), interrupt = availability(controls.interrupt);
    const readonly = bool(row.readonly);
    if (readonly !== (!prompt.enabled && !interrupt.enabled) || mode !== "continuable" && (prompt.enabled || interrupt.enabled))
        fail();
    const invocation = Object.hasOwn(row, "invocation") ? parseDsmmInvocationView(row.invocation) : undefined;
    const routeComparison = Object.hasOwn(row, "routeComparison") ? parseDsmmRoleRouteComparison(row.routeComparison) : undefined;
    const evidence = Object.hasOwn(row, "evidence") ? parseChildAdmissionEvidenceView(row.evidence) : undefined;
    const id = identity(row.id);
    if (invocation !== undefined && (invocation.childId !== id || invocation.mode !== mode))
        fail();
    if (routeComparison !== undefined && routeComparison.childId !== id)
        fail();
    if (evidence?.mode === "legacy-conservative" && invocation !== undefined)
        fail();
    return { id, parentSessionId: identity(row.parentSessionId), mode, activity: choice(row.activity, ["running", "inactive"]), readonly,
        controls: { prompt, interrupt }, ...(Object.hasOwn(row, "label") ? { label: text(row.label, 120) } : {}),
        ...(invocation === undefined ? {} : { invocation }), ...(routeComparison === undefined ? {} : { routeComparison }), ...(evidence === undefined ? {} : { evidence }) };
}
function snapshot(value) {
    const row = object(value, ["sessionId", "admissionEpoch", "runs", "children", "capabilities"]);
    const sessionId = identity(row.sessionId), admissionEpoch = epoch(row.admissionEpoch), runs = array(row.runs).map(run), children = array(row.children).map(child);
    if (runs.some(run => run.sessionId !== sessionId) || children.some(child => child.parentSessionId !== sessionId || child.evidence !== undefined && child.evidence.parentAdmissionEpoch !== admissionEpoch))
        fail();
    return { sessionId, admissionEpoch, runs, children, capabilities: capabilities(row.capabilities) };
}
function descendants(value) {
    const row = object(value, ["sessionId", "admissionEpoch", "descendants"]);
    const sessionId = identity(row.sessionId), admissionEpoch = epoch(row.admissionEpoch);
    const entries = array(row.descendants).map(value => {
        const entry = object(value, ["kind", "depth"], ["child", "hasChildren", "id", "parentSessionId", "reason"]);
        if (entry.kind === "child") {
            object(entry, ["kind", "depth", "child", "hasChildren"]);
            const projected = child(entry.child);
            if (entry.depth !== 1 && (projected.controls.prompt.enabled || projected.controls.interrupt.enabled))
                fail();
            return { kind: "child", depth: depth(entry.depth), child: projected, hasChildren: bool(entry.hasChildren) };
        }
        object(entry, ["kind", "depth", "id", "parentSessionId", "reason"]);
        if (entry.kind !== "diagnostic")
            fail();
        return { kind: "diagnostic", depth: depth(entry.depth), id: identity(entry.id), parentSessionId: identity(entry.parentSessionId), reason: choice(entry.reason, ["corrupt", "unsupported", "unavailable"]) };
    });
    for (const entry of entries) {
        const parent = entry.kind === "child" ? entry.child.parentSessionId : entry.parentSessionId;
        if ((entry.depth === 1) !== (parent === sessionId))
            fail();
        if (entry.kind === "child" && entry.child.evidence !== undefined && entry.child.evidence.parentAdmissionEpoch !== admissionEpoch)
            fail();
    }
    return { sessionId, admissionEpoch, descendants: entries };
}
function backgroundRequest(value) {
    const row = object(value, ["sessionId", "toolCallId", "runId", "expectedAdmissionEpoch"]);
    return { sessionId: identity(row.sessionId), toolCallId: identity(row.toolCallId), runId: identity(row.runId), expectedAdmissionEpoch: epoch(row.expectedAdmissionEpoch) };
}
function transition(value) {
    const row = object(value, ["status", "runId"], ["jobId"]);
    const status = choice(row.status, ["background", "already-background", "already-settled", "cancelled"]);
    if (["background", "already-background"].includes(status) !== Object.hasOwn(row, "jobId"))
        fail();
    return { status, runId: identity(row.runId), ...(Object.hasOwn(row, "jobId") ? { jobId: identity(row.jobId) } : {}) };
}
function promptRequest(value) {
    const row = object(value, ["requestId", "parentSessionId", "childSessionId", "mode", "delivery", "content"], ["clientTimeZone"]);
    if (row.mode !== "continuable")
        fail();
    const content = array(row.content, Number.MAX_SAFE_INTEGER).map(value => {
        const part = object(value, ["type"], ["text", "mediaType", "data", "name"]);
        if (part.type === "text") {
            object(part, ["type", "text"]);
            if (typeof part.text !== "string")
                fail();
            return { type: "text", text: part.text };
        }
        object(part, ["type", "mediaType", "data"], ["name"]);
        if (part.type !== "image" || typeof part.data !== "string")
            fail();
        return { type: "image", mediaType: choice(part.mediaType, ["image/png", "image/jpeg", "image/webp", "image/gif"]), data: part.data,
            ...(Object.hasOwn(part, "name") ? { name: text(part.name, 256) } : {}) };
    });
    if (content.length === 0)
        fail();
    return { requestId: identity(row.requestId), parentSessionId: identity(row.parentSessionId),
        childSessionId: identity(row.childSessionId), mode: "continuable", delivery: choice(row.delivery, ["queue", "steer"]), content,
        ...(Object.hasOwn(row, "clientTimeZone") ? { clientTimeZone: text(row.clientTimeZone, 128) } : {}) };
}
function interruptRequest(value) {
    const row = object(value, ["parentSessionId", "childSessionId", "mode"]);
    if (row.mode !== "continuable")
        fail();
    return { parentSessionId: identity(row.parentSessionId), childSessionId: identity(row.childSessionId), mode: "continuable" };
}
function promptReceipt(value) { const row = object(value, ["messageId"]); return { messageId: identity(row.messageId) }; }
function interruptReceipt(value) { const row = object(value, ["accepted"]); if (row.accepted !== true)
    fail(); return { accepted: true }; }
function errorInfo(value) {
    const row = object(value, ["code"], ["field", "reason"]);
    return { code: choice(row.code, ROLE_CONTROL_ERROR_CODES), ...(Object.hasOwn(row, "field") ? { field: choice(row.field, ROLE_CONTROL_ERROR_FIELDS) } : {}),
        ...(Object.hasOwn(row, "reason") ? { reason: choice(row.reason, ROLE_CONTROL_DISABLED_REASONS) } : {}) };
}
export const parseRoleControlErrorInfo = (value) => errorInfo(json(value));
export const parseChildSessionSnapshot = (value) => snapshot(json(value));
export const parseRoleControlDescendants = (value) => descendants(json(value));
export const parseRoleControlBackgroundRequest = (value) => backgroundRequest(json(value));
export const parseRoleControlPromptRequest = (value) => promptRequest(json(value));
export const parseRoleControlInterruptRequest = (value) => interruptRequest(json(value));
export const parseRoleControlCapabilities = (value) => capabilities(json(value));
export const parseRoleControlSessionId = (value) => identity(value);
function codec(symbol, parse) {
    return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse: value => parse(json(value)) }) };
}
function descriptor(method, result, request) {
    return { id: `@dsmm/dsmm-children#dsmmChildren/${method}`, service: "dsmmChildren", namespace: "dsmmChildren", method, invocation: { kind: "direct" },
        parameters: [{ name: "sessionId", wire: "sessionId", source: "json", codec: codec("ChildControlSessionId", identity) },
            ...(request === undefined ? [] : [{ name: "request", wire: "request", source: "json", codec: request }])], result };
}
/** Separate package identity prevents replacing the Profiles contribution. */
export const ROLE_CONTROL_REMOTE = { package: "@dsmm/dsmm-children", descriptors: [
        descriptor("describe", codec("ChildSessionSnapshot", snapshot)),
        descriptor("descendants", codec("RoleControlDescendantsSnapshot", descendants)),
        descriptor("background", codec("BackgroundTransitionResult", transition), codec("RoleControlBackgroundRequest", backgroundRequest)),
        descriptor("prompt", codec("SubagentPromptReceipt", promptReceipt), codec("SubagentPromptRequest", promptRequest)),
        descriptor("interrupt", codec("SubagentInterruptReceipt", interruptReceipt), codec("RoleControlInterruptRequest", interruptRequest)),
    ] };
export const ROLE_CONTROL_HOST = { package: ROLE_CONTROL_REMOTE.package, face: "host", schemas: [], model: { services: [], events: [], objects: [] }, invocations: ROLE_CONTROL_REMOTE.descriptors };
export default ROLE_CONTROL_REMOTE;
//# sourceMappingURL=role-control-remote.js.map