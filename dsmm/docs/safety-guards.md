# DSMM Safety Guards

DSMM v0.4 adds dsh-native safety guards on the dsh tools pipeline. The guards use `tools/pre-execute` for allow, deny, and ask decisions, and `tools/post-execute` for accepted-result truncation. They do not use OpenCode hook names and do not mutate tool arguments.

## Scope

The default scope is `deepwork-or-dsmm-agent`: guards apply only when the current agent is in DSMM deepwork mode or uses a DSMM-managed preset id. For preset selection, the most recent `agent-preset/selected` session event takes precedence over `session.header.agentPreset`; the header is only the fallback when no selection event supplies a preset. Set `guards.scope: always` to apply them to every tool call in the profile, or `guards.scope: off` to disable all DSMM guard enforcement.

## Settings

```yaml
dsmm:
  guards:
    scope: deepwork-or-dsmm-agent
    shellCommandSafety: true
    gitWriteGuard: ask
    toolOutputTruncation:
      enabled: true
      maxInlineBytes: 12000
    planFormatValidation: true
    questionLabelHelper:
      enabled: true
      maxLabelChars: 30
    todoDisciplineHelper: true
```

## Failure messages

All DSMM guard messages begin with `[dsmm safety]`.

- `[dsmm safety] PowerShell command appears to use POSIX shell syntax (...)` rejects clear POSIX-only syntax such as `export` in `pwsh`.
- `[dsmm safety] PowerShell command uses POSIX null redirection (...)` rejects `/dev/null` in `pwsh`.
- `[dsmm safety] PowerShell command uses POSIX \`source\` (...)` rejects `source` in `pwsh`.
- `[dsmm safety] bash command appears to use PowerShell syntax (...)` rejects `$env:` in `bash`.
- `[dsmm safety] git write command requires explicit user approval before running: git ...` requests host approval for mutating git operations such as `git add`, `git rm`, `git mv`, `git commit`, `git push`, `git tag`, `git merge`, `git rebase`, `git cherry-pick`, `git revert`, `git reset`, `git clean`, `git stash`, `git checkout`, `git switch`, `git pull`, `git fetch`, `git remote`, `git submodule`, and `git worktree`, including forms with git global options such as `git -C repo commit`. If host approval is unavailable, dsh fails closed.
- `[dsmm safety] git write command is disabled by dsmm settings: git ...` denies those same git write operations when `gitWriteGuard: deny`.
- `[dsmm safety] truncated ... output` marks accepted plain-text tool results that were replaced with a head/tail preview.
- `[dsmm safety] plan file contains a malformed checklist entry: ...` rejects malformed checkbox lines in writes to `docs/superpowers/plans/*.md` and `.omo/plans/*.md`.
- `[dsmm safety] question option label exceeds ... characters: ...` rejects `ask_user_question` option labels longer than `maxLabelChars`.
- `[dsmm safety] todo list must keep exactly one in_progress item while unfinished work remains.` rejects todo lists with zero or multiple active items while work remains.
- `[dsmm safety] todo content must use "[WHERE] [HOW] to [WHY] - expect [RESULT]": ...` rejects unstructured `todo_write` content.

## Shell and Git coverage

Shell checks inspect the command argument for `bash`, `sh`, `zsh`, `pwsh`, and `powershell`. Command parsing separates `;`, newlines, pipes, and `&&`/`||` continuations; it also honors the dialect's normal line continuation escape. Git write detection recognizes an executable named `git` or `git.exe`, including a path-qualified executable, Git global options such as `git -C repo commit`, and the `env` wrapper with its supported options and POSIX-style assignments. Other aliases, shell functions, and wrappers are deliberately unclassified rather than guessed.

Known write operations are `add`, `am`, `apply`, `branch`, `checkout`, `cherry-pick`, `clean`, `clone`, `commit`, `fetch`, `init`, `merge`, `mv`, `pull`, `push`, `rebase`, `remote`, `reset`, `restore`, `revert`, `rm`, `stash`, `submodule`, `switch`, `tag`, and `worktree`. The guard also classifies mutating `config`, `notes`, `replace`, `update-ref`, and `symbolic-ref` forms, plus `reset --hard` and destructive `stash` actions. With `gitWriteGuard: ask`, each known write returns an ask decision for the host to compose with user approval; with `deny`, it is rejected; with `off`, it is not classified by DSMM. An unrecognized alias or wrapper receives no DSMM git decision.

DSMM's pre-execute handler runs before downstream handlers. Its own deny wins immediately. For its own ask, DSMM calls downstream and returns the ask only when downstream allowed the call; a downstream ask or deny is preserved. This keeps another safety policy's stricter decision intact rather than replacing it with DSMM's request.

## Plan mutation validation

Plan validation applies only to `write` and `edit` calls targeting `docs/superpowers/plans/*.md` or `.omo/plans/*.md` beneath the session cwd. A write validates its supplied `content`. For an edit, DSMM reads the current file, requires a non-empty `old_string`, reconstructs the resulting document using the requested single replacement or `replace_all`, then validates the resulting document's checklist lines. It rejects ambiguous, missing, unreadable, out-of-cwd, or non-string edit inputs instead of validating only the replacement fragment.
