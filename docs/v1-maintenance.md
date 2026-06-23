# v1 Skills and Prompts — Sources, Characteristics, and Maintenance

This document is the single source of truth for v1 skill and prompt provenance, characteristics, and maintenance rules.

Naming note: `v1` remains the configuration value and on-disk version label. Prompt text shown to models calls this the `deepwork` workflow to describe the behavior rather than the version tag.

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
| deepwork/default.md | all 5 | local ocmm agent/category structure, exact-scope and evidence discipline | upstream CODE RED bulk and model-specific ceremony | concise local deepwork controller; no visible version label |
| deepwork/gpt.md | all 5 | upstream GPT structured-instruction adaptation, certainty protocol, TDD/QA/reviewer gate | upstream-only agent/tool names | local agent names plus deepwork skill-layer note |
| deepwork/gemini.md | all 5 | upstream Gemini intent gate, tool mandate, delegation and QA strictness | upstream-only agent/tool names | local agent names plus deepwork skill-layer note |
| deepwork/glm.md | all 5 | upstream GLM 5.x calibration, shallow/deep thinking split, evidence-first completion | upstream-only agent/tool names | local agent names plus deepwork skill-layer note |
| deepwork/codex.md | all 5 | upstream Codex tier triage, success criteria, RED/GREEN/SURFACE loop, cleanup/review gates, TUI visual QA evidence requirement | Codex harness-only `multi_agent_v1`, `fork_context`, TOML routing, `update_plan`/`create_goal`, Sparkshell-only command lens | OpenCode/ocmm task/todowrite semantics, local PowerShell command guidance, and deepwork skill-layer note |
| deepwork/planner.md | writing-plans | upstream planner doctrine from ultrawork planner prompt | Prometheus branding and upstream skill name | local `planner` name plus writing-plans skill-layer note |
| agents/orchestrator.md | all 5 | upstream Sisyphus orchestration structure | lore/brand-heavy identity, upstream-only tool names | local role names, v1 5-phase routing, category dispatch |
| agents/reviewer.md | requesting-code-review | upstream Oracle advisor role | Oracle branding, upstream-only restrictions | local `reviewer` name, read-only review/architecture/debugging contract |
| agents/planner.md | writing-plans | upstream Prometheus planner scope | `.omo`-specific plan-only command flow | local docs/superpowers plan path, writing-plans skill contract |
| agents/clarifier.md | brainstorming, writing-plans | upstream Metis pre-planning analysis | Metis branding, `call_omo_agent`, Prometheus-only handoff | local `clarifier` name, deepwork planner directives |
| agents/plan-critic.md | writing-plans, requesting-code-review | upstream Momus blocker-focused review | Momus branding, `.omo/plans`-only extraction | local `plan-critic` name, inline-or-file plan review |
| category/frontend.md | (deepwork injected separately) | full omo frontend category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/creative.md | (deepwork injected separately) | full omo creative category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/hard-reasoning.md | (deepwork injected separately) | full omo hard-reasoning category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/research.md | (deepwork injected separately) | full omo research category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/quick.md | (deepwork injected separately) | full omo quick category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/low-effort.md | (deepwork injected separately) | full omo low-effort category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/high-effort.md | (deepwork injected separately) | full omo high-effort category constraints | old shortened category router | strongly aligned category role; no visible version label |
| category/writing.md | (deepwork injected separately) | full omo writing category constraints | old shortened category router | strongly aligned category role; no visible version label |

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
