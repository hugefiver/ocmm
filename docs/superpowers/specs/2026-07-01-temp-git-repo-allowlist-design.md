# Temp Git Repository Allowlist Design

## Context

`subagent-git-guard` blocks subagent git write commands so the main agent controls normal repository history. That is still the correct default for project/user repositories, but agents also create disposable git repositories under the operating-system temp directory for tests, repros, fixtures, or isolated experiments. Those temp repositories should allow arbitrary git operations without tripping the guard.

## Goals

- Allow git write commands when every detected git write targets a git repository located under `os.tmpdir()`.
- Keep blocking subagent git writes in the project repository or any non-temp repository.
- Keep the existing quote-aware git command parser and write-command classification intact.
- Update the injected commit guard text so main agents and subagents understand the temp-repository exception.
- Add focused tests for subagent guard behavior, not just `isGitWriteCommand()` parsing.

## Non-Goals

- Do not allow arbitrary git writes merely because the command mentions a temp path; the effective git working directory must resolve to a temp git repository.
- Do not parse every shell construct such as `cd temp && git commit`; callers should use the bash tool working directory or `git -C <repo>` for the allowlist to apply.
- Do not weaken the guard for unknown/non-temp repos.
- Do not change the config schema.

## Hardening

- **Worktree `.git` file bypass:** A temp worktree with a `.git` file containing `gitdir: <outside-temp-path>` must not pass the allowlist. The `.git` marker validator (`isValidTempGitMarker`) must distinguish directories from files: `.git` directories must be a valid git dir via `isValidGitDir` (under temp, outside project, contains git markers like HEAD, config+objects, or refs); `.git` files must be well-formed `gitdir:` worktree links with the resolved gitdir passing `isValidGitDir`.
- **Shell env override bypass:** Real shell environment assignments before the git segment must be detected and folded into the execution context like explicit `--git-dir` / `--work-tree` options. For PowerShell, only unquoted segment-leading `$env:GIT_DIR=...` / `$env:GIT_WORK_TREE=...` assignment statements count; quoted strings or `echo '$env:...'` do not. For cmd, only `set GIT_DIR=...` / `set GIT_WORK_TREE=...` inside supported `cmd /c` payloads count. If any env override points outside temp, the write is not allowlisted, even when later command-line git options point back into temp. The allowlist uses the conservative rule that any outside-temp source denies the exception.
- **Empty override bypass:** Empty explicit `-C ""`, `--work-tree ""`, `--git-dir ""`, `core.worktree=`, and empty PowerShell env overrides (`$env:GIT_WORK_TREE=""`) must set permanent `tempDenied`, blocking the write even when later valid temp options appear. Empty values must be detected before absolutization and treated as invalid immediately.
- **Valid gitdir requirement:** A `.git` directory marker or resolved worktree gitdir must contain actual git markers (`HEAD`, or `config`+`objects`, or `refs`), not merely exist under temp. Empty directories or temp directories without git markers are not valid git repositories.
- **Ancestor containment exclusion:** A temp repo that is an ancestor of `projectRoot` (contains the project tree) must not pass the allowlist. An allowed temp repo must be fully disjoint from the project root: not inside projectRoot AND not an ancestor containing projectRoot. This applies to all resolution paths: working-directory discovery (`isTempGitRepositoryContext`), explicit `-C`, `--git-dir`, `--work-tree`, env `GIT_DIR`/`GIT_WORK_TREE`, and worktree `.git` file gitdir targets. For standard `<repo>/.git` directories, disjointness is checked against the effective repo root `<repo>` (parent of `.git`), not just the `.git` directory itself. For linked-worktree admin gitdirs under `<repo>/.git/worktrees/<name>`, disjointness is also checked against `<repo>`. For bare gitdirs not named `.git` and not under `.git/worktrees/`, the gitdir itself is treated as the repo root.

## Design

The allowlist belongs in `guardSubagentGit()` after `isGitWriteCommand(command)` has identified a write command and before the subagent block is thrown.

The guard will derive a bash working directory from `args.workdir`, `args.cwd`, `args.directory`, or matching top-level fields, resolving relative paths against the plugin project root. It will then inspect the command with the existing quote-aware git tokenizer:

- Direct `git` segments use the segment's effective git directory.
- `git -C <path>` updates the effective git directory, including multiple `-C` options.
- Explicit `-C`, `--git-dir`, `--work-tree`, and `git -c core.worktree=...` values must each resolve to valid temp locations outside the project root; empty, missing, non-temp, project-root, or invalid values permanently deny the temp exception even if later overrides point back into temp.
- Supported shell wrappers (`pwsh`, `powershell`, `cmd`) recurse using the same working directory.
- The command is allowed only when all detected git writes target temp git repositories.

A temp git repository is a directory under `os.tmpdir()` with a `.git` marker at or above the working directory, also under `os.tmpdir()`, and fully disjoint from the project root (not inside projectRoot AND not an ancestor containing projectRoot). The `.git` marker must be a valid git directory (containing `HEAD`, or `config`+`objects`, or `refs`) — not just an empty directory. Worktree `.git` files must resolve to a gitdir that also passes this validity check. Existing paths are canonicalized with `realpathSync()` so Windows short/long temp path forms and symlinks are handled consistently.

## Testing

Add tests in `src/permissions/index.test.ts` that exercise the real `createPermissionGuards().before()` path with a subagent session:

- Subagent `git commit` is allowed when `args.workdir` points to a temp git repository.
- Subagent `git -C <tempRepo> commit` is allowed from a non-temp working directory.
- Subagent git write remains blocked in a temp directory that is not a git repository.
- Subagent git write remains blocked when the command redirects to a non-temp repository with `git -C`.

Existing `src/permissions/subagent-git-guard.test.ts` parser coverage remains unchanged except if a helper export is needed.

## Self-Review

- Placeholder scan: no placeholders remain.
- Consistency check: the allowlist is contextual and does not change write-command parsing.
- Scope check: this is limited to permission guard behavior and commit guard text.
- Ambiguity check: “temp directory” is defined as `os.tmpdir()` and “git repository” requires a `.git` marker under that temp root.
