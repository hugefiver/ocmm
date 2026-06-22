# v1 Workflow Design

**Date**: 2026-06-22
**Status**: Design (revised 2)
**Author**: Sisyphus

## Goal

Restructure ocmm's workflow system with a unified architecture applied to
both `omo` and `v1` workflows:

1. **No keyword detection** — both workflows drop the `chat.message` keyword
   detection hook. Prompts are attached to agents declaratively at config
   time. The model reads the system prompt and autonomously decides when to
   follow workflow protocols.
2. **Skills injected via omo-style mechanism** — v1 skills are read from
   `skills/v1/` by ocmm and injected into the system message via the
   queue + `system.transform` mechanism. Skills are NOT registered via
   OpenCode's skill loader (no inlined skills metadata).
3. **Model-family specialization preserved** — both workflows keep omo's
   4-variant pattern (default/gpt/gemini/planner), selected at config time
   based on the agent's declared preference model.
4. **v1 = superpowers 5-phase chain** — v1 prompts reference 5 superpowers
   skills (brainstorming, writing-plans, subagent-driven-development,
   requesting-code-review, receiving-code-review) forked into `skills/v1/`.
5. **omo = upstream omo system prompt** — omo prompts guide the model
   autonomously, no keyword triggers.

Both workflows maintained simultaneously, switchable via a single config
field.

## Background

ocmm currently ships a single implicit workflow ("omo"). The `prompt-loader.ts`
hardcodes loading from `prompts/{deepwork,mode,category}/`. Intent keywords
(`dw`/`deepwork`, `sp`/`superplan`, `team`/`teamwork`) trigger runtime prompt
injection via `chat.message` + `system.transform` hooks. Per-model-family
variants (`default`/`gpt`/`gemini`/`planner`) let different models work in
their strong modes, selected at runtime via `pickDeepworkVariant` which
inspects the actual model in the chat request.

This design drops keyword detection for BOTH workflows. Prompts become
declarative (attached to agents at config time). The model autonomously
decides when to follow workflow protocols based on the system prompt content.
v1 skills are injected via omo's queue + `system.transform` mechanism (not
OpenCode's skill loader, not inlined metadata).

## Non-Goals

- Changing the routing resolver or variant translator (unchanged)
- Changing the agent definitions (same 10 built-in agents, same categories)
- Changing the runtime fallback system (unchanged)
- Auto-selecting workflow based on agent or model (explicit config only)
- Migrating omo prompts to v1 or vice versa (both kept as-is)
- v1 or omo mode prompts (`superplan`/`team`) — these were keyword-triggered;
  both workflows now drop keyword detection, so no mode directory. v1's
  writing-plans skill covers planning.

## Architecture

### Workflow Switch

Add a `workflow` field to `OcmmConfigSchema`:

```ts
workflow: z.enum(['omo', 'v1']).default('omo')
```

Default `omo` for backward compatibility. Existing configs without this field
continue to work — but behavior changes: no keyword detection, prompts
attached to agents. (This is a breaking change for omo users who relied on
keyword triggers. See Migration Path.)

### Unified Architecture (both workflows)

```
              both omo and v1 workflows
        ┌──────────────────────────────────────┐
        │                                      │
   Skills Layer        Prompt Layer              Hook Layer
   (v1 only)           (both)                    (both)
   skills/v1/          prompts/<workflow>/       config: attach prompts
   (5 skills,            deepwork/               to agents (declarative)
    forked from          category/              chat.message:
    superpowers)                               - omo: no-op
                                               - v1: queue skill content
                                                 on first message per session
                                             system.transform:
                                               - omo: no-op
                                               - v1: drain queue, prepend
                                                 skill content to system
```

### Skills Layer (`skills/v1/` — v1 only)

v1 maintains its own variant of 5 superpowers skills:

```
skills/v1/
  brainstorming/
    SKILL.md          (forked from superpowers, adjusted)
    visual-companion.md (if present upstream)
  writing-plans/
    SKILL.md
    plan-document-reviewer-prompt.md (if present upstream)
  subagent-driven-development/
    SKILL.md
    implementer-prompt.md
    spec-reviewer-prompt.md
    code-quality-reviewer-prompt.md
  requesting-code-review/
    SKILL.md
    code-reviewer.md
  receiving-code-review/
    SKILL.md
```

