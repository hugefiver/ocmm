# Oracle/Reviewer Separation + Acceptance Review Loop Design

**Date:** 2026-07-02
**Status:** Approved (self-review pass, user delegation "继续" from prior context)
**Scope:** (1) Add a generic `alias` config field for agent/category model
configuration inheritance with cycle detection. (2) Promote `oracle` from a
pure `reviewer` alias to an independent builtin agent with cross-gen model
defaults while sharing the reviewer prompt. (3) Add a final acceptance review
loop to the v1 workflow that dispatches oracle (self-supervision) and/or
reviewer (external review) based on task complexity.

## Background

Currently `oracle` is a compatibility alias for `reviewer` registered via
`COMPAT_AGENT_ALIASES`. Both share the same model configuration, prompt, and
permissions. The user wants:

1. **Semantic separation**: Oracle = self-supervision (reviewing work the
   agent itself produced), Reviewer = external review (reviewing code not
   produced by the current agent). Both use the reviewer.md prompt.
2. **Model differentiation**: Oracle should default to a cross-gen model
   (different from the main agent, to avoid self-confirmation bias); Reviewer
   should default to the same family as the main agent (flagship).
3. **Generic alias mechanism**: Any agent/category can declare
   `alias: <other_agent>` to inherit another agent's model configuration
   (requirement only — not prompt/permission/tools/skills). Oracle gets
   `alias: 'reviewer'` as a default so that users who configure only reviewer
   get a working oracle that matches reviewer (no cross-gen effect until they
   explicitly configure a different model for oracle).
4. **Acceptance review loop**: After subagent-driven-development completes
   all tasks, the orchestrator dispatches a final acceptance review.
   Simple/single-stage tasks: one reviewer (oracle by default, or reviewer per
   user habit). Complex/large projects: both oracle and reviewer in parallel.

## Goals

- G1: Add `alias: z.string().optional()` to `ShorthandFields` (shared by
  agent and category entries).
- G2: Implement alias resolution in normalize/resolver with cycle detection
  (hard error on cycles).
- G3: Promote oracle to an independent BUILTIN_AGENTS entry with
  cross-gen requirement and `promptSource: 'reviewer'`.
- G4: Remove oracle from COMPAT_AGENT_ALIASES; add oracle to AGENT_NAMES and
  AGENT_ALIASES (name alias only, for routing).
- G5: Codex plugin-generator: oracle → Cross-gen tier, reviewer → Flagship
  tier; requirementForName resolves the `alias` field.
- G6: Extend requesting-code-review skill to support
  `reviewer: oracle | reviewer | both` selection.
- G7: Subagent-driven-development: add a Final Acceptance Review stage after
  all tasks complete, calling requesting-code-review with the appropriate
  reviewer set.
- G8: Orchestrator: document when to dispatch oracle (self-supervision) vs
  reviewer (external review) vs both (complex/large).
- G9: Regenerate schema.json, Codex bundle; sync docs and tests.

## Non-Goals

- No new prompt files for oracle (shares reviewer.md).
- No changes to plan-critic tier (remains Cross-gen review).
- No changes to the omo workflow.
- No automatic model selection at config time beyond the existing Codex tier
  table (which is advisory text, not enforced selection).
- No persistence of which reviewer was used across sessions.

## Design

### Part 1: Generic `alias` Field

#### Schema (`src/config/schema.ts`)

Add `alias` to `ShorthandFields`:

```typescript
const ShorthandFields = z.object({
  description: z.string().optional(),
  alias: z.string().optional(),            // NEW
  variant: z.enum(...).optional(),
  model: z.string().optional(),
  fallbackModels: z.array(z.string()).optional(),
  requirement: RequirementSchema.optional(),
});
```

Because `AgentEntrySchema = ShorthandFields + AgentOverrideFields + disabled`
and `CategoryEntrySchema = ShorthandFields`, both agent and category entries
gain the field. Both schemas use `.strict()`, so no other changes needed for
validation.

**Regenerate** `schema.json` via `pnpm run gen-schema`.

#### Semantics

`alias` declares "use another agent's model configuration when this agent has
no direct model configuration (no `model`, `fallbackModels`, or
`requirement`)".

- **Inherits**: `requirement` (which bundles model, fallbackModels, variant).
- **Does NOT inherit**: prompt, permission, tools, skills, description.
- **Priority**: direct config (`model`/`fallbackModels`/`requirement`) >
  `alias` target's resolved requirement > builtin requirement.

#### Resolution (`src/config/normalize.ts`)

Extend `normalizeShorthand` to accept a resolver callback for alias targets:

```typescript
export function normalizeShorthand(
  entry: ShorthandInput | undefined,
  options?: {
    resolveAlias?: (name: string) => NormalizedEntry | undefined,
    visited?: Set<string>,   // cycle detection
    selfName?: string,       // for error messages
  },
): NormalizedEntry | undefined
```

Logic:
1. If `entry.requirement` exists → use it directly (alias ignored).
2. If `entry.model` or `entry.fallbackModels` exists → build requirement from
   them (alias ignored).
3. If `entry.alias` exists:
   a. Check `visited` set; if alias target is already in visited → throw
      `circular alias: A→B→...→A`.
   b. Add self to visited.
   c. Call `resolveAlias(target)` to get the target's normalized entry.
   d. If target has a requirement → use it as self's requirement.
   e. If target also has an alias → recurse (depth tracked via visited).
   f. If target resolves to nothing → fall through to builtin.
4. Else → return undefined (caller falls back to builtin).

#### Resolver (`src/routing/resolver.ts`)

`resolveModelRouting` already checks `agentsConfig[agentName]` then
`agentsConfig[canonicalName]`. Add alias awareness:

1. After resolving the agent's own requirement (from user config or builtin),
   if the user config entry has an `alias` field AND no direct model config,
   resolve the alias target's requirement first.
2. The visited-set for cycle detection is per-resolution-call.

#### Config Hook (`src/hooks/config.ts`)

- `applyAgentEntry`: when the entry has `alias` and no direct requirement,
   resolve the alias target's requirement from the already-registered
   `agentMap[target]`.
- `registerCompatAgentAliases`: remove oracle entry. Keep explore→code-search.
   Oracle now registers as a normal builtin (Part 2).

#### Codex (`src/codex/plugin-generator.ts`)

`requirementForName`: after checking `config.agents[name]` and
`config.agents[canonical]`, check the `alias` field on the resolved entry and
resolve transitively with cycle detection.

### Part 2: Oracle as Independent Builtin

#### Builtin Agents (`src/config/data/agents.ts`)

Add oracle entry:

```typescript
{
  name: 'oracle',
  description: 'Self-supervision reviewer for work the agent itself produced. Cross-gen model by default to avoid self-confirmation bias.',
  promptSource: 'reviewer',   // NEW optional field: load reviewer.md
  requirement: {
    variant: 'high',
    chain: [
      // cross-gen: previous-gen flagships, different families from main agent
      { model: 'claude-opus-4-7', variant: 'max' },
      { model: 'gpt-5', variant: 'high' },
      { model: 'gemini-3-pro', variant: 'high' },
      { model: 'glm-5.1' },
    ],
  },
  defaultAlias: 'reviewer',  // NEW: if user configures neither oracle model nor alias, use reviewer's model
  permissions: { task: 'deny' },
}
```

**New optional BuiltinAgent fields**: `promptSource?: string`,
`defaultAlias?: string`.

- `promptSource`: at registration, load the prompt from
  `getAgentPrompt(promptSource)` instead of `getAgentPrompt(name)`.
- `defaultAlias`: if the user config entry for this agent has no direct model
  config and no `alias` field, inject `alias = defaultAlias` before resolution.

#### Agent Name Constants (`src/config/schema.ts`)

- `AGENT_NAMES`: add `'oracle'`.
- `COMPAT_AGENT_ALIASES` (config.ts): remove oracle→reviewer; keep
  explore→code-search.
- `AGENT_ALIASES` (resolver.ts, plugin-generator.ts): keep oracle→reviewer
  for routing compatibility (users typing 'oracle' still route correctly), but
  this no longer affects model resolution.

#### Config Registration (`src/hooks/config.ts`)

- `BUILTIN_AGENTS` iteration (L180-196): oracle now included, registers with
  its own requirement (cross-gen) and promptSource='reviewer'.
- `registerCompatAgentAliases`: no longer processes oracle. Oracle is already
  registered as a builtin. If a user explicitly configures `agents.oracle`,
  it overrides the builtin normally.

#### Codex Plugin Generator (`src/codex/plugin-generator.ts`)

- `BUILTIN_AGENT_INDEX`: includes oracle with cross-gen requirement.
- Tier table (L448-451):
  - Flagship row: add `reviewer` (was in Cross-gen).
  - Cross-gen review row: replace `reviewer` with `oracle`. Keep `plan-critic`.
- `requirementForName`: oracle resolves via its own builtin requirement
  (cross-gen) unless user configures it. If user configures `alias: reviewer`
  explicitly, it inherits reviewer's model config.

