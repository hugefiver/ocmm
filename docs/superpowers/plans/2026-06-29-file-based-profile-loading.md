# File-Based Profile Loading Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add directory-based profile loading where each profile is a `<name>.jsonc` file under `ocmm-profiles/`, loadable and mergeable at startup, with comment preservation for both profile files and `ocmm.jsonc`.

**Architecture:** New `loadProfilesFromDir()` in `load.ts` scans user+project `ocmm-profiles/` dirs, merges with inline `profiles` (directory shadows inline, project shadows user). New `jsonc-patch.ts` does comment-preserving patch of the `activeProfile` scalar field in `ocmm.jsonc`. `ocmm-profiles` CLI `add`/`rm`/`list`/`show` switch to directory file operations; `use`/`clear` use the patcher.

**Tech Stack:** TypeScript, Node 22+ (`node:fs`, `node:os`, `node:path`, `node:child_process`), Zod, `node --test` + `--experimental-strip-types`.

---

## File Structure

- **Create:** `src/config/jsonc-patch.ts` — comment-preserving patcher for top-level scalar fields
- **Create:** `src/config/jsonc-patch.test.ts` — patcher unit tests
- **Modify:** `src/config/load.ts` — add `loadProfilesFromDir()`, integrate into `loadConfig`
- **Modify:** `src/config/load.test.ts` — cover directory profile loading and shadowing
- **Modify:** `src/cli/profiles.ts` — refactor add/rm/list/show to file ops; use/clear to patch
- **Modify:** `src/cli/profiles.test.ts` — cover new file operations, shadowing, comment preservation

No schema changes (`ProfileEntrySchema` already describes per-profile shape; directory files use the same schema).

---

## Task 1: jsonc-patch module

**Files:**
- Create: `src/config/jsonc-patch.ts`
- Test: `src/config/jsonc-patch.test.ts`

- [ ] **Step 1: Write the failing test for setting an existing field**

```ts
// src/config/jsonc-patch.test.ts
import { test } from "node:test"
import assert from "node:assert/strict"
import { patchTopLevelScalar, PatchError } from "./jsonc-patch.ts"

test("sets an existing top-level string field, preserving comments", () => {
  const src = `{
  // workflow selection
  "workflow": "v1",
  "activeProfile": "old",
  "debug": false
}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  assert.ok(out.includes(`"activeProfile": "co"`))
  assert.ok(out.includes(`// workflow selection`))
  assert.ok(out.includes(`"workflow": "v1"`))
  assert.ok(!out.includes(`"old"`))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/config/jsonc-patch.test.ts`
Expected: FAIL with module not found / `patchTopLevelScalar` not a function.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/config/jsonc-patch.ts
/**
 * Minimal comment-preserving patcher for top-level scalar fields in JSONC.
 *
 * Supports setting or removing a single top-level string/number/boolean field
 * without rewriting the whole file. Intended for `activeProfile`.
 * Does NOT handle nested keys, arrays, or objects.
 *
 * On structural surprise, throws PatchError; caller falls back to full rewrite.
 */
export class PatchError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = "PatchError"
  }
}

/** Strip // line and /* block comments + trailing commas for validation only. */
function stripJsonc(input: string): string {
  let out = ""
  let i = 0
  let inStr: '"' | "'" | null = null
  while (i < input.length) {
    const c = input[i]
    if (inStr) {
      out += c
      if (c === "\\" && i + 1 < input.length) {
        out += input[i + 1]
        i += 2
        continue
      }
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === '"' || c === "'") {
      inStr = c as '"' | "'"
      out += c
      i++
      continue
    }
    if (c === "/" && input[i + 1] === "/") {
      const nl = input.indexOf("\n", i + 2)
      i = nl < 0 ? input.length : nl
      continue
    }
    if (c === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2)
      i = end < 0 ? input.length : end + 2
      continue
    }
    out += c
    i++
  }
  return out.replace(/,(\s*[}\]])/g, "$1")
}

function serializeValue(value: string | number | boolean): string {
  if (typeof value === "string") return JSON.stringify(value)
  return String(value)
}

export function patchTopLevelScalar(
  source: string,
  key: string,
  value: string | number | boolean | null,
): string {
  // Regex: a line whose only top-level content is "key": <scalar>
  // Captures leading whitespace and trailing comma/newline context.
  const keyPattern = new RegExp(
    `^(\\s*)"${key}"\\s*:\\s*[^\\n,}]+?(\\s*)(,?)$`,
    "m",
  )
  const match = source.match(keyPattern)
  if (value !== null) {
    // Set (insert or replace).
    const serialized = serializeValue(value)
    if (match) {
      const replacement = `${match[1]}"${key}": ${serialized}${match[2]}${match[3]}`
      const result = source.replace(keyPattern, replacement)
      validateJsonc(result, key)
      return result
    }
    // Insert before final closing brace.
    return insertField(source, key, serialized)
  }
  // Remove.
  if (!match) {
    // Nothing to remove; return unchanged.
    return source
  }
  return removeLine(source, match[0], key)
}

function insertField(source: string, key: string, serializedValue: string): string {
  // Find the last top-level closing brace (naive: last `}` in file).
  const closeIdx = source.lastIndexOf("}")
  if (closeIdx < 0) throw new PatchError("no closing brace found")
  const before = source.slice(0, closeIdx)
  const after = source.slice(closeIdx)
  // Determine if we need a leading comma: scan backward for non-whitespace.
  let i = before.length - 1
  while (i >= 0 && /\s/.test(before[i]!)) i--
  const needsComma = i >= 0 && before[i] !== "{" && before[i] !== ","
  const prefix = needsComma ? "," : ""
  // Preserve indentation: match the indentation of the last property line if possible.
  const indent = detectIndent(source)
  const insertion = `${prefix}\n${indent}"${key}": ${serializedValue}`
  const result = before + insertion + after
  validateJsonc(result, key)
  return result
}

function removeLine(source: string, line: string, key: string): string {
  // Remove the matched line plus its trailing newline.
  const withNewline = line.endsWith("\n") ? line : line + "\n"
  let result = source.replace(withNewline, "")
  // Handle dangling comma: if the removed line was the last property, the
  // preceding property may now have a trailing comma before `}`.
  // Find the position where the line was and check backward.
  const closeIdx = result.lastIndexOf("}")
  if (closeIdx > 0) {
    let i = closeIdx - 1
    while (i >= 0 && /\s/.test(result[i]!)) i--
    if (i >= 0 && result[i] === ",") {
      result = result.slice(0, i) + result.slice(i + 1)
    }
  }
  validateJsonc(result, key)
  return result
}

function detectIndent(source: string): string {
  const m = source.match(/\n([ \t]+)"[^"]+"\s*:/)
  return m ? m[1]! : "  "
}

function validateJsonc(text: string, key: string): void {
  try {
    const parsed = JSON.parse(stripJsonc(text)) as Record<string, unknown>
    void parsed
  } catch (err) {
    throw new PatchError(`patching "${key}" produced invalid JSONC: ${(err as Error).message}`)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/config/jsonc-patch.test.ts`
