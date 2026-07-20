---
name: using-git-worktrees
description: Use ONLY when the user explicitly asks to use a git worktree for isolated feature work. Do not auto-trigger. Creates a linked worktree, sets up the project, and verifies a clean baseline before development begins.
---

# Using Git Worktrees

> **Consent gate:** This skill activates ONLY when the user explicitly requests a worktree. Never proactively offer or create a worktree. If the user asks for "isolation" or "a separate branch" without saying "worktree," ask whether they want a worktree or a regular branch.

## When to Use

- The user explicitly says "worktree" (or confirms when asked)
- You need isolated development without disturbing the main working tree
- The repository is not a submodule (worktrees inside submodules are problematic)

## Why Worktrees

A worktree gives you a separate checkout of the same repository, linked to the same `.git` directory. You can build and test on one branch without switching your main checkout. Changes in the worktree are visible to git immediately; no stash/switch/unstash dance.

## The Flow

### Step 0: Detect Existing Isolation

Before creating anything, check whether you are already inside a worktree.

```powershell
# In pwsh — check if GIT_DIR differs from GIT_WORK_TREE
$gitDir = git rev-parse --git-dir 2>$null
$gitCommon = git rev-parse --git-common-dir 2>$null
if ($gitDir -and $gitCommon -and ($gitDir -ne $gitCommon)) {
  Write-Output "Already inside a worktree (git-dir=$gitDir, common-dir=$gitCommon). Aborting create."
  exit
}
```

If `git-dir` and `git-common-dir` differ, you are already in a linked worktree — do not create a nested one. Report this to the user and ask how to proceed.

**Submodule guard:** If the current directory is inside a git submodule, worktrees are unreliable. Check with `git rev-parse --show-toplevel` and verify the top-level is not a `.gitmodules` entry.

### Step 1: Create the Worktree

OpenCode has no native worktree tool. Use `git worktree add` directly.

```powershell
# From the repository root:
$branch = "feature/<short-descriptive-name>"
$worktreePath = "<repo-parent-dir>/<repo-name>-wt-<short-name>"

git worktree add -b $branch $worktreePath
```

**Naming convention:** Place the worktree as a sibling of the main repo (`../<repo>-wt-<branch>`), not inside it. This avoids the worktree appearing in the main checkout's file listing.

**Branch vs detached:** Prefer `-b <new-branch>` so the worktree is on a named branch. Use `--detach` only if the user explicitly wants a detached HEAD.

### Step 2: Project Setup

The worktree is a fresh checkout — dependencies and build artifacts are not shared. Re-run project setup inside the worktree directory.

```powershell
Set-Location $worktreePath

# Node / pnpm (ocmm uses pnpm)
pnpm install

# Cargo (if the project has Rust components)
# cargo build

# Python (if applicable)
# python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -e .

# Go (if applicable)
# go build ./...
```

**Do not assume the setup is identical.** Build tools, lockfiles, and generated files must be regenerated in the worktree.

### Step 3: Verify Clean Baseline

Confirm the worktree is ready for development.

```powershell
# Verify branch
git branch --show-current

# Verify clean status
git status --short

# Verify the project builds and tests pass
pnpm run typecheck
pnpm test
```

If any check fails, stop and report to the user. Do not begin feature work on a broken baseline.

## Quick Reference

| Action | Command (pwsh) |
|---|---|
| List existing worktrees | `git worktree list` |
| Create worktree + branch | `git worktree add -b <branch> <path>` |
| Remove worktree | `git worktree remove <path>` |
| Prune stale worktree metadata | `git worktree prune` |
| Check if inside a worktree | `git rev-parse --git-dir` vs `--git-common-dir` |

## Common Mistakes

