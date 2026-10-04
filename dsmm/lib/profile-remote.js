const errorCodes = new Set(["validation", "conflict", "not-found", "lock-timeout", "unsafe-path", "io", "activation", "corrupt-selection", "limit"]);
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const revisionPattern = /^[a-f0-9]{64}$/u;
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
    const item = object(value, ["profiles", "selectedId", "appliedRevision", "selectionRevision"], ["selectionError"]);
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
function codec(symbol, parse) {
    return { mode: "strict", typeSymbol: `@dsmm/dsmm#${symbol}`, create: () => ({ parse }) };
}
function descriptor(method, result, parameter) {
    return { id: `@dsmm/dsmm#dsmmProfiles/${method}`, service: "dsmmProfiles", namespace: "dsmmProfiles", method, invocation: { kind: "direct" }, parameters: parameter === undefined ? [] : [{ name: parameter.name, wire: parameter.name, source: "json", codec: parameter.codec }], result };
}
/** Explicit strict Host contract; no SRC fallback or browser-supplied authority. */
export const TYPERT_REMOTE = {
    package: "@dsmm/dsmm",
    descriptors: [
        descriptor("describe", codec("ProfileSnapshot", snapshot)),
        descriptor("read", codec("ProfileReadResult", readResult), { name: "id", codec: codec("ProfileId", id) }),
        descriptor("save", codec("ProfileReadResult", readResult), { name: "request", codec: codec("ProfileSaveRequest", saveRequest) }),
        descriptor("select", codec("ProfileSnapshot", snapshot), { name: "request", codec: codec("ProfileSelectRequest", selectRequest) }),
    ],
};
export const TYPERT_HOST = {
    package: "@dsmm/dsmm", face: "host", schemas: [],
    model: { services: [], events: [], objects: [] }, invocations: TYPERT_REMOTE.descriptors,
};
export default TYPERT_REMOTE;
//# sourceMappingURL=profile-remote.js.map