Expected: PASS.

- [ ] **Step 5: Write tests for remaining patcher scenarios**

Append to `src/config/jsonc-patch.test.ts`:

```ts
test("inserts a new field into an object that already has properties", () => {
  const src = `{
  "workflow": "v1"
}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  assert.ok(out.includes(`"activeProfile": "co"`))
  assert.ok(out.includes(`"workflow": "v1"`))
  // comma before the new field
  assert.ok(out.includes(`"v1",\n  "activeProfile"`))
})

test("inserts a new field into an empty object", () => {
  const src = `{}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  assert.ok(out.includes(`"activeProfile": "co"`))
  assert.ok(!out.includes(","))
})

test("removes an existing field, fixing trailing comma", () => {
  const src = `{
  "workflow": "v1",
  "activeProfile": "co"
}`
  const out = patchTopLevelScalar(src, "activeProfile", null)
  assert.ok(!out.includes(`"activeProfile"`))
  assert.ok(out.includes(`"workflow": "v1"`))
  // no dangling comma after workflow now
  assert.ok(out.includes(`"workflow": "v1"\n}`))
})

test("removes a middle field, preserving surrounding commas", () => {
  const src = `{
  "workflow": "v1",
  "activeProfile": "co",
  "debug": false
}`
  const out = patchTopLevelScalar(src, "activeProfile", null)
  assert.ok(!out.includes(`"activeProfile"`))
  assert.ok(out.includes(`"workflow": "v1",`))
  assert.ok(out.includes(`"debug": false`))
})

test("remove is idempotent when field absent", () => {
  const src = `{
  "workflow": "v1"
}`
  const out = patchTopLevelScalar(src, "activeProfile", null)
  assert.equal(out, src)
})

test("preserves block comments around the patched line", () => {
  const src = `{
  /* top */ "activeProfile": "old", /* trailing */
  "debug": false
}`
  const out = patchTopLevelScalar(src, "activeProfile", "co")
  assert.ok(out.includes(`/* top */`))
  assert.ok(out.includes(`/* trailing */`))
  assert.ok(out.includes(`"activeProfile": "co"`))
})

test("sets a boolean field", () => {
  const src = `{
  "debug": false
}`
  const out = patchTopLevelScalar(src, "debug", true)
  assert.ok(out.includes(`"debug": true`))
})

test("sets a number field", () => {
  const src = `{
  "count": 1
}`
  const out = patchTopLevelScalar(src, "count", 42)
  assert.ok(out.includes(`"count": 42`))
})

test("throws PatchError on unparseable input", () => {
  const src = `{ this is not valid`
  assert.throws(
    () => patchTopLevelScalar(src, "activeProfile", "co"),
    PatchError,
  )
})

test("value with special chars is JSON-escaped", () => {
  const src = `{
  "activeProfile": "x"
}`
  const out = patchTopLevelScalar(src, "activeProfile", 'a"b\\c')
  assert.ok(out.includes(`"activeProfile": "a\\"b\\\\c"`))
})
```

- [ ] **Step 6: Run all patcher tests**

Run: `node --test --experimental-strip-types src/config/jsonc-patch.test.ts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/config/jsonc-patch.ts src/config/jsonc-patch.test.ts
git commit -m "feat: add comment-preserving jsonc patcher for top-level scalars"
```

---

## Task 2: loadProfilesFromDir

**Files:**
- Modify: `src/config/load.ts` (add function + export)
- Test: `src/config/load.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/config/load.test.ts` (after existing imports, which already include `loadConfig` and helpers):

```ts
import { loadProfilesFromDir } from "./load.ts"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

test("loadProfilesFromDir returns {} for missing dir", () => {
  const result = loadProfilesFromDir(join("/nonexistent", "path", "x"))
  assert.deepEqual(result, {})
})

test("loadProfilesFromDir returns {} for empty dir", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ocmm-empty-"))
  const result = loadProfilesFromDir(tmp)
  assert.deepEqual(result, {})
})

