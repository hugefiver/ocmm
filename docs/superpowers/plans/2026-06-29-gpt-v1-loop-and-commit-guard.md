# GPT v1 Loop Behavior & Commit Guard Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjust the GPT deepwork prompt to tier task complexity and suppress non-brainstorm skill authority, and add a commit-guard hook that injects a no-autonomous-commit constraint into the system message for all models.

**Architecture:** Two independent parts. Part A rewrites four sections of `prompts/v1/deepwork/gpt.md` (no code). Part B extends `createSystemTransformHandler` to accept `getConfig`, adds a `commit-guard-injector` hook name, and appends the constraint when enabled. Both parts touch `docs/v1-maintenance.md` for sync.

**Tech Stack:** TypeScript (Node 22+, `node --test --experimental-strip-types`), Zod schema, OpenCode plugin hooks.

**Spec:** `docs/superpowers/specs/2026-06-29-gpt-v1-loop-and-commit-guard-design.md`

---

### Task 1: Add `commit-guard-injector` to HOOK_NAMES

**Files:**
- Modify: `src/config/schema.ts:76-93`

- [ ] **Step 1: Add the hook name to the HOOK_NAMES array**

In `src/config/schema.ts`, the `HOOK_NAMES` const tuple (L76-93) currently ends with `"todo-description-override",`. Add `"commit-guard-injector"` as the new last element before the closing `] as const`:

```ts
const HOOK_NAMES = [
  "directory-readme-injector",
  "directory-agents-injector",
  "write-existing-file-guard",
  "notepad-write-guard",
  "bash-file-read-guard",
  "question-label-truncator",
  "tasks-todowrite-disabler",
  "webfetch-redirect-guard",
  "empty-task-response-detector",
  "comment-checker",
  "plan-format-validator",
  "read-image-resizer",
  "json-error-recovery",
  "fsync-skip-warning",
  "tool-output-truncator",
  "todo-description-override",
  "commit-guard-injector",
] as const
```

- [ ] **Step 2: Run typecheck to verify the schema change is valid**

Run: `pnpm run typecheck`
Expected: PASS, no errors. The `HookNameSchema = z.enum(HOOK_NAMES)` and `HookName` type update automatically.

- [ ] **Step 3: Commit**

```bash
git add src/config/schema.ts
git commit -m "feat: add commit-guard-injector hook name"
```

---

### Task 2: Extend createSystemTransformHandler with commit guard injection

**Files:**
- Modify: `src/hooks/chat-message.ts:183-214`
- Modify: `src/index.ts:147`

- [ ] **Step 1: Write the failing test for commit guard appended to array system**

In `src/hooks/chat-message.test.ts`, add a new test after the existing `system.transform` tests (after L248). The test needs a mock `getConfig` returning a config where `commit-guard-injector` is NOT disabled:

```ts
test("system.transform appends commit guard to array system when enabled", async () => {
  const sessionID = "ses_test_guard_arr"
  clearSessionIntent(sessionID)
  const getConfig = () => ({ disabledHooks: [] }) as unknown as import("../config/schema.ts").OcmmConfig
  const handler = createSystemTransformHandler({ getConfig })
  const input = { sessionID }
  const output = { system: ["ORIGINAL"] }
  await handler(input, output)
  assert.ok(Array.isArray(output.system))
  assert.equal(output.system.length, 2)
  assert.equal(output.system[0], "ORIGINAL")
  assert.ok(typeof output.system[1] === "string")
  assert.ok((output.system[1] as string).includes("Commit Guard"))
  assert.ok((output.system[1] as string).includes("git commit"))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --experimental-strip-types src/hooks/chat-message.test.ts`
Expected: FAIL — `createSystemTransformHandler` does not accept `{getConfig}` yet, or commit guard not appended.

- [ ] **Step 3: Add COMMIT_GUARD_TEXT constant and extend the handler**

In `src/hooks/chat-message.ts`, add the constant near the top of the file (after the existing imports/constants, before `createSystemTransformHandler`):

