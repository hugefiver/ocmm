# Prompt Synchronization

This document tracks how local ocmm prompt files map to upstream omo prompt logic and how updates should be synchronized.

## Local Prompt Structure

Both workflows use the same prompt layers:

```text
prompts/<workflow>/
  agents/{orchestrator,reviewer,planner,clarifier,plan-critic}.md
  deepwork/{default,gpt,gemini,glm,codex,planner}.md
  category/{frontend,creative,hard-reasoning,research,quick,coding,normal-task,complex,deep,documenting}.md
```

`workflow: "omo"` is the default local prompt set. `workflow: "v1"` is the deepwork skill-driven workflow that keeps the `v1` config/path label while model-visible text calls it the deepwork workflow.

## Functional Agent Mapping

| Local agent | Upstream omo role/file | Local adaptation |
|-------------|------------------------|------------------|
| `orchestrator` | Sisyphus dynamic prompt (`packages/omo-opencode/src/agents/sisyphus-*`) | Local role-descriptive names, category dispatch, no upstream lore dependency |
| `reviewer` | Oracle (`packages/omo-opencode/src/agents/oracle.ts`) | Read-only advisor contract, local `reviewer` name, no Oracle branding in model-facing local role prompt |
| `planner` | Prometheus (`packages/omo-opencode/src/agents/prometheus/*`, `packages/prompts-core/prompts/prometheus/default.md`) | Local docs/superpowers plan path and writing-plans skill contract |
| `clarifier` | Metis (`packages/omo-opencode/src/agents/metis.ts`) | Local `clarifier` name, directives feed local planner instead of Prometheus |
| `plan-critic` | Momus (`packages/omo-opencode/src/agents/momus.ts`) | Local `plan-critic` name and inline-or-file plan review, blocker-focused only |

## Model-Family Prompt Mapping

| Local file | Upstream reference | Notes |
|------------|--------------------|-------|
| `deepwork/default.md` | local ocmm controller + upstream discipline concepts | v1 default is intentionally concise; omo default stays upstream-first |
| `deepwork/gpt.md` | `packages/prompts-core/prompts/ultrawork/gpt.md` | Upstream-first; local agent/tool names only |
| `deepwork/gemini.md` | `packages/prompts-core/prompts/ultrawork/gemini.md` | Upstream-first; local agent/tool names only |
| `deepwork/glm.md` | `packages/prompts-core/prompts/ultrawork/glm.md` | Upstream-first GLM reliability and evidence discipline |
| `deepwork/codex.md` | `packages/prompts-core/prompts/ultrawork/codex.md` | Upstream-first; Codex harness-only commands adapted to OpenCode/ocmm; synced through `./omo@c6058d5` TUI visual QA and command-lens updates |
| `deepwork/planner.md` | `packages/prompts-core/prompts/ultrawork/planner.md` and Prometheus prompt | Upstream-first planner doctrine with local planner naming |

## Maintenance Rules

1. Any change under `prompts/omo/` that changes upstream-derived behavior must update this document.
2. Any change under `prompts/v1/` must update `docs/v1-maintenance.md`; if it changes upstream omo mapping, update this document too.
3. Keep local model-facing prompts on local role names: `reviewer`, `planner`, `clarifier`, `plan-critic`, and `orchestrator`.
4. Agent and category prompts should remain strongly aligned between `prompts/omo/` and `prompts/v1/`; the skill-driven workflow gets its distinct behavior from the deepwork layer and injected skills.
5. Category prompts must describe the work shape each category handles. Avoid routing language based on model strength, weak/strong labels, or vague difficulty tiers; say what kind of deliverable belongs in the category.
   Local mapping for upstream categories: `hard-reasoning` is the ultrabrain-style decision category; `deep` is autonomous system development and feature delivery; `coding` is determined code editing and bug fixing. `normal-task` absorbs bounded fallback work with known acceptance criteria; `complex` absorbs coordinated cross-cutting fallback work that remains below autonomous feature delivery.
6. Compatibility aliases are intentional: upstream-style `@oracle` maps to local `reviewer`, and `@explore` maps to local `code-search`. Category names such as `@deep` and `@quick` are exposed directly as category-subagents.
7. Keep compatibility labels such as `workflow: "omo"` and `workflow: "v1"` unchanged unless a separate migration explicitly changes config semantics.
8. Do not expose `v1` as model-facing workflow wording. Files under `prompts/v1/` should say `deepwork` to the model; `v1` remains only a config/path label.
9. When syncing from upstream, compare against `C:\Users\HUGEFI~1\AppData\Local\Temp\opencode\omo-shared-skills\repo` or a fresh checkout of the same upstream repository, then re-apply local naming and OpenCode/ocmm tool semantics.

## Last Upstream Prompt Check

- Source checked: local upstream checkout `./omo` at `c6058d5db81851d822106a9df20a34d66313ade3`.
- Prompt-relevant upstream changes since `f6b9ace452f04fe3fea8025c4356e6343959ee4f`: GLM ultrawork/Atlas prompt registration was already represented locally; Codex ultrawork added TUI visual QA evidence requirements and sharpened command-lens guidance.
- Local sync: `prompts/omo/deepwork/codex.md` and `prompts/v1/deepwork/codex.md` now include the TUI visual evidence requirement and local OpenCode/PowerShell command guidance instead of upstream-only `script/qa/web-terminal-visual-qa.mjs` / Sparkshell wording.
