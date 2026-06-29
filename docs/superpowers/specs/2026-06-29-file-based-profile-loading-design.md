# File-Based Profile Loading Design

## Goal

Add file-based profile loading to ocmm: each profile lives in its own JSONC file under a dedicated directory, loadable and mergeable at startup. This mirrors omo-switch's `configs/<name>.jsonc` model while preserving ocmm's existing overlay-merge semantics. The primary motivation is comment preservation — the current `ocmm-profiles add` rewrites `ocmm.jsonc` as plain JSON, destroying comments.

## Background

### Current state (ocmm)

- Profiles are stored inline in `ocmm.jsonc` under a top-level `profiles` object: `{ profiles: { co: {...}, oa: {...} }, activeProfile: "co" }`.
- `ProfileEntrySchema` (`src/config/schema.ts:368-411`) defines a profile as a partial overlay: `agents`, `categories`, `disabledAgents`, feature-gate arrays, `skills`, `fallbackModels`, `systemDefaultModel`, `locale`, `intent`, `runtimeFallback`, `idleContinuation`, `hashline`, `rules`, `mcp`, `registerBuiltinAgents`, `promptsRoot`, `debug`. `.strict()`. Nested `profiles`/`activeProfile` are forbidden.
- `loadConfig` (`src/config/load.ts:147-203`): reads user + project `ocmm.json[c]`, deep-merges into base, selects profile via `OCMM_PROFILE` env > `activeProfile` field, deep-merges `profiles[activeProfile]` over base with `{ profileOverlay: true }`. Missing profile silently ignored.
- `deepMerge` (`src/config/load.ts:105-128`): objects merge per-key; plain arrays replace; `ACCUMULATING_ARRAY_KEYS` (fallbackModels, disabledAgents, disabledHooks, disabledTools, disabledSkills, disabledCommands, disabledMcps) union-dedup. With `profileOverlay: true`, ALL arrays replace (no accumulation).
- `ocmm-profiles` CLI (`src/cli/profiles.ts`): `list`/`use`/`show`/`add`/`rm`/`clear`/`current` operate on the inline `profiles` object. All commands rewrite `ocmm.jsonc` via `JSON.stringify` — comments are lost.

### omo-switch model (reference)

- `~/.config/omo-switch/configs/<name>.jsonc` — one JSONC file per profile, comments preserved, source of truth.
- `~/.config/omo-switch/index.json` — store file with `activeProfileId` and embedded profile copies.
- Each omo-switch profile is a complete omo config (replace semantics). ocmm profiles remain partial overlays (merge semantics).

## Design Decisions

| Dimension | Decision |
|---|---|
| Relationship to inline `profiles` | Coexist; directory profiles shadow inline profiles with the same name |
| Directory path (user) | `~/.config/opencode/ocmm-profiles/` |
| Directory path (project) | `<cwd>/.opencode/ocmm-profiles/` |
| Filename / format | `<name>.jsonc` |
| CLI operation mode | `add`/`rm`/`list`/`show` operate on directory files; `use`/`clear` read/write `ocmm.jsonc` `activeProfile` |
| `activeProfile` storage | Stays in `ocmm.jsonc` top-level field |
| Profile file shape | `ProfileEntrySchema` (partial overlay, same as inline) |
| Existing inline migration | No auto-migration; user manages manually |
| codex host support | opencode host only |
| `add` semantics | Copy source file into directory as `<name>.jsonc` |
| Comment preservation | Both `ocmm.jsonc` and directory files preserve comments |
| `OCMM_PROFILE` env | Unchanged (env > `activeProfile`; can name a directory or inline profile) |

### Comment preservation approach

`use`/`clear` modify only the top-level scalar `activeProfile` field in `ocmm.jsonc`. A minimal regex-based patcher (`src/config/jsonc-patch.ts`) locates the `activeProfile` line and replaces its value (or removes the line for `clear`) without touching the rest of the file. This avoids a runtime dependency (ocmm is currently zero-dependency for config). If the patcher fails (malformed input), it falls back to `JSON.stringify` full rewrite with a `console.warn` noting comment loss. Directory files are never rewritten by the CLI except via `add` (copy) and `rm` (delete), so hand-written comments survive.

## Architecture

### Load flow

```
ocmm.jsonc (base config, with inline profiles + activeProfile)
  +
profiles directory (NEW):
  ~/.config/opencode/ocmm-profiles/<name>.jsonc   (user)
  <cwd>/.opencode/ocmm-profiles/<name>.jsonc      (project, overrides user same-name)
  +
inline profiles object (kept, shadowed by directory same-name)

loadConfig:
  1. Read user ocmm.jsonc -> read project ocmm.jsonc -> deepMerge (base)
  2. Scan user + project profiles dirs -> collect directory profiles (NEW)
  3. Merge profiles: { ...inlineProfiles, ...userDirProfiles, ...projectDirProfiles }
     (directory shadows inline; project shadows user)
  4. Select profile: OCMM_PROFILE env > activeProfile field
  5. profiles[activeProfile] deepMerge onto base with { profileOverlay: true }
  6. Missing profile silently ignored (unchanged)
```

