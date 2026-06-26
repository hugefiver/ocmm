# v1 Skills and Prompts — Sources, Characteristics, and Maintenance

This document is the single source of truth for v1 skill and prompt provenance, characteristics, and maintenance rules.

Naming note: `v1` remains the configuration value and on-disk version label. Prompt text shown to models calls this the `deepwork` workflow to describe the behavior rather than the version tag.

## Skills Source Mapping

| v1 skill | Upstream | Upstream version | Adjustments | Last synced |
|----------|----------|------------------|-------------|-------------|
| brainstorming | obra/superpowers/brainstorming | v6.0.3 | removed visual-companion section; removed spec-document-reviewer-prompt reference; replaced skill invocation language to match v1 auto-injected model; frontmatter kept as first bytes for OpenCode native slash skill loading | 2026-06-25 |
| writing-plans | obra/superpowers/writing-plans | v6.0.3 | removed executing-plans cross-reference; removed using-git-worktrees reference; subagent-driven is the only execution path; frontmatter kept as first bytes for OpenCode native slash skill loading | 2026-06-25 |
| subagent-driven-development | obra/superpowers/subagent-driven-development | v6.0.3 | removed executing-plans comparison; removed using-git-worktrees and finishing-a-development-branch references; removed test-driven-development reference (TDD described inline); final review uses requesting-code-review only; frontmatter kept as first bytes for OpenCode native slash skill loading | 2026-06-25 |
| requesting-code-review | obra/superpowers/requesting-code-review | v6.0.3 | removed executing-plans and subagent-driven-development cross-references; frontmatter kept as first bytes for OpenCode native slash skill loading | 2026-06-25 |
| receiving-code-review | obra/superpowers/receiving-code-review | v6.0.3 | no content changes (skill is self-contained); frontmatter kept as first bytes for OpenCode native slash skill loading | 2026-06-25 |

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
| deepwork/default.md | all 5 | local ocmm agent/category structure, exact-scope and evidence discipline | upstream CODE RED bulk and model-specific ceremony | concise local deepwork controller; no visible version label; output discipline (incremental file writes) |
| deepwork/gpt.md | all 5 | upstream GPT structured-instruction adaptation, certainty protocol, TDD/QA/reviewer gate | upstream-only agent/tool names | local agent names plus deepwork skill-layer note |
| deepwork/gemini.md | all 5 | upstream Gemini intent gate, tool mandate, delegation and QA strictness | upstream-only agent/tool names | local agent names plus deepwork skill-layer note |
| deepwork/glm.md | all 5 | upstream GLM 5.x calibration, deep-first thinking with thinking-channel mandate, evidence-first completion | upstream-only agent/tool names, shallow-default thinking_depth, fable_counters that suppress planning | local agent names plus deepwork skill-layer note, thinking-channel-first reasoning, softened fable_counters to allow 3+ step planning, output discipline (incremental file writes) |
| deepwork/codex.md | all 5 | upstream Codex tier triage, success criteria, RED/GREEN/SURFACE loop, cleanup/review gates, TUI visual QA evidence requirement | Codex harness-only `multi_agent_v1`, `fork_context`, TOML routing, `update_plan`/`create_goal`, Sparkshell-only command lens | OpenCode/ocmm task/todowrite semantics, local PowerShell command guidance, and deepwork skill-layer note |
| deepwork/planner.md | writing-plans | upstream planner doctrine from ultrawork planner prompt | Prometheus branding and upstream skill name | local `planner` name plus writing-plans skill-layer note |
| agents/orchestrator.md | all 5 | upstream Sisyphus orchestration structure and intent verbalization gate | lore/brand-heavy identity, upstream-only tool names | local role names, deepwork routing, category dispatch, user-language `I read/我读到` line before non-trivial routing, brainstorm stage in Intent Gate with trivial-fix fast path, injected skill utilization section (MANDATORY trigger table, was advisory), delegation table (builder removed as subagent target — now primary-only), tool-selection guidance (ast-grep/rg/fd/lsp_* auto-route by extension/uutils shell-aware terminal), parallel task dispatch section |
| agents/reviewer.md | requesting-code-review | upstream Oracle advisor role | Oracle branding, upstream-only restrictions | local `reviewer` name, read-only review/architecture/debugging contract |
| agents/planner.md | writing-plans | upstream Prometheus planner scope | `.omo`-specific plan-only command flow | local docs/superpowers plan path, writing-plans skill contract, brainstorm precondition in First Action, injected skill utilization section (MANDATORY for writing-plans + brainstorming STOP gate, was advisory), tool-selection guidance (ast-grep/rg/fd/lsp_* auto-route by extension/uutils shell-aware terminal) |
| agents/clarifier.md | brainstorming, writing-plans | upstream Metis pre-planning analysis | Metis branding, `call_omo_agent`, Prometheus-only handoff | local `clarifier` name, deepwork planner directives |
| agents/plan-critic.md | writing-plans, requesting-code-review | upstream Momus blocker-focused review | Momus branding, `.omo/plans`-only extraction | local `plan-critic` name, inline-or-file plan review |
| category/frontend.md | (deepwork injected separately) | full omo frontend category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/creative.md | (deepwork injected separately) | full omo creative category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/hard-reasoning.md | (deepwork injected separately) | full omo hard-reasoning category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/research.md | (deepwork injected separately) | full omo research category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/quick.md | (deepwork injected separately) | full omo quick category constraints | old shortened category router | fully specified mechanical edits; strongly aligned category role; no visible version label |
| category/coding.md | (deepwork injected separately) | bounded-code-edit category constraints | old shortened category router and vague effort label | determined code edits and bug fixes only; strongly aligned category role; no visible version label |
| category/normal-task.md | (deepwork injected separately) | new local ordinary-task category | old vague effort category split | ordinary bounded tasks with known acceptance criteria; no visible version label |
| category/complex.md | (deepwork injected separately) | new local coordinated-task category | old vague effort category split | coordinated multi-step ordinary tasks; no visible version label |
| category/deep.md | (deepwork injected separately) | upstream deep category semantics | old shortened category router and vague effort label | autonomous system development and feature delivery loop; strongly aligned category role; no visible version label |
| category/documenting.md | (deepwork injected separately) | prose and documentation discipline | old `writing` category name | standalone documentation/prose that does not change product behavior; no visible version label |

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
10. **Deepwork tag envelope**: every `prompts/v1/deepwork/*.md` file is wrapped in `<deepwork-mode>` to match the omo prompt envelope while keeping `v1` only as the config/path label.
11. **No model-visible version label**: files under `prompts/v1/` must not mention `v1` to the model. Use `deepwork` wording in model-facing prompt text.
12. **Concrete category scope**: category prompts describe the work shape and deliverable they handle, not vague model strength or weak/strong capability levels. Local mapping: `hard-reasoning` covers ultrabrain-style decisions, `deep` covers autonomous system development and feature delivery, `coding` covers determined code edits and bug fixes, `normal-task` covers bounded fallback work with known acceptance criteria, `complex` covers coordinated multi-step or cross-cutting ordinary tasks that remain below autonomous feature delivery, and `documenting` covers standalone text.
13. **Reasoning defaults**: built-in category defaults from `coding` upward should use the highest supported reasoning level (`max` in the local variant vocabulary); `quick` remains lightweight. User-declared model, variant, and provider parameters are respected as explicit configuration.

