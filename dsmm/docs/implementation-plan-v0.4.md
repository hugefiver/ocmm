# DSMM Safety Guards Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DSMM v0.4's dsh-native safety and guard layer for shell commands, git writes, oversized tool output, plan files, questions, and todos.

**Architecture:** DSMM will add a small structural adapter for the dsh tools pipeline without importing OpenCode hooks or requiring OpenCode tool names. Pre-execute policy is implemented as pure decision helpers plus a `tools/pre-execute` listener; output truncation is implemented as a `tools/post-execute` transformer. Guards are scoped by default to active DSMM deepwork mode or DSMM-managed agent presets, and each guard is individually configurable through the existing restart-scoped `dsmm` settings namespace.

**Tech Stack:** TypeScript ESM, Node.js 22 `node:test`, dsh Cordis `ctx.on("tools/pre-execute")` / `ctx.on("tools/post-execute")` structural types, Schemastery settings, Docker smoke against `@deepseek-ai/dsh@latest`.

**Spec:** `dsmm/docs/roadmap.md` v0.4 section and `dsmm/docs/design.md` safety settings. Discovery evidence: official dsh tools docs describe `tools/pre-execute` as an allow/deny/ask waterfall, `ctx.tools.guard()` as monotonic deny-only policy, and `tools/post-execute` as accepted-result transformation; `@deepseek-ai/dsh-tool-bash` / `dsh-tool-pwsh` expose a `command` argument; `@deepseek-ai/dsh-tool-fs` exposes `write(file_path, content)` and `edit(file_path, old_string, new_string, replace_all?)`; `@deepseek-ai/dsh-tool-ask-user` exposes `ask_user_question({ questions: [{ id, question, header?, options?, multi_select? }] })`; `@deepseek-ai/dsh-tool-todo` exposes `todo_write({ todos: [{ content, status }] })`; `@deepseek-ai/dsh-agent-presets` records preset selection as the session event `agent-preset/selected`; `@deepseek-ai/dsh-spill-policy` uses `tools/post-execute` for output bounding.

**Global Constraints:**
- Implement dsh-native Cordis hooks only; do not emulate OpenCode `tool.execute.*`, `question`, or `todowrite` hooks.
- Default guard scope is DSMM-only: active `deepwork` mode or a detected DSMM-managed agent preset.
- Every v0.4 guard must have a settings toggle and a documented failure message.
- Do not add a hard dependency on unavailable local `@deepseek-ai/dsh-tools` packages; use structural event types and runtime feature detection.
- Do not mutate tool arguments; dsh pre-execute deliberately cannot rewrite them after logging/presentation.
- Git write protection must ask for host approval when approval is available and fail closed when approval is unavailable.
- Tool-output truncation must preserve successful calls as successful accepted results; it must not convert an oversized successful result into an error.
- Question and todo helpers must bind to the verified dsh tool contracts, not OpenCode argument shapes.
- Keep v0.4 independent from v0.5 MCP/LSP and v0.6 model routing.

---

## File Structure

### Runtime and settings

- Modify: `dsmm/src/dsh-types.ts`  
  Add structural dsh tool pipeline types: `DshToolExecution`, `DshPreToolDecision`, `DshPostToolDecision`, `DshToolExecutionResult`, `DshContentBlock`, `DshToolRuntime`, and `ctx.on` overloads for tool events.

- Modify: `dsmm/src/settings.ts`  
  Add `settings.guards` defaults, schema, merge behavior, and exported types.

- Create: `dsmm/src/guards.ts`  
  Pure guard decisions plus runtime registration against `tools/pre-execute` and `tools/post-execute`.

- Modify: `dsmm/src/index.ts`  
  Register safety guards after mode controller creation and export guard helpers/types.

### Tests

- Modify: `dsmm/test/settings.test.ts`  
  Cover guard defaults and partial guard overrides.

- Create: `dsmm/test/guards.test.ts`  
  Cover scope selection, shell dialect safety, git write ask/deny, plan validation, question label limits, todo discipline, output truncation, and runtime registration.

- Modify: `dsmm/test/docker-smoke-assets.test.ts`  
  Assert Docker smoke includes v0.4 guard registration checks.

### Docs and smoke assets

- Create: `dsmm/docs/safety-guards.md`  
  Document every guard, default setting, scope, and failure message.

- Modify: `dsmm/README.md`  
  Add v0.4 summary and link to `docs/safety-guards.md`.

- Modify: `dsmm/docs/roadmap.md`  
  Mark v0.4 as implemented and keep v0.5+ unchanged.

- Modify: `dsmm/prompts/deepwork.md` and generated prompt tests if needed  
  Mention DSMM guard policy as runtime enforcement active only inside DSMM scope.

- Modify: `dsmm/scripts/docker-smoke.mjs`  
  Import built guard helpers and run a small in-container policy smoke without depending on a live model tool call.

- Create: `dsmm/docs/implementation-plan-v0.4.md`  
  Copy this approved plan into the dsmm subtree after plan approval.

---

## Task 1: Guard settings and dsh tool event types

**Files:**
- Modify: `dsmm/src/dsh-types.ts`
- Modify: `dsmm/src/settings.ts`
- Modify: `dsmm/test/settings.test.ts`