### Components and file changes

| File | Change | Responsibility |
|---|---|---|
| `src/config/load.ts` | Modify | Add `loadProfilesFromDir()`; integrate directory scan + merge into `loadConfig` |
| `src/config/jsonc-patch.ts` | Create | Minimal comment-preserving patcher for top-level scalar fields (`activeProfile`) |
| `src/cli/profiles.ts` | Refactor | `add`/`rm`/`list`/`show` operate on directory files; `use`/`clear` use jsonc-patch on `ocmm.jsonc` |
| `src/cli/profiles.test.ts` | Extend | Cover file operations, shadowing, comment preservation |
| `src/config/load.test.ts` | Extend | Cover directory profile loading and shadowing |

No schema changes. `ProfileEntrySchema` already describes the per-profile shape; directory files use the same schema. `OcmmConfigSchema.profiles` remains for inline profiles.

## Detailed Design

### `loadProfilesFromDir(dir: string): Record<string, unknown>`

New function in `src/config/load.ts`.

- If `dir` does not exist or is not a directory, return `{}`.
- Scan for files matching `*.jsonc` and `*.json` (`.jsonc` preferred when both exist for the same base name).
- For each file, read text, strip comments via `stripJsoncCommentsAndTrailingCommas`, `JSON.parse`. On parse failure, `log.warn` and skip that file (do not throw).
- Return `{ [baseName]: parsedContent }`. `baseName` = filename without extension.
- Does not validate against `ProfileEntrySchema` here — validation happens after merge in `loadConfig` via `OcmmConfigSchema.safeParse`, consistent with current inline profile handling. (Rationale: a profile is a partial overlay; schema validation of the merged result is the correctness boundary. The CLI `add` command does validate via `ProfileEntrySchema` before copying, giving early feedback.)
- **Safety filter**: before returning, strip any `profiles` or `activeProfile` keys from each parsed profile object. `ProfileEntrySchema` forbids these (`.strict()`), but `loadProfilesFromDir` does not run schema validation, so a malformed file could otherwise leak nested `profiles` into the base via `deepMerge`. This defensive strip prevents that. `log.warn` when stripping occurs.

### `loadConfig` integration

In `src/config/load.ts`, after the existing user+project deepMerge and before activeProfile selection (around L174):

```ts
// Collect profiles from both sources.
const inlineProfiles = isPlainObject(mergedRecord.profiles) ? mergedRecord.profiles : {}
const userDirProfiles = loadProfilesFromDir(join(userConfigDir(host), "ocmm-profiles"))
const projectDirProfiles = host === "opencode"
  ? loadProfilesFromDir(join(projectConfigDir(cwd, host), "ocmm-profiles"))
  : {}
// Directory shadows inline; project shadows user.
const allProfiles = { ...inlineProfiles, ...userDirProfiles, ...projectDirProfiles }
```

The activeProfile lookup (L185-189) uses `allProfiles` instead of `mergedRecord.profiles`:

```ts
if (activeProfile && isPlainObject(allProfiles)) {
  const profile = allProfiles[activeProfile]
  if (isPlainObject(profile)) {
    merged = deepMerge(merged, profile, undefined, { profileOverlay: true })
  } else {
    log.warn(`active profile "${activeProfile}" not found; ignored`)
  }
}
```

`userConfigDir` and `projectConfigDir` are existing helpers (L19-28), already host-aware. `loadProfilesFromDir` is host-agnostic (just scans a directory); the host-awareness comes from which directory path is passed.

### `jsonc-patch.ts`

New file `src/config/jsonc-patch.ts`:

```ts
/**
 * Minimal comment-preserving patcher for top-level scalar fields in JSONC.
 *
 * Supports setting or removing a single top-level string/number/boolean field
 * without rewriting the whole file. Intended for `activeProfile` (string or
 * absent). Does NOT handle nested keys, arrays, or objects — those go through
 * full rewrite paths.
 *
 * On any structural surprise (unparseable, key in unusual position), throws
 * PatchError; caller falls back to full JSON.stringify rewrite with a warning.
 */
export class PatchError extends Error {}

export function patchTopLevelScalar(
  source: string,
  key: string,
  value: string | number | boolean | null,  // null = remove
): string
```