- **Creating a worktree inside the main checkout.** This pollutes the main tree. Always place worktrees as siblings, not children.
- **Forgetting to run project setup.** The worktree starts empty of `node_modules`, `target/`, etc. Build will fail until you re-install.
- **Not verifying the baseline.** If the worktree's `pnpm test` fails before you write any code, you cannot distinguish pre-existing failures from your changes.
- **Leaving stale worktrees.** When done, `git worktree remove <path>` cleans up. Stale worktrees accumulate and confuse `git worktree list`.

## Red Flags

- Never create a worktree without explicit user consent.
- Never create a worktree inside a submodule.
- Never assume the worktree shares `node_modules` or build artifacts with the main checkout.
- Never start feature work before verifying the baseline builds and tests pass.
- Never leave a worktree unremoved after the work is merged — clean up.

## When Done

When the feature is merged or abandoned:

```powershell
Set-Location <repo-root>
git worktree remove <worktree-path>
git branch -d <branch>  # if merged; -D if abandoned
```

## Codex Compatibility

- When this skill mentions TodoWrite, use Codex `update_plan`.
- When this skill mentions OpenCode `task(...)`, preserve its task contract and use the current callable Codex dispatch route.
- When this skill mentions OpenCode-specific tool names, choose the nearest callable Codex tool with the same intent and preserve the workflow contract.

### Callable Dispatch Contract

The current callable dispatch-tool schema is the only authority. Examples are not feature proof; omit hidden fields.

Compatibility routing never relaxes role delegation permission, target allowlists, or workflow ownership. Only call `create_goal` when a user, system, or developer instruction explicitly requests runtime goal creation. Ordinary workflow, planning, delegation, or a `GOAL:` line does not qualify.

Use the first permitted route in this order:

1. **Exact profile** — use `agent_type`, `agent_path`, or `agent_nickname` only when the current callable schema explicitly guarantees it selects a generated `dw-*` profile.
2. **Direct composition** — use only when the current callable schema exposes every model field required by the role, the schema-exact `reasoning` or `reasoning_effort` field when the role requires reasoning, the role's full system/developer instructions, and all required skills. Report this route as composition, not exact-profile selection.
3. **V1/V2 generic or flat dispatch** — use the canonical envelope below. The child keeps its default or inherited runtime model unless the callable schema exposes and receives a valid explicit override.
4. **Local execution** — when delegation is permitted, use only when no callable native dispatch tool is available. When delegation is not permitted, preserve the role contract and its workflow owner rather than routing around that restriction.

For generic or flat dispatch, put this canonical envelope in the task message:

`GOAL:` State one imperative, bounded outcome, including the role, scope, constraints, and required work.
`STOP WHEN:` State the exact completion condition and non-goal boundary.
`EVIDENCE:` State the paths, commands, outputs, or observations that prove completion.

The generic envelope does not load a profile, select a model, attach a skill, or enable a missing feature.

The default V1 exact-profile call is `multi_agent_v1.spawn_agent(agent_type="dw-plan-critic", message="Review the saved implementation plan and return one current-revision verdict.")`. V1 may send `model` only when the current callable schema exposes `model`. V1 may send exactly the schema-named `reasoning` or `reasoning_effort` field only when that exact field is exposed. If either field is hidden, omit it; never send both reasoning spellings. V1 may add `fork_context` only when the callable V1 schema exposes it and an explicit inheritance decision requires it.

V2-style flat dispatch uses `spawn_agent` to create, `wait_agent` to await, `followup_task` to continue, and `interrupt_agent` to stop. Use each flat tool only when it is present in the current callable schema and pass only parameters exposed by that tool's schema. No stable `multi_agent_v2` namespace is guaranteed. V2-style flat tools never receive `fork_context`. Never synthesize a namespace, copy parameters between tools, or add hidden parameters.

Only when the callable schema exposes `fork_turns` may the agent use `fork_turns: none` to request no context. If `fork_turns` is hidden, omit it. Other `fork_turns` values are only for explicit branch exploration.

`task_name` is an identity, not a profile selector. Do not pass `dw-*.toml` as a prompt, item, or skill attachment: generated TOML files are installation artifacts, not runtime skills.
