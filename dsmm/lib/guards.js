import { isDsmmRoleId } from "./roles.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
import { validatePlanMutation } from "./plan-validation.js";
import { classifyKnownGitWrite, classifyShellDialectViolation } from "./shell-command.js";
import { resolveAdmittedDsmmRole } from "./role-policy.js";
import { Context } from "@deepseek-ai/cordis";
import { nativeStandingFullAccess } from "./permission-native-access.js";
import { DsmmProfileError } from "./profiles.js";
export const DSMM_GUARD_PREFIX = "[dsmm safety]";
const STRUCTURED_TODO_PATTERN = /^\[[^\]]+\]\s+\[[^\]]+\]\s+to\s+.+\s+-\s+expect\s+.+/u;
function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
function stringField(value, keys) {
    const record = asRecord(value);
    if (record === undefined)
        return undefined;
    for (const key of keys) {
        if (typeof record[key] === "string")
            return record[key];
    }
    return undefined;
}
function toolName(exec) {
    return exec.name.toLowerCase();
}
function commandText(exec) {
    return stringField(exec.arguments, ["command", "cmd", "script"]);
}
function allText(content) {
    let text = "";
    for (const block of content) {
        if (block.type !== "text" || typeof block.text !== "string")
            return undefined;
        text += block.text;
    }
    return text;
}
function utf8Bytes(text) {
    return Buffer.byteLength(text, "utf8");
}
function takeUtf8Start(text, maxBytes) {
    let used = 0;
    let output = "";
    for (const char of text) {
        const size = utf8Bytes(char);
        if (used + size > maxBytes)
            break;
        used += size;
        output += char;
    }
    return output;
}
function takeUtf8End(text, maxBytes) {
    let used = 0;
    const output = [];
    const chars = Array.from(text);
    for (let index = chars.length - 1; index >= 0; index -= 1) {
        const char = chars[index];
        const size = utf8Bytes(char);
        if (used + size > maxBytes)
            break;
        used += size;
        output.push(char);
    }
    return output.reverse().join("");
}
export function truncateTextMiddle(text, maxBytes, toolName) {
    if (utf8Bytes(text) <= maxBytes)
        return text;
    const shortNotice = `${DSMM_GUARD_PREFIX} truncated ${toolName} output.`;
    const notice = `\n\n${DSMM_GUARD_PREFIX} truncated ${toolName} output...\n\n`;
    if (maxBytes <= utf8Bytes(notice) + 10)
        return takeUtf8Start(shortNotice, maxBytes);
    const budget = maxBytes - utf8Bytes(notice);
    const head = Math.ceil(budget / 2);
    const tail = Math.floor(budget / 2);
    return `${takeUtf8Start(text, head)}${notice}${takeUtf8End(text, tail)}`;
}
export function isSafetyScopeActive(exec, settings, controller) {
    if (settings.guards.scope === "off")
        return false;
    if (settings.guards.scope === "always")
        return true;
    if (!settings.modules.deepwork.enabled)
        return false;
    if (exec.agent !== undefined && resolveAdmittedDsmmRole(exec.agent, settings, false) !== undefined)
        return true;
    if (controller.active(exec.agent, settings.defaultActive))
        return true;
    return isDsmmRoleId(resolveSelectedAgentPreset(exec.agent?.session));
}
function shellDialect(exec) {
    const name = toolName(exec);
    if (name === "bash" || name === "sh" || name === "zsh")
        return "posix";
    if (name === "pwsh" || name === "powershell")
        return "powershell";
    return undefined;
}
function shellSafetyDecision(exec) {
    const dialect = shellDialect(exec);
    const command = commandText(exec);
    if (dialect === undefined || command === undefined)
        return undefined;
    const violation = classifyShellDialectViolation(command, dialect);
    if (violation === undefined)
        return undefined;
    return shellDialectViolationDecision(violation);
}
function shellDialectViolationDecision(violation) {
    if (violation === "powershell-export") {
        return {
            kind: "deny",
            reason: `${DSMM_GUARD_PREFIX} PowerShell command appears to use POSIX shell syntax (\`export\`). Use \`$env:NAME = "value"; command\` instead.`
        };
    }
    if (violation === "powershell-source") {
        return {
            kind: "deny",
            reason: `${DSMM_GUARD_PREFIX} PowerShell command uses POSIX \`source\`. Use dot-sourcing with a .ps1 file instead.`
        };
    }
    if (violation === "powershell-dev-null") {
        return {
            kind: "deny",
            reason: `${DSMM_GUARD_PREFIX} PowerShell command uses POSIX null redirection (/dev/null). Use \`*> $null\` or omit redirection.`
        };
    }
    return {
        kind: "deny",
        reason: `${DSMM_GUARD_PREFIX} bash command appears to use PowerShell syntax (\`$env:\`). Use POSIX environment syntax for bash.`
    };
}
function gitWriteDecision(exec, settings) {
    if (settings.guards.gitWriteGuard === "off")
        return undefined;
    const command = commandText(exec);
    const dialect = shellDialect(exec);
    const operation = command === undefined || dialect === undefined ? undefined : classifyKnownGitWrite(command, dialect);
    if (operation === undefined)
        return undefined;
    if (settings.guards.gitWriteGuard === "deny") {
        return {
            kind: "deny",
            reason: `${DSMM_GUARD_PREFIX} git write command is disabled by dsmm settings: git ${operation}`
        };
    }
    return {
        kind: "ask",
        reason: `${DSMM_GUARD_PREFIX} git write command requires explicit user approval before running: git ${operation}`
    };
}
function questionLabelDecision(exec, settings) {
    if (!settings.guards.questionLabelHelper.enabled || toolName(exec) !== "ask_user_question")
        return undefined;
    const questions = asRecord(exec.arguments)?.questions;
    if (!Array.isArray(questions))
        return undefined;
    const limit = settings.guards.questionLabelHelper.maxLabelChars;
    for (const question of questions) {
        const options = asRecord(question)?.options;
        if (!Array.isArray(options))
            continue;
        for (const option of options) {
            const label = asRecord(option)?.label;
            if (typeof label !== "string" || label.length <= limit)
                continue;
            return {
                kind: "deny",
                reason: `${DSMM_GUARD_PREFIX} question option label exceeds ${String(limit)} characters: ${label}`
            };
        }
    }
    return undefined;
}
function todoDisciplineDecision(exec, settings) {
    if (toolName(exec) !== "todo_write")
        return undefined;
    const todos = asRecord(exec.arguments)?.todos;
    if (!Array.isArray(todos))
        return undefined;
    const todoRecords = todos.map(asRecord);
    const unfinished = todoRecords.some((todo) => todo?.status !== "completed");
    if (unfinished) {
        const active = todoRecords.filter((todo) => todo?.status === "in_progress").length;
        if (active === 0) {
            return {
                kind: "deny",
                reason: `${DSMM_GUARD_PREFIX} todo list must keep at least one in_progress item while unfinished work remains; parallel work follows the host todo policy.`
            };
        }
    }
    if (settings.workflow.policy !== "legacy")
        return undefined;
    const malformed = todoRecords.find((todo) => typeof todo?.content === "string" && !STRUCTURED_TODO_PATTERN.test(todo.content));
    if (typeof malformed?.content !== "string")
        return undefined;
    return {
        kind: "deny",
        reason: `${DSMM_GUARD_PREFIX} todo content must use "[WHERE] [HOW] to [WHY] - expect [RESULT]": ${malformed.content}`
    };
}
export function decidePreToolExecution(exec, settings, controller, nativeFullAccess = false) {
    if (!isSafetyScopeActive(exec, settings, controller))
        return undefined;
    if (nativeFullAccess)
        return settings.guards.gitWriteGuard === "deny" ? gitWriteDecision(exec, settings) : undefined;
    if (settings.guards.shellCommandSafety) {
        const shell = shellSafetyDecision(exec);
        if (shell !== undefined)
            return shell;
    }
    const git = gitWriteDecision(exec, settings);
    if (git !== undefined)
        return git;
    if (!settings.modules.deepwork.enabled)
        return undefined;
    if (settings.guards.planFormatValidation) {
        const plan = validatePlanMutation(exec);
        if (plan !== undefined)
            return plan;
    }
    const question = questionLabelDecision(exec, settings);
    if (question !== undefined)
        return question;
    if (settings.guards.todoDisciplineHelper) {
        const todo = todoDisciplineDecision(exec, settings);
        if (todo !== undefined)
            return todo;
    }
    return undefined;
}
export function decidePostToolExecution(exec, result, decision, settings, controller) {
    const truncation = settings.guards.toolOutputTruncation;
    if (!settings.modules.deepwork.enabled || !truncation.enabled || !isSafetyScopeActive(exec, settings, controller))
        return decision;
    if (result.isError || decision.kind !== "accept" || "value" in decision)
        return decision;
    const content = decision.content ?? result.content;
    const text = allText(content);
    if (text === undefined || utf8Bytes(text) <= truncation.maxInlineBytes)
        return decision;
    return {
        ...decision,
        content: [{ type: "text", text: truncateTextMiddle(text, truncation.maxInlineBytes, exec.name) }]
    };
}
export function registerSafetyGuards(ctx, controller, getSettings, rolePolicy) {
    const truncationLimits = new WeakMap();
    const tools = ctx.get?.("tools");
    if (rolePolicy !== undefined && tools !== undefined) {
        const guard = tools.guard((execution) => execution.agent === undefined ? undefined : rolePolicy.toolDenial(execution.agent, execution.name, tools, execution));
        ctx.effect?.(() => guard);
    }
    ctx.on?.("tools/pre-execute", async (exec, next) => {
        const execution = exec;
        const full = Context.is(ctx) && nativeStandingFullAccess(ctx, exec.agent);
        rolePolicy?.captureToolExecution(execution, full);
        const denied = exec.agent === undefined ? undefined : full ? rolePolicy?.toolBlacklistDenial(exec.agent, exec.name, execution) : rolePolicy?.preToolDenial(exec.agent, exec.name, undefined, execution);
        if (denied !== undefined)
            return { kind: "deny", reason: denied };
        let settings;
        try {
            settings = getSettings(exec.agent);
        }
        catch (error) {
            if (full && error instanceof DsmmProfileError && !["disposed", "not-owned", "cancelled"].includes(error.code))
                return next();
            throw error;
        }
        const decision = decidePreToolExecution(exec, settings, controller, full);
        if (!full && settings.modules.deepwork.enabled && settings.guards.toolOutputTruncation.enabled && isSafetyScopeActive(exec, settings, controller))
            truncationLimits.set(exec, settings.guards.toolOutputTruncation.maxInlineBytes);
        if (decision === undefined)
            return next();
        if (decision.kind === "deny")
            return decision;
        const downstream = await next();
        return downstream.kind === "allow" ? decision : downstream;
    }, { prepend: true });
    ctx.on?.("tools/post-execute", async (exec, result, next) => {
        const decision = await next();
        const limit = truncationLimits.get(exec);
        if (limit === undefined || result.isError || decision.kind !== "accept" || "value" in decision)
            return decision;
        const text = allText(decision.content ?? result.content);
        return text === undefined || utf8Bytes(text) <= limit ? decision : { ...decision, content: [{ type: "text", text: truncateTextMiddle(text, limit, exec.name) }] };
    }, { prepend: true });
}
//# sourceMappingURL=guards.js.map