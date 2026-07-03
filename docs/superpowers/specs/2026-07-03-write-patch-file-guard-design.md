# Write/Patch File Guard Design

**Date:** 2026-07-03
**Status:** Draft — pending approval
**Author:** orchestrator

## Goal

Prevent agents from overwriting existing project files via the `write` tool, force them to use `edit`/`multiedit` (patch) tools after reading the file first, and block shell-command workarounds that would bypass these built-in file-write rules. The guard has an always-on baseline that survives hook disablement.

## Background

### Existing code context

`src/permissions/index.ts` already contains `guardExistingFileWrite` (L187-210) gated by `write-existing-file-guard`. Its current behavior:

- If a `write` targets an existing file inside `projectRoot` (excluding `.omo`), it requires the same session to have called `read` on that file first (`readPermissions: Map<session, Set<canonicalPath>>`).
- When the write follows a read, the read token is **consumed** (deleted from the set) — so the next write to the same file requires another read.
- If `args?.overwrite === true`, the guard is skipped entirely (overwrite allowed).
- `trackReadPermission` (L138-160) records every `read` call into `readPermissions`, also gated by the same hook.

This is a read-then-write-allowed policy, not a write-prohibited policy. The user wants the opposite default: **writing existing files is prohibited; patching is required.**

### Hook pattern

Guards live in `createPermissionGuards` (L61-113). The `before` array (L76-86) runs guards in order:

```
trackReadPermission → guardNotepadWrite → guardExistingFileWrite → warnBashFileRead → guardSubagentGit → ...
```

Each guard signature: `function guardX(config, rawInput, ...extras): void`, first line `if (hookDisabled(config, "name", "alias")) return`, last action `throw new Error(msg)`.

Session state (`readPermissions`, `readmeSessionCache`, `lastAccess`) is created at L70-72, passed to guards and to `createGuardEventHandler` (L115-136) which clears them on `session.deleted` / `session.compacted`.

### Reusable helpers

- `toolName(rawInput)` → lowercase tool name (L926)
- `argsRecord(rawInput)` → `rawInput.args` as record (L898)
- `filePathFromArgs(rawInput, baseDir)` → resolves `filePath`/`path`/`file`/`file_path` args (L882)
- `canonicalExistingFile(filePath, projectRoot)` → canonical realpath if file exists, else null (L1431)
- `isInside(root, target)` → target within root (L1457)
- `isUnderSpecialDir(projectRoot, filePath, dirName)` → under `.omo` etc (L1462)
- `sessionId(rawInput)` → session id string (L948)
- `stringArg(rawInput, key)` → string arg value (L892)
- `tokenizeCommand(command)` → quote-aware tokens (L1467)
- `normalizeCommandName(text)` → lowercase, strip `.exe`, basename (L1547)
- `absolutize(filePath, baseDir)` → resolve relative path (L1453)
- `bashWorkingDirectory(rawInput, projectRoot)` → resolve bash workdir (L259)
- `hookDisabled(config, kebab, camel)` → true if hook disabled in config

### Config schema

`src/config/schema.ts` `HOOK_NAMES` array (L77-96) lists all guard names. `disabledHooks` defaults to `["directory-readme-injector"]` (L139). Per AGENTS.md, any `HOOK_NAMES` change requires `pnpm run gen-schema` to regenerate `schema.json` in the same commit.

### Plugin wiring

`src/index.ts` L118-123 constructs `createPermissionGuards({ getConfig, projectRoot, agentsSessionCache, sessionAgentMap })`. No new wiring needed — guards are internal to `createPermissionGuards`.

## Design Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Replace read-then-write-allowed with write-already-existing-prohibited for the `write` tool | User's core requirement: "不允许agent直接写入已存在的文件，应该使用patch的方式" |
| 2 | Add read-before-patch requirement to `edit`/`multiedit` | User: "patch之前应该先读取过文件内容" |
| 3 | Add `bash-file-write-guard` to detect shell file-write commands targeting existing project files | User: "禁止模型通过shell命令的方式绕过内置的write/patch file规则" |
| 4 | Always-on baseline for `write` (survives hook disable) + gated enhancement | User (m0010): "当禁用该hook的时候也禁止未设置overwrite参数的直接写入" |
| 5 | `edit`/`multiedit` read token is persistent (not consumed per patch) | Iterative editing reality; avoids forcing re-reads between every edit |
| 6 | Scope: `projectRoot` interior, excluding `.omo` (matches existing `guardExistingFileWrite`) | Consistency with existing scope; `.omo` is ocmm-internal |
| 7 | `write` `overwrite=true` is **not** exempt when hook is enabled; only exempt when hook is disabled (baseline) | User chose "完全禁止，不豁免 overwrite" (m0008) |
| 8 | Shell guard detects only writes to **existing** project files (not new files, not files outside project) | User chose "仅写已存在文件" (m0008); low false-positive rate |
| 9 | New hook name `bash-file-write-guard` (separate from `bash-file-read-guard`) | Different concern; independently disableable |