**Interfaces:**
- Consumes: existing `DsmmSettings`, `DsmmPluginConfig`, and `DshContext`.
- Produces:
  - `export type DsmmGuardScope = "deepwork-or-dsmm-agent" | "always" | "off"`
  - `export type DsmmGitWritePolicy = "ask" | "deny" | "off"`
  - `export interface DsmmGuardSettings`
  - `export interface DshToolExecution`
  - `export type DshPreToolDecision`
  - `export type DshPostToolDecision`
  - `export interface DshToolExecutionResult`
  - `export interface DshToolRuntime`

- [ ] **Step 1: Add failing settings tests for guard defaults and partial overrides**

Add to `dsmm/test/settings.test.ts`:

```ts
const DEFAULT_GUARD_SETTINGS = {
  scope: "deepwork-or-dsmm-agent",
  shellCommandSafety: true,
  gitWriteGuard: "ask",
  toolOutputTruncation: {
    enabled: true,
    maxInlineBytes: 12000
  },
  planFormatValidation: true,
  questionLabelHelper: {
    enabled: true,
    maxLabelChars: 30
  },
  todoDisciplineHelper: true
};

test("default settings enable scoped safety guards", () => {
  assert.deepEqual(DEFAULT_DSMM_SETTINGS.guards, DEFAULT_GUARD_SETTINGS);
});

test("resolveConfig supports partial guard setting overlays", () => {
  const settings = resolveConfig({
    guards: {
      scope: "always",
      gitWriteGuard: "deny",
      toolOutputTruncation: { maxInlineBytes: 80 },
      questionLabelHelper: { enabled: false }
    }
  });

  assert.deepEqual(settings.guards, {
    ...DEFAULT_GUARD_SETTINGS,
    scope: "always",
    gitWriteGuard: "deny",
    toolOutputTruncation: {
      enabled: true,
      maxInlineBytes: 80
    },
    questionLabelHelper: {
      enabled: false,
      maxLabelChars: 30
    }
  });
});
```

Run:

```powershell
pnpm --filter dsmm test test/settings.test.ts
```

Expected before implementation: FAIL because `guards` is missing.

- [ ] **Step 2: Add structural dsh tool pipeline types**

Extend `dsmm/src/dsh-types.ts` with structural types only:

```ts
export interface DshContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface DshToolExecution {
  callId?: unknown;
  rootCallId?: unknown;
  name: string;
  arguments: unknown;
  agent?: DshAgent;
  parent?: unknown;
  signal?: AbortSignal;
}

export type DshPreToolDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "ask"; reason?: string };

export type DshPostToolDecision =
  | { kind: "accept"; content?: DshContentBlock[]; value?: never; additionalContexts?: unknown[] }
  | { kind: "accept"; value: unknown; content?: never; additionalContexts?: unknown[] }
  | { kind: "block"; feedback: DshContentBlock[]; additionalContexts?: unknown[] };

export interface DshToolExecutionResult {
  isError: boolean;
  content: DshContentBlock[];
  value?: unknown;
  error?: unknown;
  additionalContexts?: unknown[];
}

export interface DshToolRuntime {
  guard?(guard: (execution: Readonly<DshToolExecution>) => string | undefined): () => void;
}

export type DshEventListener = (...args: any[]) => any;
```

Replace the single-event `on?` signature in `DshContext` with the existing exact `agent/pre-step` overload plus a broad structural event listener fallback. Keep the concrete listener parameter types on exported helper functions and tests; the generic `DshContext` event fallback stays permissive so test doubles and future dsh events remain assignable:

```ts
export interface DshContext {
  settings?: DshSettingsRegistry;
  systemPrompt?: DshSystemPromptRegistry;
  skills?: DshSkillRegistry;
  commands?: DshCommandsRegistry;
  tools?: DshToolRuntime;
  inject?(dependencies: string[], installer: (services: DshInjectedServices) => unknown): unknown;
  on?(event: "agent/pre-step", listener: (frame: PreStepFrame, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>, options?: unknown): unknown;
  on?(event: string, listener: DshEventListener, options?: unknown): unknown;
  logger?: { warn(message: string, ...args: unknown[]): void };
}
```

The important contract is that `DshContext.on` preserves the existing exact `agent/pre-step` type while the fallback remains structurally permissive. The explicit `any[]` rest type and `any` return type are intentional here: this is a structural Cordis event adapter, not a public model-facing data type, and it keeps concrete `tools/pre-execute` and `tools/post-execute` listeners assignable under `strictFunctionTypes`.

Also extend `DshInjectedServices` with `tools?: DshToolRuntime`.

- [ ] **Step 3: Add guard settings types, defaults, schema, and merge logic**

In `dsmm/src/settings.ts`, add types:

```ts
export type DsmmGuardScope = "deepwork-or-dsmm-agent" | "always" | "off";
export type DsmmGitWritePolicy = "ask" | "deny" | "off";

export interface DsmmGuardSettings {
  scope: DsmmGuardScope;
  shellCommandSafety: boolean;
  gitWriteGuard: DsmmGitWritePolicy;
  toolOutputTruncation: {
    enabled: boolean;
    maxInlineBytes: number;
  };
  planFormatValidation: boolean;
  questionLabelHelper: {
    enabled: boolean;
    maxLabelChars: number;
  };
  todoDisciplineHelper: boolean;
}
```

Extend `DsmmPluginConfig` with:

```ts
guards?: Partial<Omit<DsmmGuardSettings, "toolOutputTruncation" | "questionLabelHelper">> & {
  toolOutputTruncation?: Partial<DsmmGuardSettings["toolOutputTruncation"]>;
  questionLabelHelper?: Partial<DsmmGuardSettings["questionLabelHelper"]>;
};
```

Add `guards` to `DsmmSettings` and `DEFAULT_DSMM_SETTINGS` using the values from Step 1. Add Schemastery schemas:

```ts
const GUARD_SCOPE_SCHEMA = Schema.union([
  Schema.const("deepwork-or-dsmm-agent"),
  Schema.const("always"),
  Schema.const("off")
]).default(DEFAULT_DSMM_SETTINGS.guards.scope);

const GIT_WRITE_POLICY_SCHEMA = Schema.union([
  Schema.const("ask"),
  Schema.const("deny"),
  Schema.const("off")
]).default(DEFAULT_DSMM_SETTINGS.guards.gitWriteGuard);

const GUARDS_SCHEMA = Schema.object({
  scope: GUARD_SCOPE_SCHEMA,
  shellCommandSafety: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.shellCommandSafety),
  gitWriteGuard: GIT_WRITE_POLICY_SCHEMA,
  toolOutputTruncation: Schema.object({
    enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.toolOutputTruncation.enabled),
  maxInlineBytes: Schema.number().default(DEFAULT_DSMM_SETTINGS.guards.toolOutputTruncation.maxInlineBytes)
  }),
  planFormatValidation: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.planFormatValidation),
  questionLabelHelper: Schema.object({
    enabled: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.questionLabelHelper.enabled),
  maxLabelChars: Schema.number().default(DEFAULT_DSMM_SETTINGS.guards.questionLabelHelper.maxLabelChars)
  }),
  todoDisciplineHelper: Schema.boolean().default(DEFAULT_DSMM_SETTINGS.guards.todoDisciplineHelper)
});
```

Add `guards: GUARDS_SCHEMA` to `DSMM_CONFIG_SCHEMA` and `DSMM_SETTINGS_SCHEMA`. Add concrete merge helpers, then call `resolveGuardSettings(config.guards)` from `resolveConfig()`:

```ts
function positiveIntegerOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function resolveGuardSettings(config: DsmmPluginConfig["guards"]): DsmmGuardSettings {
  return {
    ...DEFAULT_DSMM_SETTINGS.guards,
    ...config,
    toolOutputTruncation: {
      ...DEFAULT_DSMM_SETTINGS.guards.toolOutputTruncation,
      ...config?.toolOutputTruncation,
      maxInlineBytes: positiveIntegerOrDefault(
        config?.toolOutputTruncation?.maxInlineBytes,
        DEFAULT_DSMM_SETTINGS.guards.toolOutputTruncation.maxInlineBytes
      )
    },
    questionLabelHelper: {
      ...DEFAULT_DSMM_SETTINGS.guards.questionLabelHelper,
      ...config?.questionLabelHelper,
      maxLabelChars: positiveIntegerOrDefault(
        config?.questionLabelHelper?.maxLabelChars,
        DEFAULT_DSMM_SETTINGS.guards.questionLabelHelper.maxLabelChars
      )
    }
  };
}
```

This helper deliberately does not throw on bad numeric settings because `resolveConfig()` is used by tests and fallback config paths before Schemastery validation can normalize user input.

- [ ] **Step 4: Verify Task 1**

Run:

```powershell
pnpm --filter dsmm test test/settings.test.ts
pnpm --filter dsmm typecheck:test
pnpm --filter dsmm build
```

Expected: all PASS.

---

## Task 2: Pre-execute safety guards

**Files:**
- Create: `dsmm/src/guards.ts`
- Modify: `dsmm/src/index.ts`
- Create: `dsmm/test/guards.test.ts`

**Interfaces:**
- Consumes:
  - `DsmmSettings` and `DsmmGuardSettings` from Task 1.
  - `DeepworkModeController.active(agent, defaultActive)` from `dsmm/src/state.ts`.
  - `DSMM_ROLE_IDS` from `dsmm/src/roles.ts`.
- Produces:
  - `export const DSMM_GUARD_PREFIX = "[dsmm safety]"`
  - `export function isSafetyScopeActive(exec: DshToolExecution, settings: DsmmSettings, controller: DeepworkModeController): boolean`
  - `export function decidePreToolExecution(exec: DshToolExecution, settings: DsmmSettings, controller: DeepworkModeController): DshPreToolDecision | undefined`
  - `export function registerSafetyGuards(ctx: DshContext, controller: DeepworkModeController, getSettings: () => DsmmSettings): void`

- [ ] **Step 1: Write failing pre-execute tests**

Create `dsmm/test/guards.test.ts` with the following tests first:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DshPreToolDecision, DshToolExecution } from "../lib/dsh-types.js";
import { decidePreToolExecution, isSafetyScopeActive, registerSafetyGuards } from "../lib/guards.js";
import { DEFAULT_DSMM_SETTINGS } from "../lib/settings.js";
import { DEEPWORK_MODE_EVENT, DeepworkModeController } from "../lib/state.js";

function controller() {
  return new DeepworkModeController({});
}

function exec(name: string, args: unknown, active = true): DshToolExecution {
  return {
    name,
    arguments: args,
    agent: {
      session: {
        events: active ? [{ type: DEEPWORK_MODE_EVENT, data: { active: true } }] : [],
        append() {}
      }
    }
  };
}

