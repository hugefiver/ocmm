import { isAbsolute, normalize, parse, resolve } from "node:path";
import { parseNativeCommands } from "./permission-settings.js";
import { PermissionRefusal } from "./permission-errors.js";
/** Host-only validation: Windows drive-relative roots never authorize an enhancement. */
export function parseHostNativeCommands(input = {}) {
    const settings = parseNativeCommands(input);
    return Object.freeze({ enabled: settings.enabled, entries: Object.freeze(settings.entries.map(entry => {
            const cwd = entry.match.workingDirectory;
            if (!isAbsolute(cwd) || process.platform === "win32" && parse(normalize(cwd)).root.length === 1)
                throw new PermissionRefusal("validation");
            return Object.freeze({ ...entry, match: Object.freeze({ ...entry.match, workingDirectory: normalize(cwd) }) });
        })) });
}
/** Finite literal grammar: ASCII blanks, bare literal tokens, and static quotes.
 * POSIX quote fragments concatenate; PowerShell quotes must enclose a whole operand.
 * Unsupported syntax retains the ordinary native path. */
export function literalCommand(command, dialect) {
    if (/[\u0000-\u0008\u000a-\u001f\u007f-\u009f\u2018-\u201f]/u.test(command) || command.includes("--%"))
        return undefined;
    const words = [];
    let word = "", quote = "", started = false;
    for (let index = 0; index < command.length; index++) {
        const char = command[index];
        if (quote !== "") {
            if (char === quote) {
                if (dialect === "powershell" && quote === "'" && command[index + 1] === "'") {
                    word += "'";
                    index++;
                }
                else {
                    // Adjacent PowerShell double quotes encode an embedded quote, not concatenation.
                    if (dialect === "powershell" && index + 1 < command.length && command[index + 1] !== " " && command[index + 1] !== "\t")
                        return undefined;
                    quote = "";
                }
            }
            else if ((dialect === "powershell" && char === '"') || (quote === '"' && (char === "$" || char === "`")))
                return undefined;
            else if (char === "\\" && dialect === "posix" && quote === '"' && /[\\$`"]/u.test(command[index + 1] ?? ""))
                return undefined;
            else
                word += char;
        }
        else if (char === "'" || char === '"') {
            // A quoted PowerShell command name is an expression without a call operator.
            if (dialect === "powershell" && (started || words.length === 0))
                return undefined;
            quote = char;
            started = true;
        }
        else if (char === " " || char === "\t") {
            if (started) {
                words.push(word);
                word = "";
                started = false;
            }
        }
        else if (!/[\p{L}\p{M}\p{N}_./:=+%\-]/u.test(char) && !(char === "\\" && dialect === "powershell"))
            return undefined;
        else {
            word += char;
            started = true;
        }
    }
    if (quote !== "")
        return undefined;
    if (started)
        words.push(word);
    if (!words.length || words[0] === "" || words[0].includes("=") || dialect === "powershell" && /^(?:[\d+\-]|\.\d)/u.test(words[0])
        || /^(?:\.|eval|exec|invoke-expression|iex|cmd(?:\.exe)?|pwsh(?:\.exe)?|powershell(?:\.exe)?|bash|sh|zsh|env|sudo|node(?:\.exe)?|python[\d.]*(?:\.exe)?|command|builtin|time|if|then|elif|elseif|else|fi|for|foreach|while|until|do|done|case|esac|in|function|select|coproc|return|throw|exit|break|continue|trap|switch|try|catch|finally|class|enum|using|param|dynamicparam|filter|data|begin|process|end|configuration|workflow|parallel|sequence|default|define|from|var)$/iu.test(words[0].replace(/^.*[\\/]/u, "")))
        return undefined;
    return Object.freeze(words);
}
export function nativeCommandMatch(settings, tool, identity, args, workspace) {
    if (!settings.enabled || args === null || typeof args !== "object")
        return undefined;
    const command = Reflect.get(args, identity.commandField), modelCwd = identity.cwdField === undefined ? undefined : Reflect.get(args, identity.cwdField);
    if (typeof command !== "string" || !isAbsolute(workspace) || modelCwd !== undefined && typeof modelCwd !== "string")
        return undefined;
    const cwd = normalize(modelCwd === undefined ? workspace : resolve(workspace, modelCwd));
    const words = literalCommand(command, identity.dialect);
    if (words === undefined)
        return undefined;
    const matches = parseHostNativeCommands(settings).entries.filter(entry => {
        const match = entry.match, argv = match.subcommand === undefined ? words.slice(1) : words.slice(2);
        return match.tool === tool && match.executable === words[0] && normalize(match.workingDirectory) === cwd
            && (match.subcommand === undefined || match.subcommand === words[1]) && argv.length === match.args.length && argv.every((value, index) => value === match.args[index]);
    });
    if (new Set(matches.map(entry => entry.sandboxMode)).size > 1)
        return "ambiguous";
    return matches.find(entry => entry.mode === "ask") ?? matches[0];
}
//# sourceMappingURL=permission-native-command.js.map