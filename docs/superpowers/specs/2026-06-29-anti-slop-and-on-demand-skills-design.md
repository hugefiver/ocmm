# Anti-Slop Prevention + On-Demand Skill Loading Design

## Goal

Three coordinated changes to the v1 deepwork workflow:
1. **Anti-slop prevention** — strengthen `<scope_constraints>` in all 5 deepwork variants with omo-aligned rules + a 10-category anti-slop checklist. Applies to all models.
2. **remove-ai-slops skill** — fork omo's skill as a simplified version, register as a shared slash command (on-demand load, not injected).
3. **Core skills on-demand** — only `brainstorming` remains injected (HARD-GATE protection); the other 4+1 skills (writing-plans, subagent-driven-development, requesting-code-review, receiving-code-review, dispatching-parallel-agents) become slash-command-only with prompt guidance to load on demand.

## Background

### Current v1 skill injection (`src/intent/skill-loader.ts`)

- `V1_SKILL_DIRS` (L49-56): 6 skill dirs (brainstorming, writing-plans, subagent-driven-development, requesting-code-review, receiving-code-review, dispatching-parallel-agents).
- `loadV1Skills()` (L58-72): reads all 6 SKILL.md files, concatenates into ~34k chars string, injected via `chat.message` → `system.transform`.
- `loadV1SkillCommands()` (L74-89): also iterates `V1_SKILL_DIRS`, registers each as a slash command.
- Both functions use the same `V1_SKILL_DIRS` array — changing it affects both injection AND slash command registration.

### Shared skill registration (`loadSharedSkills`, L91-127)

- Scans `skills/` root (excluding `v1/` subdir) for `SKILL.md` files.
- Registers each as a shared slash command.
- `remove-ai-slops` placed at `skills/remove-ai-slops/SKILL.md` (not under `v1/`) will be auto-discovered and registered as `/remove-ai-slops` — no code change needed for registration.

### Current anti-slop constraints

- v1 deepwork prompts have `<scope_constraints>` with 4 basic rules.
- omo deepwork prompts have stronger `<scope_constraints>` with 5 rules (adds "fix doesn't need surrounding cleanup", "one-shot doesn't need helper/abstraction", "validate only at boundaries").
- omo has `remove-ai-slops` skill (317 lines, Python-specific, on-demand).
- omo clarifier flags AI-slop risks.

## Design

### Part A: Strengthen anti-slop in all deepwork variants

Modify `prompts/v1/deepwork/{default,gpt,gemini,glm,codex}.md`:

**A1. Replace `<scope_constraints>` with omo-aligned version:**

```
<scope_constraints>
- Implement EXACTLY and ONLY what the user requested.
- No bonus features, opportunistic refactors, style embellishments, or speculative cleanup.
- A fix does not need surrounding cleanup unless the cleanup is required for the fix.
- A one-shot operation does not need a helper, abstraction, flag, shim, or future-proofing.
- Validate only at boundaries. Trust internal guarantees unless evidence proves otherwise.
- If any instruction is ambiguous, choose the simplest valid interpretation.
- Do NOT expand the task beyond what was asked.
</scope_constraints>
```

**A2. Add anti-slop checklist after scope_constraints:**

```
### Anti-slop checklist (applies to all code you write)

Before writing code, verify you are NOT introducing:
- Comments that restate what the code does (only write comments explaining WHY, not WHAT)
- Defensive checks on values guaranteed by the type system or upstream contracts (null checks on non-nullable, try/catch around code that cannot throw, isinstance on statically-typed params)
- Pass-through wrappers, single-use helpers, speculative abstractions, factory functions that only call constructors
- Dead code, unused imports, debug leftovers (console.log, print, dbg!), commented-out code
- Duplication that could be extracted without forced generics (but keep coincidental repetition where intents differ)
- Loop-invariant computations, repeated string concatenation in loops (use join), redundant deep copies, repeated len()/size() calls that could be cached
- Oversized functions (>50 lines) or modules (>250 pure LOC) — split by responsibility, not by line count

If you notice existing slop in files you touch, mention it in your report but do not fix it unless asked. Slop cleanup is a separate task — use /remove-ai-slops for systematic cleanup.
```

### Part B: remove-ai-slops skill (simplified fork)

Create `skills/remove-ai-slops/SKILL.md` (NOT under `v1/` — auto-discovered by `loadSharedSkills`).

**Simplified from omo's 317 lines to ~150 lines:**