omo has no skills layer — omo prompts are self-contained.

Forking rules:
- Each skill copied from `~/.config/opencode/skills/superpowers/<name>/`
  into `skills/v1/<name>/`
- `name` and `description` in SKILL.md frontmatter preserved (for reference,
  NOT for OpenCode skill loader — skills are injected by ocmm, not OpenCode)
- Body adjusted for v1 workflow: references to excluded skills
  (executing-plans, dispatching-parallel-agents) removed; 5-phase chain
  aligned with v1's declarative model
- Header comment records upstream version + sync notes:
  ```
  <!-- v1 fork of superpowers/<name>. Upstream: obra/superpowers v6.0.3.
       Adjustments: <list>. Sync: diff against upstream, re-apply
       adjustments. See docs/v1-maintenance.md. -->
  ```

Skills are NOT registered with OpenCode's skill loader. ocmm reads the
SKILL.md content directly and injects it via the `system.transform` hook.

### Prompt Layer (`prompts/<workflow>/`)

Both workflows have declarative prompts attached to agents at config time.
Prompts tell the model HOW to work and WHICH skills to invoke (v1), but do
NOT contain skill content (v1 skills are injected separately).

```
prompts/
  omo/                                  # existing files moved here
    deepwork/
      default.md   (331 lines, omo style — content unchanged)
      gpt.md       (180 lines)
      gemini.md    (317 lines)
      planner.md   (24 lines)
    category/
      frontend.md, creative.md, hard-reasoning.md, research.md,
      quick.md, low-effort.md, high-effort.md, writing.md (8 files)
    # NO mode/ — keyword-triggered modes removed
  v1/                                   # new
    deepwork/
      default.md   (~120 lines, references 5 skills by name)
      gpt.md       (~120 lines, same structure + GPT specialization)
      gemini.md    (~140 lines, same structure + Gemini specialization)
      planner.md   (~50 lines, references writing-plans skill)
    category/
      frontend.md, creative.md, hard-reasoning.md, research.md,
      quick.md, low-effort.md, high-effort.md, writing.md (8 files)
    # NO mode/ — no keyword-triggered modes
```

No `mode/` directory in either workflow — `superplan` and `team` were
keyword-triggered concepts; both workflows now drop keyword detection.
omo's `mode/superplan.md` and `mode/team.md` are removed.

#### v1 Prompt Structure (all deepwork variants)

Each prompt has this skeleton:

```markdown
# v1 Deepwork Prompt — <variant>

You are running the v1 workflow. Follow the 5-phase development chain.
The skill instructions are available in your system message — invoke them
when entering each phase.

## Phase 1: Brainstorm
When the task is non-trivial (2+ steps, unclear scope, multiple modules):
- Follow the `brainstorming` skill instructions (in your system message)
- Process: explore context, ask questions one at a time, propose 2-3
  approaches, present design, write spec
- Trivial tasks (single-file fix, typo) skip to Phase 3

## Phase 2: Plan
When the task needs a plan:
- Follow the `writing-plans` skill instructions
- Produce a plan with bite-sized tasks (2-5 min), TDD cycle, no placeholders
- Self-review the plan against the spec

## Phase 3: Implement
For each task in the plan:
- Follow the `subagent-driven-development` skill instructions
- Dispatch a fresh subagent per task
- Collect implementer status: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
- Continuous execution — no pause between tasks

## Phase 4: Request Review
When implementation is complete:
- Follow the `requesting-code-review` skill instructions
- Get git SHAs, dispatch reviewer subagent
- Act on feedback: Critical=immediate, Important=before proceeding, Minor=note

## Phase 5: Receive Review
When you receive review feedback:
- Follow the `receiving-code-review` skill instructions
- READ -> UNDERSTAND -> VERIFY -> EVALUATE -> RESPOND -> IMPLEMENT
- No performative agreement. Push back when reviewer is wrong.

## Context Discipline
- Investigate before claiming — never speculate about unread code
- Parallelize independent file reads

## <Variant-Specific Specialization>
<gpt/gemini/default-specific guidance here>
```