Implementation approach:
1. **Set existing**: regex `/^(\s*)"key"\s*:\s*.*?(\s*,?\s*)$/m` — replace value, preserve trailing comma/newline.
2. **Remove existing**: delete the matched line, handle dangling comma (if the removed line was the last property, remove the preceding trailing comma).
3. **Insert new**: find the top-level opening `{`, then insert `"key": "value"` before the closing `}`. If the object is non-empty, append with a leading comma; if empty, no comma.
4. **Validate**: after patching, attempt `JSON.parse(stripJsoncCommentsAndTrailingCommas(result))` — if it fails, throw `PatchError`.

The regex must respect JSONC string quoting: the key is always a double-quoted string at the top level (per JSON spec). Comments before/after the line are preserved because we only touch the matching line.

### `ocmm-profiles` CLI refactor

`src/cli/profiles.ts` changes:

**Path resolution (new helper):**
```ts
function profilesDir(): string {
  return join(userConfigDir(), "ocmm-profiles")  // userConfigDir() already exists (L32-36)
}
function profilePath(name: string): string {
  // Validate name (no path separators, no dots) to prevent traversal.
  if (!/^[A-Za-z0-9_-]+$/.test(name)) fail(`invalid profile name: ${name}`)
  return join(profilesDir(), `${name}.jsonc`)
}
```

