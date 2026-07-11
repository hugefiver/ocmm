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
- When this skill mentions OpenCode `task(...)`, use the current callable Codex subagent-dispatch tool and preserve the task contract; prefer an exact profile selector, then complete direct composition, then generic/flat dispatch with role and required skills in the message.
- When this skill mentions OpenCode-specific tool names, choose the nearest Codex tool with the same intent and preserve the workflow contract.