```ts
const COMMIT_GUARD_TEXT = `## Commit Guard

You must not execute git commit, git push, git tag, or any other git write
command on your own. All version control writes require explicit user
permission in the conversation. If a task needs committing, state what should
be committed and ask the user to approve or perform it.`
```

Add the `hookDisabled` import at the top of the file (find the existing imports, add):

```ts
import { hookDisabled } from "../permissions/index.ts"
```

Replace the `createSystemTransformHandler` function (L183-214) with the extended version:

```ts
export function createSystemTransformHandler(opts: {
  getConfig: () => OcmmConfig
}): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput, rawOutput) => {
    if (!isRecord(rawInput)) return
    const sessionID = typeof rawInput.sessionID === "string" ? rawInput.sessionID : ""
    if (!sessionID) return
    const merged = getSessionPrompt(sessionID)
    if (merged) {
      if (!isRecord(rawOutput)) return
      const sys = rawOutput.system
      if (Array.isArray(sys)) {
        sys.unshift(merged)
        log.info(
          `system.transform: prepended ${merged.length} chars (sessionID=${sessionID.slice(0, 16)}…)`,
        )
      } else if (typeof sys === "string") {
        rawOutput.system = `${merged}\n\n${sys}`
        log.info(
          `system.transform: prepended ${merged.length} chars to string system`,
        )
      } else {
        rawOutput.system = [merged]
        log.info(
          `system.transform: initialized system with ${merged.length} chars`,
        )
      }
    }

    // Commit guard injection (appended to system end, after skills prepend).
    if (!isRecord(rawOutput)) return
    try {
      const config = opts.getConfig()
      if (!hookDisabled(config, "commit-guard-injector", "commitGuardInjector")) {
        const sys = rawOutput.system
        if (Array.isArray(sys)) {
          sys.push(COMMIT_GUARD_TEXT)
          log.info(`system.transform: appended commit guard (${COMMIT_GUARD_TEXT.length} chars)`)
        } else if (typeof sys === "string") {
          rawOutput.system = `${sys}\n\n${COMMIT_GUARD_TEXT}`
          log.info(`system.transform: appended commit guard (${COMMIT_GUARD_TEXT.length} chars)`)
        } else if (sys === undefined) {
          rawOutput.system = [COMMIT_GUARD_TEXT]
          log.info(`system.transform: initialized system with commit guard (${COMMIT_GUARD_TEXT.length} chars)`)
        }
      }
    } catch (err) {
      log.warn(`system.transform: commit guard skipped due to error: ${(err as Error).message}`)
    }
  }
}
```

Note: the `OcmmConfig` type import must be present. Check the top of `chat-message.ts` — if `OcmmConfig` is not already imported, add `import type { OcmmConfig } from "../config/schema.ts"`.

Also note: the original code had three separate `return` statements inside the `if (merged)` block for array/string/else. The new code removes those early returns so the commit guard block always runs after. The `if (merged)` wrapping ensures the skills block is skipped when no skills are queued, but the commit guard block runs unconditionally (guarded only by `hookDisabled`).

- [ ] **Step 4: Update the registration in src/index.ts**

In `src/index.ts` L147, change:

```ts
"experimental.chat.system.transform": createSystemTransformHandler(),
```

to:

```ts
"experimental.chat.system.transform": createSystemTransformHandler({ getConfig }),
```

`getConfig` is already in scope at that point in `src/index.ts` (it is defined earlier in the `createPlugin` function).

- [ ] **Step 5: Update existing system.transform tests to pass {getConfig}**

In `src/hooks/chat-message.test.ts`, the three existing `system.transform` tests (L217, L233, L244) call `createSystemTransformHandler()` with no args. Update each to:

```ts
const getConfig = () => ({ disabledHooks: [] }) as unknown as OcmmConfig
const sysHandler = createSystemTransformHandler({ getConfig })
```

Add the `OcmmConfig` type import at the top of the test file if not present: `import type { OcmmConfig } from "../config/schema.ts"`.