**`add <name> <src-file>`** (L125-148 refactor):
- Read source file raw text. Fail early if file not found or unreadable.
- **JSONC validity check**: strip comments via `stripJsoncCommentsAndTrailingCommas`, then `JSON.parse`. If strip+parse fails, fail with `invalid JSONC in <src-file>: <parse error>` — do NOT copy the file. This catches syntax errors (trailing commas handled by the stripper, but unterminated strings, unbalanced braces, bad escapes, etc. still surface here).
- **Schema validation**: parse result through `ProfileEntrySchema.safeParse`. If it fails, fail with the schema issues — do NOT copy.
- Ensure `profilesDir()` exists (`mkdirSync` recursive).
- Copy source file content (raw text, not re-serialized — preserves comments in the source) to `profilePath(name)`.
- **Post-copy verification**: read the copied file back, strip+parse, `ProfileEntrySchema.safeParse` again. This catches filesystem corruption and encoding issues. If it fails (shouldn't on a normal filesystem), unlink the partial copy and fail.
- If target exists, overwrite (idempotent, matches current `add` replace semantics).
- Print `profile "name" added (file: <path>)`.

**`rm <name>`** (L150-164 refactor):
- If `profilePath(name)` exists, `unlinkSync` it.
- If not exists, check inline `profiles` in `ocmm.jsonc`: if an inline profile with that name exists, print an informative message: `profile "name" exists only inline in ocmm.jsonc; directory-based rm cannot remove it. Edit ocmm.jsonc manually to delete the inline entry.` and exit without error (exit code 0). This avoids confusing the user who sees the profile in `list` but can't `rm` it.
- If neither directory nor inline has the profile, fail with `profile "name" not found`.
- Do NOT touch `ocmm.jsonc` `activeProfile` — if the removed profile was active, `loadConfig` will silently ignore it (existing behavior). Print a note: `note: "name" was active — activeProfile in ocmm.jsonc is now stale; run 'ocmm-profiles use <other>' to switch`.
- Inline profiles in `ocmm.jsonc` are NOT deletable via `rm` (directory-only operation). This is a deliberate scope boundary: removing inline profiles requires editing `ocmm.jsonc` by hand (which preserves comments naturally). The `rm` command only manages directory files. Documented in help.

**`list`** (L81-97 refactor):
- Scan `profilesDir()` for `*.jsonc`/`*.json` → directory profiles.
- Read `ocmm.jsonc` inline `profiles` object → inline profiles.
- Merge names. For each, print: `marker name [source]` where source is `file` or `inline` (or both if shadowed: `file (shadows inline)`).
- Active marker `*` on the active profile (read from `ocmm.jsonc` `activeProfile`).

**`show [name]`** (L110-123 refactor):
- Default to `activeProfile` (unchanged).
- Look up in directory first; if not found, look up in inline `profiles`.
- Print `{ name, active, source: "file"|"inline", config }`.

**`use <name>`** (L99-108 refactor):
- Verify the profile exists: check directory, then inline. If neither, fail.
- Read `ocmm.jsonc` raw text.
- Call `patchTopLevelScalar(text, "activeProfile", name)`. On `PatchError`, fall back to `writeConfigRaw` (full rewrite) + `console.warn("comment preservation failed; ocmm.jsonc rewritten without comments")`.
- Write patched text back.
- Print `active profile set to "name"`.

**`clear`** (L166-176 refactor):
- Read `ocmm.jsonc` raw text.
- `patchTopLevelScalar(text, "activeProfile", null)` (remove). Same fallback as `use`.
- Write back. Print `cleared active profile (was "...")`.

**`current`** (L178-182): unchanged (reads `activeProfile` from parsed config).

**Help text** (`printHelp`, L184-201): update to reflect file-based operations. Add note that inline profiles in `ocmm.jsonc` are shadowed by directory files and cannot be managed via `add`/`rm` (only `list`/`show` see them).

### Error handling

- **Profiles dir missing**: `loadProfilesFromDir` returns `{}`; `list` shows only inline; `add` creates the dir.
- **Profile file parse failure**: `log.warn` + skip (load); CLI `add` validates before copy so bad files don't get added.
- **`add` source invalid JSONC**: strip+parse fails → error exit with parse error detail. File is not copied.
- **`add` source fails schema**: `ProfileEntrySchema.safeParse` fails → error exit with schema issues. File is not copied.
- **`add` post-copy verification fails**: unlink partial copy, error exit (defensive; should not happen on normal filesystems).
- **`rm` file missing**: error exit with hint.
- **`use` profile missing**: check dir then inline; both miss → error exit listing available (unchanged UX).
- **`jsonc-patch` failure**: fallback to full rewrite + warn. Never blocks the operation.
- **Name validation**: `add`/`rm`/`use` reject names with path separators or dots to prevent directory traversal and ambiguity with extensions.

## Testing

### `src/config/load.test.ts` additions

- `loadProfilesFromDir`: missing dir → `{}`; empty dir → `{}`; multiple files; `.jsonc` preferred over `.json`; parse failure skips file.
- `loadConfig` with directory profile: applies overlay; shadows inline same-name; project shadows user; `OCMM_PROFILE` env selects directory profile; missing directory profile silently ignored.

### `src/cli/profiles.test.ts` additions

- `add`: copies source to `profilesDir/<name>.jsonc`; preserves source comments (raw copy); validates before copy; creates dir if missing; overwrites existing; **rejects invalid JSONC** (unterminated string, unbalanced braces); **rejects schema-violating content** (e.g., nested `profiles` field); **post-copy verification** (read-back parse succeeds).
- `rm`: deletes file; missing file errors; active profile note printed.
- `list`: shows directory + inline; source markers; active marker.
- `show`: directory first, then inline; `source` field in output.
- `use`: sets `activeProfile` preserving comments (fixture with comments, assert comments survive); profile missing errors; name validation.
- `clear`: removes `activeProfile` preserving comments; idempotent on already-absent.

### `src/config/jsonc-patch.test.ts` (new)

- Set existing field (beginning/middle/end of object).
- Set new field (empty object; non-empty object).
- Remove field (beginning/middle/end; trailing comma handling).
- Comment preservation (line and block comments before/after/around the patched line).
- Invalid input throws `PatchError`.
- Round-trip: patch then `JSON.parse(strip(...))` yields expected value.

## Scope Boundaries (YAGNI)

Not in this design:
- `profilesDir` config field for custom path (hardcoded `ocmm-profiles`; add when needed).
- codex host directory profiles (opencode host only).
- Auto-migration of existing inline profiles to files.
- Profile inheritance / references between profiles.
- Full JSONC editor (only `activeProfile` scalar patch).
- Validation of directory profile files at load time against `ProfileEntrySchema` (deferred to merged `OcmmConfigSchema` validation, same as inline).

## Migration Path for Users

Manual, opt-in. A user with an existing inline `co` profile who wants to move to file-based:
1. `ocmm-profiles show co` → copy the `config` object content.
2. Save to `~/.config/opencode/ocmm-profiles/co.jsonc` (by hand or via a temp file + `ocmm-profiles add co <tmp>` — but `add` copies, so direct file write is simpler).
3. Edit `ocmm.jsonc` to remove the inline `profiles.co` entry (optional; if left, it's shadowed).
4. `ocmm-profiles use co` (already active, but confirms).

No CLI `migrate` command. The shadowing rule means leaving inline profiles in place is harmless.

## Risks

- **Regex patcher fragility**: unusual JSONC formatting (e.g., `activeProfile` inside a string value elsewhere) could confuse the regex. Mitigation: post-patch `JSON.parse` validation + fallback to full rewrite. Test with adversarial fixtures.
- **Shadowing confusion**: a stale inline profile with the same name as a directory profile is invisible to `show`/`use` (they see the directory one). `list` shows both with a shadow marker. Acceptable — documented in help.
- **Name collision with extensions**: a profile named `co` maps to `co.jsonc`. A profile named `co.jsonc` would map to `co.jsonc.jsonc`. Name validation regex `[A-Za-z0-9_-]+` prevents dots, avoiding this.