test("safety scope is active for deepwork mode and dsmm preset sessions", () => {
  assert.equal(isSafetyScopeActive(exec("bash", { command: "pwd" }), DEFAULT_DSMM_SETTINGS, controller()), true);
  assert.equal(isSafetyScopeActive(exec("bash", { command: "pwd" }, false), DEFAULT_DSMM_SETTINGS, controller()), false);
  assert.equal(isSafetyScopeActive({ name: "bash", arguments: { command: "pwd" }, agent: { session: { events: [{ type: "agent-preset/selected", data: { agentPreset: "dsmm-reviewer" } }], append() {} } } }, DEFAULT_DSMM_SETTINGS, controller()), true);
  assert.equal(isSafetyScopeActive(exec("bash", { command: "pwd" }), { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, scope: "off" } }, controller()), false);
});

test("pwsh shell safety denies clear POSIX-only syntax", () => {
  assert.deepEqual(decidePreToolExecution(exec("pwsh", { command: "export CI=true; pnpm test" }), DEFAULT_DSMM_SETTINGS, controller()), {
    kind: "deny",
    reason: "[dsmm safety] PowerShell command appears to use POSIX shell syntax (`export`). Use `$env:NAME = \"value\"; command` instead."
  });
});

test("bash shell safety denies clear PowerShell-only syntax", () => {
  const decision = decidePreToolExecution(exec("bash", { command: "$env:CI = \"true\"; pnpm test" }), DEFAULT_DSMM_SETTINGS, controller());
  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /PowerShell syntax/);
});

test("git write guard asks for approval by default", () => {
  assert.deepEqual(decidePreToolExecution(exec("bash", { command: "git commit -m test" }), DEFAULT_DSMM_SETTINGS, controller()), {
    kind: "ask",
    reason: "[dsmm safety] git write command requires explicit user approval before running: git commit"
  });
});

test("git write guard can be configured to deny", () => {
  const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, gitWriteGuard: "deny" as const } };
  const decision = decidePreToolExecution(exec("pwsh", { command: "git push origin master" }), settings, controller());
  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /git write command is disabled/);
});