The existing test assertions check `output.system[0]` or `output.system` (the prepended skills). Since the commit guard is appended (not prepended), those assertions still pass — the skills content remains at index 0. However, tests that assert `output.system.length === 1` will now fail because the commit guard adds a second element. Update those assertions:

- For array tests expecting length 1: change to expect the skills at `[0]` and optionally assert `[1]` contains "Commit Guard".
- For the no-ops test (L244, `system.transform no-ops when no skills queued`): this test expects no change when no skills are queued. With commit guard enabled, the system IS changed (guard appended). Update this test to either disable the guard via config (`disabledHooks: ["commit-guard-injector"]`) OR assert that only the commit guard is appended. The cleaner choice: set `disabledHooks: ["commit-guard-injector"]` in the no-ops test's `getConfig` so it truly tests the skills-only no-op path.

- [ ] **Step 6: Add test for commit guard appended to string system**

```ts
test("system.transform appends commit guard to string system when enabled", async () => {
  const sessionID = "ses_test_guard_str"
  clearSessionIntent(sessionID)
  const getConfig = () => ({ disabledHooks: [] }) as unknown as OcmmConfig
  const handler = createSystemTransformHandler({ getConfig })
  const input = { sessionID }
  const output = { system: "ORIGINAL" }
  await handler(input, output)
  assert.equal(typeof output.system, "string")
  assert.ok((output.system as string).startsWith("ORIGINAL"))
  assert.ok((output.system as string).includes("Commit Guard"))
  assert.ok((output.system as string).includes("git commit"))
})
```

- [ ] **Step 7: Add test for commit guard NOT appended when disabled**

```ts
test("system.transform does not append commit guard when disabled", async () => {
  const sessionID = "ses_test_guard_off"
  clearSessionIntent(sessionID)
  const getConfig = () => ({ disabledHooks: ["commit-guard-injector"] }) as unknown as OcmmConfig
  const handler = createSystemTransformHandler({ getConfig })
  const input = { sessionID }
  const output = { system: ["ORIGINAL"] }
  await handler(input, output)
  assert.ok(Array.isArray(output.system))
  assert.equal(output.system.length, 1)
  assert.equal(output.system[0], "ORIGINAL")
})
```

- [ ] **Step 8: Add test for getConfig throwing does not break handler**

```ts
test("system.transform tolerates getConfig throwing", async () => {
  const sessionID = "ses_test_guard_err"
  clearSessionIntent(sessionID)
  const getConfig = () => { throw new Error("config unavailable") }
  const handler = createSystemTransformHandler({ getConfig })
  const input = { sessionID }
  const output = { system: ["ORIGINAL"] }
  await handler(input, output)  // must not throw
  assert.equal(output.system.length, 1)
  assert.equal(output.system[0], "ORIGINAL")
})
```

- [ ] **Step 9: Run all chat-message tests to verify they pass**

Run: `node --test --experimental-strip-types src/hooks/chat-message.test.ts`
Expected: PASS — all existing + new tests pass.

- [ ] **Step 10: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 11: Commit**

```bash
git add src/hooks/chat-message.ts src/index.ts src/hooks/chat-message.test.ts
git commit -m "feat: inject commit guard into system message via hook"
```

---

### Task 3: Rewrite gpt.md prompt sections

**Files:**
- Modify: `prompts/v1/deepwork/gpt.md`

- [ ] **Step 1: Add GPT Skill Priority Override after the deepwork-skill-layer block**

In `prompts/v1/deepwork/gpt.md`, after the `<deepwork-skill-layer>` closing tag (around L5), insert the new section. Find the line containing `</deepwork-skill-layer>` and insert after it:

```markdown

### GPT Skill Priority Override

For GPT models, the injected superpowers skills have tiered priority:

- **High priority (mandatory when triggered):** `brainstorming` — the design-before-code HARD-GATE applies fully.
- **Advisory (consult as needed, not mandatory):** `writing-plans`, `subagent-driven-development`, `requesting-code-review`, `receiving-code-review`. Use these as reference for complex tasks, but do NOT invoke their full ceremony (spec documents, subagent dispatch, two-stage review) unless the task genuinely warrants it per the Decision Framework below.

The trigger conditions described in those 4 advisory skills (e.g., "use when you have a spec") are informational for GPT models, not binding obligations. Apply judgment: if the task is simple, a lighter process is correct.
```

