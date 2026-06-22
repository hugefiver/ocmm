# v1 Skills and Prompts — Sources, Characteristics, and Maintenance

This document is the single source of truth for v1 skill and prompt provenance, characteristics, and maintenance rules.

## Skills Source Mapping

| v1 skill | Upstream | Upstream version | Adjustments | Last synced |
|----------|----------|------------------|-------------|-------------|
| brainstorming | obra/superpowers/brainstorming | v6.0.3 | removed visual-companion section; removed spec-document-reviewer-prompt reference; replaced skill invocation language to match v1 auto-injected model | 2026-06-22 |
| writing-plans | obra/superpowers/writing-plans | v6.0.3 | removed executing-plans cross-reference; removed using-git-worktrees reference; subagent-driven is the only execution path | 2026-06-22 |
| subagent-driven-development | obra/superpowers/subagent-driven-development | v6.0.3 | removed executing-plans comparison; removed using-git-worktrees and finishing-a-development-branch references; removed test-driven-development reference (TDD described inline); final review uses requesting-code-review only | 2026-06-22 |
| requesting-code-review | obra/superpowers/requesting-code-review | v6.0.3 | removed executing-plans and subagent-driven-development cross-references; no other changes | 2026-06-22 |
| receiving-code-review | obra/superpowers/receiving-code-review | v6.0.3 | no content changes (skill is self-contained) | 2026-06-22 |

### Skill Template Files

| v1 file | Upstream file | Adjustments |
|---------|---------------|-------------|
| subagent-driven-development/implementer-prompt.md | superpowers/subagent-driven-development/implementer-prompt.md | none (copied verbatim) |
| subagent-driven-development/spec-reviewer-prompt.md | superpowers/subagent-driven-development/spec-reviewer-prompt.md | none (copied verbatim) |
| subagent-driven-development/code-quality-reviewer-prompt.md | superpowers/subagent-driven-development/code-quality-reviewer-prompt.md | none (copied verbatim) |
| requesting-code-review/code-reviewer.md | superpowers/requesting-code-review/code-reviewer.md | none (copied verbatim) |
| writing-plans/plan-document-reviewer-prompt.md | superpowers/writing-plans/plan-document-reviewer-prompt.md | none (copied verbatim) |

## Prompt Source Mapping

| v1 prompt | Skills referenced | Kept from omo | Dropped from omo | Adapted for v1 |
|-----------|-------------------|---------------|------------------|-----------------|
| deepwork/default.md | all 5 | model-family specialization concept, forced context gathering, parallel delegation | CODE RED tone, ABSOLUTE CERTAINTY, NO EXCUSES, table emphasis, keyword injection | declarative skill invocation, calm tone, 5-phase chain |
| deepwork/gpt.md | all 5 | GPT-structured-instruction adaptation concept | CODE RED tone | declarative, GPT-friendly checklist/IF-THEN format |
| deepwork/gemini.md | all 5 | large-context gathering concept, intent-gate concept | CODE RED tone | declarative, Gemini-specific context emphasis, phase-transition gates |
| deepwork/planner.md | writing-plans | (no omo equivalent — omo planner.md is a different style) | — | condensed ~50 lines, references writing-plans skill directly |
| category/frontend.md | (references deepwork prompt) | category role concept | omo tone | declarative, 5-phase integration for frontend |
| category/creative.md | (references deepwork prompt) | category role concept | omo tone | declarative, 5-phase integration for creative |
| category/hard-reasoning.md | (references deepwork prompt) | category role concept | omo tone | declarative, 5-phase integration for hard-reasoning |
| category/research.md | (references deepwork prompt) | category role concept | omo tone | declarative, 5-phase integration for research |
| category/quick.md | (references deepwork prompt) | category role concept | omo tone | declarative, skip phases for trivial tasks |
| category/low-effort.md | (references deepwork prompt) | category role concept | omo tone | declarative, condensed 5-phase |
| category/high-effort.md | (references deepwork prompt) | category role concept | omo tone | declarative, full 5-phase |
| category/writing.md | (references deepwork prompt) | category role concept | omo tone | declarative, 5-phase for documentation |

## Shared Characteristics

All v1 prompts share these principles (derived from superpowers skills):

1. **5-phase chain**: brainstorm → plan → implement → review → receive-review
2. **TDD cycle**: write failing test → run → implement → run → commit
3. **Two-stage review**: spec compliance first, then code quality
4. **Fresh subagent per task**: each implementation task gets a clean subagent
5. **No performative agreement**: no "You're right!", no "Great point!"
6. **No placeholders**: plans must have zero TODO/TBD/placeholder
7. **Bite-sized tasks**: 2-5 minute steps in plans
8. **Investigate before claiming**: never speculate about unread code
9. **Parallelize reads**: batch independent file reads

## Maintenance Rules

1. v1 skill file changes (in `skills/v1/`) MUST update the Skills Source Mapping table in this doc in the same commit.
2. v1 prompt file changes (in `prompts/v1/`) MUST update the Prompt Source Mapping table in this doc in the same commit.
3. Source Mapping table changes MUST be reflected in the actual files in the same commit.
4. Adding a new v1 file requires adding a row to the relevant table.
5. Removing a v1 file requires removing its row and updating any references in `src/intent/skill-loader.ts` or `src/intent/prompt-loader.ts`.
6. Upstream skill sync requires updating the "Last synced" date and "Upstream version" column, plus re-applying any adjustments listed.
7. omo prompts (`prompts/omo/`) are NOT tracked in this doc — they are the baseline, not derivatives. omo changes follow normal commit conventions.

## Upstream Sync Procedure

When syncing a v1 skill from upstream superpowers:

1. Read the current upstream `SKILL.md` from `~/.config/opencode/skills/superpowers/<name>/SKILL.md`
2. Diff against the current `skills/v1/<name>/SKILL.md`
3. Re-apply the adjustments listed in the Skills Source Mapping table
4. Update the "Last synced" date and "Upstream version" in this doc
5. Run `pnpm test` to verify nothing broke
6. Commit with message: `chore: sync v1/<name> skill from superpowers <version>`
