import { applyEdits, findNodeAtLocation, modify, parse, parseTree } from "jsonc-parser";
import { normalizeRateLimitOverrides, normalizeRoutingStrategy } from "../routing-policy.js";
function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function route(value) {
    return record(value) && typeof value.provider === "string" && typeof value.model === "string"
        && (value.reasoningEffort === undefined || typeof value.reasoningEffort === "string")
        && Object.keys(value).every((key) => ["provider", "model", "reasoningEffort"].includes(key));
}
function validTree(node, depth = 0) {
    if (depth > 32)
        return false;
    if (node.type === "object") {
        const seen = new Set();
        for (const property of node.children ?? []) {
            const key = property.children?.[0]?.value;
            if (typeof key !== "string" || seen.has(key) || ["__proto__", "prototype", "constructor"].includes(key))
                return false;
            seen.add(key);
        }
    }
    return (node.children ?? []).every((child) => validTree(child, depth + 1));
}
/** Read-only projection. Malformed raw drafts cannot be rewritten by the form. */
export function structuredDocument(content) {
    const errors = [];
    const tree = parseTree(content, errors, { allowTrailingComma: true });
    if (errors.length !== 0 || tree === undefined || !validTree(tree))
        return null;
    const document = parse(content, errors, { allowTrailingComma: true });
    if (errors.length !== 0 || !record(document) || document.version !== 1 || typeof document.id !== "string"
        || !record(document.settings) || (document.label !== undefined && typeof document.label !== "string"))
        return null;
    const settings = document.settings;
    if (settings.defaultActive !== undefined && typeof settings.defaultActive !== "boolean")
        return null;
    if (settings.roleRouting !== undefined && !record(settings.roleRouting))
        return null;
    if (settings.runtimePolicy !== undefined && !record(settings.runtimePolicy))
        return null;
    const runtimePolicy = settings.runtimePolicy ?? {};
    const policies = settings.roleRouting ?? {};
    try {
        if (Object.keys(runtimePolicy).some((key) => key !== "strategy" && key !== "rateLimit"))
            return null;
        if (runtimePolicy.strategy !== undefined)
            normalizeRoutingStrategy(runtimePolicy.strategy);
        if (runtimePolicy.rateLimit !== undefined)
            normalizeRateLimitOverrides(runtimePolicy.rateLimit);
        for (const raw of Object.values(policies)) {
            if (!record(raw) || Object.keys(raw).some((key) => !["primary", "fallbackRoutes", "strategy", "rateLimit"].includes(key)))
                return null;
            if (raw.primary !== undefined && !route(raw.primary))
                return null;
            if (raw.fallbackRoutes !== undefined && (!Array.isArray(raw.fallbackRoutes) || raw.fallbackRoutes.length > 32 || !raw.fallbackRoutes.every(route)))
                return null;
            if (raw.strategy !== undefined)
                normalizeRoutingStrategy(raw.strategy);
            if (raw.rateLimit !== undefined)
                normalizeRateLimitOverrides(raw.rateLimit);
        }
    }
    catch {
        return null;
    }
    return { label: document.label, settings, roleRouting: policies, runtimePolicy };
}
/** Only the named path changes; comments/unrelated raw JSONC remain untouched. */
export function editStructuredPath(content, path, value) {
    if (structuredDocument(content) === null)
        return null;
    try {
        return applyEdits(content, modify(content, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
    }
    catch {
        return null;
    }
}
export function moveFallback(content, role, from, to) {
    const document = structuredDocument(content);
    const chain = document?.roleRouting[role]?.fallbackRoutes;
    if (chain === undefined || from < 0 || from >= chain.length || to < 0 || to >= chain.length)
        return null;
    // Move the original object text, not parsed/serialized values, so even the
    // edited rows retain their internal comments and manual identifier spelling.
    const low = Math.min(from, to), high = Math.max(from, to);
    const tree = parseTree(content);
    if (tree === undefined)
        return null;
    const nodes = chain.map((_, index) => findNodeAtLocation(tree, ["settings", "roleRouting", role, "fallbackRoutes", index]));
    if (nodes.some((node) => node === undefined))
        return null;
    const order = nodes.map((node) => content.slice(node.offset, node.offset + node.length));
    order.splice(to, 0, order.splice(from, 1)[0]);
    return applyEdits(content, nodes.slice(low, high + 1).map((node, offset) => ({ offset: node.offset, length: node.length, content: order[low + offset] })));
}
//# sourceMappingURL=structured.js.map