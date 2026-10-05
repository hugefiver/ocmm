import { getNodeValue, parseTree } from "jsonc-parser";
import { DSMM_ROLE_IDS } from "./roles.js";
import { resolveConfig } from "./settings.js";
import { normalizeRateLimitOverrides, normalizeRoutingStrategy, normalizeRuntimePolicy } from "./routing-policy.js";
export const MAX_PROFILE_BYTES = 128 * 1024;
export const MAX_PROFILE_COUNT = 128;
export const MAX_PROFILE_DIRECTORY_ENTRIES = 1024;
export const MAX_PROFILE_REVISIONS = 1024;
export class DsmmProfileError extends Error {
    code;
    field;
    constructor(code, message, field) {
        super(message);
        this.name = "DsmmProfileError";
        this.code = code;
        this.field = field;
    }
    toInfo() {
        return { code: this.code, message: this.message, ...(this.field === undefined ? {} : { field: this.field }) };
    }
}
export function profileErrorInfo(error, fallback = "io") {
    return error instanceof DsmmProfileError ? error.toInfo() : { code: fallback, message: "Deepwork profile operation failed; the previous selection and files were retained." };
}
export function validateProfileId(id) {
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(id) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu.test(id)) {
        throw new DsmmProfileError("validation", "Profile ID must be 1–64 lowercase ASCII letters, digits, hyphens or underscores, and not a Windows reserved name.", "id");
    }
}
export function validateProfileRevision(revision, field = "expectedRevision") {
    if (typeof revision !== "string" || !/^[a-f0-9]{64}$/u.test(revision))
        invalid(field, "must be a SHA256 file revision");
}
const OVERLAY_FIELDS = ["defaultActive", "roleRouting", "runtimePolicy", "workflow", "guards", "runtimeRecovery", "deepseekV4ProCalibration", "deepseekV4ProDefaultReasoningEffort", "deepseekV4ProMaxReasoningPresets", "deepseekFlashCalibration", "deepseekFlashDefaultReasoningEffort", "deepseekFlashMaxReasoningPresets"];
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
export function parseProfileDocument(content, expectedId) {
    if (typeof content !== "string")
        invalid("content", "must be JSONC text");
    if (content.length > MAX_PROFILE_BYTES)
        throw new DsmmProfileError("limit", "Profile files must not exceed 128 KiB.", "content");
    const encoded = new TextEncoder().encode(content);
    if (encoded.byteLength > MAX_PROFILE_BYTES)
        throw new DsmmProfileError("limit", "Profile files must not exceed 128 KiB.", "content");
    if (new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(encoded) !== content)
        invalid("content", "must round-trip through UTF-8 without unpaired UTF-16 surrogates");
    const errors = [];
    const tree = parseTree(content.replace(/^\uFEFF/u, ""), errors, { allowTrailingComma: true, disallowComments: false, allowEmptyContent: false });
    if (tree === undefined || errors.length > 0)
        invalid("content", "must contain one valid JSONC document (comments and trailing commas are allowed)");
    validateTree(tree, 0);
    const document = record(getNodeValue(tree), "document");
    keys(document, ["version", "id", "label", "settings"], "document");
    if (document.version !== 1)
        invalid("version", "must be 1");
    validateProfileId(document.id);
    if (expectedId !== undefined && document.id !== expectedId)
        invalid("id", "must match the profile filename ID");
    if (Object.hasOwn(document, "label"))
        string(document.label, "label", 120);
    const overlay = record(document.settings, "settings");
    keys(overlay, OVERLAY_FIELDS, "settings", "Only runtime settings are supported; keep roles, skills, installation, providers, credentials, presets and LSP configuration in the native deployment configuration.");
    optional(overlay, "defaultActive", bool, "settings");
    for (const prefix of ["deepseekV4Pro", "deepseekFlash"]) {
        optional(overlay, `${prefix}Calibration`, (value, field) => enumeration(value, ["off", "auto", "strict"], field), "settings");
        optional(overlay, `${prefix}DefaultReasoningEffort`, (value, field) => enumeration(value, ["off", "low", "high"], field), "settings");
        optional(overlay, `${prefix}MaxReasoningPresets`, roleList, "settings");
    }
    optional(overlay, "roleRouting", roleRouting, "settings");
    optional(overlay, "runtimePolicy", runtimePolicy, "settings");
    optional(overlay, "workflow", workflow, "settings");
    optional(overlay, "guards", guards, "settings");
    optional(overlay, "runtimeRecovery", recovery, "settings");
    const result = clone(document);
    // The package's existing resolver remains authoritative for semantic normalization.
    try {
        resolveConfig(result.settings);
    }
    catch {
        invalid("settings", "contains an invalid Deepwork runtime policy");
    }
    return result;
}
export function mergeProfileConfig(baseline, overlay) {
    return mergeRecords(baseline, overlay);
}
export function resolveProfileSettings(baseline, overlay) {
    return resolveConfig(mergeProfileConfig(baseline, overlay));
}
function mergeRecords(baseline, overlay) {
    const result = {};
    for (const [key, value] of Object.entries(baseline))
        result[key] = clone(value);
    for (const [key, value] of Object.entries(overlay)) {
        // Routes are complete values, whereas each role's policy keys merge independently.
        result[key] = key !== "primary" && isRecord(value) && isRecord(result[key]) ? mergeRecords(result[key], value) : clone(value);
    }
    return result;
}
function clone(value) {
    if (Array.isArray(value))
        return value.map(clone);
    return isRecord(value) ? mergeRecords({}, value) : value;
}
function validateTree(node, depth) {
    if (depth > 32)
        invalid("content", "exceeds the maximum JSON nesting depth");
    if (node.type === "object") {
        const found = new Set();
        for (const property of node.children ?? []) {
            const key = property.children?.[0]?.value;
            if (typeof key !== "string" || FORBIDDEN_KEYS.has(key))
                invalid("content", "contains an unsafe object key");
            if (found.has(key))
                invalid("content", "contains a duplicate object key; remove the duplicate before saving");
            found.add(key);
        }
    }
    for (const child of node.children ?? [])
        validateTree(child, depth + 1);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, field) {
    if (!isRecord(value))
        invalid(field, "must be an object");
    return value;
}
function keys(value, allowed, field, extra = "Remove unsupported fields before saving.") {
    if (Object.keys(value).some((key) => !allowed.includes(key)))
        invalid(field, `contains unsupported fields. ${extra}`);
}
function optional(value, key, validator, field) {
    if (Object.hasOwn(value, key))
        validator(value[key], `${field}.${key}`);
}
function invalid(field, message) {
    throw new DsmmProfileError("validation", `${field} ${message}.`, field);
}
function bool(value, field) {
    if (typeof value !== "boolean")
        invalid(field, "must be true or false");
}
function string(value, field, maximum) {
    if (typeof value !== "string" || value.trim() === "" || value.length > maximum || /[\u0000-\u001F\u007F]/u.test(value))
        invalid(field, `must be nonempty text of at most ${maximum} characters without control characters`);
}
function enumeration(value, allowed, field) {
    if (typeof value !== "string" || !allowed.includes(value))
        invalid(field, `must be one of ${allowed.join(", ")}`);
}
function integer(value, field, minimum, maximum) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum)
        invalid(field, `must be an integer from ${minimum} to ${maximum}`);
}
function array(value, field, maximum, validator) {
    if (!Array.isArray(value) || value.length > maximum)
        invalid(field, `must be an array with at most ${maximum} entries`);
    for (const item of value)
        validator(item, field);
}
function roleList(value, field) {
    array(value, field, DSMM_ROLE_IDS.length, (role, path) => enumeration(role, DSMM_ROLE_IDS, path));
    if (new Set(value).size !== value.length)
        invalid(field, "must not contain duplicate roles");
}
function route(value, field) {
    const item = record(value, field);
    keys(item, ["provider", "model", "reasoningEffort"], field);
    string(item.provider, `${field}.provider`, 128);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(item.provider))
        invalid(`${field}.provider`, "must reference a native provider ID, not a URL, credential or path");
    string(item.model, `${field}.model`, 512);
    if (item.model.includes("://"))
        invalid(`${field}.model`, "must reference a native model ID, not a credential-bearing URL");
    optional(item, "reasoningEffort", (effort, path) => string(effort, path, 64), field);
}
function routeList(value, field) {
    array(value, field, 32, route);
}
function roleRouting(value, field) {
    const item = record(value, field);
    keys(item, DSMM_ROLE_IDS, field);
    for (const [role, raw] of Object.entries(item)) {
        const path = `${field}.${role}`;
        const policy = record(raw, path);
        keys(policy, ["primary", "fallbackRoutes", "strategy", "rateLimit"], path);
        optional(policy, "primary", route, path);
        optional(policy, "fallbackRoutes", routeList, path);
        optional(policy, "strategy", strategy, path);
        optional(policy, "rateLimit", rateLimit, path);
    }
}
function strategy(value, field) {
    try {
        normalizeRoutingStrategy(value);
    }
    catch {
        invalid(field, "must be startup-lock or rate-limit-fallback");
    }
}
function rateLimit(value, field) {
    try {
        normalizeRateLimitOverrides(value);
    }
    catch {
        invalid(field, "must contain only bounded integer retry, delay, threshold and switch fields");
    }
}
function runtimePolicy(value, field) {
    const item = record(value, field);
    keys(item, ["strategy", "rateLimit"], field);
    optional(item, "strategy", strategy, field);
    optional(item, "rateLimit", rateLimit, field);
    try {
        normalizeRuntimePolicy(value);
    }
    catch {
        invalid(field, "must contain a valid strategy and bounded rateLimit policy");
    }
}
function workflow(value, field) {
    const item = record(value, field);
    keys(item, ["policy", "strictGates", "reviewCap", "finalReviewPolicy"], field);
    optional(item, "policy", (policy, path) => enumeration(policy, ["risk-based", "legacy"], path), field);
    optional(item, "strictGates", bool, field);
    optional(item, "reviewCap", (cap, path) => integer(cap, path, 0, 10), field);
    optional(item, "finalReviewPolicy", (policy, path) => enumeration(policy, ["simple-oracle-complex-reviewer", "reviewer-only", "off"], path), field);
}
function guards(value, field) {
    const item = record(value, field);
    keys(item, ["scope", "shellCommandSafety", "gitWriteGuard", "toolOutputTruncation", "planFormatValidation", "questionLabelHelper", "todoDisciplineHelper"], field);
    optional(item, "scope", (scope, path) => enumeration(scope, ["deepwork-or-dsmm-agent", "always", "off"], path), field);
    optional(item, "gitWriteGuard", (policy, path) => enumeration(policy, ["ask", "deny", "off"], path), field);
    for (const key of ["shellCommandSafety", "planFormatValidation", "todoDisciplineHelper"])
        optional(item, key, bool, field);
    optional(item, "toolOutputTruncation", (raw, path) => {
        const nested = record(raw, path);
        keys(nested, ["enabled", "maxInlineBytes"], path);
        optional(nested, "enabled", bool, path);
        optional(nested, "maxInlineBytes", (bytes, at) => integer(bytes, at, 1, 1024 * 1024), path);
    }, field);
    optional(item, "questionLabelHelper", (raw, path) => {
        const nested = record(raw, path);
        keys(nested, ["enabled", "maxLabelChars"], path);
        optional(nested, "enabled", bool, path);
        optional(nested, "maxLabelChars", (chars, at) => integer(chars, at, 1, 256), path);
    }, field);
}
function recovery(value, field) {
    const item = record(value, field);
    keys(item, ["enabled", "retryOnStatusCodes", "retryOnCodes", "fallbackRoutes", "maxFallbackAttempts", "idleContinuation"], field);
    optional(item, "enabled", bool, field);
    optional(item, "retryOnStatusCodes", (raw, path) => array(raw, path, 64, (status, at) => integer(status, at, 100, 599)), field);
    optional(item, "retryOnCodes", (raw, path) => array(raw, path, 64, (code, at) => string(code, at, 128)), field);
    optional(item, "fallbackRoutes", routeList, field);
    optional(item, "maxFallbackAttempts", (attempts, path) => integer(attempts, path, 0, 10), field);
    optional(item, "idleContinuation", (raw, path) => {
        const nested = record(raw, path);
        keys(nested, ["enabled", "maxContinuations", "prompt"], path);
        optional(nested, "enabled", bool, path);
        optional(nested, "maxContinuations", (count, at) => integer(count, at, 0, 10), path);
        optional(nested, "prompt", (prompt, at) => {
            if (typeof prompt !== "string" || prompt.trim() === "" || prompt.length > 8192 || prompt.includes("\0"))
                invalid(at, "must be nonempty text of at most 8192 characters without NUL");
        }, path);
    }, field);
}
//# sourceMappingURL=profiles.js.map