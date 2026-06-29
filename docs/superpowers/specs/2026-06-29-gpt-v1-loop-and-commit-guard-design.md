# GPT v1 Loop Behavior & Commit Guard Design

## Goal

Adjust the deepwork v1 loop behavior for GPT models via prompt changes, and add a commit-guard hook that injects a "no autonomous git commits" constraint into the system message for all models. The commit guard is toggleable via `disabledHooks`.

## Background

### GPT deepwork prompt (`prompts/v1/deepwork/gpt.md`)

The GPT variant already receives a model-aware deepwork prompt (183 lines). It currently treats all 5 superpowers skills as equally authoritative, mandates TDD on every production change, requires scenario contracts with binary pass conditions, and has a decision framework that encourages delegation. Users report this is too heavy for simple tasks, causes redundant full-ceremony runs per edit point, and the model stops too often to ask questions.

### v1 skill injection (`src/intent/skill-loader.ts`, `src/hooks/chat-message.ts`)

- `loadV1Skills()` reads all 5 `SKILL.md` files into a single string.
- `chat.message` hook queues the string per session.
- `createSystemTransformHandler()` (in `src/hooks/chat-message.ts:183-214`) consumes the queue via `getSessionPrompt(sessionID)` and prepends it to the system message.
- Injection is undifferentiated — all model families get all 5 skills.

### system.transform registration (`src/index.ts:147`)

```ts
"experimental.chat.system.transform": createSystemTransformHandler(),
```

Currently `createSystemTransformHandler()` takes no arguments and does not have access to config. To check `hookDisabled`, it must receive `getConfig`.

### HOOK_NAMES (`src/config/schema.ts:76-93`)

16 hook names as a const tuple. `disabledHooks` defaults to `["directory-readme-injector"]`. New hook names must be added here. `disabledHooks` is in `ACCUMULATING_ARRAY_KEYS` (union across config layers).

### v1-maintenance doc sync (AGENTS.md mandate)

All `skills/v1/` and `prompts/v1/` changes MUST update `docs/v1-maintenance.md` in the same commit. The Prompt Source Mapping table (L29+) tracks each prompt's skill references and adaptations.

## Design Decisions

| Need | Decision |
|---|---|
| 1. Suppress non-brainstorm skill priority for GPT | `gpt.md` prompt instruction override (no code change to skill-loader) |
| 2. Skip spec-plan-TDD for simple tasks | `gpt.md` rewrite DECISION FRAMEWORK + TDD section with task-tiered flow |
| 3. Batch multi-point edits with unified test/review | `gpt.md` new batch-processing instruction |
| 4. Self-progress when clear, ask when unclear | `gpt.md` rewrite DECISION FRAMEWORK with clarity-gated ask rule |
| 5+6. No autonomous commits, hook toggle | New `commit-guard-injector` hook; injects constraint into system message for all models; default enabled; toggleable via `disabledHooks` |

### Why prompt override instead of code filtering for skill priority

The user chose "gpt.md prompt instruction override" over code-layer filtering. Rationale: the 5 skills are still injected as reference material, but `gpt.md` explicitly downgrades 4 of them from mandatory to advisory, keeping only `brainstorming` as high-priority. This avoids touching the shared skill-loader (which serves all model families) and keeps the change localized to GPT behavior.

### Why extend system.transform for commit guard

`createSystemTransformHandler` already owns system message mutation and runs for all models (v1 and omo). Extending it to append the commit guard after the skills prepend is the minimal, architecturally consistent approach. The alternative (a separate hook registered alongside) would require a second system.transform handler, but OpenCode's plugin interface has a single slot for `experimental.chat.system.transform`, so composition must happen inside the handler.

## Architecture

### Part A: `prompts/v1/deepwork/gpt.md` rewrite

Edit the existing 183-line file, preserving overall structure but adjusting four sections:

**1. Skill priority override** — after the `<deepwork-skill-layer>` block, add:

```
### GPT Skill Priority Override

For GPT models, the injected superpowers skills have tiered priority:

- **High priority (mandatory when triggered):** `brainstorming` — the design-before-code HARD-GATE applies fully.
- **Advisory (consult as needed, not mandatory):** `writing-plans`, `subagent-driven-development`, `requesting-code-review`, `receiving-code-review`. Use these as reference for complex tasks, but do NOT invoke their full ceremony (spec documents, subagent dispatch, two-stage review) unless the task genuinely warrants it per the Decision Framework below.

The trigger conditions described in those 4 advisory skills (e.g., "use when you have a spec") are informational for GPT models, not binding obligations. Apply judgment: if the task is simple, a lighter process is correct.
```

**2. Decision Framework rewrite** — replace the current Self-vs-Delegate framework with a task-tiered flow + clarity-gated ask rule:

```
## DECISION FRAMEWORK: Task Tier + Clarity Gate

Before acting, classify the task and your certainty:

### Task tiers

- **Simple** (single file, <30 lines changed, clear target behavior): Fix directly → run relevant tests → report. No spec, no plan, no TDD ceremony. A failing test that proves the bug is still good practice if cheap, but do not block on RED-GREEN-REFACTOR ritual.
- **Moderate** (multiple files, design judgment needed, known acceptance criteria): Brief design note (2-4 sentences) → implement → test → self-review. Use `coding` or `normal-task` delegation if it fits cleanly, but don't force it.
- **Complex** (architecture-level, cross-module, or novel behavior): Full brainstorm → spec → plan → TDD flow. This is where the advisory skills become mandatory.

### Clarity gate (when to ask vs proceed)

- **Proceed without asking** when: the goal is clear, there is a single valid implementation path, and no tool can resolve remaining trivia. Self-progress through the work.
- **Ask the user** (via the question tool) only when:
  1. Multiple valid implementation paths exist AND the choice changes the deliverable shape, OR
  2. Required information is missing AND no tool can find it, OR
  3. User intent is ambiguous enough that proceeding risks rework.

Do not stop to ask "should I continue?" after every step. Execute the plan unless blocked.
```

**3. Batch processing instruction** — add a new section:

```
## BATCH PROCESSING

When a request contains multiple independent edit points (e.g., "fix these 4 issues"), make all edits first, then run tests and review once collectively. Do NOT run a full test+review cycle per edit point. Only split into sequential batches when edit points have ordering dependencies (one must complete before the next is valid).
```

**4. TDD section softening** — adjust the existing TDD MANDATORY block to reference the task tiers:

```
## TDD (tier-dependent)

TDD (RED→GREEN→SURFACE→REFACTOR) is mandatory for **Complex** tier tasks. For **Moderate** tier, write tests for new behavior but a lightweight cycle is acceptable. For **Simple** tier, run existing tests to verify the fix; a dedicated failing-test-first cycle is optional unless the bug is subtle.

Exemptions unchanged: pure prompt text, formatting, comment-only, version bumps, rename-only.
```

Remove or soften `SCENARIO CONTRACT` and `MANUAL_QA_MANDATE` to tier-dependent language matching the above: **Complex** tier keeps full 3+ scenario contracts with binary pass conditions and manual QA on the real surface; **Moderate** tier uses targeted verification (the specific happy path + one adjacent regression check, no formal scenario table); **Simple** tier runs the existing test suite or a single targeted check, no scenario contract required.

### Part B: `commit-guard-injector` hook

**New hook name** — add to `HOOK_NAMES` array (`src/config/schema.ts:76-93`):

```ts
const HOOK_NAMES = [
  "directory-readme-injector",
  // ... existing ...
  "todo-description-override",
  "commit-guard-injector",  // NEW
] as const
```

**Constraint text** — constant in `src/hooks/chat-message.ts`:

```ts
const COMMIT_GUARD_TEXT = `## Commit Guard

You must not execute git commit, git push, git tag, or any other git write
command on your own. All version control writes require explicit user
permission in the conversation. If a task needs committing, state what should
be committed and ask the user to approve or perform it.`
```

**Handler extension** — `createSystemTransformHandler` gains a `getConfig` parameter:

```ts
export function createSystemTransformHandler(opts: {
  getConfig: () => OcmmConfig
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, rawOutput) => {
    // ... existing skill injection logic (unchanged) ...

    // Commit guard injection (after skills, appended to system end)
    const config = opts.getConfig()
    if (!hookDisabled(config, "commit-guard-injector", undefined)) {
      // Append to system. Handle array and string shapes (mirrors existing logic).
      const sys = (rawOutput as Record<string, unknown>).system
      if (Array.isArray(sys)) {
        sys.push(COMMIT_GUARD_TEXT)
      } else if (typeof sys === "string") {
        (rawOutput as Record<string, unknown>).system = `${sys}\n\n${COMMIT_GUARD_TEXT}`
      } else if (sys === undefined) {
        (rawOutput as Record<string, unknown>).system = [COMMIT_GUARD_TEXT]
      }
      log.info(`system.transform: appended commit guard (${COMMIT_GUARD_TEXT.length} chars)`)
    }
  }
}
```

**Registration update** (`src/index.ts:147`):

```ts
"experimental.chat.system.transform": createSystemTransformHandler({ getConfig }),
```

**Default behavior** — `disabledHooks` default stays `["directory-readme-injector"]`. `commit-guard-injector` is NOT in the default disabled list, so it is enabled by default. Users disable it via:

```jsonc
{ "disabledHooks": ["commit-guard-injector"] }
```

### File change list

