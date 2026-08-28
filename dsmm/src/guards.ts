import type { DshContentBlock, DshContext, DshPostToolDecision, DshPreToolDecision, DshToolExecution, DshToolExecutionResult } from "./dsh-types.js";
import { isDsmmRoleId } from "./roles.js";
import type { DsmmSettings } from "./settings.js";
import { resolveSelectedAgentPreset } from "./session-scope.js";
import { validatePlanMutation } from "./plan-validation.js";
import { classifyKnownGitWrite, classifyShellDialectViolation } from "./shell-command.js";
import type { ShellDialect, ShellDialectViolation } from "./shell-command.js";
import type { DeepworkModeController } from "./state.js";

export const DSMM_GUARD_PREFIX = "[dsmm safety]";

const STRUCTURED_TODO_PATTERN = /^\[[^\]]+\]\s+\[[^\]]+\]\s+to\s+.+\s+-\s+expect\s+.+/u;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringField(value: unknown, keys: readonly string[]): string | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;

  for (const key of keys) {
    if (typeof record[key] === "string") return record[key];
  }

  return undefined;
}

function toolName(exec: DshToolExecution): string {
  return exec.name.toLowerCase();
}

function commandText(exec: DshToolExecution): string | undefined {
  return stringField(exec.arguments, ["command", "cmd", "script"]);
}

function allText(content: readonly DshContentBlock[]): string | undefined {
  let text = "";
  for (const block of content) {
    if (block.type !== "text" || typeof block.text !== "string") return undefined;
    text += block.text;
  }
  return text;
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function takeUtf8Start(text: string, maxBytes: number): string {
  let used = 0;
  let output = "";
  for (const char of text) {
    const size = utf8Bytes(char);
    if (used + size > maxBytes) break;
    used += size;
    output += char;
  }
  return output;
}

function takeUtf8End(text: string, maxBytes: number): string {
  let used = 0;
  const output: string[] = [];
  const chars = Array.from(text);
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index];
    const size = utf8Bytes(char);
    if (used + size > maxBytes) break;
    used += size;
    output.push(char);
  }
  return output.reverse().join("");
}

export function truncateTextMiddle(text: string, maxBytes: number, toolName: string): string {
  if (utf8Bytes(text) <= maxBytes) return text;

  const shortNotice = `${DSMM_GUARD_PREFIX} truncated ${toolName} output.`;
  const notice = `\n\n${DSMM_GUARD_PREFIX} truncated ${toolName} output...\n\n`;
  if (maxBytes <= utf8Bytes(notice) + 10) return takeUtf8Start(shortNotice, maxBytes);

  const budget = maxBytes - utf8Bytes(notice);
  const head = Math.ceil(budget / 2);
  const tail = Math.floor(budget / 2);
  return `${takeUtf8Start(text, head)}${notice}${takeUtf8End(text, tail)}`;
}

export function isSafetyScopeActive(exec: DshToolExecution, settings: DsmmSettings, controller: DeepworkModeController): boolean {
  if (settings.guards.scope === "off") return false;
  if (settings.guards.scope === "always") return true;
  if (controller.active(exec.agent, settings.defaultActive)) return true;
  return isDsmmRoleId(resolveSelectedAgentPreset(exec.agent?.session));
}

function shellDialect(exec: DshToolExecution): ShellDialect | undefined {
  const name = toolName(exec);
  if (name === "bash" || name === "sh" || name === "zsh") return "posix";
  if (name === "pwsh" || name === "powershell") return "powershell";
  return undefined;
}

function shellSafetyDecision(exec: DshToolExecution): DshPreToolDecision | undefined {
  const dialect = shellDialect(exec);
  const command = commandText(exec);
  if (dialect === undefined || command === undefined) return undefined;

  const violation = classifyShellDialectViolation(command, dialect);
  if (violation === undefined) return undefined;
  return shellDialectViolationDecision(violation);
}

