import type { NativeCommandEntry, NativeCommandsSettings } from "./permission-settings.js";
import type { PermissionShellIdentity } from "./permission-shell.js";
/** Host-only validation: Windows drive-relative roots never authorize an enhancement. */
export declare function parseHostNativeCommands(input?: unknown): NativeCommandsSettings;
/** Finite literal grammar: ASCII blanks, bare literal tokens, and static quotes.
 * POSIX quote fragments concatenate; PowerShell quotes must enclose a whole operand.
 * Unsupported syntax retains the ordinary native path. */
export declare function literalCommand(command: string, dialect: PermissionShellIdentity["dialect"]): readonly string[] | undefined;
export declare function nativeCommandMatch(settings: NativeCommandsSettings, tool: "bash" | "pwsh", identity: PermissionShellIdentity, args: unknown, workspace: string): NativeCommandEntry | "ambiguous" | undefined;
//# sourceMappingURL=permission-native-command.d.ts.map