The prompt is ~120-140 lines. Skill CONTENT (detailed, long) lives in
`skills/v1/` and is injected separately via `system.transform`. The prompt
is a router that tells the model which skill to follow at each phase.

#### omo Prompt Structure

omo prompts are unchanged in content (the existing CODE RED style, etc.).
The only change is HOW they're delivered: attached to agents at config time
(declarative), not keyword-triggered (runtime injection). The model reads
the omo system prompt and autonomously decides when to follow deepwork
protocols.

#### Variant-Specific Specializations (v1)

| Variant | Specialization |
|---------|----------------|
| `default.md` | Generic, calm tone, numbered steps. For claude/kimi/glm/unknown families. |
| `gpt.md` | Same structure, GPT-friendly format: explicit checklists, IF/THEN branch points, template fields. GPT excels at structured instruction following. |
| `gemini.md` | Same structure, Gemini-specific emphasis: exhaustive context gathering, explicit phase-transition gates, mandated parallel tool calls. Gemini has large context windows. |
| `planner.md` | Condensed (~50 lines). References `writing-plans` skill directly. For the `planner`/`plan` agent. |

#### Category Prompts (`prompts/<workflow>/category/*.md`)

Both workflows have 8 category prompts. Each ~30-50 lines, attached to
category subagents at config time.

v1 categories reference relevant skills for the category's workflow.
omo categories are self-contained (no skills).

### Hook Layer

#### Config Hook (active for both, behavior changes)

`src/hooks/config.ts` `createConfigHandler`:

For **both** omo and v1:
- Register 10 built-in agents + 8 categories
- Each built-in agent gets a `prompt` field set to the deepwork variant
  appropriate for its `requirement.fallbackChain[0].model` (model-family
  classification at config time)
- Categories get `mode:'subagent'` + `prompt` from the workflow's category
  prompts

Model-family classification at config time (reuses existing
`classifyModelFamily`):
```ts
function pickDeepworkVariantForAgent(agent: BuiltinAgent): DeepworkVariant {
  if (agent.name === 'planner' || agent.name === 'plan') return 'planner';
  const model = agent.requirement?.fallbackChain?.[0]?.model ?? '';
  const family = classifyModelFamily({ providerID: '', modelID: model });
  if (family === 'gpt') return 'gpt';
  if (family === 'gemini') return 'gemini';
  return 'default';
}
```

This replaces the runtime `pickDeepworkVariant` (which inspected the actual
chat model). The config-time approach uses the agent's declared preference
model. If the user overrides the model via config, the prompt may be less
specialized but still functional.

#### Chat Message Hook (behavior changes for both)

`src/hooks/chat-message.ts` `createChatMessageHandler`:

For **omo**: no-op. Returns early without modifying output. No keyword
detection, no prompt queueing. The omo deepwork prompt is already attached
to the agent via the config hook.

For **v1**: on the FIRST message of each session (per-session latching via
existing `sessionState` Map), queue the v1 skill content. The skill content
is read from `skills/v1/` files (all 5 skills concatenated). No keyword
detection — the queue is always populated on first message for v1 agents.

```ts
// v1 chat.message handler (pseudocode)
if (config.workflow !== 'v1') return;  // omo: no-op
if (sessionState.has(sessionID)) return;  // already latched
sessionState.set(sessionID, { intentLatched: true });
const skillContent = await loadV1Skills();  // read skills/v1/*/SKILL.md
queuePrompt(skillContent);
```

#### System Transform Hook (behavior changes for both)

`src/hooks/chat-message.ts` `createSystemTransformHandler`:

For **omo**: no-op. Returns early. Nothing queued, nothing to prepend.

For **v1**: drains the queued skill content, prepends to `output.system`
(unchanged mechanism — handles array/string/empty shapes). This is the
omo-style injection: skill content is prepended to the system message,
making it available to the model without being inlined as skills metadata.

#### Other Hooks (unchanged)

- `chat.params`: active for both (variant translation, routing) — unchanged
- `event`: active for both (runtime fallback) — unchanged

### Config Schema Changes

`src/config/schema.ts`:

```ts
export const OcmmConfigSchema = z.object({
  // ... existing fields ...
  workflow: z.enum(['omo', 'v1']).default('omo')
});
export type OcmmConfig = z.infer<typeof OcmmConfigSchema>;
export type Workflow = 'omo' | 'v1';
```

`ProfileEntrySchema` remains a strict partial overlay; `workflow` is NOT
allowed inside profiles.

### Prompt Loader Changes

`src/intent/prompt-loader.ts`:

```ts
export type Workflow = 'omo' | 'v1';

export async function loadAllPrompts(
  rootDir: string,
  workflow: Workflow = 'omo'
): Promise<void> {
  // clear all Maps (existing behavior)
  const base = path.join(rootDir, 'prompts', workflow);
  // load deepwork/, category/ from base
  // NO mode/ loading (removed for both workflows)
}
```

The `ModeVariant` type and `modePrompts` Map are removed (no mode directory
for either workflow). `composeIntentPrompt` no longer handles
`superplan`/`team` intents — it's removed or simplified to only handle
deepwork-style prompt composition (which for v1 is skill content, for omo
is nothing since omo is declarative).

### Intent Detection Removal

`src/intent/detectors.ts`:

The keyword detection (`DEEPWORK_RE`, `SUPERPLAN_RE`, `TEAM_RE`,
`stripSystemReminders`, `isPlannerAgent`) is largely removed. The
`IntentType` type is removed. The `chat.message` hook no longer calls any
detection function.

Retained:
- `isPlannerAgent` — used by `pickDeepworkVariantForAgent` at config time
- `stripSystemReminders` — retained if useful for cleaning user messages,
  but no longer used for intent detection
- `classifyModelFamily` (in `src/intent/model-family.ts`) — used by
  `pickDeepworkVariantForAgent` at config time

Removed:
- `DEEPWORK_RE`, `SUPERPLAN_RE`, `TEAM_RE`, `SUPERPLAN_DEEPWORK_RE`
- `IntentType`, `detectIntent`
- `composeIntentPrompt` (or simplified to just return skill content for v1)

### V1 Skill Loader (new)

New module `src/intent/skill-loader.ts`:

```ts
export async function loadV1Skills(skillsDir: string): Promise<string> {
  // Read skills/v1/{brainstorming,writing-plans,subagent-driven-development,
  //   requesting-code-review,receiving-code-review}/SKILL.md
  // Concatenate with separators
  // Return as single string for queueing
}
```

This reads the v1 skill files at startup (or on-demand) and returns the
concatenated content for injection via `system.transform`.

### Index Wiring

`src/index.ts` `createPlugin(input?)`:
1. Load config as before
2. Read `config.workflow` (default `'omo'`)
3. Call `loadAllPrompts(config.promptsRoot ?? DEFAULT_PROMPTS_ROOT, config.workflow)`
4. If v1, call `loadV1Skills(skillsDir)` and cache the content
5. Hook factories receive `getConfig` which exposes `workflow`

### Backward Compatibility

This is a **breaking change** for omo users who relied on keyword detection.
Changes:
- omo deepwork prompt is now ALWAYS attached to agents (was: only injected
  when `dw`/`deepwork` keyword detected)
- `sp`/`superplan` and `team`/`teamwork` keywords no longer trigger anything
- `mode/superplan.md` and `mode/team.md` are removed

Users who want the old keyword-triggered behavior can pin to the previous
ocmm version. The new behavior is simpler (prompts always present) and
aligns with the declarative model.

### Profile Interaction

`workflow` is a top-level config field, NOT a profile field. Profiles overlay
agent/category/fallback settings but cannot switch workflows. Rationale:
workflow determines the prompt set loaded at startup and the hook behavior.

If a user wants per-project workflow switching, they use project-level config
(`<cwd>/.opencode/ocmm.jsonc`) which overrides user config via `deepMerge`.
The `workflow` field is a scalar -> scalar replace (project wins).

### Maintenance Doc

`docs/v1-maintenance.md` records provenance, characteristics, and maintenance
rules for v1 skills and prompts. Single source of truth.

Doc structure:

```
# v1 Skills and Prompts — Sources, Characteristics, and Maintenance

## Skills Source Mapping
| v1 skill | Upstream | Upstream version | Adjustments | Last synced |
|----------|----------|------------------|-------------|-------------|
| brainstorming | obra/superpowers/brainstorming | v6.0.3 | removed excluded-skill refs; aligned 5-phase chain | 2026-06-22 |
| writing-plans | obra/superpowers/writing-plans | v6.0.3 | removed excluded-skill refs; aligned task format | 2026-06-22 |
| subagent-driven-development | obra/superpowers/subagent-driven-development | v6.0.3 | removed executing-plans cross-ref; aligned implementer prompt | 2026-06-22 |
| requesting-code-review | obra/superpowers/requesting-code-review | v6.0.3 | no adjustment needed | 2026-06-22 |
| receiving-code-review | obra/superpowers/receiving-code-review | v6.0.3 | no adjustment needed | 2026-06-22 |

## Prompt Source Mapping
| v1 prompt | Skills referenced | Kept from omo | Dropped from omo | Adapted for v1 |
|-----------|-------------------|---------------|------------------|-----------------|
| deepwork/default.md | all 5 | model-family specialization | CODE RED tone, keyword injection, table emphasis | declarative skill invocation, calm tone |
| deepwork/gpt.md | all 5 | GPT-structured-instruction adaptation | CODE RED tone | declarative, GPT-friendly checklist format |
| deepwork/gemini.md | all 5 | large-context gathering, intent-gate | CODE RED tone | declarative, Gemini-specific context emphasis |
| deepwork/planner.md | writing-plans | (no omo equivalent) | — | condensed ~50 lines, references writing-plans skill |
| category/*.md | varies | per-category role | omo tone | declarative, references skills by phase |

## Shared Characteristics
5-phase chain, TDD, two-stage review, no performative agreement, bite-sized
tasks, no placeholders, investigate before claiming, parallelize reads.

## Maintenance Rules
1. v1 skill file changes MUST update Skills Source Mapping in same commit.
2. v1 prompt file changes MUST update Prompt Source Mapping in same commit.
3. Source Mapping changes MUST update actual files in same commit.
4. New file -> add row. Removed file -> remove row + update references.
5. Upstream skill sync -> update "Last synced" + "Upstream version".
6. omo prompts NOT tracked here (baseline, not derivatives).
```

### AGENTS.md Update

Add to `AGENTS.md` (project root):

```markdown
## v1 Maintenance

All v1 skill file changes (in `skills/v1/`) and v1 prompt file changes (in
`prompts/v1/`) MUST be synchronized with `docs/v1-maintenance.md` in the same
commit, and vice versa. A file change without a doc update, or a doc update
without a file change, is a failed review.

This applies to: content edits, new files, deletions, renames, and upstream
skill syncs.

omo prompts (`prompts/omo/`) are not tracked in this doc.
```

## Testing Strategy

### Unit Tests

1. **Schema test**: `workflow` field accepts `'omo'`/`'v1'`, rejects invalid,
   defaults to `'omo'` when absent
2. **Prompt-loader test**: `loadAllPrompts(root, 'v1')` loads from
   `prompts/v1/` (deepwork + category, no mode); `loadAllPrompts(root, 'omo')`
   loads from `prompts/omo/` (deepwork + category, no mode); default loads omo
3. **Config merge test**: user `workflow:'v1'` + project `workflow:'omo'` ->
   project wins
4. **Config hook test (both)**: built-in agents get `prompt` field set to
   deepwork variant based on `fallbackChain[0].model`; categories get category
   prompts
5. **Config hook variant selection**: planner agent -> `planner.md`; gpt family
   model -> `gpt.md`; gemini family -> `gemini.md`; other -> `default.md`
6. **Chat hook omo no-op**: `workflow:'omo'` -> `chat.message` and
   `system.transform` return early, no modification
7. **Chat hook v1 skill injection**: `workflow:'v1'` -> `chat.message` queues
   skill content on first message; `system.transform` prepends to system;
   second message does not re-queue (latching)
8. **Skill loader test**: `loadV1Skills(dir)` reads 5 SKILL.md files,
   concatenates, returns string
9. **Detectors removal**: verify keyword detection functions are removed or
   no longer called by hooks

### Live Integration Test

Follow `AGENTS.md` live test procedure. Test both workflows:

**omo (`workflow:'omo'` or absent):**
- Plugin loads, agents register with omo prompts attached (check agent config
  for `prompt` field)
- `opencode run --agent orchestrator "..."` completes without errors
- `opencode run --agent orchestrator "dw say hi"` does NOT trigger keyword
  injection (no `[ocmm] intent=...` lines) — omo prompt is always attached

**v1 (`workflow:'v1'`):**
- Plugin loads, agents register with v1 prompts attached
- v1 skills injected on first message (check `[ocmm] system.transform:
  prepended N chars` log)
- `opencode run --agent orchestrator "..."` completes without errors
- No keyword detection (no `[ocmm] intent=...` lines)

### Manual Prompt Review

Each v1 prompt file reviewed for:
- No omo-style aggression (no CODE RED, no ABSOLUTE CERTAINTY, no NO EXCUSES)
- References skills by name (does not inline skill content)
- Contains the 5-phase chain
- Contains TDD cycle mention
- Contains two-stage review mention
- Contains no performative agreement rule
- Line count within target range

### Manual Skill Review

Each v1 skill file reviewed for:
- Header comment with upstream version + sync notes
- No references to excluded skills (executing-plans,
  dispatching-parallel-agents)
- 5-phase chain aligned with v1 declarative model

### Maintenance Doc Verification

- `docs/v1-maintenance.md` exists with Skills Source Mapping (5 rows) and
  Prompt Source Mapping (12 rows: 4 deepwork + 8 category)
- `AGENTS.md` contains v1 Maintenance section with bidirectional sync rule
- Every v1 file has a row; no row references non-existent file

## Migration Path

**Breaking change** for omo users:
- omo deepwork prompt now always attached to agents (was keyword-triggered)
- `dw`/`sp`/`team` keywords no longer trigger anything
- `mode/superplan.md` and `mode/team.md` removed

Users who want old keyword-triggered behavior can pin to previous ocmm
version. The new behavior is simpler and aligns with the declarative model.

Users opt into v1 by adding `"workflow": "v1"` to their ocmm config.

## Open Questions

None at design time.

### Known Edge Cases to Handle During Implementation

1. **Existing test paths**: `prompt-loader.test.ts` (fixture dirs) and
   `chat-message.test.ts` (line 14, real prompts path) need updates for new
   `prompts/<workflow>/` layout + no mode directory.
2. **`promptsRoot` config field**: custom `promptsRoot` gets
   `<promptsRoot>/<workflow>/` appended.
3. **Missing workflow directory**: `loadAllPrompts` logs warning, falls back
   to empty Maps (no crash).
4. **Skill content size**: 5 SKILL.md files concatenated may be large
   (~50-80 KB). Verify this fits within the system message size limit. If
   not, consider injecting only the relevant skill per phase (but this
   requires runtime phase detection, which conflicts with the no-keyword
   design). Acceptable trade-off: inject all skills, let model ignore
   irrelevant ones.
5. **Model-family mismatch**: `pickDeepworkVariantForAgent` uses
   `fallbackChain[0].model` which may not match the actual runtime model.
   Acceptable — prompt is a hint, still functional if mismatched.
6. **omo `mode/` removal**: verify no other code references `modePrompts`
   or `ModeVariant` before removing.
7. **Detectors removal**: verify `stripSystemReminders` is not needed
   elsewhere before removing. `isPlannerAgent` is retained (used by
   `pickDeepworkVariantForAgent`).

## Success Criteria

1. `pnpm run typecheck` passes
2. `pnpm test` passes (existing tests updated + new tests added)
3. `pnpm run build` passes
4. Live test `workflow:'omo'`: agents have omo prompts attached, no keyword
   detection, `opencode run` works
5. Live test `workflow:'v1'`: agents have v1 prompts attached, skills
   injected via `system.transform`, `opencode run` works
6. Both `prompts/omo/` and `prompts/v1/` exist (deepwork + category, no mode)
7. `skills/v1/` exists with 5 skill directories, each with SKILL.md + header
8. `docs/v1-maintenance.md` exists with complete Source Mapping tables
9. `AGENTS.md` contains v1 Maintenance bidirectional sync rule
10. No keyword detection code active in either workflow
