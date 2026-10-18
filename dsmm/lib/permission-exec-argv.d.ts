import type { ToolExecution } from "@deepseek-ai/dsh-tools";
import type { Context } from "@deepseek-ai/cordis";
import type { TemporaryPermissionGrants } from "./permission-temporary-grants.js";
export interface ArgvInput {
    readonly executable: string;
    readonly args: readonly string[];
    readonly cwd: string;
}
export interface ArgvPermissionAuthority {
    readonly owner: object;
    readonly generation: string | number;
    readonly sessionSignal: AbortSignal;
    /** Includes live ownership and absolute role/readonly ceilings, not a config-revision veto. */
    assertIntegrity(): void;
    /** Initial admission and reusable permits include every applicable command/path/tool deny. */
    assertProgramAllowed(): void;
    /** A child additionally needs its current explicit operator interaction authority. */
    assertRetentionAllowed?(): void;
}
export interface ArgvPermissionOptions {
    readonly grants: TemporaryPermissionGrants;
    capture(execution: Readonly<ToolExecution>, input: ArgvInput): ArgvPermissionAuthority;
    /** Explicit Host classification; unknown programs and interpreters are once-only. */
    programKind(executable: string): "native" | "interpreter" | "unknown";
    readonly environment?: Readonly<Record<string, string | undefined>>;
    readonly maxOutputBytes?: number;
    readonly timeoutMs?: number;
}
export declare function effectiveArgvEnvironment(overrides: Readonly<Record<string, string | undefined>>, parent?: Record<string, string>): string;
/** Explicit argv only. Native shell tools keep their own semantics and approvals. */
export declare function installPermissionExecArgv(ctx: Context, options: ArgvPermissionOptions): () => void;
//# sourceMappingURL=permission-exec-argv.d.ts.map