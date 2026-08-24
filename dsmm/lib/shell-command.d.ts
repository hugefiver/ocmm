export type ShellDialect = "posix" | "powershell";
export type ShellToken = {
    kind: "word";
    value: string;
    quoted: boolean;
} | {
    kind: "operator";
    value: string;
};
export interface ParsedShellSegment {
    tokens: readonly ShellToken[];
    words: readonly string[];
}
export declare function parseShellCommand(input: string, dialect: ShellDialect): readonly ParsedShellSegment[];
export declare function classifyKnownGitWrite(input: string, dialect: ShellDialect): string | undefined;
export type ShellDialectViolation = "powershell-export" | "powershell-source" | "powershell-dev-null" | "posix-powershell-env";
export declare function classifyShellDialectViolation(input: string, dialect: ShellDialect): ShellDialectViolation | undefined;
//# sourceMappingURL=shell-command.d.ts.map