import type { DshContentBlock, DshContext, DshPostToolDecision, DshPreToolDecision, DshToolExecution, DshToolExecutionResult } from "./dsh-types.js";
import { DSMM_ROLE_IDS } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettings } from "./settings.js";
import type { DeepworkModeController } from "./state.js";

export const DSMM_GUARD_PREFIX = "[dsmm safety]";

const STRUCTURED_TODO_PATTERN = /^\[[^\]]+\]\s+\[[^\]]+\]\s+to\s+.+\s+-\s+expect\s+.+/u;
const GIT_WRITE_COMMANDS = new Set([
  "add",
  "am",
  "apply",
  "branch",
  "checkout",
  "cherry-pick",
  "clean",
  "clone",
  "commit",
  "fetch",
  "init",
  "merge",
  "mv",
  "pull",
  "push",
  "rebase",
  "remote",
  "reset",
  "restore",
  "revert",
  "rm",
  "stash",
  "submodule",
  "switch",
  "tag",
  "worktree"
]);
const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--config-env", "--exec-path", "--git-dir", "--namespace", "--super-prefix", "--work-tree"]);

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

function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaped = true;
      current += char;
      continue;
    }

    if ((char === "'" || char === '"') && quote === undefined) {
      quote = char;
      current += char;
      continue;
    }

    if (char === quote) {
      quote = undefined;
      current += char;
      continue;
    }

    if (quote === undefined && (char === ";" || char === "&" || char === "|" || char === "\r" || char === "\n")) {
      if (current.trim() !== "") segments.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim() !== "") segments.push(current.trim());
  return segments;
}

function shellWords(segment: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (const char of segment) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if ((char === "'" || char === '"') && quote === undefined) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = undefined;
      continue;
    }

    if (quote === undefined && /\s/u.test(char)) {
      if (current !== "") {
        words.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current !== "") words.push(current);
  return words;
}

function isDsmmRole(value: unknown): value is DsmmRoleId {
  return typeof value === "string" && (DSMM_ROLE_IDS as readonly string[]).includes(value);
}

function selectedAgentPreset(events: readonly { type: string; data?: unknown }[]): string | undefined {
  let selected: string | undefined;

  for (const event of events) {
    if (event.type !== "agent-preset/selected") continue;
    const data = asRecord(event.data);
    if (typeof data?.agentPreset === "string") selected = data.agentPreset;
  }

  return selected;
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
  return isDsmmRole(selectedAgentPreset(exec.agent?.session.events ?? []));
}

function shellSafetyDecision(exec: DshToolExecution): DshPreToolDecision | undefined {
  const name = toolName(exec);
  const command = commandText(exec);
  if (command === undefined) return undefined;

  if (name === "pwsh" || name === "powershell") {
    if (/(^|[;&|\r\n]\s*)export\s+[A-Za-z_][A-Za-z0-9_]*=/u.test(command)) {
      return {
        kind: "deny",
        reason: `${DSMM_GUARD_PREFIX} PowerShell command appears to use POSIX shell syntax (\`export\`). Use \`$env:NAME = "value"; command\` instead.`
      };
    }

    if (/\/dev\/null/u.test(command)) {
      return {
        kind: "deny",
        reason: `${DSMM_GUARD_PREFIX} PowerShell command uses POSIX null redirection (/dev/null). Use \`*> $null\` or omit redirection.`
      };
    }

    if (/(^|[;&|\r\n]\s*)source\s+\S+/u.test(command)) {
      return {
        kind: "deny",
        reason: `${DSMM_GUARD_PREFIX} PowerShell command uses POSIX \`source\`. Use dot-sourcing with a .ps1 file instead.`
      };
    }
  }

  if (name === "bash" && /\$env:/u.test(command)) {
    return {
      kind: "deny",
      reason: `${DSMM_GUARD_PREFIX} bash command appears to use PowerShell syntax (\`$env:\`). Use POSIX environment syntax for bash.`
    };
  }

  return undefined;
}

function gitWriteOperation(command: string): string | undefined {
  for (const segment of splitShellSegments(command)) {
    const words = shellWords(segment);
    let index = 0;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[index] ?? "")) index += 1;

    if ((words[index] ?? "").toLowerCase() !== "git") continue;
    index += 1;

    while (index < words.length) {
      const option = words[index];
      if (option === "--") {
        index += 1;
        break;
      }
      if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(option)) {
        index += 2;
        continue;
      }
      if ([...GIT_GLOBAL_OPTIONS_WITH_VALUE].some((name) => option.startsWith(`${name}=`))) {
        index += 1;
        continue;
      }
      if (/^-C.+/u.test(option) || /^-c.+/u.test(option)) {
        index += 1;
        continue;
      }
      if (option.startsWith("-")) {
        index += 1;
        continue;
      }
      break;
    }

    const subcommand = words[index]?.toLowerCase();
    if (subcommand === "reset" && words.slice(index + 1).some((word) => word.toLowerCase() === "--hard")) return "reset --hard";
    if (subcommand === "stash") {
      const action = words[index + 1]?.toLowerCase();
      if (action === "pop" || action === "drop" || action === "clear") return `stash ${action}`;
    }
    if (subcommand !== undefined && GIT_WRITE_COMMANDS.has(subcommand)) return subcommand;
  }

  return undefined;
}

function gitWriteDecision(exec: DshToolExecution, settings: DsmmSettings): DshPreToolDecision | undefined {
  if (settings.guards.gitWriteGuard === "off") return undefined;

  const command = commandText(exec);
  const operation = command === undefined ? undefined : gitWriteOperation(command);
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

function writePath(exec: DshToolExecution): string | undefined {
  return stringField(exec.arguments, ["file_path", "path"]);
}

function writeContent(exec: DshToolExecution): string | undefined {
  return stringField(exec.arguments, ["content", "new_string", "new_str", "file_text"]);
}

function isPlanPath(path: string): boolean {
  const normalized = path.replace(/\\/gu, "/");
  return /(?:^|\/)docs\/superpowers\/plans\/[^/]+\.md$/u.test(normalized) || /(?:^|\/)\.omo\/plans\/[^/]+\.md$/u.test(normalized);
}

function malformedChecklistLine(content: string): string | undefined {
  return content.split(/\r?\n/u).find((line) => /^\s*[-*]\s+\[(?! |x|X\])/u.test(line) || /^\s*[-*]\s+\[\]/u.test(line));
}

function planFormatDecision(exec: DshToolExecution): DshPreToolDecision | undefined {
  const path = writePath(exec);
  const content = writeContent(exec);
  if (path === undefined || content === undefined || !isPlanPath(path)) return undefined;

  const malformed = malformedChecklistLine(content);
  if (malformed === undefined) return undefined;

  return {
    kind: "deny",
    reason: `${DSMM_GUARD_PREFIX} plan file contains a malformed checklist entry: ${malformed.trim()}`
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
    const plan = planFormatDecision(exec);
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
    return decision ?? next();
  }, { prepend: true });

  ctx.on?.("tools/post-execute", async (exec: DshToolExecution, result: DshToolExecutionResult, next: () => Promise<DshPostToolDecision>) => {
    const decision = await next();
    return decidePostToolExecution(exec, result, decision, getSettings(), controller);
  }, { prepend: true });
}
