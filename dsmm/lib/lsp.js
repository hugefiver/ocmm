export const DSMM_LSP_SERVER_NAME = "dsmm_lsp";
export const DSMM_LSP_TOOL_NAMES = [
    "status",
    "diagnostics",
    "goto_definition",
    "find_references",
    "find_symbol_related",
    "symbols",
    "prepare_rename",
    "rename",
    "format"
];
/** Optional native package resolution is anchored by the trusted host, not home guesses or CLI paths. */
export async function registerLspRuntime(ctx, settings) {
    let state = { state: "disabled", tools: [] };
    ctx.provide("dsmmLspState", () => state);
    if (!settings.enabled)
        return;
    const anchor = ctx.get("profileContext")?.installAnchor;
    const unavailable = (diagnostic) => {
        state = { state: "unavailable", tools: [], diagnostic };
        if (settings.failOnStartupError)
            throw new Error(`DSMM LSP startup unavailable: ${diagnostic}`);
    };
    if (anchor === undefined) {
        unavailable("host-anchor-unavailable");
        return;
    }
    let plugin;
    try {
        const modulePath = createRequire(anchor).resolve("@deepseek-ai/dsh-mcp-client");
        plugin = await import(pathToFileURL(modulePath).href);
    }
    catch {
        unavailable("native-package-unavailable");
        return;
    }
    if (typeof plugin.apply !== "function") {
        unavailable("native-package-unavailable");
        return;
    }
    try {
        await ctx.plugin(plugin, toDshMcpClientConfig(settings)).await();
    }
    catch {
        unavailable("native-tools-unavailable");
        return;
    }
    const tools = ctx.get("tools");
    const names = tools?.schemas().map((tool) => tool.name).filter((name) => name.startsWith(`mcp__${settings.serverName}__`)) ?? [];
    if (names.length === 0) {
        unavailable("native-tools-unavailable");
        return;
    }
    state = { state: "ready", tools: names };
    ctx.on("tools/change", () => {
        const names = tools.schemas().map((tool) => tool.name).filter((name) => name.startsWith(`mcp__${settings.serverName}__`));
        state = names.length === 0 ? { state: "unavailable", diagnostic: "native-tools-unavailable", tools: [] } : { state: "ready", tools: names };
    });
    ctx.effect(() => () => { state = { state: "unavailable", diagnostic: "native-tools-unavailable", tools: [] }; });
}
export const DEFAULT_DSMM_LSP_SETTINGS = {
    enabled: false,
    serverName: "dsmm_lsp",
    command: "ocmm-lsp",
    args: ["mcp"],
    cwd: "",
    env: {},
    toolCallTimeoutMs: 60000,
    failOnStartupError: true
};
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u;
export function resolveLspSettings(input = {}) {
    const serverName = input.serverName ?? DEFAULT_DSMM_LSP_SETTINGS.serverName;
    validateServerName(serverName);
    const command = input.command ?? DEFAULT_DSMM_LSP_SETTINGS.command;
    if (typeof command !== "string" || command.trim() === "")
        throw new Error("dsmm lsp command must be a non-empty string");
    const args = input.args ?? DEFAULT_DSMM_LSP_SETTINGS.args;
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))
        throw new Error("dsmm lsp args must be an array of strings");
    const env = input.env ?? DEFAULT_DSMM_LSP_SETTINGS.env;
    if (!isStringRecord(env))
        throw new Error("dsmm lsp env must be a string record");
    return {
        enabled: input.enabled ?? DEFAULT_DSMM_LSP_SETTINGS.enabled,
        serverName,
        command,
        args: [...args],
        cwd: input.cwd ?? DEFAULT_DSMM_LSP_SETTINGS.cwd,
        env: { ...env },
        toolCallTimeoutMs: normalizeTimeout(input.toolCallTimeoutMs),
        failOnStartupError: input.failOnStartupError ?? DEFAULT_DSMM_LSP_SETTINGS.failOnStartupError
    };
}
export function toDshMcpClientConfig(input = {}) {
    const settings = resolveLspSettings(input);
    return {
        transport: "stdio",
        serverName: settings.serverName,
        command: settings.command,
        args: settings.args,
        env: settings.env,
        cwd: settings.cwd,
        toolCallTimeoutMs: settings.toolCallTimeoutMs,
        failOnStartupError: settings.failOnStartupError
    };
}
export function publicLspToolName(rawName, serverName = DEFAULT_DSMM_LSP_SETTINGS.serverName) {
    validateServerName(serverName);
    return `mcp__${serverName}__${rawName}`;
}
export function renderLspMcpPatch(input = {}) {
    const settings = resolveLspSettings(input);
    const lines = [
        "# Example only: opt-in dsmm LSP MCP bridge.",
        "# Requires ocmm-lsp to be on PATH or command to be replaced with an absolute wrapper path.",
        "- insert:",
        "    - id: dsmm-lsp-mcp",
        "      name: '@deepseek-ai/dsh-mcp-client'",
        "      config:",
        "        transport: stdio",
        `        serverName: ${renderYamlScalar(settings.serverName)}`,
        `        command: ${renderYamlScalar(settings.command)}`,
        ...renderYamlStringArray("        args", settings.args),
        ...renderYamlStringRecord("        env", settings.env),
        `        cwd: ${renderYamlScalar(settings.cwd)}`,
        `        toolCallTimeoutMs: ${settings.toolCallTimeoutMs}`,
        `        failOnStartupError: ${settings.failOnStartupError}`
    ];
    return `${lines.join("\n")}\n`;
}
export function parseLspSmokeCommand(raw, fallback) {
    const trimmed = raw?.trim();
    if (trimmed === undefined || trimmed === "")
        return [...fallback];
    if (trimmed.startsWith("[")) {
        let parsed;
        try {
            parsed = JSON.parse(trimmed);
        }
        catch (cause) {
            throw new Error("dsmm lsp smoke command must be a non-empty string array when provided as JSON", { cause });
        }
        if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((value) => typeof value !== "string")) {
            throw new Error("dsmm lsp smoke command must be a non-empty string array when provided as JSON");
        }
        return [...parsed];
    }
    return [trimmed, "mcp"];
}
function validateServerName(serverName) {
    if (!SERVER_NAME_PATTERN.test(serverName))
        throw new Error("dsmm lsp serverName must match /^[A-Za-z0-9_-]{1,32}$/u");
}
function normalizeTimeout(value) {
    if (value === undefined || !Number.isFinite(value) || value <= 0)
        return DEFAULT_DSMM_LSP_SETTINGS.toolCallTimeoutMs;
    return Math.floor(value);
}
function isStringRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return false;
    return Object.values(value).every((entry) => typeof entry === "string");
}
function renderYamlStringArray(key, values) {
    if (values.length === 0)
        return [`${key}: []`];
    const itemIndent = `${key.match(/^ */u)?.[0] ?? ""}  `;
    return [
        `${key}:`,
        ...values.map((value) => `${itemIndent}- ${renderYamlScalar(value)}`)
    ];
}
function renderYamlStringRecord(key, values) {
    const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0)
        return [`${key}: {}`];
    const itemIndent = `${key.match(/^ */u)?.[0] ?? ""}  `;
    return [
        `${key}:`,
        ...entries.map(([entryKey, value]) => `${itemIndent}${renderYamlScalar(entryKey)}: ${renderYamlScalar(value)}`)
    ];
}
function renderYamlScalar(value) {
    if (isPlainYamlScalar(value))
        return value;
    return JSON.stringify(value);
}
function isPlainYamlScalar(value) {
    if (value === "")
        return false;
    if (value !== value.trim())
        return false;
    if (!/^[A-Za-z0-9_./-]+$/u.test(value))
        return false;
    if (/^(?:true|false|null|~)$/iu.test(value))
        return false;
    if (/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/iu.test(value))
        return false;
    return !value.startsWith("---") && !value.startsWith("...");
}
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
//# sourceMappingURL=lsp.js.map