### Part 3: Acceptance Review Loop

#### requesting-code-review Skill (`skills/v1/requesting-code-review/SKILL.md`)

Extend to support reviewer selection:

```
## Reviewer Selection

Dispatch the code reviewer subagent(s) based on task complexity:

| Task shape | Reviewer(s) | Rationale |
|---|---|---|
| Simple / single-stage | `oracle` (default) | Self-supervision; plan-critic already reviewed the plan |
| Complex / large / multi-module | `oracle` + `reviewer` (both, in parallel) | Cross-gen self-supervision + external review |
| User habit override | user-specified | User may prefer reviewer for all cases |

Pass `reviewer: oracle | reviewer | both` when dispatching. Default is `oracle`.
```

The skill already dispatches a reviewer subagent with work SHAs. Extend it to
accept the reviewer name parameter and dispatch accordingly.

#### subagent-driven-development Skill (`skills/v1/subagent-driven-development/SKILL.md`)

Add a Final Acceptance Review stage after all tasks complete:

```
## Final Acceptance Review

After all tasks are marked complete, before declaring the work done:

1. Orchestrator assesses complexity:
   - Simple (1-2 tasks, single module, no architectural change) → one reviewer.
   - Complex (3+ tasks, cross-module, architectural change, security/perf sensitive) → both reviewers.
2. Dispatch requesting-code-review with the appropriate reviewer set.
3. Process feedback via receiving-code-review skill.
4. If reviewer requests changes: fix, re-review, loop.
5. Only declare done when reviewer(s) approve.
```

#### Orchestrator Prompt (`prompts/v1/agents/orchestrator.md`)

Update the Delegation Table and Injected Skill Utilization table:

- Delegation Table: split reviewer/oracle rows to clarify semantics.
  - `oracle`: self-supervision review (work the agent itself produced).
  - `reviewer`: external review (code not produced by the current agent).
- Skill Utilization: requesting-code-review row notes the reviewer selection
  logic (oracle default for simple, both for complex).

#### Deepwork Prompts (`prompts/v1/deepwork/*.md`)

Sync the REVIEWER GATE section to mention oracle/reviewer duality:

> Use a high-rigor reviewer when the task touches 3+ files, changes
> security/performance/migration behavior, lasts 30+ minutes, or the user asks
> for strict review. For final acceptance: oracle (self-supervision) by
> default for simple tasks; both oracle and reviewer for complex/large tasks.

#### Codex Adapter

Mirror all Part 3 changes in `prompts/codex/**` and regenerate the Codex
bundle.

### Part 4: Documentation & Tests

#### Tests

- `src/config/normalize.test.ts`: alias resolution (direct, transitive,
  cycle detection error).
- `src/hooks/config.test.ts`: oracle registered as independent builtin with
  cross-gen requirement; reviewer/oracle have different default models;
  `agents.oracle` config overrides; `alias` field works for user agents.
- `src/routing/resolver.test.ts`: alias-aware resolution priority.
- `src/codex/plugin-generator.test.ts`: oracle → cross-gen, reviewer →
  flagship in generated TOML; requirementForName resolves alias.

#### Docs

- `docs/v1-maintenance.md`: record the oracle promotion, alias field, and
  acceptance review loop changes. Update sync date.
- `docs/prompt-sync.md`: record the Codex tier changes and acceptance review
  sync.
- `AGENTS.md`: update the "Codex bundle should expose" section to note
  oracle's cross-gen default and reviewer's flagship default.

## Verification

- `pnpm run typecheck` passes (schema changes are typed).
- `pnpm run gen-schema` regenerates schema.json; `git diff --exit-code` on
  schema.json shows only the new `alias` field.
- `pnpm test`: all existing tests pass plus new alias/cycle/oracle tests.
- `pnpm run gen:codex-plugin`: regenerates bundle; dw-oracle.toml shows
  cross-gen model, dw-reviewer.toml shows flagship model.
- Manual: inspect a generated dw-oracle.toml and confirm the model differs
  from dw-reviewer.toml when no user override is present.
- Manual: configure `agents.oracle.model = "different/model"` in a test
  ocmm.jsonc and confirm `opencode debug agent oracle` shows the override.

## Rollout

Two commits (matching the v0.2.11 pattern):

1. `feat(v1): separate oracle/reviewer with alias field + acceptance review loop`
   — all source, skill, prompt, doc, and regenerated bundle changes.
2. `chore: bump version to 0.2.12` — version bump + bundle regeneration.

Then tag v0.2.12 and push to trigger the release workflow.