test("plan format validation rejects malformed checklist entries", () => {
  const decision = decidePreToolExecution(exec("write", {
    file_path: "docs/superpowers/plans/example.md",
    content: "# Example Implementation Plan\n\n- [] Missing space\n"
  }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /malformed checklist/);
});

test("question label helper rejects overlong option labels", () => {
  const decision = decidePreToolExecution(exec("ask_user_question", {
    questions: [{ id: "q1", question: "Choose?", options: [{ label: "this label is definitely longer than thirty characters" }] }]
  }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /question option label exceeds 30 characters/);
});

test("todo discipline helper enforces structured content and one active todo while work remains", () => {
  const decision = decidePreToolExecution(exec("todo_write", {
    todos: [
      { content: "fix guards", status: "in_progress" },
      { content: "[docs] [write] to document guards - expect docs", status: "pending" }
    ]
  }), DEFAULT_DSMM_SETTINGS, controller());

  assert.equal(decision?.kind, "deny");
  assert.match(decision?.reason ?? "", /todo content must use/);
});

test("registerSafetyGuards wires tools\/pre-execute and delegates when allowed", async () => {
  const listeners: Record<string, (...args: any[]) => unknown> = {};
  registerSafetyGuards({
    on(event, listener) {
      listeners[event] = listener;
    }
  }, controller(), () => DEFAULT_DSMM_SETTINGS);

  assert.equal(typeof listeners["tools/pre-execute"], "function");
  const preExecute = listeners["tools/pre-execute"] as (execution: DshToolExecution, next: () => Promise<DshPreToolDecision>) => Promise<DshPreToolDecision>;
  const allowed = await preExecute(exec("bash", { command: "pwd" }), async (): Promise<DshPreToolDecision> => ({ kind: "allow" }));
  assert.deepEqual(allowed, { kind: "allow" });
});
```

Run:

```powershell
pnpm --filter dsmm test test/guards.test.ts
```

Expected before implementation: FAIL because `../lib/guards.js` is missing.

- [ ] **Step 2: Implement scope and argument extraction helpers**

Create `dsmm/src/guards.ts` with helpers:

```ts
import type { DshContentBlock, DshContext, DshPostToolDecision, DshPreToolDecision, DshToolExecution, DshToolExecutionResult } from "./dsh-types.js";
import { DSMM_ROLE_IDS } from "./roles.js";
import type { DsmmRoleId } from "./roles.js";
import type { DsmmSettings } from "./settings.js";
import type { DeepworkModeController } from "./state.js";

export const DSMM_GUARD_PREFIX = "[dsmm safety]";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringField(value: unknown, keys: readonly string[]): string | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  for (const key of keys) if (typeof record[key] === "string") return record[key];
  return undefined;
}

function commandText(exec: DshToolExecution): string | undefined {
  return stringField(exec.arguments, ["command", "cmd", "script"]);
}

function toolName(exec: DshToolExecution): string {
  return exec.name.toLowerCase();
}

function isDsmmRole(value: unknown): value is DsmmRoleId {
  return typeof value === "string" && (DSMM_ROLE_IDS as readonly string[]).includes(value);
}

function selectedAgentPreset(events: readonly { type: string; data?: unknown }[]): string | undefined {
  let selected: string | undefined;
  for (const event of events) {
    if (event.type !== "agent-preset/selected") continue;
    const data = asRecord(event.data);
    selected = typeof data?.agentPreset === "string" ? data.agentPreset : selected;
  }
  return selected;
}
```

Implement `isSafetyScopeActive()`:

```ts
export function isSafetyScopeActive(exec: DshToolExecution, settings: DsmmSettings, controller: DeepworkModeController): boolean {
  if (settings.guards.scope === "off") return false;
  if (settings.guards.scope === "always") return true;
  if (controller.active(exec.agent, settings.defaultActive)) return true;
  return isDsmmRole(selectedAgentPreset(exec.agent?.session.events ?? []));
}
```

- [ ] **Step 3: Implement pre-execute decision functions**

In `dsmm/src/guards.ts`, add pure validators:

```ts
function shellSafetyDecision(exec: DshToolExecution): DshPreToolDecision | undefined {
  const name = toolName(exec);
  const command = commandText(exec);
  if (command === undefined) return undefined;

  if (name === "pwsh" || name === "powershell") {
    if (/(^|[;&|]\s*)export\s+[A-Za-z_][A-Za-z0-9_]*=/u.test(command)) {
      return { kind: "deny", reason: `${DSMM_GUARD_PREFIX} PowerShell command appears to use POSIX shell syntax (\`export\`). Use \`$env:NAME = "value"; command\` instead.` };
    }
    if (/\/dev\/null/u.test(command)) {
      return { kind: "deny", reason: `${DSMM_GUARD_PREFIX} PowerShell command uses POSIX null redirection (/dev/null). Use \`*> $null\` or omit redirection.` };
    }
    if (/(^|[;&|]\s*)source\s+\S+/u.test(command)) {
      return { kind: "deny", reason: `${DSMM_GUARD_PREFIX} PowerShell command uses POSIX \`source\`. Use dot-sourcing with a .ps1 file instead.` };
    }
  }

  if (name === "bash" && /\$env:/u.test(command)) {
    return { kind: "deny", reason: `${DSMM_GUARD_PREFIX} bash command appears to use PowerShell syntax (\`$env:\`). Use POSIX environment syntax for bash.` };
  }

  return undefined;
}

function gitWriteOperation(command: string): string | undefined {
  const match = /(?:^|[;&|]\s*)git\s+((?:reset\s+--hard)|(?:stash\s+(?:pop|drop|clear))|commit|push|tag|rebase|cherry-pick|revert|clean)\b/iu.exec(command);
  return match?.[1]?.replace(/\s+/gu, " ").toLowerCase();
}

function gitWriteDecision(exec: DshToolExecution, settings: DsmmSettings): DshPreToolDecision | undefined {
  if (settings.guards.gitWriteGuard === "off") return undefined;
  const command = commandText(exec);
  const operation = command === undefined ? undefined : gitWriteOperation(command);
  if (operation === undefined) return undefined;
  if (settings.guards.gitWriteGuard === "deny") {
    return { kind: "deny", reason: `${DSMM_GUARD_PREFIX} git write command is disabled by dsmm settings: git ${operation}` };
  }
  return { kind: "ask", reason: `${DSMM_GUARD_PREFIX} git write command requires explicit user approval before running: git ${operation}` };
}
```

Add plan/question/todo helpers:

```ts
function writePath(exec: DshToolExecution): string | undefined {
  return stringField(exec.arguments, ["file_path", "path"]);
}

function writeContent(exec: DshToolExecution): string | undefined {
  return stringField(exec.arguments, ["content", "new_string", "new_str", "file_text"]);
}

function planFormatDecision(exec: DshToolExecution): DshPreToolDecision | undefined {
  const path = writePath(exec)?.replace(/\\/gu, "/");
  const content = writeContent(exec);
  if (path === undefined || content === undefined) return undefined;
  if (!/(?:^|\/)docs\/superpowers\/plans\/[^/]+\.md$/u.test(path) && !/(?:^|\/)\.omo\/plans\/[^/]+\.md$/u.test(path)) return undefined;
  const malformed = content.split(/\r?\n/u).find((line) => /^\s*[-*]\s+\[(?! |x|X\])/u.test(line) || /^\s*[-*]\s+\[\]/u.test(line));
  if (malformed !== undefined) return { kind: "deny", reason: `${DSMM_GUARD_PREFIX} plan file contains a malformed checklist entry: ${malformed.trim()}` };
  return undefined;
}

function questionLabelDecision(exec: DshToolExecution, settings: DsmmSettings): DshPreToolDecision | undefined {
  if (!settings.guards.questionLabelHelper.enabled || toolName(exec) !== "ask_user_question") return undefined;
  const questions = asRecord(exec.arguments)?.questions;
  if (!Array.isArray(questions)) return undefined;
  const limit = settings.guards.questionLabelHelper.maxLabelChars;
  const options = questions.flatMap((question) => {
    const rawOptions = asRecord(question)?.options;
    return Array.isArray(rawOptions) ? rawOptions : [];
  });
  const overlong = options.map(asRecord).find((option) => typeof option?.label === "string" && option.label.length > limit);
  if (overlong?.label === undefined) return undefined;
  return { kind: "deny", reason: `${DSMM_GUARD_PREFIX} question option label exceeds ${String(limit)} characters: ${overlong.label}` };
}

function todoDisciplineDecision(exec: DshToolExecution): DshPreToolDecision | undefined {
  if (toolName(exec) !== "todo_write") return undefined;
  const todos = asRecord(exec.arguments)?.todos;
  if (!Array.isArray(todos)) return undefined;
  const active = todos.filter((todo) => asRecord(todo)?.status === "in_progress").length;
  const unfinished = todos.some((todo) => String(asRecord(todo)?.status ?? "") !== "completed");
  if (unfinished && active !== 1) return { kind: "deny", reason: `${DSMM_GUARD_PREFIX} todo list must keep exactly one in_progress item while unfinished work remains.` };
  const malformed = todos.map(asRecord).find((todo) => typeof todo?.content === "string" && !/^\[[^\]]+\]\s+\[[^\]]+\]\s+to\s+.+\s+-\s+expect\s+.+/u.test(todo.content));
  if (malformed?.content === undefined) return undefined;
  return { kind: "deny", reason: `${DSMM_GUARD_PREFIX} todo content must use "[WHERE] [HOW] to [WHY] - expect [RESULT]": ${malformed.content}` };
}
```

Implement `decidePreToolExecution()`:

```ts
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
```

- [ ] **Step 4: Register pre-execute listener and integrate apply**

Add the pre-execute part of `registerSafetyGuards()`:

```ts
export function registerSafetyGuards(ctx: DshContext, controller: DeepworkModeController, getSettings: () => DsmmSettings): void {
ctx.on?.("tools/pre-execute", async (exec: DshToolExecution, next: () => Promise<DshPreToolDecision>) => {
    const decision = decidePreToolExecution(exec, getSettings(), controller);
    return decision ?? next();
  }, { prepend: true });
}
```

Modify `dsmm/src/index.ts`:

```ts
import { registerSafetyGuards } from "./guards.js";
// inside apply(), after `const controller = new DeepworkModeController(ctx);`
registerSafetyGuards(ctx, controller, getSettings);
```

Export the pre-execute guard helpers and settings types from `index.ts`:

```ts
export { DSMM_GUARD_PREFIX, decidePreToolExecution, isSafetyScopeActive, registerSafetyGuards } from "./guards.js";
export type { DsmmGuardScope, DsmmGuardSettings, DsmmGitWritePolicy } from "./settings.js";
```
Task 3 will extend this export list with `decidePostToolExecution` and `truncateTextMiddle` after those functions exist. Do not add a temporary post-execute stub in Task 2.

- [ ] **Step 5: Verify Task 2**

Run:

```powershell
pnpm --filter dsmm test test/guards.test.ts
pnpm --filter dsmm test
pnpm --filter dsmm typecheck:test
pnpm --filter dsmm build
```

Expected: all PASS.

---

## Task 3: Post-execute tool-output truncation

**Files:**
- Modify: `dsmm/src/guards.ts`
- Modify: `dsmm/test/guards.test.ts`

**Interfaces:**
- Consumes:
  - `registerSafetyGuards()` from Task 2.
  - `settings.guards.toolOutputTruncation` from Task 1.
- Produces:
  - `export function truncateTextMiddle(text: string, maxBytes: number, toolName: string): string`
  - `export function decidePostToolExecution(exec: DshToolExecution, result: Readonly<DshToolExecutionResult>, decision: DshPostToolDecision, settings: DsmmSettings, controller: DeepworkModeController): DshPostToolDecision`

- [ ] **Step 1: Add failing post-execute tests**

Update the existing import from `../lib/guards.js` so it includes `decidePostToolExecution` and `truncateTextMiddle`, then append the tests below. Do not add a second `import` statement in the middle of the file.

```ts
test("truncateTextMiddle keeps head and tail with dsmm notice", () => {
  const text = "a".repeat(40) + "b".repeat(40) + "c".repeat(40);
  const truncated = truncateTextMiddle(text, 80, "bash");

  assert.ok(Buffer.byteLength(truncated, "utf8") <= 80);
  assert.match(truncated, /\[dsmm safety\] truncated/);
  assert.match(truncated, /^a+/);
  assert.match(truncated, /c+$/);
});

