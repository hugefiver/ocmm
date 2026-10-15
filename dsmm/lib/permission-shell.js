import { classifyKnownGitWrite, parseShellCommand } from "./shell-command.js";
import { isAbsolute, resolve } from "node:path";
const reads = new Set(["echo", "printf", "pwd", "ls", "cat", "head", "tail", "wc", "rg", "grep", "write-output", "get-location", "get-childitem", "get-content"]);
const localWrites = new Set(["mkdir", "touch", "cp", "mv", "tee", "new-item", "set-content", "add-content", "copy-item", "move-item"]);
const destroys = new Set(["rm", "rmdir", "del", "erase", "remove-item", "format-volume"]);
const rank = { read: 0, "local-write": 1, "external-write": 2, destructive: 3, unknown: 4 };
const base = (name) => name.replace(/^.*[\\/]/u, "").replace(/\.exe$/iu, "").toLowerCase();
const readFlags = {
    echo: ["-n", "-e", "-E"], printf: [], pwd: ["-L", "-P"], ls: ["-l", "-a", "-A", "-h", "-1", "--color=never"],
    cat: ["-n", "-b", "-s", "-v", "-e", "-t"], head: [], tail: [], wc: ["-l", "-w", "-c", "-m", "-L"],
    rg: ["-n", "--line-number", "-i", "--ignore-case", "-F", "--fixed-strings", "-l", "--files-with-matches", "--files", "--no-config", "--hidden", "--no-ignore", "--color=never"],
    grep: ["-n", "--line-number", "-i", "--ignore-case", "-F", "--fixed-strings", "-E", "--extended-regexp", "-r", "-R", "-l", "-c", "-v"],
    "write-output": ["-noenumerate"], "get-location": [], "get-childitem": ["-recurse", "-force", "-name", "-file", "-directory"], "get-content": ["-raw"],
};
const gitReadFlags = {
    status: ["-s", "--short", "-b", "--branch", "--porcelain", "--porcelain=v1", "--porcelain=v2"],
    diff: ["--no-ext-diff", "--no-textconv", "--stat", "--name-only", "--name-status", "--cached", "--staged", "--quiet", "--exit-code"],
    log: ["--oneline", "--no-decorate", "--no-color", "--no-ext-diff", "--no-textconv"],
    show: ["--stat", "--name-only", "--name-status", "--no-color", "--no-ext-diff", "--no-textconv"],
    "ls-files": ["--cached", "--stage", "--others", "--exclude-standard"], "rev-parse": ["--show-toplevel", "--git-dir", "--is-inside-work-tree", "--verify"],
    "rev-list": ["--count", "--all"], describe: ["--tags", "--always", "--abbrev=0"], version: [],
};
function knownReadArguments(command, args) {
    let flags, operands = args;
    if (command === "git") {
        if (operands[0] === "--no-pager")
            operands = operands.slice(1);
        const subcommand = operands[0];
        if (subcommand === undefined || !Object.hasOwn(gitReadFlags, subcommand))
            return false;
        flags = gitReadFlags[subcommand];
        operands = operands.slice(1);
    }
    else
        flags = readFlags[command];
    const cmdlet = command.startsWith("get-") || command === "write-output";
    for (let index = 0; index < operands.length; index++) {
        const argument = operands[index], option = cmdlet ? argument.toLowerCase() : argument;
        if (!cmdlet && option === "--")
            return true;
        if (!argument.startsWith("-"))
            continue;
        if (flags.includes(option))
            continue;
        if (cmdlet && ["get-content", "get-childitem"].includes(command) && ["-path", "-literalpath"].includes(option) && operands[index + 1] !== undefined) {
            index++;
            continue;
        }
        return false;
    }
    return true;
}
/** Classification supports exact-operation authorization, not filesystem or network isolation. */
export function classifyPermissionShell(identity, args, cwd, execution) {
    const row = typeof args === "object" && args !== null && !Array.isArray(args) ? args : {};
    const command = typeof row[identity.commandField] === "string" ? row[identity.commandField] : "";
    const explicitCwd = identity.cwdField !== undefined && typeof row[identity.cwdField] === "string" ? row[identity.cwdField] : undefined;
    const workingDirectory = explicitCwd === undefined ? cwd : cwd !== "" && !isAbsolute(explicitCwd) ? resolve(cwd, explicitCwd) : explicitCwd;
    let effect = "read";
    const operations = [];
    // Dynamic evaluation, interpolation, script blocks, wrappers and malformed quotes
    // remain exact-once asks. No command family wildcard is created from them.
    // PowerShell smart quotes are lexical delimiters unsupported by the ASCII tokenizer.
    const unsupportedQuotes = identity.dialect === "powershell" && /[\u2018-\u201f]/u.test(command);
    const dynamic = unsupportedQuotes || command === "" || /[$`{}()]/u.test(command) || /\b(?:eval|exec|invoke-expression|iex|cmd|pwsh|powershell|bash|sh|zsh|env|sudo|node|python)\b/iu.test(command)
        || (command.match(/'/gu)?.length ?? 0) % 2 !== 0 || (command.match(/"/gu)?.length ?? 0) % 2 !== 0;
    for (const segment of parseShellCommand(command, identity.dialect)) {
        const token = segment.words[0] ?? "";
        const trusted = identity.readCapability?.signal.aborted === false ? identity.readCapability.resolveExecutable(token, workingDirectory, execution) : undefined;
        const name = trusted ?? base(token);
        let next = "unknown", operation = name;
        if (name === "git") {
            const write = classifyKnownGitWrite(segment.words.map(word => JSON.stringify(word)).join(" "), identity.dialect);
            const sub = segment.words[1]?.toLowerCase();
            operation = `git:${write ?? sub ?? "unknown"}`;
            if (write !== undefined) {
                next = write === "push" ? "external-write" : ["clean", "reset --hard", "rm", "stash drop", "stash clear"].includes(write) ? "destructive" : "local-write";
            }
            else if (trusted === "git" && knownReadArguments("git", segment.words.slice(1)))
                next = "read";
            if (segment.words.slice(1).some(word => /^-(?:c|C)(?:.+)?$/u.test(word) || /^--(?:config-env|exec-path|git-dir|work-tree)(?:=|$)/u.test(word)))
                next = "unknown";
        }
        else if (reads.has(name) && trusted !== undefined && knownReadArguments(trusted, segment.words.slice(1)))
            next = "read";
        else if (localWrites.has(name))
            next = "local-write";
        else if (destroys.has(name))
            next = "destructive";
        if (/[\\/]/u.test(token) && trusted === undefined)
            next = "unknown";
        if (segment.tokens.some(token => token.kind === "operator" && token.value.includes(">")) && rank[next] < rank["local-write"])
            next = "local-write";
        if (rank[next] > rank[effect])
            effect = next;
        operations.push(operation);
    }
    if (dynamic || operations.length === 0)
        effect = "unknown";
    return Object.freeze({ effect, operations: Object.freeze(operations), rememberable: effect !== "unknown" && workingDirectory !== "", executable: identity.executable, command, workingDirectory });
}
/** Typed DSMM extraction, not an SDK operand field. Undefined means exact native ask, not inside. */
export function parsePermissionShellReadPaths(identity, args, cwd, execution) {
    const operation = classifyPermissionShell(identity, args, cwd, execution);
    if (operation.effect !== "read" || operation.workingDirectory === "" || identity.readCapability === undefined)
        return undefined;
    if (/[|<>]/u.test(operation.command))
        return undefined;
    const paths = [];
    for (const segment of parseShellCommand(operation.command, identity.dialect)) {
        // Redirects, pipelines, wildcard expansion and Git object/pathspec semantics require an exact question.
        if (segment.tokens.some(token => token.kind === "operator" && ![";", "&&"].includes(token.value)))
            return undefined;
        const command = identity.readCapability.resolveExecutable(segment.words[0], operation.workingDirectory, execution);
        if (command === undefined || command === "git")
            return undefined;
        if (["echo", "printf", "pwd", "write-output", "get-location"].includes(command))
            continue;
        const operands = [];
        let options = true;
        for (const word of segment.words.slice(1)) {
            if (word === "--" && options) {
                options = false;
                continue;
            }
            if (options && word.startsWith("-"))
                continue;
            operands.push(word);
        }
        if (command === "rg" || command === "grep") {
            if (!(command === "rg" && segment.words.includes("--files"))) {
                if (operands.length === 0)
                    return undefined;
                operands.shift();
            }
            if (operands.length === 0)
                operands.push(".");
        }
        else if (["ls", "get-childitem"].includes(command) && operands.length === 0)
            operands.push(".");
        // Missing file operands use stdin, which may be supplied by unparsed shell syntax.
        else if (operands.length === 0)
            return undefined;
        if (operands.some(path => path === "-" || /[*?\[\]]/u.test(path) || /^~(?:[\\/]|$)/u.test(path)))
            return undefined;
        paths.push(...operands);
    }
    return Object.freeze({ workingDirectory: operation.workingDirectory, paths: Object.freeze(paths) });
}
//# sourceMappingURL=permission-shell.js.map