| File | Change | Responsibility |
|---|---|---|
| `prompts/v1/deepwork/gpt.md` | Rewrite 4 sections | Needs 1-4: skill priority, task tiers, batch, TDD softening |
| `src/config/schema.ts` | Add hook name | `HOOK_NAMES` array gains `commit-guard-injector` |
| `src/hooks/chat-message.ts` | Extend handler | `createSystemTransformHandler` accepts `{getConfig}`, appends commit guard when enabled |
| `src/index.ts` | Pass config | Registration call passes `getConfig` |
| `docs/v1-maintenance.md` | Sync | Update gpt.md row in Prompt Source Mapping table |
| `src/hooks/chat-message.test.ts` | Extend tests | Cover commit guard injection enabled/disabled, system array/string shapes |

## Detailed Design

### Injection order in system message

After the handler runs, the system message shape is:
1. **Prepended** v1 skills (existing behavior, via `sys.unshift(merged)`)
2. **Original** system content (agent prompt, deepwork prompt, etc.)
3. **Appended** commit guard (new)

For string system: `{skills}\n\n{original}\n\n{commit_guard}`.
For array system: `[skills, ...original_items, commit_guard]`.

The commit guard sits at the end so it is the last instruction the model reads before its turn — reinforcing the constraint.

### `hookDisabled` integration

`hookDisabled(config, name, alias?)` is the existing helper (`src/permissions/index.ts`). It checks `config.disabledHooks` (array of hook names or strings). Since `disabledHooks` is in `ACCUMULATING_ARRAY_KEYS`, a profile or project config adding `"commit-guard-injector"` unions with the base — it cannot accidentally re-enable a disabled hook. This is the desired behavior: if a user disables it globally, a profile can't silently re-enable it.

### Scope: all models

The commit guard applies to all models because `system.transform` runs for every chat regardless of model family or workflow (v1/omo). The GPT-specific prompt changes only affect `gpt.md`, which `pickDeepworkVariantForAgent` selects for GPT-family models.

## Error Handling

- **`getConfig` throws**: The handler's existing pattern swallows errors via early returns. For commit guard, if `getConfig()` throws, catch and skip injection (safe failure — prefer missing the constraint over breaking chat). Log a warning.
- **`hookDisabled` throws**: Same — catch, skip, warn.
- **System shape unexpected** (not array/string/undefined): Skip append, log debug. Existing handler already tolerates this.
- **Empty system**: Append creates `[COMMIT_GUARD_TEXT]` (array) or the guard alone (string) — valid.

## Testing

### `src/hooks/chat-message.test.ts` additions

- Commit guard appended to array system when enabled.
- Commit guard appended to string system when enabled.
- Commit guard NOT appended when `disabledHooks` contains `"commit-guard-injector"`.
- Commit guard NOT appended when `getConfig` returns config with disabledHooks including it.
- Skills still prepended when commit guard is disabled (independent).
- Skills still prepended AND commit guard appended when both enabled (order correct).
- `getConfig` throws → handler does not throw, no commit guard injected.

### Existing tests

The existing `system.transform` tests (L211-243 of chat-message.test.ts) must still pass. The handler signature change (`getConfig` param) requires updating the test constructor calls, but behavior for skills-only injection is unchanged.

### Prompt content verification

`gpt.md` is text; verify via grep for the new section markers:
- `### GPT Skill Priority Override`
- `## DECISION FRAMEWORK: Task Tier + Clarity Gate`
- `## BATCH PROCESSING`
- `## TDD (tier-dependent)`

## Scope Boundaries (YAGNI)

Not in this design:
- No code change to `skill-loader.ts` (injection stays undifferentiated; prompt overrides authority).
- No change to other deepwork variants (gemini/glm/codex/default/planner).
- No bash-level git command interception (constraint is prompt-only, no hard enforcement).
- No config field for custom commit-guard text (hardcoded constant).
- No model-specific commit guard text (all models get the same English text).
- No `default.md` change (default variant unaffected; only GPT gets the behavior adjustment).

## v1-maintenance Doc Sync

Update `docs/v1-maintenance.md` Prompt Source Mapping table, `deepwork/gpt.md` row. The "Adapted for v1" column gains notes about: skill priority override (brainstorming high, 4 others advisory), task-tiered decision framework, batch processing instruction, tier-dependent TDD. Update "Last synced" date.

## Risks

- **Prompt override may be insufficient**: GPT models might still follow the 4 advisory skills' trigger language. Mitigation: the override text is explicit ("do NOT invoke their full ceremony"). Monitor behavior; if insufficient, escalate to code-layer filtering in skill-loader.
- **`createSystemTransformHandler` signature change**: Existing tests construct the handler without args. Must update test call sites. Low risk — mechanical update.
- **Commit guard as soft constraint**: A model determined to commit could ignore the instruction. This is accepted: the user explicitly chose prompt injection over hard bash interception. Hard enforcement is a future option if needed.
- **`disabledHooks` accumulation**: Because it's an accumulating array, disabling in user config + enabling (by omission) in project config means disabled wins (union). This is the safe direction — a user who disables the guard globally won't be surprised by a project re-enabling it.
