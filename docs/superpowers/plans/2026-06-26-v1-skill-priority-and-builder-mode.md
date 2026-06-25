# v1 Skill Priority & Builder Mode Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen v1 prompt wording so injected skills feel mandatory to the model, and restrict `builder` to primary-only by changing its registered mode.

**Architecture:** Two independent change tracks. Track A (code): one-line mode change in `config.ts` + test update. Track B (prompts): replace the soft "follow when phase applies" sections in `orchestrator.md` and `planner.md` with MANDATORY trigger tables, plus update the orchestrator delegation table to reflect builder's new status. A doc-sync task updates `docs/v1-maintenance.md`.

**Tech Stack:** TypeScript (Node 22+, `node --test`), Zod, OpenCode plugin hooks, Markdown prompt files.

**Spec:** `docs/superpowers/specs/2026-06-26-v1-skill-priority-and-builder-mode-design.md`

---

## File Structure

**Files modified (no new files created):**

| File | Responsibility | Track |
|---|---|---|
| `src/hooks/config.ts` | Agent mode registration — builder moves from "all" to "primary" | A |
| `src/hooks/config.test.ts` | Asserts builder mode is "primary", not "all" | A |
| `prompts/v1/agents/orchestrator.md` | Delegation table row + skill section wording | B |
| `prompts/v1/agents/planner.md` | Skill section wording | B |
| `docs/v1-maintenance.md` | Sync entry for prompt changes (per AGENTS.md rule) | B |

---

## Task 1: Change builder mode to primary

**Files:**
- Modify: `src/hooks/config.ts` (agent mode registration, ~L181)
- Test: `src/hooks/config.test.ts` (~L37-46)

- [ ] **Step 1: Update the failing test first (TDD red)**

In `src/hooks/config.test.ts`, find the test at ~L37:

```typescript
test("builder and planner can be used as both primary and delegated agents", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  assert.equal((cfg.agent.orchestrator as Record<string, unknown> | undefined)?.mode, "primary")
  assert.equal((cfg.agent.builder as Record<string, unknown> | undefined)?.mode, "all")
  assert.equal((cfg.agent.planner as Record<string, unknown> | undefined)?.mode, "all")
  assert.equal((cfg.agent.reviewer as Record<string, unknown> | undefined)?.mode, "subagent")
})
```

Replace with:

```typescript
test("builder is primary-only; planner can be both primary and delegated", async () => {
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await handler(cfg, undefined)

  assert.equal((cfg.agent.orchestrator as Record<string, unknown> | undefined)?.mode, "primary")
  assert.equal((cfg.agent.builder as Record<string, unknown> | undefined)?.mode, "primary")
  assert.equal((cfg.agent.planner as Record<string, unknown> | undefined)?.mode, "all")
  assert.equal((cfg.agent.reviewer as Record<string, unknown> | undefined)?.mode, "subagent")
})
```

Changes: test name updated; builder assertion changed from `"all"` to `"primary"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/hooks/config.test.ts`
Expected: FAIL — the test now expects builder mode `"primary"` but config.ts still produces `"all"`.

- [ ] **Step 3: Implement the mode change**

In `src/hooks/config.ts`, find the mode assignment (~L179-181):

```typescript
  const mode = a.name === "orchestrator"
    ? "primary"
    : a.name === "planner" || a.name === "builder"
      ? "all"
      : "subagent"
```

Replace with:

```typescript
  const mode = a.name === "orchestrator" || a.name === "builder"
    ? "primary"
    : a.name === "planner"
      ? "all"
      : "subagent"
```

Change rationale: `builder` moves from the second condition (`"all"`) to the first condition (`"primary"`). `planner` stays `"all"`. Everything else stays `"subagent"`. This ensures builder gets `mode: "primary"` AND keeps its locale guidance (the `if (mode === "primary" || mode === "all")` block at L184 still fires for builder).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/hooks/config.test.ts`
Expected: PASS — builder mode assertion is now `"primary"`.

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `pnpm test`
Expected: PASS — no other tests break. The locale test at ~L54 iterates `["orchestrator", "builder", "planner"]` and checks locale injection; since builder is still `mode === "primary"`, the `mode === "primary" || mode === "all"` check still passes, so locale is still injected. No regression.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/config.ts src/hooks/config.test.ts
git commit -m "feat(config): restrict builder to primary-only mode

builder had mode \"all\" which allowed it to be dispatched as a subagent,
but it has no role-specific prompt (prompts/v1/agents/builder.md does not
exist). Move builder to mode \"primary\" so it can only be used as a
primary agent. Subagent implementation work routes to category subagents
(coding/quick/normal-task/deep) instead."
```