### Why an always-on baseline for `write` only

The user explicitly requested that disabling the hook should still block `write` without `overwrite`. This creates two tiers:

- **Baseline (always on):** `write` to existing project file with `overwrite !== true` → throw. This mirrors the *spirit* of the original guard (don't blindly overwrite) and cannot be turned off.
- **Enhancement (gated by `write-existing-file-guard`):** `write` to existing project file with `overwrite === true` → also throw. When enabled, no write to existing files is allowed at all.

Effect:
- Hook **enabled** (default) → `write` to existing project file is fully prohibited (regardless of `overwrite`).
- Hook **disabled** → falls back to baseline: `overwrite === true` allows the write, `overwrite !== true` is blocked.

The `edit`/`multiedit` read-before-patch requirement and the `bash-file-write-guard` are purely gated — disabling them turns them off entirely. The user only specified the baseline constraint for the `write` tool, so we do not extend it to those (YAGNI).

## Architecture

### Part 1: Config schema

```ts
// src/config/schema.ts — HOOK_NAMES array
const HOOK_NAMES = [
  "directory-readme-injector",
  "directory-agents-injector",
  "write-existing-file-guard",
  "notepad-write-guard",
  "bash-file-read-guard",
  "bash-file-write-guard",          // NEW
  "question-label-truncator",
  // ... rest unchanged
] as const
```

`disabledHooks` default stays `["directory-readme-injector"]` — the new guard is on by default.

### Part 2: `write` guard rewrite (two-tier)

```ts
// src/permissions/index.ts

function guardExistingFileWrite(
  config: OcmmConfig,
  rawInput: unknown,
  _readPermissions: Map<string, Set<string>>, // retained for signature compat; write no longer consumes read tokens
  projectRoot: string,
): void {
  if (toolName(rawInput) !== WRITE_TOOL) return
  const args = argsRecord(rawInput)
  const filePath = filePathFromArgs(rawInput, projectRoot)
  if (!filePath) return

  const canonical = canonicalExistingFile(filePath, projectRoot)
  if (!canonical || !isInside(projectRoot, canonical) || isUnderSpecialDir(projectRoot, canonical, ".omo")) return
  // ^ new files, projectRoot exterior, and .omo are never blocked

  const overwrite = args?.overwrite === true

  // Baseline (always on, even when hook disabled): block write without overwrite.
  if (!overwrite) {
    throw new Error(
      "File already exists. Use the edit/multiedit tool to patch the existing file instead of overwriting it with write. " +
      "Set overwrite: true on the write tool only if intentional full overwrite is required and the write-existing-file-guard hook is disabled.",
    )
  }

  // Enhancement (gated): block write even with overwrite when hook is enabled.
  if (hookDisabled(config, "write-existing-file-guard", "writeExistingFileGuard")) return
  throw new Error(
    "File already exists. The write-existing-file-guard hook blocks overwriting existing files. " +
    "Use the edit/multiedit tool to patch the file instead. " +
    'To disable this guard, add "write-existing-file-guard" to disabledHooks in ocmm.jsonc.',
  )
}
```

Key changes from the existing L187-210:
- The `hookDisabled` early-return is removed from the top and moved to the enhancement tier only.
- The read-token check (`paths?.has(canonical)`) is removed entirely — reads no longer unlock writes.
- The baseline throws regardless of hook state.

### Part 3: `edit`/`multiedit` read-before-patch guard

```ts
function guardPatchWithoutRead(
  config: OcmmConfig,
  rawInput: unknown,
  readPermissions: Map<string, Set<string>>,
  projectRoot: string,
): void {
  if (hookDisabled(config, "write-existing-file-guard", "writeExistingFileGuard")) return
  const name = toolName(rawInput)
  if (name !== "edit" && name !== "multiedit") return
  const filePath = filePathFromArgs(rawInput, projectRoot)
  if (!filePath) return
  const canonical = canonicalExistingFile(filePath, projectRoot)
  if (!canonical || !isInside(projectRoot, canonical) || isUnderSpecialDir(projectRoot, canonical, ".omo")) return
  const session = sessionId(rawInput)
  const paths = readPermissions.get(session)
  if (paths?.has(canonical)) return // read token is persistent, NOT consumed
  throw new Error(
    `File already exists but was not read in this session. Read the file first, then use ${name} to patch it. ` +
    'To disable this guard, add "write-existing-file-guard" to disabledHooks in ocmm.jsonc.',
  )
}
```

This guard shares the `write-existing-file-guard` gate (same hook name) because the three behaviors — block write, require read before patch, block shell bypass — are one cohesive policy. Disabling the hook disables both the write enhancement and the patch read-requirement, falling back to the always-on write baseline.

**Read-token lifecycle clarifications:**
- Reads performed while the hook is **disabled** are not recorded (because `trackReadPermission` is also gated). If the hook is later enabled, those reads do not count — the agent must read again under enforcement. Correct behavior: the read must happen under the same enforcement regime as the patch.
- The existing `createGuardEventHandler` (L115-136) clears `readPermissions` for a session on `session.deleted` and `session.compacted`. After compaction, the agent must re-read a file before patching it. This is pre-existing behavior, unchanged by this design.

### Part 4: `trackReadPermission` unchanged

`trackReadPermission` (L138-160) keeps recording reads. It is already gated by `write-existing-file-guard`. No change needed — the read set now feeds `guardPatchWithoutRead` instead of `guardExistingFileWrite`.

### Part 5: `bash-file-write-guard`

```ts
const SHELL_FILE_WRITE_COMMANDS = new Set([
  "tee",
  "dd",
  "install",
  "truncate",
  "fallocate",
])

function guardBashFileWrite(
  config: OcmmConfig,
  rawInput: unknown,
  projectRoot: string,
): void {
  if (hookDisabled(config, "bash-file-write-guard", "bashFileWriteGuard")) return
  if (toolName(rawInput) !== "bash") return
  const command = stringArg(rawInput, "command")
  if (!command) return
  if (!commandWritesExistingFile(command, rawInput, projectRoot)) return
  throw new Error(
    "This shell command writes to an existing project file. Use the edit/multiedit tool to patch the file instead of bypassing the file-write guard via shell. " +
    'To disable this guard, add "bash-file-write-guard" to disabledHooks in ocmm.jsonc.',
  )
}

function commandWritesExistingFile(command: string, rawInput: unknown, projectRoot: string): boolean {
  // 1. Redirect operators targeting existing project files: > >>
  if (redirectTargetsExistingProjectFile(command, rawInput, projectRoot)) return true
  // 2. tee / dd / install / truncate / fallocate with file operands
  if (commandUsesWriteCommandOnExistingFile(command, rawInput, projectRoot)) return true
  // 3. sed -i, perl -i, ruby -i in-place edits
  if (commandDoesInPlaceEdit(command, rawInput, projectRoot)) return true
  // 4. cp / mv / install overwriting existing files
  if (commandCopiesMovesOverExisting(command, rawInput, projectRoot)) return true
  return false
}
```

Detection details are in **Detailed Design** below.

### Part 6: Registration order

```ts
// createPermissionGuards before array (L76-86)
before: async (rawInput, rawOutput) => {
  const config = args.getConfig()
  await trackReadPermission(config, rawInput, readPermissions, readmeSessionCache, lastAccess, projectRoot)
  guardNotepadWrite(config, rawInput, projectRoot)
  guardExistingFileWrite(config, rawInput, readPermissions, projectRoot)        // rewritten
  guardPatchWithoutRead(config, rawInput, readPermissions, projectRoot)        // NEW
  warnBashFileRead(config, rawInput, rawOutput)
  guardBashFileWrite(config, rawInput, projectRoot)                             // NEW
  guardSubagentGit(config, rawInput, projectRoot, args.sessionAgentMap)
  truncateQuestionLabels(config, rawInput, rawOutput)
  guardTodoRead(config, rawInput, args.taskSystemEnabled)
  await rewriteWebfetchRedirect(config, rawInput, rawOutput, args.redirectResolver)
},
```

`guardPatchWithoutRead` runs after `guardExistingFileWrite` (write is rejected first if applicable). `guardBashFileWrite` runs after `warnBashFileRead` (read-detection is non-blocking warning; write-detection is blocking).

### Part 7: Event cleanup

No new state maps are introduced — `guardBashFileWrite` and `guardPatchWithoutRead` are stateless (the read set already exists and is cleaned up by the existing `createGuardEventHandler`). No event handler changes.

## File change list

| File | Change | Responsibility |
|---|---|---|
| `src/config/schema.ts` | Add `"bash-file-write-guard"` to `HOOK_NAMES` | Enable config-level disable |
| `schema.json` | Regenerate via `pnpm run gen-schema` | Keep generated schema in sync (AGENTS.md mandate) |
| `src/permissions/index.ts` | Rewrite `guardExistingFileWrite` (two-tier, remove read-token consumption); add `guardPatchWithoutRead`; add `guardBashFileWrite` + helpers; register both in `before` array | Core guard logic |
| `src/permissions/index.test.ts` | Add test cases for all three guards + two-tier behavior | Verify behavior |
| `docs/v1-maintenance.md` | Note the new hook name and behavior | AGENTS.md doc-sync mandate (schema change) |

## Detailed Design

### `write` guard two-tier flow

```
write tool called
  ├─ filePath not resolvable → pass
  ├─ file does not exist → pass (new file creation allowed)
  ├─ file outside projectRoot → pass
  ├─ file under .omo → pass
  ├─ overwrite !== true
  │    └─ throw BASELINE ERROR (always, even if hook disabled)
  ├─ overwrite === true
  │    ├─ hook disabled → pass (baseline allows intentional overwrite)
  │    └─ hook enabled → throw ENHANCEMENT ERROR
```

### `edit`/`multiedit` guard flow

```
edit/multiedit tool called
  ├─ hook disabled → pass (purely gated)
  ├─ filePath not resolvable → pass
  ├─ file does not exist → pass (new file via edit is allowed by OpenCode edit tool semantics)
  ├─ file outside projectRoot → pass
  ├─ file under .omo → pass
  ├─ session has read token for canonical path → pass (token persistent, not consumed)
  └─ no read token → throw ERROR
```

Note: if `edit` on a non-existent file is semantically invalid for OpenCode's `edit` tool, the tool itself will reject it; the guard only adds the read-requirement for existing files.

### Shell file-write detection

The detection is intentionally conservative — it only fires when a shell command writes to an **existing** file inside `projectRoot` (excluding `.omo`). This keeps false positives low (legitimate new-file generation via shell is unaffected).

**1. Redirect operators (`>`, `>>`, `>&`, `<&` with file targets)**

Scan the raw command string for `>` / `>>` followed by a file path token. Resolve the path relative to the bash working directory (`bashWorkingDirectory`). If the resolved path is an existing file inside `projectRoot` (excluding `.omo`), block.

Edge cases:
- `>/dev/null` and `> /dev/null` → `/dev/null` is outside projectRoot → not blocked.
- `2>file` → stderr redirect to existing file → blocked.
- `>>file` → append → blocked (still writes to existing file).
- `> file1 > file2` → check each target.
- Quoted paths: `>"my file.txt"` → tokenize handles quotes.

Regex approach: match `1?>>?\s*([^\s|;&]+|"[^"]*"|'[^']*')` and similar for `2>`, `&>`. For each match, strip quotes, absolutize, check existence + scope.

**2. Write commands (`tee`, `dd`, `install`, `truncate`, `fallocate`)**

- `tee file` → writes to `file`. Check if `file` is existing project file.
- `tee -a file` → append, still writes.
- `dd of=file` → `of=` operand targets output file. Check `of=` value.
- `install file dest` → `dest` is the last non-option operand. Check `dest`.
- `truncate -s 0 file` → truncates existing file. Check `file`.
- `fallocate -l SIZE file` → preallocates/changes existing file. Check `file`.

Tokenize the command; find the write-command token (after `normalizeCommandName`); resolve operands relative to bash workdir; check existence + scope.

**3. In-place editors (`sed -i`, `perl -i`, `ruby -i`)**

- `sed -i 's/old/new/g' file` → in-place edit. Check `file`.
- `sed -i.bak ... file` → in-place with backup suffix. The `-i` may take an optional suffix arg. Check the non-option operand.
- `perl -i -pe '...' file` → in-place. Check `file`.
- `ruby -i -pe '...' file` → in-place. Check `file`.

Detection: command is `sed`/`perl`/`ruby` AND has `-i` flag (with optional suffix). The last non-option token is the target file.

**4. Copy/move overwriting (`cp`, `mv`, `install`)**

- `cp src dest` → if `dest` exists, it is overwritten. Check `dest`.
- `mv src dest` → same.
- `install src dest` → same (already covered above but listed for completeness).

For `cp`/`mv`: the destination is the last non-option operand. If it resolves to an existing file inside projectRoot, block. Edge case: `cp -t destdir src1 src2` → `-t` consumes a directory target; if `destdir` is an existing directory, `cp` writes inside it — but the individual files may or may not exist. This is complex; we handle the common case (`cp src dest` where `dest` is a file) and skip the `-t` directory case (dest is a dir, not a file-overwrite).

### What is NOT detected (explicit non-goals)

- Shell commands that create **new** files (e.g. `echo x > newfile`) — not blocked (user chose "仅写已存在文件").
- Writes to files **outside** projectRoot — not blocked.
- Indirect writes via `python -c "open('file','w')"` or `node -e "fs.writeFileSync(...)"` — not blocked. Detecting arbitrary interpreter-based file writes is unbounded; the guard covers direct shell file-write primitives only. This is documented as a known limitation.
- `awk` with `print > "file"` redirect syntax — not blocked (complex, rare). Documented limitation.

## Error Handling

All three guards throw `Error` with actionable messages:

1. **Write baseline:** `"File already exists. Use the edit/multiedit tool to patch the existing file instead of overwriting it with write. Set overwrite: true on the write tool only if intentional full overwrite is required and the write-existing-file-guard hook is disabled."`
2. **Write enhancement:** `"File already exists. The write-existing-file-guard hook blocks overwriting existing files. Use the edit/multiedit tool to patch the file instead. To disable this guard, add \"write-existing-file-guard\" to disabledHooks in ocmm.jsonc."`
3. **Patch without read:** `"File already exists but was not read in this session. Read the file first, then use edit/multiedit to patch it. To disable this guard, add \"write-existing-file-guard\" to disabledHooks in ocmm.jsonc."`
4. **Shell file write:** `"This shell command writes to an existing project file. Use the edit/multiedit tool to patch the file instead of bypassing the file-write guard via shell. To disable this guard, add \"bash-file-write-guard\" to disabledHooks in ocmm.jsonc."`

## Testing

All tests use the existing `node:test` + `node:assert` pattern, temp directories via `mkdtempSync`, and `createPermissionGuards({ getConfig, projectRoot })`.

### `write` guard tests

- [ ] `write` to **new** file inside projectRoot → passes (both hook enabled and disabled)
- [ ] `write` to **existing** file inside projectRoot, `overwrite` unset, hook **enabled** → throws baseline error
- [ ] `write` to **existing** file inside projectRoot, `overwrite` unset, hook **disabled** → throws baseline error (always-on)
- [ ] `write` to **existing** file inside projectRoot, `overwrite: true`, hook **enabled** → throws enhancement error
- [ ] `write` to **existing** file inside projectRoot, `overwrite: true`, hook **disabled** → passes (baseline allows intentional overwrite)
- [ ] `write` to **existing** file inside `.omo/` → passes (special dir exempt)
- [ ] `write` to **existing** file **outside** projectRoot → passes
- [ ] `write` after `read` (same session) to existing file, hook enabled → still throws (read no longer unlocks write)

### `edit`/`multiedit` guard tests

- [ ] `edit` on existing file, **no prior read**, hook **enabled** → throws
- [ ] `edit` on existing file, **prior read same session**, hook **enabled** → passes
- [ ] `edit` on existing file, **prior read different session**, hook **enabled** → throws
- [ ] `multiedit` on existing file, no prior read → throws
- [ ] `multiedit` on existing file, prior read → passes
- [ ] `edit` on existing file, prior read, then `edit` again (second edit) → passes (token persistent, not consumed)
- [ ] `edit` on existing file, no prior read, hook **disabled** → passes
- [ ] `edit` on **new** file (does not exist) → passes
- [ ] `edit` on file under `.omo/` → passes
- [ ] `edit` on file outside projectRoot → passes

### `bash-file-write-guard` tests

- [ ] `echo x > existing.txt` (existing file in projectRoot) → throws
- [ ] `echo x > newfile.txt` (new file) → passes
- [ ] `echo x >> existing.txt` (append) → throws
- [ ] `echo x 2> existing.txt` (stderr redirect) → throws
- [ ] `echo x > /dev/null` → passes
- [ ] `echo x > file_outside.txt` (outside projectRoot) → passes
- [ ] `tee existing.txt` → throws
- [ ] `tee -a existing.txt` → throws
- [ ] `tee newfile.txt` → passes
- [ ] `dd of=existing.txt` → throws
- [ ] `sed -i 's/a/b/g' existing.txt` → throws
- [ ] `sed -i.bak 's/a/b/g' existing.txt` → throws
- [ ] `sed 's/a/b/g' existing.txt` (no `-i`, writes to stdout) → passes
- [ ] `cp src.txt existing_dest.txt` (dest exists) → throws
- [ ] `mv src.txt existing_dest.txt` (dest exists) → throws
- [ ] `cp src.txt newdest.txt` (dest does not exist) → passes
- [ ] `perl -i -pe 's/a/b/g' existing.txt` → throws
- [ ] command with redirect to file under `.omo/` → passes
- [ ] hook **disabled** → all above pass
- [ ] non-bash tool (`write`, `edit`) → passes (guard only inspects `bash`)

### Integration

- [ ] Full `before` array: `write` to existing file rejected even when `read` was called (guards compose correctly)
- [ ] `edit` after `read` passes through both `guardExistingFileWrite` (no-op for edit) and `guardPatchWithoutRead`

## Scope Boundaries (YAGNI)

- **No detection of interpreter-based writes** (`python -c`, `node -e`, `ruby -e` with `open(...,'w')`). Unbounded; documented as known limitation.
- **No detection of `awk` redirect syntax** (`awk '...{print > "file"}'`). Complex and rare.
- **`sh -c`/`bash -c`/`zsh -c`/`dash -c`/`ash -c` ARE specially parsed** (recursively). The guard extracts the quoted `-c` script body and re-scans it for redirects, write commands, in-place editors, and nested subshells. This is a deliberate exception to the "no recursive parsing" rule below, because `sh -c "..."` is the most common bypass vector.
- **No recursive shell parsing for other substitution forms** (nested `$(...)`, backticks, process substitution `>(...)`, `coproc`). `echo x > >(tee file)` and `coproc tee file` bypass the guard. The `guardSubagentGit` complexity is not replicated for these forms; they are documented as known limitations.
- **No `edit`/`multiedit` read-token consumption.** Persistent token. Re-reading is not forced between edits.
- **No baseline for `edit`/`multiedit` or shell guard.** Only `write` has the always-on baseline per the user's explicit constraint. Extending it would be scope creep.
- **No projectRoot-exterior file protection.** Consistent with existing guard scope.

## Doc Sync

Per AGENTS.md "Config Schema Sync": adding `bash-file-write-guard` to `HOOK_NAMES` requires regenerating `schema.json` (`pnpm run gen-schema`) in the same commit.

Per AGENTS.md "v1 Maintenance": this change does not touch `skills/v1/` or `prompts/v1/`, so `docs/v1-maintenance.md` is not strictly required. However, the new hook name is a config-level surface; add a one-line note to `docs/v1-maintenance.md` under a "Config/hooks" section for discoverability. (If no such section exists, add it under a new "### Hooks" subsection.)

## Risks

1. **False positives on shell commands with unusual quoting.** The flat-string scan for `>` may misidentify heredoc terminators (`<<EOF`) or comparison operators in test expressions. Mitigation: only match `>` not preceded by `<` (avoid `<<`), and skip `[[` / `[` test contexts. Document remaining edge cases.

2. **`cp`/`mv` destination detection complexity.** The last-operand heuristic fails for `cp -t dir src1 src2`. Mitigation: skip the `-t` case (destination is a directory, not a file overwrite); only block when the last operand resolves to an existing **file**.

3. **Existing tests may break.** The current `guardExistingFileWrite` tests (in `src/permissions/index.test.ts`) assert read-then-write-allowed behavior. These tests must be updated to reflect the new two-tier policy. This is expected and required.

4. **Always-on baseline cannot be disabled.** If a user genuinely needs `write` without `overwrite` on an existing file, they must either (a) use `edit`/`multiedit`, or (b) set `overwrite: true` and disable the hook. This is intentional per the user's constraint. The error message documents the escape hatch.

5. **`edit` on non-existent files.** If OpenCode's `edit` tool rejects non-existent files anyway, the guard's pass-through for non-existent files is harmless. If `edit` can create files, the guard allows it (consistent with `write` allowing new-file creation). Verify during implementation.