- Keep 10 slop categories (generalized, not Python-specific):
  1. Obvious comments
  2. Over-defensive code
  3. Excessive complexity
  4. Needless abstraction
  5. Boundary violations
  6. Dead code
  7. Duplication
  8. Performance equivalences
  9. Missing tests
  10. Oversized modules

- Keep 6-phase flow (simplified):
  - Phase 0: Plan
  - Phase 1: Scope (git diff)
  - Phase 2: Behavior lock (regression tests FIRST, non-negotiable)
  - Phase 3: Cleanup plan (safety order: comments → dead code → defensive → duplication → complexity → abstraction → performance → tests → oversized)
  - Phase 4: Parallel cleanup via task tool (batches of 5)
  - Phase 5: Quality gates + critical review
  - Phase 6: Fix failures (revert + re-apply safe changes; 3 failures = escalate)

- Generalize from Python:
  - `match/case + assert_never` → "exhaustive pattern matching (switch/match with exhaustiveness check)"
  - `isinstance` → "type guards / instanceof"
  - `Protocol/TypeVar` → "interfaces / generics"
  - `except Exception` → "broad catch (catch-all)"
  - Keep `console.log/print/dbg!` examples but add `console.error` etc.

- Adapt omo-specific references:
  - `deep` agents → "task tool with appropriate category"
  - `task(run_in_background=true)` → "task tool (run_in_background=true)"
  - Keep batch-5 parallel pattern

- Keep core principles:
  - Behavior lock first (regression tests are the safety mechanism, not checklists)
  - Don't bundle unrelated refactors
  - Algorithm changes are NOT slop fixes (those are separate refactors)
  - Don't silently skip; if N/A, say why
  - Don't delete WHY comments
  - When in doubt, SKIP, don't guess

**Frontmatter:**
```yaml
---
name: remove-ai-slops
description: "Remove AI-generated code slop from branch changes. Locks behavior with regression tests FIRST, then runs categorized cleanup via parallel task agents in batches of 5, then verifies with quality gates. Covers 10 slop categories. MUST USE when the user asks to \"remove slop\", \"clean AI code\", \"deslop\", \"clean up AI-generated code\", or wants to clean up AI-generated patterns."
---
```

### Part C: Core skills on-demand

**C1. Split V1_SKILL_DIRS into two arrays:**

In `src/intent/skill-loader.ts`:

```ts
// Skills injected into system message (only brainstorming — HARD-GATE protection)
export const V1_INJECTED_SKILLS = [
  "brainstorming",
] as const

// Skills registered as slash commands (all v1 skills, loaded on demand)
export const V1_COMMAND_SKILLS = [
  "brainstorming",
  "writing-plans",
  "subagent-driven-development",
  "requesting-code-review",
  "receiving-code-review",
  "dispatching-parallel-agents",
] as const
```

**C2. `loadV1Skills()` only injects brainstorming:**

```ts
export function loadV1Skills(rootDir: string = DEFAULT_SKILLS_ROOT): string {
  const parts: string[] = []
  for (const dir of V1_INJECTED_SKILLS) {  // changed from V1_SKILL_DIRS
    const skillPath = join(rootDir, "v1", dir, "SKILL.md")
    try {
      const content = readFileSync(skillPath, "utf8")
      parts.push(content)
    } catch {
      log.warn(`v1 skill missing: ${dir}/SKILL.md (root=${rootDir})`)
    }
  }
  return parts.join("\n\n---\n\n")
}
```

**C3. `loadV1SkillCommands()` registers all 6 (unchanged behavior):**

```ts
export function loadV1SkillCommands(args: {
  rootDir?: string
  disable?: readonly string[]
} = {}): SkillCommand[] {
  const rootDir = args.rootDir ?? DEFAULT_SKILLS_ROOT
  const disable = new Set(args.disable ?? [])
  const commands: SkillCommand[] = []
  for (const dir of V1_COMMAND_SKILLS) {  // changed from V1_SKILL_DIRS
    // ... rest unchanged
  }
  return commands.sort((a, b) => a.name.localeCompare(b.name))
}
```

Keep `V1_SKILL_DIRS` as an alias for backward compat (tests reference it):
```ts
/** @deprecated Use V1_INJECTED_SKILLS or V1_COMMAND_SKILLS */
export const V1_SKILL_DIRS = V1_COMMAND_SKILLS
```

**C4. Add Skill Reference section to all deepwork variants:**