test("loadProfilesFromDir loads .jsonc files by basename", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ocmm-profiles-"))
  writeFileSync(
    join(tmp, "co.jsonc"),
    `// comment\n{ "agents": { "orchestrator": { "model": "gpt-5" } } }`,
  )
  writeFileSync(
    join(tmp, "oa.jsonc"),
    `{ "agents": { "reviewer": { "model": "claude" } } }`,
  )
  const result = loadProfilesFromDir(tmp)
  assert.deepEqual(Object.keys(result).sort(), ["co", "oa"])
  assert.deepEqual((result.co as Record<string, unknown>).agents, {
    orchestrator: { model: "gpt-5" },
  })
})

test("loadProfilesFromDir prefers .jsonc over .json for same basename", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ocmm-dup-"))
  writeFileSync(join(tmp, "co.json"), `{ "src": "json" }`)
  writeFileSync(join(tmp, "co.jsonc"), `{ "src": "jsonc" }`)
  const result = loadProfilesFromDir(tmp)
  assert.equal((result.co as Record<string, unknown>).src, "jsonc")
})

test("loadProfilesFromDir skips unparseable files with warn", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ocmm-bad-"))
  writeFileSync(join(tmp, "good.jsonc"), `{ "a": 1 }`)
  writeFileSync(join(tmp, "bad.jsonc"), `{ this is broken`)
  const result = loadProfilesFromDir(tmp)
  assert.deepEqual(Object.keys(result), ["good"])
})

test("loadProfilesFromDir strips nested profiles/activeProfile keys defensively", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ocmm-leak-"))
  writeFileSync(
    join(tmp, "sneaky.jsonc"),
    `{ "agents": {}, "profiles": { "nested": {} }, "activeProfile": "nested" }`,
  )
  const result = loadProfilesFromDir(tmp)
  const sneaky = result.sneaky as Record<string, unknown>
  assert.ok(!("profiles" in sneaky))
  assert.ok(!("activeProfile" in sneaky))
  assert.ok("agents" in sneaky)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/config/load.test.ts`
Expected: FAIL — `loadProfilesFromDir` not exported.

- [ ] **Step 3: Implement loadProfilesFromDir**

Add to `src/config/load.ts` (after the `locateFile` function, around L88):

```ts
import { readdirSync } from "node:fs"  // add to existing fs import at top

/**
 * Load profile entries from a directory of `<name>.jsonc` / `<name>.json` files.
 *
 * Each file is parsed (JSONC) and returned under its basename (extension
 * stripped). Parse failures are warned and skipped. `profiles` and
 * `activeProfile` keys are defensively stripped from each entry to prevent
 * nested-profile leakage (ProfileEntrySchema forbids them, but this function
 * does not run schema validation — the merge step would otherwise leak them).
 *
 * `.jsonc` is preferred when both `<name>.jsonc` and `<name>.json` exist.
 * Returns `{}` if the directory does not exist or is empty.
 */
export function loadProfilesFromDir(dir: string): Record<string, unknown> {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return {}
  }
  const out: Record<string, unknown> = {}
  const seen = new Set<string>()
  // Sort so .jsonc is processed after .json (later wins) for same basename.
  const files = entries.filter((n) => n.endsWith(".jsonc") || n.endsWith(".json")).sort()
  for (const name of files) {
    const baseName = name.replace(/\.(jsonc|json)$/, "")
    const ext = name.endsWith(".jsonc") ? "jsonc" : "json"
    // If we already have a .jsonc version, skip .json.
    if (ext === "json" && seen.has(baseName + ":jsonc")) continue
    const path = join(dir, name)
    const raw = readFileSync(path, "utf8")
    let parsed: unknown
    try {
      parsed = JSON.parse(stripJsoncCommentsAndTrailingCommas(raw))
    } catch (err) {
      log.warn(`failed to parse profile ${path}: ${(err as Error).message}`)
      continue
    }
    if (!isPlainObject(parsed)) {
      log.warn(`profile ${path} is not a JSON object; skipped`)
      continue
    }
    // Defensive: strip forbidden keys.
    const cleaned: Record<string, unknown> = { ...parsed }
    let stripped = false
    if ("profiles" in cleaned) {
      delete cleaned.profiles
      stripped = true
    }
    if ("activeProfile" in cleaned) {
      delete cleaned.activeProfile
      stripped = true
    }
    if (stripped) {
      log.warn(`profile ${path} contained profiles/activeProfile; stripped`)
    }
    out[baseName] = cleaned
    seen.add(baseName + ":" + ext)
  }
  return out
}
```

Also update the top import line to include `readdirSync`:

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/config/load.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/load.ts src/config/load.test.ts
git commit -m "feat: add loadProfilesFromDir for directory-based profiles"
```

---

## Task 3: Integrate directory profiles into loadConfig

**Files:**
- Modify: `src/config/load.ts` (`loadConfig` body)
- Test: `src/config/load.test.ts`

- [ ] **Step 1: Write the failing integration test**

Append to `src/config/load.test.ts`:

```ts
test("loadConfig applies a directory profile, shadowing inline same-name", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-int-"))
  const ocDir = join(xdg, "opencode")
  const profDir = join(ocDir, "ocmm-profiles")
  mkdirSync(profDir, { recursive: true })
  // Base config: inline profile "co" with model A, activeProfile=co
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    JSON.stringify({
      agents: { orchestrator: { model: "hoo/glm" } },
      profiles: {
        co: { agents: { orchestrator: { model: "INLINE-MODEL" } } },
      },
      activeProfile: "co",
    }),
  )
  // Directory profile "co" with model DIR-MODEL (shadows inline)
  writeFileSync(
    join(profDir, "co.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "DIR-MODEL" } } }),
  )
  const { config, activeProfile } = loadConfig({ cwd: join(xdg, "project") })
  assert.equal(activeProfile, "co")
  assert.equal(
    (config.agents!.orchestrator as Record<string, unknown>).model,
    "DIR-MODEL",
  )
})

test("loadConfig uses inline profile when no directory file exists", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-inline-"))
  const ocDir = join(xdg, "opencode")
  mkdirSync(ocDir, { recursive: true })
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    JSON.stringify({
      agents: { orchestrator: { model: "hoo/glm" } },
      profiles: {
        oa: { agents: { orchestrator: { model: "INLINE-OA" } } },
      },
      activeProfile: "oa",
    }),
  )
  const { config, activeProfile } = loadConfig({ cwd: join(xdg, "project") })
  assert.equal(activeProfile, "oa")
  assert.equal(
    (config.agents!.orchestrator as Record<string, unknown>).model,
    "INLINE-OA",
  )
})

test("loadConfig: OCMM_PROFILE selects a directory profile", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-env-"))
  const ocDir = join(xdg, "opencode")
  const profDir = join(ocDir, "ocmm-profiles")
  mkdirSync(profDir, { recursive: true })
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "hoo/glm" } } }),
  )
  writeFileSync(
    join(profDir, "env.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "ENV-MODEL" } } }),
  )
  const prev = process.env.OCMM_PROFILE
  process.env.OCMM_PROFILE = "env"
  try {
    const { config, activeProfile } = loadConfig({ cwd: join(xdg, "project") })
    assert.equal(activeProfile, "env")
    assert.equal(
      (config.agents!.orchestrator as Record<string, unknown>).model,
      "ENV-MODEL",
    )
  } finally {
    if (prev === undefined) delete process.env.OCMM_PROFILE
    else process.env.OCMM_PROFILE = prev
  }
})

test("loadConfig: project profiles dir shadows user profiles dir", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-user-"))
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-proj-"))
  const userOc = join(xdg, "opencode")
  const userProf = join(userOc, "ocmm-profiles")
  const projProf = join(cwd, ".opencode", "ocmm-profiles")
  mkdirSync(userProf, { recursive: true })
  mkdirSync(projProf, { recursive: true })
  writeFileSync(
    join(userOc, "ocmm.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "hoo/glm" } }, activeProfile: "p" }),
  )
  writeFileSync(
    join(userProf, "p.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "USER" } } }),
  )
  writeFileSync(
    join(projProf, "p.jsonc"),
    JSON.stringify({ agents: { orchestrator: { model: "PROJ" } } }),
  )
  const { config, activeProfile } = loadConfig({ cwd })
  assert.equal(activeProfile, "p")
  assert.equal(
    (config.agents!.orchestrator as Record<string, unknown>).model,
    "PROJ",
  )
})

test("loadConfig silently ignores missing directory profile", () => {
  const xdg = mkdtempSync(join(tmpdir(), "ocmm-miss-"))
  const ocDir = join(xdg, "opencode")
  mkdirSync(ocDir, { recursive: true })
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    JSON.stringify({
      agents: { orchestrator: { model: "hoo/glm" } },
      activeProfile: "nonexistent",
    }),
  )
  const { config, activeProfile } = loadConfig({ cwd: join(xdg, "project") })
  assert.equal(activeProfile, "nonexistent")
  // base config unchanged
  assert.equal(
    (config.agents!.orchestrator as Record<string, unknown>).model,
    "hoo/glm",
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/config/load.test.ts`
Expected: FAIL — directory profiles not loaded yet (shadowing test fails because inline still wins).

- [ ] **Step 3: Integrate into loadConfig**

In `src/config/load.ts`, modify `loadConfig` (around L170-193). Replace the activeProfile selection block:

```ts
  // --- existing code L170-180 stays: envProfile, activeProfileRaw, activeProfile ---

  // Collect profiles from inline + user dir + project dir.
  // Directory shadows inline; project shadows user.
  const inlineProfiles = isPlainObject(mergedRecord.profiles) ? mergedRecord.profiles : {}
  const userDirProfiles = loadProfilesFromDir(join(userConfigDir(host), "ocmm-profiles"))
  const projectDirProfiles = host === "opencode"
    ? loadProfilesFromDir(join(projectConfigDir(cwd, host), "ocmm-profiles"))
    : {}
  const allProfiles: Record<string, unknown> = {
    ...inlineProfiles,
    ...userDirProfiles,
    ...projectDirProfiles,
  }

  // If an active profile is named, deep-merge it over the base. A missing
  // profile is silently ignored so a stale activeProfile/OCMM_PROFILE value
  // never breaks the plugin — base config loads unchanged.
  if (activeProfile && isPlainObject(allProfiles)) {
    const profile = allProfiles[activeProfile]
    if (isPlainObject(profile)) {
      merged = deepMerge(merged, profile, undefined, { profileOverlay: true })
    } else {
      log.warn(`active profile "${activeProfile}" not found; ignored`)
    }
  }
```

Notes:
- `userConfigDir` and `projectConfigDir` are existing host-aware helpers (L19-28).
- `host` is already in scope (`opts.host ?? "opencode"`, L149).
- `cwd` is already resolved (L148).
- The `projectDirProfiles` is gated on `host === "opencode"` per the design (codex not supported).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/config/load.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run existing profiles.test.ts to ensure no regression**