## Maintenance Rules

1. v1 skill file changes (in `skills/v1/`) MUST update the Skills Source Mapping table in this doc in the same commit.
2. v1 prompt file changes (in `prompts/v1/`) MUST update the Prompt Source Mapping table in this doc in the same commit.
3. Source Mapping table changes MUST be reflected in the actual files in the same commit.
4. Adding a new v1 file requires adding a row to the relevant table.
5. Removing a v1 file requires removing its row and updating any references in `src/intent/skill-loader.ts` or `src/intent/prompt-loader.ts`.
6. Upstream skill sync requires updating the "Last synced" date and "Upstream version" column, plus re-applying any adjustments listed.
7. omo prompts (`prompts/omo/`) are tracked in `docs/prompt-sync.md`, not this v1 derivative table. Update that doc when omo prompt files change.

## Upstream Sync Procedure

When syncing a v1 skill from upstream superpowers:

1. Read the current upstream `SKILL.md` from `~/.config/opencode/skills/superpowers/<name>/SKILL.md`
2. Diff against the current `skills/v1/<name>/SKILL.md`
3. Re-apply the adjustments listed in the Skills Source Mapping table
4. Update the "Last synced" date and "Upstream version" in this doc
5. Run `pnpm test` to verify nothing broke
6. Commit with message: `chore: sync v1/<name> skill from superpowers <version>`