test("post-execute truncates accepted plain-text content when scoped", () => {
  const activeExec = exec("bash", { command: "yes" });
  const result = { isError: false, content: [{ type: "text", text: "x".repeat(140) }] };
  const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, toolOutputTruncation: { enabled: true, maxInlineBytes: 90 } } };
  const decision = decidePostToolExecution(activeExec, result, { kind: "accept" }, settings, controller());

  assert.equal(decision.kind, "accept");
  assert.ok(!("value" in decision));
  assert.equal(decision.content?.length, 1);
  assert.ok(Buffer.byteLength(decision.content?.[0].text ?? "", "utf8") <= 90);
  assert.match(decision.content?.[0].text ?? "", /\[dsmm safety\] truncated/);
});

test("post-execute leaves value decisions and out-of-scope calls unchanged", () => {
  const inactiveExec = exec("bash", { command: "yes" }, false);
  const result = { isError: false, content: [{ type: "text", text: "x".repeat(140) }] };
  const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, toolOutputTruncation: { enabled: true, maxInlineBytes: 90 } } };
  const valueDecision = { kind: "accept" as const, value: { full: true } };

  assert.equal(decidePostToolExecution(inactiveExec, result, { kind: "accept" }, settings, controller()).content, undefined);
  assert.equal(decidePostToolExecution(exec("bash", { command: "yes" }), result, valueDecision, settings, controller()), valueDecision);
});

