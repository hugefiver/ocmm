import { isNativeSessionId, isProfileId } from "./profile-remote.js";
const codes = ["validation", "not-owned", "not-found", "unsupported-host", "unsupported-backend", "unavailable", "busy", "stale", "cancelled", "authorization-required", "child-owner-required", "format-unavailable", "initialization-failed"];
function invalid() { throw new TypeError("Invalid history continuation request or response"); }
function object(input, required, optional = []) {
    if (!input || typeof input !== "object" || Array.isArray(input)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Object.getOwnPropertySymbols(input).length
        || Object.values(Object.getOwnPropertyDescriptors(input)).some(row => !Object.hasOwn(row, "value") || !row.enumerable))
        invalid();
    const row = input;
    if (required.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !required.includes(key) && !optional.includes(key)))
        invalid();
    return row;
}
function text(input, maximum = 4096) { if (typeof input !== "string" || input.length > maximum)
    invalid(); return input; }
function bool(input) { if (typeof input !== "boolean")
    invalid(); return input; }
function list(input, parse) { if (!Array.isArray(input))
    invalid(); return input.map(value => parse(value)); }
function code(input) { if (!codes.includes(input))
    invalid(); return input; }
export function historySessionId(input) { if (!isNativeSessionId(input))
    invalid(); return input; }
function intentId(input) { const id = text(input, 36); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id))
    invalid(); return id; }
function profileId(input) { if (input === null)
    return null; if (!isProfileId(input))
    invalid(); return input; }
function presetId(input) { return historySessionId(input); }
function choice(input) { const row = object(input, ["id", "label"]); return { id: text(row.id, 256), label: text(row.label, 120) }; }
export function historyJson(input, depth = 0, active = new Set()) {
    if (depth > 32)
        invalid();
    if (input === null || typeof input === "boolean" || typeof input === "string")
        return input;
    if (typeof input === "number") {
        if (!Number.isFinite(input))
            invalid();
        return input;
    }
    if (!input || typeof input !== "object")
        invalid();
    if (active.has(input))
        invalid();
    active.add(input);
    try {
        if (Array.isArray(input)) {
            if (Object.getOwnPropertySymbols(input).length || Object.entries(Object.getOwnPropertyDescriptors(input)).some(([key, property]) => key !== "length" && (!/^(0|[1-9][0-9]*)$/u.test(key) || !Object.hasOwn(property, "value") || !property.enumerable)))
                invalid();
            return input.map(value => historyJson(value, depth + 1, active));
        }
        const row = object(input, Object.keys(input));
        return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, historyJson(value, depth + 1, active)]));
    }
    finally {
        active.delete(input);
    }
}
export function parseHistoryFailure(input) {
    const row = object(input, ["code", "storageEffects"]);
    if (row.storageEffects !== "none" && row.storageEffects !== "may-have-committed")
        invalid();
    return { code: code(row.code), storageEffects: row.storageEffects };
}
export function parseHistoryStatus(input) {
    const row = object(input, ["sessionId", "readable", "execution", "compatibleHost"], ["reason"]);
    if (row.readable !== "readable" && row.readable !== "unavailable")
        invalid();
    if (!["authorization-required", "activating", "active", "unavailable"].includes(String(row.execution)))
        invalid();
    return { sessionId: historySessionId(row.sessionId), readable: row.readable, execution: row.execution, compatibleHost: bool(row.compatibleHost), ...(row.reason === undefined ? {} : { reason: code(row.reason) }) };
}
export function parseHistoryChoices(input) {
    const row = object(input, ["presets", "profiles"]);
    return { presets: list(row.presets, value => { const result = choice(value); presetId(result.id); return result; }), profiles: list(row.profiles, value => { const result = choice(value); profileId(result.id); return result; }) };
}
export function parseHistoryPreviewRequest(input) {
    const row = object(input, ["sessionId", "preset", "profileId"]);
    return { sessionId: historySessionId(row.sessionId), preset: presetId(row.preset), profileId: profileId(row.profileId) };
}
export function parseHistoryConfirmRequest(input) {
    const row = object(input, ["sessionId", "intentId", "processPending", "acceptMigration"]);
    return { sessionId: historySessionId(row.sessionId), intentId: intentId(row.intentId), processPending: bool(row.processPending), acceptMigration: bool(row.acceptMigration) };
}
function candidate(input) {
    const row = object(input, ["preset", "profile", "model", "roles", "restrictions", "differences"]);
    const model = object(row.model, ["provider", "model"], ["reasoningEffort"]);
    return { preset: choice(row.preset), profile: row.profile === null ? null : choice(row.profile),
        model: { provider: text(model.provider, 256), model: text(model.model, 256), ...(model.reasoningEffort === undefined ? {} : { reasoningEffort: text(model.reasoningEffort, 128) }) },
        roles: list(row.roles, choice), restrictions: list(row.restrictions, value => text(value)), differences: list(row.differences, value => text(value)) };
}
export function parseHistoryPreview(input) {
    const row = object(input, ["sessionId", "intentId", "cwd", "candidate", "migrationRequired", "pending"]), pending = object(row.pending, ["nextTurn", "nextStep"]);
    return { sessionId: historySessionId(row.sessionId), intentId: intentId(row.intentId), cwd: text(row.cwd), candidate: candidate(row.candidate), migrationRequired: bool(row.migrationRequired), pending: { nextTurn: list(pending.nextTurn, historyJson), nextStep: list(pending.nextStep, historyJson) } };
}
export function parseHistoryResult(input) {
    const row = object(input, ["sessionId", "execution"]);
    if (row.execution !== "active")
        invalid();
    return { sessionId: historySessionId(row.sessionId), execution: "active" };
}
//# sourceMappingURL=history-codec.js.map