- [ ] **Step 2: Replace the DECISION FRAMEWORK section with Task Tier + Clarity Gate**

Find the section titled `## DECISION FRAMEWORK: SELF VS DELEGATE` (around L42-57, includes the table with Trivial/Moderate/Complex/Research rows). Replace the entire section (from the `## DECISION FRAMEWORK` heading through the end of its table/content, up to the next `##` heading) with:

```markdown
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

- [ ] **Step 3: Add BATCH PROCESSING section**

After the DECISION FRAMEWORK section (and before EXECUTION PATTERN or the next heading), insert:

```markdown

## BATCH PROCESSING

When a request contains multiple independent edit points (e.g., "fix these 4 issues"), make all edits first, then run tests and review once collectively. Do NOT run a full test+review cycle per edit point. Only split into sequential batches when edit points have ordering dependencies (one must complete before the next is valid).
```

- [ ] **Step 4: Rewrite SCENARIO CONTRACT to tier-dependent**

Find the `## SCENARIO CONTRACT` section (around L122-129). Replace the entire section with:

```markdown
## SCENARIO CONTRACT (tier-dependent)

- **Complex** tier: define 3+ scenarios (happy path, edge case, adjacent regression) with binary pass conditions before implementation. "Looks good" is not a pass condition.
- **Moderate** tier: targeted verification — the specific happy path + one adjacent regression check. No formal scenario table required.
- **Simple** tier: run the existing test suite or a single targeted check. No scenario contract required.
```

- [ ] **Step 5: Rewrite TDD MANDATORY to tier-dependent**

Find the `## TDD` or `## TDD MANDATORY` section (around L131-137). Replace the entire section with:

```markdown
## TDD (tier-dependent)

- **Complex** tier: TDD mandatory (RED → GREEN → SURFACE → REFACTOR). Write the failing test first.
- **Moderate** tier: write tests for new behavior; a lightweight cycle is acceptable (test after implementation is fine if the behavior is straightforward).
- **Simple** tier: run existing tests to verify the fix. A dedicated failing-test-first cycle is optional unless the bug is subtle.

Exemptions (all tiers): pure prompt text, formatting, comment-only edits, version bumps with no behavior delta, rename-only moves. Justify every exemption in the final report.
```

- [ ] **Step 6: Rewrite MANUAL_QA_MANDATE to tier-dependent**

Find the `## MANUAL_QA_MANDATE` section (around L150-167, includes the table with CLI/API/UI/TUI/Config/Prompt/Build rows). Replace the entire section with:

```markdown
## MANUAL QA (tier-dependent)

- **Complex** tier: full manual QA on the real surface (see table below). Capture the artifact proving the behavior.
- **Moderate** tier: exercise the real surface for the changed behavior; capture one artifact.
- **Simple** tier: run the relevant test or command; no formal QA artifact required unless the change is user-visible.

| Change type | Complex-tier QA |
|---|---|
| CLI | Run the command and show stdout/stderr. |
| API | Call the endpoint and show status/body. |
| UI | Drive the page in a browser and capture a screenshot or trace. |
| TUI | Capture the terminal pane and verify layout. |
| Config | Load the config and verify the parsed shape. |
| Prompt or mode | Verify the prompt loads or the registry resolves it. |
| Build output | Run build and verify exit code 0. |

If QA starts a server, browser, tmux session, port, temp dir, or background process, clean it up and record the cleanup.
```

- [ ] **Step 7: Verify the file is well-formed**

Run: `rg "^## " prompts/v1/deepwork/gpt.md`
Expected: section headings include `## DECISION FRAMEWORK: Task Tier + Clarity Gate`, `## BATCH PROCESSING`, `## SCENARIO CONTRACT (tier-dependent)`, `## TDD (tier-dependent)`, `## MANUAL QA (tier-dependent)`.

