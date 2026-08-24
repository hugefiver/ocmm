# DSMM Safety Guards

DSMM v0.4 adds dsh-native safety guards on the dsh tools pipeline. The guards use `tools/pre-execute` for allow, deny, and ask decisions, and `tools/post-execute` for accepted-result truncation. They do not use OpenCode hook names and do not mutate tool arguments.

## Scope

The default scope is `deepwork-or-dsmm-agent`: guards apply only when the current agent is in DSMM deepwork mode or the agent appears to be one of DSMM's managed preset ids. Set `guards.scope: always` to apply them to every tool call in the profile, or `guards.scope: off` to disable all DSMM guard enforcement.

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