---

## Task 2: Strengthen orchestrator.md skill section + delegation table

**Files:**
- Modify: `prompts/v1/agents/orchestrator.md` (~L80, ~L82-90)

- [ ] **Step 1: Update the delegation table row**

In `prompts/v1/agents/orchestrator.md`, find the delegation table row at ~L80:

```
| Focused single task with skills | `builder` |
```

Replace with:

```
| Focused single task (implementation) | `coding` / `quick` / `normal-task` / `deep` (subagent) — `builder` is primary-only |
```

- [ ] **Step 2: Replace the skill utilization section**

In `prompts/v1/agents/orchestrator.md`, find the section at ~L82-90:

```
## Injected Skill Utilization

The deepwork workflow injects these skills as text into your system message; follow them when their phase applies:

- `brainstorming` — before any creative work (new features, components, behavior changes). Present a design and get user approval before implementation.
- `writing-plans` — for multi-step implementation plans.
- `subagent-driven-development` — for executing plans task-by-task with fresh subagents and two-stage review.
- `requesting-code-review` — after a task or major feature, before merge.
- `receiving-code-review` — when processing reviewer feedback.
```

Replace with:

```
## Injected Skill Utilization (MANDATORY)

Five superpowers skills are injected into this session. They are not optional references. You MUST follow each one when its trigger condition is met — skipping a triggered skill is a workflow violation, not a shortcut.

| Skill | Trigger condition | Your obligation |
|---|---|---|
| `brainstorming` | User requests any new feature, component, or behavior change, AND no approved design exists yet | Present a design and get explicit user approval BEFORE any code. This is a HARD-GATE. |
| `writing-plans` | A spec/design has been approved, or a multi-step task needs decomposition | Produce a plan at `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` before implementation. |
| `subagent-driven-development` | You have an implementation plan with independent tasks | Dispatch a fresh subagent per task with two-stage review (spec then code quality). Do not implement plan tasks yourself. |
| `requesting-code-review` | A task or major feature completes, or before merge to main | Dispatch a code reviewer subagent with the work SHAs. Do not declare done without review. |
| `receiving-code-review` | You receive reviewer feedback | Verify each item against the codebase before implementing. No performative agreement. |

Every routing decision must first check: "Does a skill trigger here?" If yes, the skill dictates the next step, not your default instinct.
```

- [ ] **Step 3: Verify build still passes**

Run: `pnpm run build`
Expected: PASS — prompt files are read at config/build time; no syntax errors introduced. The `rg` or visual check confirms the MANDATORY table is present and well-formed Markdown.

- [ ] **Step 4: Commit**

```bash
git add prompts/v1/agents/orchestrator.md
git commit -m "feat(prompts): make orchestrator skill usage mandatory

Replace soft 'follow when phase applies' wording with a MANDATORY trigger
table that specifies exact trigger conditions and obligations per skill.
Update delegation table to reflect builder moving to primary-only; route
implementation subagent work to coding/quick/normal-task/deep categories."
```

---

## Task 3: Strengthen planner.md skill section

**Files:**
- Modify: `prompts/v1/agents/planner.md` (~L25-35)

- [ ] **Step 1: Replace the skill utilization section**

In `prompts/v1/agents/planner.md`, find the section at ~L25-35:

```
## Injected Skill Utilization

Follow the `writing-plans` skill as the canonical planning workflow. When specifying how tasks should be executed, pick the sharpest available tool for each job:

- **Symbol-level navigation**: `lsp_*` MCP tools. They auto-route to the matching language server by file extension — just pass the file path.
- **Structural code search/rewrite**: `ast-grep` skill or `sg` CLI.
- **Content search**: `rg` (ripgrep).
- **File discovery**: `fd`.
- **Internal codebase patterns**: `code-search` agent.
- **External API/library references**: `doc-search` agent.
- **Terminal commands**: the shell type is stated in your system prompt (e.g. `powershell`, `zsh`, `bash`). On Windows PowerShell, prefer uutils coreutils with `.exe` suffix to avoid alias shadowing; on POSIX shells use bare names.
```

Replace with:

```
## Injected Skill Utilization (MANDATORY)

`writing-plans` is injected into this session. When you produce a plan, you MUST follow the `writing-plans` skill structure exactly: plan header with goal/architecture/tech-stack, bite-sized TDD tasks with checkbox steps, no placeholders, self-review against spec coverage. This is not a style preference — it is the contract the implementer subagents will rely on.

`brainstorming` is also injected. If the request needs a design and none is approved yet, STOP and tell the orchestrator/user to run the brainstorming phase first. Do not produce a plan for undesigned work.

When specifying how tasks should be executed, pick the sharpest available tool for each job:

- **Symbol-level navigation**: `lsp_*` MCP tools. They auto-route to the matching language server by file extension — just pass the file path.
- **Structural code search/rewrite**: `ast-grep` skill or `sg` CLI.
- **Content search**: `rg` (ripgrep).
- **File discovery**: `fd`.
- **Internal codebase patterns**: `code-search` agent.
- **External API/library references**: `doc-search` agent.
- **Terminal commands**: the shell type is stated in your system prompt (e.g. `powershell`, `zsh`, `bash`). On Windows PowerShell, prefer uutils coreutils with `.exe` suffix to avoid alias shadowing; on POSIX shells use bare names.
```

Note: the tool list (lsp_*, ast-grep, rg, fd, etc.) is preserved verbatim — it was already correct and useful. Only the skill directive wording above it changes from soft to MANDATORY.

- [ ] **Step 2: Verify build still passes**

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add prompts/v1/agents/planner.md
git commit -m "feat(prompts): make planner skill usage mandatory

Replace soft 'as the canonical planning workflow' wording with MANDATORY
directive for writing-plans structure compliance and brainstorming STOP
gate for undesigned work. Preserve the tool selection list."
```

---

## Task 4: Sync docs/v1-maintenance.md

**Files:**
- Modify: `docs/v1-maintenance.md` (~L27-51, Prompt Source Mapping table)

- [ ] **Step 1: Read the current v1-maintenance.md Prompt Source Mapping table**

Run: read `docs/v1-maintenance.md` lines 27-51 to see the exact current content of the "Adapted for v1" column for orchestrator.md and planner.md rows.

- [ ] **Step 2: Update the orchestrator.md row**

In the Prompt Source Mapping table, find the row for `orchestrator.md` (~L37). Update its "Adapted for v1" cell to reflect that the "Injected Skill Utilization" section changed from advisory to MANDATORY trigger table, and the delegation table no longer lists builder as a subagent target.

Example (adapt to actual table column structure found in Step 1):

If the cell currently says something like:
`injected skill utilization section, delegation table, intent gate, MCP tools`

Change to:
`injected skill utilization section (MANDATORY trigger table, was advisory), delegation table (builder removed as subagent target — now primary-only), intent gate, MCP tools`

- [ ] **Step 3: Update the planner.md row**

In the same table, find the row for `planner.md` (~L39). Update its "Adapted for v1" cell.

Example:

If the cell currently says something like:
`injected skill utilization section, plan structure, self-review`

Change to:
`injected skill utilization section (MANDATORY for writing-plans + brainstorming STOP gate, was advisory), plan structure, self-review`

- [ ] **Step 4: Commit**

```bash
git add docs/v1-maintenance.md
git commit -m "docs: sync v1-maintenance for skill priority and builder mode changes

Record orchestrator.md and planner.md prompt wording change from advisory
to MANDATORY, and builder mode change from all to primary."
```

---

## Task 5: Final verification

**Files:** (no modifications — verification only)

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS (exit 0).

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: PASS — all existing tests plus the updated builder mode assertion pass.

- [ ] **Step 3: Run build**

Run: `pnpm run build`
Expected: PASS — `dist/index.js` and `dist/bin/ocmm-lsp-*` produced without errors.

- [ ] **Step 4: Verify git log is clean**

Run: `git log --oneline -5`
Expected: Shows the commits from Tasks 1-4 in order, no unrelated files in any commit.

- [ ] **Step 5: (Optional) Manual smoke test**

If a live OpenCode instance is available for testing, follow the AGENTS.md "Live Integration Test" flow:
1. Build.
2. Set up isolated test dir with XDG env vars.
3. `opencode debug config --print-logs --log-level DEBUG` — verify builder mode is `primary`.
4. `opencode run --agent orchestrator "实现一个简单函数"` with `workflow: "v1"` — orchestrator should trigger brainstorming HARD-GATE rather than writing code immediately.
5. Clean up.

If no live instance is available, skip this step — the unit tests and build cover the mechanical correctness.