Replace the existing `<deepwork-skill-layer>` block (which declares all skills as authoritative) with a Skill Reference table:

```
## Skill Reference (load on demand)

The following skills are available as slash commands. Load them when the trigger condition matches — do not load unnecessarily.

| Skill | When to load | Command |
|---|---|---|
| brainstorming | (always loaded — HARD-GATE for any new feature, component, or behavior change) | automatic |
| writing-plans | multi-step task needs decomposition before implementation | /writing-plans |
| subagent-driven-development | executing an implementation plan with independent tasks | /subagent-driven-development |
| requesting-code-review | completing a task or major feature, before merge | /requesting-code-review |
| receiving-code-review | receiving code review feedback, before implementing suggestions | /receiving-code-review |
| dispatching-parallel-agents | 2+ independent tasks with no shared state or sequential dependencies | /dispatching-parallel-agents |
| remove-ai-slops | user asks to "remove slop", "clean AI code", "deslop", or wants systematic AI-slop cleanup | /remove-ai-slops |

Load a skill by invoking its slash command. Do NOT load a skill unless its trigger matches.
```

**C5. Update gpt.md's "GPT Skill Priority Override" section:**

The existing section (added in v0.2.1) says brainstorming is high-priority and the other 4 are advisory. Update it to reflect that brainstorming is the only injected skill, and the others are on-demand:

```
### GPT Skill Priority

For GPT models, `brainstorming` is the only always-injected skill (HARD-GATE). The other skills (writing-plans, subagent-driven-development, requesting-code-review, receiving-code-review, dispatching-parallel-agents, remove-ai-slops) are on-demand — load them via slash command only when the trigger matches. Do not load them speculatively.
```

## File Changes

| File | Change |
|---|---|
| `prompts/v1/deepwork/default.md` | Replace scope_constraints + add anti-slop checklist + add Skill Reference |
| `prompts/v1/deepwork/gpt.md` | Same + update GPT Skill Priority Override |
| `prompts/v1/deepwork/gemini.md` | Replace scope_constraints + add anti-slop checklist + add Skill Reference |
| `prompts/v1/deepwork/glm.md` | Same |
| `prompts/v1/deepwork/codex.md` | Same |
| `skills/remove-ai-slops/SKILL.md` | New — simplified fork from omo (~150 lines) |
| `src/intent/skill-loader.ts` | Split V1_SKILL_DIRS into V1_INJECTED_SKILLS + V1_COMMAND_SKILLS |
| `src/intent/skill-loader.test.ts` | Update tests for split arrays |
| `docs/v1-maintenance.md` | Sync all changes |

## Context savings

- Before: `loadV1Skills()` injects 6 skills ≈ 34k chars into every system message.
- After: `loadV1Skills()` injects 1 skill (brainstorming) ≈ 6k chars.
- Savings: ~28k chars per session — significant context reduction.
- Trade-off: models must proactively load other skills via slash command when needed. Mitigated by Skill Reference table in prompt.

## Risks

1. **Model may not load skills proactively**: Previously skills were always visible. Now models must recognize the trigger and invoke the slash command. Mitigation: Skill Reference table with explicit triggers; deepwork prompts already reference skills by name in workflow steps.

2. **brainstorming HARD-GATE still enforced**: Since brainstorming remains injected, the design-before-code gate is preserved. The other skills' trigger conditions are advisory (prompt says "load when trigger matches"), not hard-enforced.

3. **Test breakage**: `skill-loader.test.ts` references `V1_SKILL_DIRS` and asserts 5 skills loaded. Must update tests for the split. The `@deprecated` alias prevents import breakage but test assertions need updating.

4. **remove-ai-slops frontmatter trigger**: The description field must contain trigger phrases for OpenCode's skill matching to work. Verified pattern from omo's frontmatter.

5. **gpt.md already has "GPT Skill Priority Override"**: Must reconcile with the new Skill Reference section — the override section is GPT-specific (downgrades 4 skills to advisory), but now ALL variants have on-demand skills. The gpt.md override becomes redundant with the general Skill Reference — simplify it to just note brainstorming is the only injected one.

## YAGNI

Not in this design:
- No hook to enforce skill loading (purely prompt-guided).
- No per-model skill availability differences (all models get the same slash commands).
- No dynamic skill suggestion based on task classification (future enhancement).
- No migration path for existing sessions (applies to new sessions only).
- remove-ai-slops skill is NOT injected into system message (on-demand only).
