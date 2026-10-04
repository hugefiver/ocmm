export declare const DSMM_LSP_SERVER_NAME = "dsmm_lsp";
export declare const DSMM_LSP_TOOL_NAMES: readonly ["status", "diagnostics", "goto_definition", "find_references", "find_symbol_related", "symbols", "prepare_rename", "rename", "format"];
export type DsmmLspToolName = (typeof DSMM_LSP_TOOL_NAMES)[number];
export interface DsmmLspSettings {
    enabled: boolean;
    serverName: string;
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    toolCallTimeoutMs: number;
    failOnStartupError: boolean;
}
export interface DshMcpStdioConfig {
    transport: "stdio";
    serverName: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd: string;
    toolCallTimeoutMs: number;
    failOnStartupError: boolean;
}
export declare const DEFAULT_DSMM_LSP_SETTINGS: DsmmLspSettings;
export declare function resolveLspSettings(input?: Partial<DsmmLspSettings>): DsmmLspSettings;
export declare function toDshMcpClientConfig(input?: Partial<DsmmLspSettings>): DshMcpStdioConfig;
export declare function publicLspToolName(rawName: DsmmLspToolName, serverName?: string): string;
export declare function renderLspMcpPatch(input?: Partial<DsmmLspSettings>): string;
export declare function parseLspSmokeCommand(raw: string | undefined, fallback: readonly string[]): string[];
//# sourceMappingURL=lsp.d.ts.map