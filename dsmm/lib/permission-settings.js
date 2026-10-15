import z from "@deepseek-ai/schemastery";
import { parsePermissionRules, permissionRuleRow } from "./permission-rules.js";
import { PermissionRefusal } from "./permission-errors.js";
export function parseNativeCommands(input = {}) {
    const row = permissionRuleRow(input, [], ["enabled", "entries"]);
    if (row.enabled !== undefined && typeof row.enabled !== "boolean" || row.entries !== undefined && (!Array.isArray(row.entries) || row.entries.length > 1024))
        throw new PermissionRefusal("validation");
    const text = (value) => { if (typeof value !== "string" || value.trim().length === 0 || value.length > 32768 || value.includes("\0"))
        throw new PermissionRefusal("validation"); return value; };
    const ids = new Set();
    const entries = (row.entries ?? []).map(value => {
        const entry = permissionRuleRow(value, ["id", "mode", "match", "sandboxMode"]), match = permissionRuleRow(entry.match, ["tool", "executable", "args", "workingDirectory"], ["subcommand"]);
        const id = text(entry.id), cwd = text(match.workingDirectory);
        if (ids.has(id) || !["ask", "allow"].includes(entry.mode) || !["bash", "pwsh"].includes(match.tool)
            || !["workspace-write", "danger-full-access"].includes(entry.sandboxMode)
            // Wire paths belong to the Host, not the browser's platform. The Host validates and canonicalizes them before use.
            || !/^(?:\/|[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/iu.test(cwd) || !Array.isArray(match.args))
            throw new PermissionRefusal("validation");
        ids.add(id);
        return Object.freeze({ id, mode: entry.mode, sandboxMode: entry.sandboxMode, match: Object.freeze({
                tool: match.tool, executable: text(match.executable), ...match.subcommand === undefined ? {} : { subcommand: text(match.subcommand) },
                args: Object.freeze(match.args.map(text)), workingDirectory: cwd,
            }) });
    });
    return Object.freeze({ enabled: row.enabled ?? false, entries: Object.freeze(entries) });
}
const nativeCommands = z.object({ enabled: z.boolean().default(false), entries: z.array(z.object({
        id: z.string().required(), mode: z.union(["ask", "allow"]).required(), match: z.object({
            tool: z.union(["bash", "pwsh"]).required(), executable: z.string().required(), subcommand: z.string(), args: z.array(z.string()).required(), workingDirectory: z.string().required(),
        }).required(), sandboxMode: z.union(["workspace-write", "danger-full-access"]).required(),
    })).default([]) });
const webDefault = Object.freeze({ enabled: true, rule: "inherit" });
export const DEFAULT_PERMISSION_CONTROL = Object.freeze({ enabled: true, outsideReads: "inherit", webSearch: webDefault, webFetch: webDefault, rules: Object.freeze([]), nativeCommands: parseNativeCommands() });
const action = () => z.union(["inherit", "allow", "ask", "deny"]).default("inherit");
const web = () => z.object({ enabled: z.boolean().default(true), rule: action() }).default({});
export const permissionControlSchema = z.transform(z.object({ enabled: z.boolean().default(true), outsideReads: action(), webSearch: web(), webFetch: web(),
    nativeCommands, rules: z.array(z.any()).default([]) }), input => Object.freeze({ ...input, webSearch: Object.freeze(input.webSearch), webFetch: Object.freeze(input.webFetch), rules: parsePermissionRules(input.rules), nativeCommands: parseNativeCommands(input.nativeCommands) }), true);
export function resolvePermissionControl(input = {}) {
    permissionRuleRow(input, [], ["enabled", "outsideReads", "webSearch", "webFetch", "rules", "nativeCommands"]);
    if (Object.hasOwn(input, "nativeCommands"))
        parseNativeCommands(input.nativeCommands);
    for (const web of [input.webSearch, input.webFetch])
        if (web !== undefined)
            permissionRuleRow(web, [], ["enabled", "rule"]);
    const parsed = permissionControlSchema(input);
    return Object.freeze({ ...parsed, webSearch: Object.freeze(parsed.webSearch), webFetch: Object.freeze(parsed.webFetch), rules: parsePermissionRules(parsed.rules) });
}
//# sourceMappingURL=permission-settings.js.map