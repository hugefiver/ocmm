import { parseTree } from "jsonc-parser";
export function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function at(value, path) {
    return path.reduce((node, key) => record(node) && Object.hasOwn(node, key) ? node[key] : undefined, value);
}
export function equal(a, b) {
    if (record(a) && record(b))
        return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
    if (Array.isArray(a) && Array.isArray(b))
        return a.length === b.length && a.every((value, i) => equal(value, b[i]));
    return a === b;
}
export function mergeLayer(base, override) {
    if (!record(base) || !record(override))
        return override;
    return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(override)])].map(key => [key,
        Object.hasOwn(override, key) ? mergeLayer(base[key], override[key]) : base[key]]));
}
/** Strict JSON with duplicate-key rejection; never silently last-key-wins. */
export function parseAdvanced(text) {
    if (text.trim() === "")
        return undefined;
    const errors = [];
    const root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
    const unique = (node) => {
        if (node.type === "object") {
            const keys = node.children.map(child => child.children[0].value);
            if (new Set(keys).size !== keys.length)
                return false;
        }
        return (node.children ?? []).every(unique);
    };
    if (root === undefined || errors.length || !unique(root))
        throw new Error("Invalid JSON");
    return JSON.parse(text);
}
export function editLayer(base, path, value) {
    const next = structuredClone(base);
    let node = next;
    for (const key of path.slice(0, -1)) {
        if (!record(node[key]))
            node[key] = {};
        node = node[key];
    }
    const key = path.at(-1);
    if (value === undefined)
        delete node[key];
    else
        node[key] = structuredClone(value);
    return next;
}
/** Preserve untouched sparse fields; arrays are one schema field, not indexed RPC paths. */
export function layerDiff(base, draft, prefix = []) {
    return [...new Set([...Object.keys(base), ...Object.keys(draft)])].flatMap(key => {
        const path = [...prefix, key], before = base[key], after = draft[key];
        if (equal(before, after))
            return [];
        if (!Object.hasOwn(draft, key))
            return [{ op: "unset", path }];
        if (record(before) && record(after))
            return layerDiff(before, after, path);
        return [{ op: "set", path, value: after }];
    });
}
export function validateEditorValue(value, schema, sparse = false) {
    if (schema.type === "union")
        return schema.alternatives?.some(node => validateEditorValue(value, node, sparse)) === true;
    if (schema.type === "const")
        return value === schema.value;
    if (schema.type === "object" || schema.type === "dict")
        return record(value) && (sparse || schema.type !== "object" || Object.entries(schema.fields ?? {}).every(([key, node]) => !node.required || Object.hasOwn(value, key))) && Object.entries(value).every(([key, child]) => {
            if (["__proto__", "prototype", "constructor"].includes(key))
                return false;
            if (schema.keys !== undefined && !schema.keys.includes(key))
                return false;
            const node = schema.type === "dict" ? schema.inner : schema.fields?.[key];
            return node !== undefined && validateEditorValue(child, node, sparse);
        });
    if (schema.type === "array")
        return Array.isArray(value) && (schema.max === undefined || value.length <= schema.max) && schema.inner !== undefined && value.every(child => validateEditorValue(child, schema.inner));
    if (schema.type === "string" && schema.nonempty)
        return typeof value === "string" && value.trim() !== "";
    if (["string", "boolean", "number"].includes(schema.type))
        return typeof value === schema.type && (typeof value !== "number" || Number.isFinite(value) && (schema.min === undefined || value >= schema.min) && (schema.max === undefined || value <= schema.max) && (schema.step === undefined || Number.isInteger(value / schema.step)));
    return false;
}
export function enumValues(schema) {
    return schema.type === "union" && schema.alternatives?.every(node => node.type === "const")
        ? schema.alternatives.map(node => node.value) : null;
}
/** Only Host-projected inspector layers, never raw sparse editor input. */
export function inspectorPaths(snapshot, admitted) {
    const paths = new Set([...Object.keys(snapshot.sources), ...Object.keys(snapshot.startupSources ?? {}), ...Object.keys(snapshot.nextRoot?.sources ?? {}),
        ...Object.keys(snapshot.nextRoot?.captures ?? {}), ...Object.keys(admitted?.sources ?? {}), ...Object.keys(admitted?.captures ?? {})]);
    const visit = (value, path) => {
        if (record(value) && Object.keys(value).length && path.join(".") !== "lsp.env")
            for (const [key, child] of Object.entries(value))
                visit(child, [...path, key]);
        else if (path.length)
            paths.add(path.join("."));
    };
    for (const value of [snapshot.desired, snapshot.startup, snapshot.nextRoot?.settings, admitted?.settings])
        if (value !== undefined)
            visit(value, []);
    return [...paths].sort();
}
//# sourceMappingURL=deployment-data.js.map