test("registerSafetyGuards wires tools\/post-execute and delegates before truncating", async () => {
  const listeners: Record<string, (...args: any[]) => unknown> = {};
  const settings = { ...DEFAULT_DSMM_SETTINGS, guards: { ...DEFAULT_DSMM_SETTINGS.guards, toolOutputTruncation: { enabled: true, maxInlineBytes: 90 } } };
  registerSafetyGuards({
    on(event, listener) {
      listeners[event] = listener;
    }
  }, controller(), () => settings);

  assert.equal(typeof listeners["tools/post-execute"], "function");
  const postExecute = listeners["tools/post-execute"] as (execution: DshToolExecution, result: DshToolExecutionResult, next: () => Promise<DshPostToolDecision>) => Promise<DshPostToolDecision>;
  const decision = await postExecute(
    exec("bash", { command: "yes" }),
    { isError: false, content: [{ type: "text", text: "x".repeat(140) }] },
    async () => ({ kind: "accept" })
  );
  assert.match(decision.content?.[0].text ?? "", /\[dsmm safety\] truncated/);
});
```

Run:

```powershell
pnpm --filter dsmm test test/guards.test.ts
```

Expected before implementation: FAIL because post-execute helpers are missing.

- [ ] **Step 2: Implement truncation helpers**

Add to `dsmm/src/guards.ts`:

```ts
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
    const size = utf8Bytes(chars[index]);
    if (used + size > maxBytes) break;
    used += size;
    output.push(chars[index]);
  }
  return output.reverse().join("");
}

export function truncateTextMiddle(text: string, maxBytes: number, toolName: string): string {
  if (utf8Bytes(text) <= maxBytes) return text;
  const notice = `\n\n${DSMM_GUARD_PREFIX} truncated ${toolName} output. Re-run with a narrower command or query if the omitted content is needed.\n\n`;
  if (maxBytes <= utf8Bytes(notice) + 10) return takeUtf8Start(`${DSMM_GUARD_PREFIX} truncated ${toolName} output.`, maxBytes);
  const budget = maxBytes - utf8Bytes(notice);
  const head = Math.ceil(budget / 2);
  const tail = Math.floor(budget / 2);
  return `${takeUtf8Start(text, head)}${notice}${takeUtf8End(text, tail)}`;
}
```

- [ ] **Step 3: Implement post-execute decision**

Add:

```ts
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
  if (text === undefined || Buffer.byteLength(text, "utf8") <= truncation.maxInlineBytes) return decision;
  return {
    ...decision,
    content: [{ type: "text", text: truncateTextMiddle(text, truncation.maxInlineBytes, exec.name) }]
  };
}
```

- [ ] **Step 4: Register post-execute listener**

Extend `registerSafetyGuards()`:

```ts
ctx.on?.("tools/post-execute", async (exec: DshToolExecution, result: DshToolExecutionResult, next: () => Promise<DshPostToolDecision>) => {
  const decision = await next();
  return decidePostToolExecution(exec, result, decision, getSettings(), controller);
}, { prepend: true });
```

This must delegate to `next()` first, matching dsh `spill-policy` composition.

- [ ] **Step 5: Verify Task 3**

Run:

```powershell
pnpm --filter dsmm test test/guards.test.ts
pnpm --filter dsmm test
pnpm --filter dsmm typecheck:test
pnpm --filter dsmm build
```

Expected: all PASS.

---

## Task 4: Documentation, prompt, Docker smoke, and plan copy

**Files:**
- Create: `dsmm/docs/safety-guards.md`
- Create: `dsmm/docs/implementation-plan-v0.4.md`
- Modify: `dsmm/README.md`
- Modify: `dsmm/docs/roadmap.md`
- Modify: `dsmm/prompts/deepwork.md`
- Modify: `dsmm/src/prompts.ts` only if tests show prompt constants need rebuilding by source edit
- Modify: `dsmm/test/prompts.test.ts`
- Modify: `dsmm/scripts/docker-smoke.mjs`
- Modify: `dsmm/test/docker-smoke-assets.test.ts`

**Interfaces:**
- Consumes: exported guard helpers from Tasks 2-3.
- Produces: user-facing guard documentation and Docker smoke evidence that the built package exports and executes guard decisions.

- [ ] **Step 1: Document v0.4 guard behavior**

Create `dsmm/docs/safety-guards.md`:

````markdown
# DSMM Safety Guards

DSMM v0.4 adds dsh-native safety guards on the dsh tools pipeline. The guards use `tools/pre-execute` for allow/deny/ask decisions and `tools/post-execute` for accepted-result truncation. They do not use OpenCode hook names or mutate tool arguments.

## Scope

Default scope is `deepwork-or-dsmm-agent`: guards apply only when the current agent is in DSMM deepwork mode or the agent appears to be one of DSMM's managed preset ids. Set `guards.scope: always` to apply them to every tool call in the profile, or `guards.scope: off` to disable all DSMM guard enforcement.

## Settings

```yaml
dsmm:
  guards:
    scope: deepwork-or-dsmm-agent
    shellCommandSafety: true
    gitWriteGuard: ask
    toolOutputTruncation:
      enabled: true
      maxInlineBytes: 12000
    planFormatValidation: true
    questionLabelHelper:
      enabled: true
      maxLabelChars: 30
    todoDisciplineHelper: true