Run: `node --test --experimental-strip-types src/config/profiles.test.ts`
Expected: all PASS (inline profile behavior unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/config/load.ts src/config/load.test.ts
git commit -m "feat: integrate directory profiles into loadConfig with shadowing"
```

---

## Task 4: Refactor ocmm-profiles CLI — directory operations

**Files:**
- Modify: `src/cli/profiles.ts` (add/rm/list/show → file ops)
- Test: `src/cli/profiles.test.ts`

- [ ] **Step 1: Write the failing test for add (file copy with validation)**

In `src/cli/profiles.test.ts`, after existing helpers, add:

```ts
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

test("add copies source file to profiles dir as <name>.jsonc", () => {
  const xdg = makeTempXdg()
  const srcFile = join(xdg, "src.jsonc")
  writeFileSync(
    srcFile,
    `// my profile comment\n{ "agents": { "orchestrator": { "model": "gpt-5" } } }`,
  )
  const { exitCode, stdout } = runCli(xdg, ["add", "co", srcFile])
  assert.equal(exitCode, 0)
  const target = join(xdg, "opencode", "ocmm-profiles", "co.jsonc")
  assert.ok(existsSync(target))
  // Raw copy preserves comments
  const content = readFileSync(target, "utf8")
  assert.ok(content.includes("// my profile comment"))
  assert.ok(stdout.includes(`profile "co" added`))
})

test("add rejects invalid JSONC source", () => {
  const xdg = makeTempXdg()
  const srcFile = join(xdg, "bad.jsonc")
  writeFileSync(srcFile, `{ this is not valid`)
  const { exitCode, stderr } = runCli(xdg, ["add", "co", srcFile])
  assert.notEqual(exitCode, 0)
  assert.ok(stderr.includes("invalid JSONC"))
  assert.ok(!existsSync(join(xdg, "opencode", "ocmm-profiles", "co.jsonc")))
})

test("add rejects schema-violating source (nested profiles)", () => {
  const xdg = makeTempXdg()
  const srcFile = join(xdg, "bad-schema.jsonc")
  writeFileSync(srcFile, JSON.stringify({ profiles: { nested: {} } }))
  const { exitCode, stderr } = runCli(xdg, ["add", "co", srcFile])
  assert.notEqual(exitCode, 0)
  assert.ok(stderr.includes("profile JSON invalid"))
})

test("add creates profiles dir if missing", () => {
  const xdg = makeTempXdg()
  const srcFile = join(xdg, "src.jsonc")
  writeFileSync(srcFile, `{ "agents": {} }`)
  runCli(xdg, ["add", "co", srcFile])
  assert.ok(existsSync(join(xdg, "opencode", "ocmm-profiles")))
})

test("add overwrites existing profile", () => {
  const xdg = makeTempXdg()
  const src1 = join(xdg, "s1.jsonc")
  const src2 = join(xdg, "s2.jsonc")
  writeFileSync(src1, `{ "agents": { "orchestrator": { "model": "a" } } }`)
  writeFileSync(src2, `{ "agents": { "orchestrator": { "model": "b" } } }`)
  runCli(xdg, ["add", "co", src1])
  runCli(xdg, ["add", "co", src2])
  const target = join(xdg, "opencode", "ocmm-profiles", "co.jsonc")
  const content = readFileSync(target, "utf8")
  assert.ok(content.includes(`"b"`))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/cli/profiles.test.ts`
Expected: FAIL — `add` still writes inline `profiles.co` instead of a file.

- [ ] **Step 3: Refactor profiles.ts path helpers and cmdAdd**

In `src/cli/profiles.ts`, add path helpers after `locateConfig` (around L47):

```ts
import { copyFileSync, unlinkSync, readdirSync, mkdirSync } from "node:fs"  // extend existing import

/** Directory holding file-based profiles (<name>.jsonc). */
function profilesDir(): string {
  return join(userConfigDir(), "ocmm-profiles")
}

/** Full path for a profile file. Validates name (no separators/dots). */
function profilePath(name: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    fail(`invalid profile name: "${name}" (allowed: letters, digits, -, _)`)
  }
  return join(profilesDir(), `${name}.jsonc`)
}

/** Scan directory profiles. Returns Map<name, path>. */
function scanDirProfiles(): Map<string, string> {
  const dir = profilesDir()
  const out = new Map<string, string>()
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  const files = entries.filter((n) => n.endsWith(".jsonc") || n.endsWith(".json")).sort()
  for (const name of files) {
    const baseName = name.replace(/\.(jsonc|json)$/, "")
    const ext = name.endsWith(".jsonc") ? "jsonc" : "json"
    if (ext === "json" && out.has(baseName)) continue  // .jsonc already seen
    out.set(baseName, join(dir, name))
  }
  return out
}
```

Replace `cmdAdd` (L125-148):

```ts
function cmdAdd(configPath: string, name: string, jsonFile: string): void {
  if (!existsSync(jsonFile)) fail(`file not found: ${jsonFile}`)
  const raw = readFileSync(jsonFile, "utf8")
  // 1. JSONC validity check
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsoncCommentsAndTrailingCommas(raw))
  } catch (err) {
    fail(`invalid JSONC in ${jsonFile}: ${(err as Error).message}`)
  }
  // 2. Schema validation
  const result = ProfileEntrySchema.safeParse(parsed)
  if (!result.success) {
    fail(
      `profile JSON invalid:\n${result.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    )
  }
  // 3. Ensure dir exists + copy raw (preserves comments)
  const target = profilePath(name)
  mkdirSync(profilesDir(), { recursive: true })
  copyFileSync(jsonFile, target)
  // 4. Post-copy verification
  try {
    const back = readFileSync(target, "utf8")
    const reparsed = JSON.parse(stripJsoncCommentsAndTrailingCommas(back))
    const revalid = ProfileEntrySchema.safeParse(reparsed)
    if (!revalid.success) throw new Error("schema validation failed on read-back")
  } catch (err) {
    unlinkSync(target)
    fail(`post-copy verification failed for ${target}: ${(err as Error).message}`)
  }
  console.log(`profile "${name}" added (file: ${target})`)
}
```

- [ ] **Step 4: Run add tests to verify they pass**

Run: `node --test --experimental-strip-types src/cli/profiles.test.ts`
Expected: the 5 new add tests PASS; existing inline tests may now fail (expected — `rm`/`list`/`show` not yet refactored).

- [ ] **Step 5: Refactor cmdRm**

Replace `cmdRm` (L150-164):

```ts
function cmdRm(configPath: string, name: string): void {
  const target = profilePath(name)
  if (existsSync(target)) {
    // Check if it was active, for the note.
    const cfg = readConfigRaw(configPath)
    const wasActive = cfg.activeProfile === name
    unlinkSync(target)
    if (wasActive) {
      console.log(`removed profile "${name}" (file)`)
      console.log(`note: "${name}" was active — activeProfile in ocmm.jsonc is now stale; run 'ocmm-profiles use <other>' to switch`)
    } else {
      console.log(`removed profile "${name}" (file)`)
    }
    return
  }
  // Not in dir — check inline.
  const cfg = readConfigRaw(configPath)
  const profiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  if (isPlainObject(profiles[name])) {
    console.log(`profile "${name}" exists only inline in ocmm.jsonc; directory-based rm cannot remove it. Edit ocmm.jsonc manually to delete the inline entry.`)
    return
  }
  fail(`profile "${name}" not found`)
}
```

- [ ] **Step 6: Refactor cmdList**

Replace `cmdList` (L81-97):

```ts
function cmdList(configPath: string): void {
  const cfg = readConfigRaw(configPath)
  const inlineProfiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  const active = typeof cfg.activeProfile === "string" ? cfg.activeProfile : undefined
  const dirProfiles = scanDirProfiles()
  // Merge names.
  const names = new Set<string>([...Object.keys(inlineProfiles), ...dirProfiles.keys()])
  if (names.size === 0) {
    console.log("(no profiles defined)")
    return
  }
  for (const name of [...names].sort()) {
    const marker = name === active ? " *" : "  "
    const inDir = dirProfiles.has(name)
    const inInline = isPlainObject(inlineProfiles[name])
    let source: string
    if (inDir && inInline) source = "file (shadows inline)"
    else if (inDir) source = "file"
    else source = "inline"
    console.log(`${marker} ${name} [${source}]`)
  }
  if (active && !names.has(active)) {
    console.log(`\n  note: active profile "${active}" is not defined`)
  }
}
```

- [ ] **Step 7: Refactor cmdShow**

Replace `cmdShow` (L110-123):

```ts
function cmdShow(configPath: string, name?: string): void {
  const cfg = readConfigRaw(configPath)
  const inlineProfiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  const active = typeof cfg.activeProfile === "string" ? cfg.activeProfile : undefined
  const target = name ?? active
  if (!target) {
    fail("no profile name given and no active profile set")
  }
  const dirProfiles = scanDirProfiles()
  let source: "file" | "inline"
  let entry: unknown
  if (dirProfiles.has(target!)) {
    source = "file"
    const raw = readFileSync(dirProfiles.get(target!)!, "utf8")
    entry = JSON.parse(stripJsoncCommentsAndTrailingCommas(raw))
  } else if (isPlainObject(inlineProfiles[target!])) {
    source = "inline"
    entry = inlineProfiles[target!]
  } else {
    fail(`profile "${target}" does not exist`)
  }
  console.log(JSON.stringify({ name: target, active: target === active, source, config: entry }, null, 2))
}
```

- [ ] **Step 8: Update existing tests that assumed inline behavior**

In `src/cli/profiles.test.ts`, the existing tests for `add`/`rm`/`list`/`show` operate on inline `profiles`. These need updating to reflect file-based behavior. For each existing test:
- Tests that did `runCli(xdg, ["add", "a", jsonFile])` then `readConfig(xdg).profiles.a` → change to check `existsSync(join(xdg, "opencode", "ocmm-profiles", "a.jsonc"))` and read the file content.
- Tests for `rm` → change to pre-create the file and assert deletion.
- Tests for `list` → adjust expected output to include `[file]`/`[inline]` markers.
- Tests for `show` → adjust to expect `source` field.

(Run the test suite first to see which fail; update each to the new file-based contract. Keep the test intent: verify the command does the right thing.)

- [ ] **Step 9: Run full profiles.test.ts**

Run: `node --test --experimental-strip-types src/cli/profiles.test.ts`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/cli/profiles.ts src/cli/profiles.test.ts
git commit -m "refactor: ocmm-profiles add/rm/list/show to directory file operations"
```

---

## Task 5: Refactor ocmm-profiles CLI — use/clear with comment preservation

**Files:**
- Modify: `src/cli/profiles.ts` (use/clear → jsonc-patch)
- Test: `src/cli/profiles.test.ts`

- [ ] **Step 1: Write the failing test for use preserving comments**

In `src/cli/profiles.test.ts`:

```ts
test("use sets activeProfile preserving comments in ocmm.jsonc", () => {
  const xdg = makeTempXdg()
  const ocDir = join(xdg, "opencode")
  const profDir = join(ocDir, "ocmm-profiles")
  mkdirSync(profDir, { recursive: true })
  // Write ocmm.jsonc with comments by hand (bypass writeConfig which strips them)
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    `// my config\n{\n  "workflow": "v1",\n  "activeProfile": "old",\n  "debug": false\n}\n`,
  )
  writeFileSync(join(profDir, "co.jsonc"), `{ "agents": {} }`)
  const { exitCode } = runCli(xdg, ["use", "co"])
  assert.equal(exitCode, 0)
  const after = readFileSync(join(ocDir, "ocmm.jsonc"), "utf8")
  assert.ok(after.includes("// my config"))
  assert.ok(after.includes(`"activeProfile": "co"`))
  assert.ok(!after.includes(`"old"`))
})

test("clear removes activeProfile preserving comments", () => {
  const xdg = makeTempXdg()
  const ocDir = join(xdg, "opencode")
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    `// top comment\n{\n  "workflow": "v1",\n  "activeProfile": "co",\n  "debug": false\n}\n`,
  )
  const { exitCode } = runCli(xdg, ["clear"])
  assert.equal(exitCode, 0)
  const after = readFileSync(join(ocDir, "ocmm.jsonc"), "utf8")
  assert.ok(after.includes("// top comment"))
  assert.ok(!after.includes(`"activeProfile"`))
})

test("use inserts activeProfile when field absent", () => {
  const xdg = makeTempXdg()
  const ocDir = join(xdg, "opencode")
  const profDir = join(ocDir, "ocmm-profiles")
  mkdirSync(profDir, { recursive: true })
  writeFileSync(
    join(ocDir, "ocmm.jsonc"),
    `// config\n{\n  "workflow": "v1"\n}\n`,
  )
  writeFileSync(join(profDir, "co.jsonc"), `{ "agents": {} }`)
  runCli(xdg, ["use", "co"])
  const after = readFileSync(join(ocDir, "ocmm.jsonc"), "utf8")
  assert.ok(after.includes(`"activeProfile": "co"`))
  assert.ok(after.includes("// config"))
})

test("use fails when profile not found in dir or inline", () => {
  const xdg = makeTempXdg()
  const { exitCode, stderr } = runCli(xdg, ["use", "nonexistent"])
  assert.notEqual(exitCode, 0)
  assert.ok(stderr.includes("does not exist") || stderr.includes("not found"))
})

test("use rejects invalid profile names", () => {
  const xdg = makeTempXdg()
  const { exitCode, stderr } = runCli(xdg, ["use", "../escape"])
  assert.notEqual(exitCode, 0)
  assert.ok(stderr.includes("invalid profile name"))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/cli/profiles.test.ts`
Expected: FAIL — `use` still uses `writeConfigRaw` (comments lost).

- [ ] **Step 3: Refactor cmdUse and cmdClear**

Add import at top of `src/cli/profiles.ts`:

```ts
import { patchTopLevelScalar, PatchError } from "../config/jsonc-patch.ts"
```

Replace `cmdUse` (L99-108):

```ts
function cmdUse(configPath: string, name: string): void {
  // Validate name format (consistent with add/rm).
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    fail(`invalid profile name: "${name}" (allowed: letters, digits, -, _)`)
  }
  // Verify the profile exists: dir first, then inline.
  const cfg = readConfigRaw(configPath)
  const inlineProfiles = isPlainObject(cfg.profiles) ? cfg.profiles : {}
  const dirProfiles = scanDirProfiles()
  if (!dirProfiles.has(name) && !isPlainObject(inlineProfiles[name])) {
    fail(`profile "${name}" does not exist. Available: ${[...dirProfiles.keys(), ...Object.keys(inlineProfiles)].sort().join(", ") || "(none)"}`)
  }
  // Patch activeProfile with comment preservation.
  const raw = readFileSync(configPath, "utf8")
  try {
    const patched = patchTopLevelScalar(raw, "activeProfile", name)
    writeFileSync(configPath, patched, "utf8")
  } catch (err) {
    if (err instanceof PatchError) {
      console.error(`ocmm-profiles: comment preservation failed (${err.message}); rewriting without comments`)
      cfg.activeProfile = name
      writeConfigRaw(configPath, cfg)
    } else {
      throw err
    }
  }
  console.log(`active profile set to "${name}"`)
}
```

Replace `cmdClear` (L166-176):

```ts
function cmdClear(configPath: string): void {
  const cfg = readConfigRaw(configPath)
  if (cfg.activeProfile === undefined) {
    console.log("no active profile set")
    return
  }
  const prev = cfg.activeProfile
  const raw = readFileSync(configPath, "utf8")
  try {
    const patched = patchTopLevelScalar(raw, "activeProfile", null)
    writeFileSync(configPath, patched, "utf8")
  } catch (err) {
    if (err instanceof PatchError) {
      console.error(`ocmm-profiles: comment preservation failed (${err.message}); rewriting without comments`)
      delete cfg.activeProfile
      writeConfigRaw(configPath, cfg)
    } else {
      throw err
    }
  }
  console.log(`cleared active profile (was "${prev}")`)
}
```

- [ ] **Step 4: Run use/clear tests to verify they pass**

Run: `node --test --experimental-strip-types src/cli/profiles.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/profiles.ts src/cli/profiles.test.ts
git commit -m "refactor: ocmm-profiles use/clear use comment-preserving jsonc patch"
```

---

## Task 6: Update help text and finalize

**Files:**
- Modify: `src/cli/profiles.ts` (printHelp)
- Test: `src/cli/profiles.test.ts`

- [ ] **Step 1: Update printHelp**

Replace `printHelp` (L184-201):

```ts
function printHelp(): void {
  console.log(`ocmm-profiles — manage ocmm config profiles

USAGE:
  ocmm-profiles list                    List all profiles (* = active)
                                        Shows [file] and [inline] sources.
  ocmm-profiles use <name>              Set the active profile (comment-preserving)
  ocmm-profiles show [name]             Print a profile (defaults to active)
  ocmm-profiles add <name> <json-file>  Add/replace a profile from a JSONC file
                                        (copied to ~/.config/opencode/ocmm-profiles/<name>.jsonc)
  ocmm-profiles rm <name>               Delete a profile file
                                        (inline profiles in ocmm.jsonc are not removable via rm)
  ocmm-profiles clear                   Clear activeProfile (comment-preserving)
  ocmm-profiles current                 Print the active profile name
  ocmm-profiles help                    Show this help

FILE-BASED PROFILES:
  Directory profiles live in:
    ~/.config/opencode/ocmm-profiles/<name>.jsonc   (user)
    <cwd>/.opencode/ocmm-profiles/<name>.jsonc      (project, shadows user)
  Each file is a ProfileEntrySchema (partial overlay) with the same merge
  semantics as inline profiles. Directory profiles shadow inline profiles
  with the same name.

INLINE PROFILES:
  Profiles defined in ocmm.jsonc's "profiles" object are still loaded but
  cannot be managed via add/rm (edit ocmm.jsonc by hand). They are shown
  in list with an [inline] marker and shadowed by same-name directory files.

The OCMM_PROFILE env var overrides activeProfile at load time but is NOT
persisted by this CLI. Use 'ocmm-profiles use <name>' to persist a switch.

Config file: ${locateConfig() ?? "(none — will be created on first write)"}`)
}
```

- [ ] **Step 2: Write test for help output**

In `src/cli/profiles.test.ts`:

```ts
test("help mentions file-based directory and inline shadowing", () => {
  const xdg = makeTempXdg()
  const { stdout } = runCli(xdg, ["help"])
  assert.ok(stdout.includes("FILE-BASED PROFILES"))
  assert.ok(stdout.includes("ocmm-profiles/<name>.jsonc"))
  assert.ok(stdout.includes("INLINE PROFILES"))
  assert.ok(stdout.includes("shadowed"))
})
```

- [ ] **Step 3: Run help test**

Run: `node --test --experimental-strip-types src/cli/profiles.test.ts`
Expected: PASS.

- [ ] **Step 4: Update existing help test if present**

If an existing test asserts the old help text shape, update its expectations to match the new help. (Run the suite to find any.)

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: all PASS (TS + existing tests).

- [ ] **Step 6: Run typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 7: Run build**

Run: `pnpm run build`
Expected: success (dist/ updated).

- [ ] **Step 8: Commit**

```bash
git add src/cli/profiles.ts src/cli/profiles.test.ts
git commit -m "docs: update ocmm-profiles help for file-based profiles"
```

---

## Self-Review

**Spec coverage:**
- `loadProfilesFromDir` (dir scan, `.jsonc` pref, parse-fail skip, defensive strip) → Task 2 ✓
- `loadConfig` integration (inline + user dir + project dir shadowing, OCMM_PROFILE env, missing profile silent) → Task 3 ✓
- `jsonc-patch.ts` (set existing, insert new, remove, comment preservation, PatchError fallback) → Task 1 ✓
- CLI `add` (JSONC validity, schema validation, raw copy, post-copy verification, dir creation, overwrite) → Task 4 ✓
- CLI `rm` (delete file, inline-only informative message, not-found error, active note) → Task 4 ✓
- CLI `list` (merge dir+inline, source markers, active marker) → Task 4 ✓
- CLI `show` (dir first then inline, source field) → Task 4 ✓
- CLI `use` (comment-preserving patch, profile existence check dir+inline, name validation, fallback) → Task 5 ✓
- CLI `clear` (comment-preserving remove, fallback) → Task 5 ✓
- Help text (file-based, inline shadowing, OCMM_PROFILE note) → Task 6 ✓
- No schema changes → confirmed (no schema task) ✓
- codex host excluded (projectDirProfiles gated on `host === "opencode"`) → Task 3 ✓

**Placeholder scan:** No TBD/TODO. All code blocks complete.

**Type consistency:**
- `loadProfilesFromDir(dir: string): Record<string, unknown>` — used consistently in Tasks 2, 3.
- `patchTopLevelScalar(source, key, value: string|number|boolean|null): string` — used consistently in Tasks 1, 5.
- `PatchError` — exported from `jsonc-patch.ts`, imported in `profiles.ts` Task 5.
- `scanDirProfiles(): Map<string, string>` — used in Task 4 `list`/`show`/`use`.
- `profilePath(name): string` with `/^[A-Za-z0-9_-]+$/` validation — used in Task 4 `add`/`rm`, Task 5 `use`.
- `profilesDir(): string` — used in Tasks 4, 5.

**Ordering:**
- Task 1 (patcher) is independent — can be built and tested in isolation. ✓
- Task 2 (`loadProfilesFromDir`) depends on `stripJsoncCommentsAndTrailingCommas` + `isPlainObject` + `log` (all existing in `load.ts`). ✓
- Task 3 (integrate) depends on Task 2. ✓
- Task 4 (CLI add/rm/list/show) depends on Task 2's `loadProfilesFromDir` for `scanDirProfiles`? No — `scanDirProfiles` is local to `profiles.ts` and uses `readdirSync` directly. But it duplicates the `.jsonc`-pref logic. This is acceptable: `profiles.ts` needs `Map<name, path>` (path included) while `loadProfilesFromDir` returns `Record<name, content>`. Different shapes, separate implementations. ✓
- Task 5 (use/clear) depends on Task 1 (`patchTopLevelScalar`, `PatchError`). ✓
- Task 6 (help) depends on nothing new. ✓