function shellDialectViolationDecision(violation: ShellDialectViolation): DshPreToolDecision {
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

function gitWriteDecision(exec: DshToolExecution, settings: DsmmSettings): DshPreToolDecision | undefined {
  if (settings.guards.gitWriteGuard === "off") return undefined;

  const command = commandText(exec);
  const dialect = shellDialect(exec);
  const operation = command === undefined || dialect === undefined ? undefined : classifyKnownGitWrite(command, dialect);
  if (operation === undefined) return undefined;

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

function questionLabelDecision(exec: DshToolExecution, settings: DsmmSettings): DshPreToolDecision | undefined {
  if (!settings.guards.questionLabelHelper.enabled || toolName(exec) !== "ask_user_question") return undefined;

  const questions = asRecord(exec.arguments)?.questions;
  if (!Array.isArray(questions)) return undefined;

  const limit = settings.guards.questionLabelHelper.maxLabelChars;
  for (const question of questions) {
    const options = asRecord(question)?.options;
    if (!Array.isArray(options)) continue;

    for (const option of options) {
      const label = asRecord(option)?.label;
      if (typeof label !== "string" || label.length <= limit) continue;

      return {
        kind: "deny",
        reason: `${DSMM_GUARD_PREFIX} question option label exceeds ${String(limit)} characters: ${label}`
      };
    }
  }

  return undefined;
}

function todoDisciplineDecision(exec: DshToolExecution): DshPreToolDecision | undefined {
  if (toolName(exec) !== "todo_write") return undefined;

  const todos = asRecord(exec.arguments)?.todos;
  if (!Array.isArray(todos)) return undefined;

  const todoRecords = todos.map(asRecord);
  const unfinished = todoRecords.some((todo) => todo?.status !== "completed");
  if (unfinished) {
    const active = todoRecords.filter((todo) => todo?.status === "in_progress").length;
    if (active !== 1) {
      return {
        kind: "deny",
        reason: `${DSMM_GUARD_PREFIX} todo list must keep exactly one in_progress item while unfinished work remains.`
      };
    }
  }

  const malformed = todoRecords.find((todo) => typeof todo?.content === "string" && !STRUCTURED_TODO_PATTERN.test(todo.content));
  if (typeof malformed?.content !== "string") return undefined;

  return {
    kind: "deny",
    reason: `${DSMM_GUARD_PREFIX} todo content must use "[WHERE] [HOW] to [WHY] - expect [RESULT]": ${malformed.content}`
  };
}

export function decidePreToolExecution(exec: DshToolExecution, settings: DsmmSettings, controller: DeepworkModeController): DshPreToolDecision | undefined {
  if (!isSafetyScopeActive(exec, settings, controller)) return undefined;

  if (settings.guards.shellCommandSafety) {
    const shell = shellSafetyDecision(exec);
    if (shell !== undefined) return shell;
  }

  const git = gitWriteDecision(exec, settings);
  if (git !== undefined) return git;

  if (settings.guards.planFormatValidation) {
    const plan = validatePlanMutation(exec);
    if (plan !== undefined) return plan;
  }

  const question = questionLabelDecision(exec, settings);
  if (question !== undefined) return question;

  if (settings.guards.todoDisciplineHelper) {
    const todo = todoDisciplineDecision(exec);
    if (todo !== undefined) return todo;
  }

  return undefined;
}

export function decidePostToolExecution(
  exec: DshToolExecution,
  result: Readonly<DshToolExecutionResult>,
  decision: DshPostToolDecision,
  settings: DsmmSettings,
  controller: DeepworkModeController
): DshPostToolDecision {
  const truncation = settings.guards.toolOutputTruncation;
  if (!truncation.enabled || !isSafetyScopeActive(exec, settings, controller)) return decision;
  if (decision.kind !== "accept" || "value" in decision) return decision;

  const content = decision.content ?? result.content;
  const text = allText(content);
  if (text === undefined || utf8Bytes(text) <= truncation.maxInlineBytes) return decision;

  return {
    ...decision,
    content: [{ type: "text", text: truncateTextMiddle(text, truncation.maxInlineBytes, exec.name) }]
  };
}

export function registerSafetyGuards(ctx: DshContext, controller: DeepworkModeController, getSettings: () => DsmmSettings): void {
  ctx.on?.("tools/pre-execute", async (exec: DshToolExecution, next: () => Promise<DshPreToolDecision>) => {
    const decision = decidePreToolExecution(exec, getSettings(), controller);
    if (decision === undefined) return next();
    if (decision.kind === "deny") return decision;

    const downstream = await next();
    return downstream.kind === "allow" ? decision : downstream;
  }, { prepend: true });

  ctx.on?.("tools/post-execute", async (exec: DshToolExecution, result: DshToolExecutionResult, next: () => Promise<DshPostToolDecision>) => {
    const decision = await next();
    return decidePostToolExecution(exec, result, decision, getSettings(), controller);
  }, { prepend: true });
}