```

## Failure messages

All DSMM guard messages begin with `[dsmm safety]`.

- PowerShell/POSIX dialect mismatch: denies commands that clearly use the wrong shell syntax for `pwsh` or `bash`.
- Git write guard: `ask` requests host approval for `git commit`, `git push`, `git tag`, `git rebase`, `git cherry-pick`, `git revert`, `git reset --hard`, `git clean`, and destructive `git stash` operations. If no dsh approval service is mounted, dsh fails closed.
- Tool-output truncation: long accepted plain-text tool results are replaced with a head/tail preview and a `[dsmm safety] truncated ...` notice.
- Plan format validation: plan writes to `docs/superpowers/plans/*.md` and `.omo/plans/*.md` reject malformed checkbox lines.
- Question label helper: `ask_user_question` option labels longer than `maxLabelChars` are rejected.
- Todo discipline helper: `todo_write` requires structured content (`[WHERE] [HOW] to [WHY] - expect [RESULT]`) and exactly one `in_progress` item while unfinished work remains.
````

- [ ] **Step 2: Update README, roadmap, and prompt**

In `dsmm/README.md`, add a v0.4 bullet under the feature summary:

```markdown
- v0.4 safety guards: dsh-native `tools/pre-execute` / `tools/post-execute` policies for shell dialect mistakes, git writes, large tool output, plan checklist formatting, question labels, and todo discipline. See `docs/safety-guards.md`.
```

In `dsmm/docs/roadmap.md`, update the v0.4 Acceptance bullets to state that v0.4 is implemented and covered by settings/tests. Do not edit v0.5+ scope.

In `dsmm/prompts/deepwork.md`, add one concise bullet under Tool discipline:

```markdown
DSMM safety guards may enforce shell dialect, git-write approval, output-size, plan-format, question-label, and todo-discipline policy inside this mode; treat `[dsmm safety]` messages as binding policy feedback.
```

Update `dsmm/test/prompts.test.ts` to assert the prompt includes `[dsmm safety]`.

- [ ] **Step 3: Extend Docker smoke with guard helper checks**

In `dsmm/scripts/docker-smoke.mjs`, after importing `dsmm`, add checks using built exports:

```js
const guardController = new dsmm.DeepworkModeController({});
const guardExec = {
  name: "bash",
  arguments: { command: "git commit -m smoke" },
  agent: { session: { events: [{ type: dsmm.DEEPWORK_MODE_EVENT, data: { active: true } }], append() {} } }
};
const guardDecision = dsmm.decidePreToolExecution(guardExec, dsmm.DEFAULT_DSMM_SETTINGS, guardController);
if (guardDecision?.kind !== "ask") throw new Error("git write guard did not request approval in Docker smoke");
const truncated = dsmm.truncateTextMiddle("x".repeat(200), 100, "bash");
if (!truncated.includes("[dsmm safety] truncated") || Buffer.byteLength(truncated, "utf8") > 100) throw new Error("tool output truncation smoke failed");
```

If `DeepworkModeController` or `DEEPWORK_MODE_EVENT` is not exported from root yet, export them in `dsmm/src/index.ts` as part of this task:

```ts
export { DEEPWORK_MODE_EVENT, DeepworkModeController, hasOpenTurn, isDeepworkActive } from "./state.js";
```

Update `dsmm/test/docker-smoke-assets.test.ts` to assert `decidePreToolExecution`, `truncateTextMiddle`, and `git write guard did not request approval` appear in the smoke script.

- [ ] **Step 4: Copy the approved implementation plan into dsmm docs**

After plan approval, copy `docs/superpowers/plans/2026-08-23-dsmm-safety-guards.md` to `dsmm/docs/implementation-plan-v0.4.md`. Verify byte-for-byte equality with a script or hash command.

- [ ] **Step 5: Verify Task 4**

Run:

```powershell
pnpm --filter dsmm test
pnpm --filter dsmm typecheck:test
pnpm --filter dsmm build
pnpm --filter dsmm smoke:docker
pnpm --filter dsmm pack --dry-run
```

Expected: all PASS.

---

## Final Verification and Review

After Tasks 1-4 complete, run:

```powershell
pnpm --filter dsmm test
pnpm --filter dsmm typecheck:test
pnpm --filter dsmm build
pnpm --filter dsmm smoke:docker
pnpm --filter dsmm pack --dry-run
pnpm run typecheck
pnpm run build
pnpm run test:lsp
pnpm test
```

Expected:
- All dsmm-specific commands pass.
- Root `typecheck`, `build`, and `test:lsp` pass.
- If root `pnpm test` still fails only because this machine resolves the WindowsApps Python stub instead of a real `python.exe`, record the exact failing test and confirm no dsmm test failed.

Then dispatch final acceptance review for the current working tree to Oracle and Reviewer. Only after both approve the same current artifact identity, commit the v0.4 stage with:

```powershell
git add dsmm docs/superpowers/plans/2026-08-23-dsmm-safety-guards.md pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(dsmm): add safety guards"
```

Do not stage unrelated files. If `pnpm-lock.yaml` or `pnpm-workspace.yaml` did not change during v0.4, do not include them in the stage command.
