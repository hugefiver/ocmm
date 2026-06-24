# shared-skills Migration Cards (11 candidates)

> **Source**: `omo/packages/shared-skills/skills/` (8 skills), `omo/.agents/skills/` (3 skills)
> **Status**: Partially migrated. `git-master`, `ast-grep`, `frontend`, `debugging`, `init-deep`, and `lsp-setup` are present under local `skills/` and registered as slash commands by default.
> **Principle**: Third-party skills (import directly); omo-own skills (reimplement or adapt)
> **Note**: `omo/` refers to the gitignored reference implementation at `C:\Users\hugefiver\source\ocmm\omo\` (omo monorepo, npm `oh-my-opencode`). Paths in this doc are relative to that location.
> **Skill loading dependency**: Skills are designed to be loaded via `task(load_skills=["skill-name"], ...)`. Verify OpenCode's built-in `task` tool supports `load_skills` — if not, Phase 7 (task enhancement) becomes a prerequisite. See design spec Open Question #3.

## Packaging Model

`@oh-my-opencode/shared-skills` is a pure data package:
- `index.mjs` exports `sharedSkillsRootPath()` → absolute path to `skills/`
- `package.json` `files` array ships `index.mjs`, `index.d.ts`, and `skills/` directory
- **No build step** — skills are hand-authored, copied literally to dist
- Codex compat: `omo-codex/plugin/scripts/sync-skills.mjs` auto-inserts "Codex Harness Tool Compatibility" sections — precedent for ocmm adaptation

## Important Discovery

3 of 11 candidates (`github-triage`, `remove-deadcode`, `tech-debt-audit`) are NOT in `shared-skills/skills/` — they live in `.agents/skills/` (harness-agnostic directory). They're project-scope skills, not shared cross-harness bundles, but still need migration cards.

The `debugging` skill IS in `shared-skills/skills/` but was not in the 11-candidate list. It's also a copy-as-is candidate (no omo agent references, pure methodology).

## Migration Cards

### Quick Wins (Copy As-Is, Zero omo Refs)

#### 1. git-master
- **Path**: `omo/packages/shared-skills/skills/git-master/`
- **Deps**: `git` CLI (system tool)
- **omo refs**: None. Pure bash/git commands.
- **Sub-files**: `agents/openai.yaml` (Codex agent metadata — can omit)
- **Adaptation**: **Copy as-is.** Zero omo-specific references.
- **Priority**: **High** — immediately usable

#### 2. ast-grep
- **Path**: `omo/packages/shared-skills/skills/ast-grep/`
- **Deps**: `sg`/`ast-grep` binary, Python 3.9+ (stdlib only), `jq` (recommended)
- **omo refs**: None. Pure CLI wrapper + documentation.
- **Sub-files**: `scripts/ast_grep_helper.py`, `references/` (7 deep-dive docs), `install.sh`, `install.ps1`, `tests/`, `LICENSE` (MIT), `SOURCE`, `README.md`
- **Adaptation**: **Copy as-is.** Ensure `sg` binary is on PATH (install scripts handle this).
- **Priority**: **High** — standalone, high value for AST-aware refactoring

#### 3. frontend
- **Path**: `omo/packages/shared-skills/skills/frontend/`
- **Deps**: Browser (Playwright), `uv`/`python3` (Lighthouse), `python3` (ui-ux-db search)
- **omo refs**: None. Pure instructions + references.
- **Sub-files**: `references/design/` (architecture + 12 taste skills + 69 brand refs), `references/perfection/`, `references/ui-ux-db/`, `scripts/perfection/lighthouse-audit.py`, `LICENSE-Apache-2.0.txt`, `ATTRIBUTION.md`
- **Adaptation**: **Copy as-is.** Ensure Playwright, Python 3, `uv` available.
- **Priority**: **Medium** — very large bundle (80+ files), high value but bulk copy

### Minor Rewrite (Replace subagent dispatch)

#### 4. init-deep
- **Path**: `omo/packages/shared-skills/skills/init-deep/`
- **Deps**: `bash`, `find`, `wc`, `awk`, LSP tools (generic), optional `codegraph_explore` (MCP)
- **omo refs**: Heavy `task(subagent_type="explore", ...)` with `run_in_background=true`. Uses `task(category="writing", ...)`.
- **Adaptation**: **Migrated with minor rewrite.** Added local ocmm/OpenCode notes, preserved `task(subagent_type="explore")` compatibility, and translated AGENTS writing from upstream `category="writing"` to local `category="documenting"`.
- **Priority**: **Medium**

### Moderate Rewrite (Replace category routing)

#### 5. remove-ai-slops
- **Path**: `omo/packages/shared-skills/skills/remove-ai-slops/`
- **Deps**: `git`, project test runner, linter, typechecker, security scanner (optional)
- **omo refs**: `task(category="deep", load_skills=["remove-ai-slops"], run_in_background=true)` for parallel slop removal in batches of 5. References `$omo:remove-ai-slops`.
- **Adaptation**: **Moderate rewrite.** 10-category slop taxonomy + quality gates are omo-agnostic. Phase 4 parallel execution needs category routing replaced.
- **Priority**: **Medium**

#### 6. visual-qa
- **Path**: `omo/packages/shared-skills/skills/visual-qa/`
- **Deps**: `bun` (for `scripts/cli.ts`), `tmux` (for TUI captures), Playwright, `python3`
- **omo refs**: `task(subagent_type="oracle", run_in_background=true, ...)` for dual QA passes.
- **Sub-files**: `scripts/cli.ts` (TypeScript, uses `bun`), `references/agent-browser-setup.md`
- **Adaptation**: **Moderate rewrite.** Replace `task(subagent_type="oracle", ...)`. Port `scripts/cli.ts` from `bun` to plain Node/tsc.
- **Priority**: **Medium**

#### 7. tech-deadcode
- **Path**: `omo/.agents/skills/tech-debt-audit/` (NOT in shared-skills)
- **Deps**: `sg`/`ast-grep`, `grep`/`rg`, `git`, project linter, optional CodeGraph MCP
- **omo refs**: `task(category="unspecified-low", run_in_background=true, ...)` for parallel sub-agent dives.
- **Adaptation**: **Moderate rewrite.** 9-dimension audit framework is entirely omo-agnostic. Replace `task(category="unspecified-low", ...)` or skip (main agent can run all dimensions sequentially).
- **Priority**: **Medium**

### Major Rewrite (Heavy task()/call_omo_agent + team_* refs)

#### 8. refactor
- **Path**: `omo/packages/shared-skills/skills/refactor/`
- **Deps**: LSP tools, `sg`/`ast-grep`, `bash`, `git`
- **omo refs**: **Heavy.** `call_omo_agent(subagent_type="explore", ...)` (5 parallel), `task(subagent_type="oracle", ...)`, `task(subagent_type="plan", ...)`, `task(category="deep", ...)`. Team Mode addendum references `team_*` tools.
- **Adaptation**: **Major rewrite.** Core 6-phase methodology (intent gate → analysis → codemap → test → plan → execute → verify) is sound. ALL subagent dispatch must be replaced. Team Mode addendum (~100 lines) can be dropped.
- **Priority**: **High** — well-structured methodology worth the effort

#### 9. review-work
- **Path**: `omo/packages/shared-skills/skills/review-work/`
- **Deps**: `git`, `gh` (GitHub CLI), Playwright, project test runner
- **omo refs**: **Heavy.** `task(subagent_type="oracle", ...)` (3 of 5 agents), `task(category="unspecified-high", ...)` (2 of 5 agents). Contains "Codex Harness Tool Compatibility" section — precedent for translation.
- **Adaptation**: **Major rewrite.** 5-agent review architecture is valuable. Replace all subagent dispatch. Existing Codex compat section proves the translation pattern works.
- **Priority**: **High** — most immediately useful skill for ocmm

#### 10. github-triage
- **Path**: `omo/.agents/skills/github-triage/` (NOT in shared-skills)
- **Deps**: `gh` (GitHub CLI), `jq`, `git`
- **omo refs**: **Heavy.** `task(category="quick", run_in_background=true, ...)`, `task_create(...)`, `task_update(...)`, `background_output(...)` for omo's task tracking system.
- **Adaptation**: **Major rewrite.** Core algorithm (fetch → classify → spawn per-item → collect → summarize) is omo-agnostic. Zero-action policy + evidence rules are excellent. Replace task tracking system.
- **Priority**: **Medium** — depends on `gh` CLI, only useful in GitHub projects

#### 11. remove-deadcode
- **Path**: `omo/.agents/skills/remove-deadcode/` (NOT in shared-skills)
- **Deps**: `tsc`, LSP tools (`LspFindReferences`), `git`, `bun`, `sg` (optional)
- **omo refs**: **Heavy.** `task(subagent_type="explore", ...)`, `task(category="deep", load_skills=["typescript-programmer", "git-master"], ...)`, `call_omo_agent`.
- **Adaptation**: **Major rewrite.** 5-phase protocol (scan → verify → batch → execute → verify) is well-structured. Phase 4's parallel batch execution is most omo-specific. Consider implementing only Phases 1-3 (scan + verify) and flagging dead code for manual removal.
- **Priority**: **Low** — heavily tied to parallel subagent system

## Summary Table

| # | Skill | Location | omo refs | Adaptation | Priority |
|---|-------|----------|----------|------------|----------|
| 1 | git-master | shared-skills | none | copy as-is | High |
| 2 | ast-grep | shared-skills | none | copy as-is | High |
| 3 | frontend | shared-skills | none | copy as-is | Medium |
| 4 | init-deep | shared-skills | heavy (explore) | minor rewrite | Medium |
| 5 | remove-ai-slops | shared-skills | moderate (deep) | moderate rewrite | Medium |
| 6 | visual-qa | shared-skills | moderate (oracle) | moderate rewrite | Medium |
| 7 | tech-debt-audit | .agents/skills | moderate (unspecified-low) | moderate rewrite | Medium |
| 8 | refactor | shared-skills | heavy (5 types + team) | major rewrite | High |
| 9 | review-work | shared-skills | heavy (oracle + unspecified-high) | major rewrite | High |
| 10 | github-triage | .agents/skills | heavy (quick + task system) | major rewrite | Medium |
| 11 | remove-deadcode | .agents/skills | heavy (explore + deep) | major rewrite | Low |

## Additional Candidate

- **debugging** (in `shared-skills/skills/` but not in 11-candidate list): Copy as-is. No omo agent references, pure methodology + runtime references.
- **lsp-setup** (in `shared-skills/skills/` but not in 11-candidate list): Migrated with local ocmm notes. It is useful because ocmm can register the `lsp` MCP server via `omo-lsp mcp`; the bundled `verify-lsp.ts` still requires an upstream omo checkout and should be treated as optional.

## Migration Strategy

> **Phase mapping**: This section uses its own phase numbering for migration sequencing. These map to the design spec as: Phase 1→Phase 2, Phase 2→Phase 12 (PR 12), Phase 3→Phase 10 (PR 13a), Phase 4→Phase 10 (PR 13b), Phase 5→Phase 10 (PR 13c). See `docs/superpowers/specs/2026-06-23-omo-feature-migration-design.md` for the authoritative phase plan.

1. **Step 1 (design spec Phase 2, immediate)**: Copy 3 quick-win skills (git-master, ast-grep, frontend) + debugging — zero adaptation needed. **Done locally.**
2. **Step 2 (design spec Phase 10/PR 12)**: Minor rewrite for init-deep. **Done locally.**
3. **Step 3 (design spec Phase 10/PR 13a)**: Moderate rewrite for remove-ai-slops, visual-qa, tech-debt-audit — replace category routing
4. **Step 4 (design spec Phase 10/PR 13b)**: Major rewrite for refactor, review-work — most valuable, heaviest omo-isms
5. **Step 5 (design spec Phase 10/PR 13c)**: Major rewrite for github-triage, remove-deadcode — specialized, lower priority