- [ ] **Step 8: Commit**

```bash
git add prompts/v1/deepwork/gpt.md
git commit -m "feat: tier GPT deepwork prompt by task complexity"
```

---

### Task 4: Sync docs/v1-maintenance.md

**Files:**
- Modify: `docs/v1-maintenance.md`

- [ ] **Step 1: Update the deepwork/gpt.md row in the Prompt Source Mapping table**

In `docs/v1-maintenance.md`, find the Prompt Source Mapping table row for `deepwork/gpt.md` (L32). Update the "Adapted for v1" column to reflect the new changes. The current content is:

```
| deepwork/gpt.md | all 5 | upstream GPT structured-instruction adaptation, certainty protocol, TDD/QA/reviewer gate | upstream-only agent/tool names | local agent names plus deepwork skill-layer note |
```

Change the "Adapted for v1" column (last column) to:

```
local agent names plus deepwork skill-layer note; GPT skill priority override (brainstorming high, 4 others advisory); task-tiered decision framework (Simple/Moderate/Complex) with clarity gate; batch processing instruction; tier-dependent TDD/scenario/QA
```

- [ ] **Step 2: Update the Last synced date if the table has one**

If the Prompt Source Mapping table has a "Last synced" column (check the header row), update the `deepwork/gpt.md` row's date to today's date (2026-06-29).

- [ ] **Step 3: Commit**

```bash
git add docs/v1-maintenance.md
git commit -m "docs: sync v1-maintenance for gpt.md prompt changes"
```

---

### Task 5: Full verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: All TS + Rust tests pass, 0 failures. The new chat-message tests (commit guard) and all existing tests pass.

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Verify gpt.md section markers via grep**

Run: `rg "GPT Skill Priority Override|Task Tier \+ Clarity Gate|BATCH PROCESSING|tier-dependent" prompts/v1/deepwork/gpt.md`
Expected: at least 5 matches covering all new/changed sections.

- [ ] **Step 4: Verify commit guard hook name is registered**

Run: `rg "commit-guard-injector" src/config/schema.ts src/hooks/chat-message.ts`
Expected: matches in both files (schema HOOK_NAMES + handler hookDisabled check).

- [ ] **Step 5: Verify v1-maintenance sync**

Run: `rg "skill priority override|tiered decision framework|batch processing" docs/v1-maintenance.md`
Expected: matches in the gpt.md row.

- [ ] **Step 6: Build to verify no compilation regressions**

Run: `pnpm run build:ts`
Expected: PASS, `dist/` updated.

---

## Self-Review Notes

**Spec coverage:**
- Need 1 (skill priority): Task 3 Step 1 ✓
- Need 2 (skip spec-plan-TDD for simple): Task 3 Steps 2,4,5,6 ✓
- Need 3 (batch processing): Task 3 Step 3 ✓
- Need 4 (self-progress vs ask): Task 3 Step 2 (Clarity gate) ✓
- Need 5+6 (commit guard hook): Tasks 1+2 ✓
- v1-maintenance sync: Task 4 ✓

**Type consistency:**
- `createSystemTransformHandler` signature: `(opts: { getConfig: () => OcmmConfig })` — consistent across Task 2 definition and test calls.
- `hookDisabled(config, "commit-guard-injector", "commitGuardInjector")` — matches existing two-name calling convention.
- `COMMIT_GUARD_TEXT` constant name — consistent across handler and tests (tests reference the string content, not the constant, so no import needed in tests).

**Ordering:**
- Task 1 (schema) before Task 2 (handler) — handler imports `hookDisabled` which checks against `HOOK_NAMES`; the name must exist first.
- Task 3 (prompt) is independent of Tasks 1-2 — could run in parallel, but kept sequential for review simplicity.
- Task 4 (docs) after Task 3 — references the prompt changes.
- Task 5 (verification) last.
