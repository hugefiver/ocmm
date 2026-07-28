# Config Merge Prototype-Pollution Hardening Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent `__proto__`, `constructor`, and `prototype` own properties from surviving the existing configuration merge boundary at any depth while preserving all safe merge and profile-overlay behavior.

**Architecture:** Keep the exported merge API and `isPlainObject` contract unchanged. Add a private recursive sanitizer in `src/config/merge.ts`, sanitize both inputs once at the public `deepMerge()` boundary, and pass the sanitized trees to a private merge helper that retains the current object, scalar, array-union, ordinary-array replacement, and profile-overlay policies.

**Tech Stack:** TypeScript, Node.js 22+ built-in `node:test`/`node:assert`, JSON/JSONC parsing, Zod-backed `loadConfig`, pnpm, Cargo (through the existing full-suite command), Windows PowerShell.

**Global Constraints:**
- Modify only `src/config/merge.ts` and `src/config/load.test.ts` as production/test surfaces; retain the approved design and this plan as the only documentation artifacts in the final workspace scope.
- Treat the exact, case-sensitive keys `__proto__`, `constructor`, and `prototype` as forbidden at every object depth, including objects nested inside arrays.
- Recursively sanitize both `base` and `override`, including the `override === undefined` path and replacement-array elements.
- Do not mutate either input and do not log rejected configuration values.
- Do not change exported `isPlainObject`, `deepMerge` parameters/return type, `ACCUMULATING_ARRAY_KEYS`, ordinary-array replacement, accumulating-array insertion-order union, or `{ profileOverlay: true }` array replacement.
- Do not change configuration discovery, paths, migration, schema, `schema.json`, prompts, skills, Codex artifacts, fast-option helpers, nearest-parent behavior, or any idle/model/prompt follow-up project.
- Do not install dependencies and do not execute `git add`, `git commit`, `git push`, `git tag`, or any other Git write without separate explicit user authorization.
- Run all test, typecheck, full-suite, diff, and scope commands in Windows PowerShell after explicitly clearing `OCMM_PROFILE`, `OCMM_NO_PROFILE`, and `OCMM_FAST`.

---

## File Map

- Modify: `src/config/merge.ts` — privately sanitize both merge inputs and perform the existing policies only on sanitized values.
- Modify: `src/config/load.test.ts` — prove the vulnerable paths first, lock safe merge semantics, and exercise temporary JSONC through `loadConfig` with deterministic cleanup.
- Preserve unchanged: `src/config/load.ts` — existing public loader and `deepMerge` re-export used by the real-surface regression test.
- Preserve unchanged: `src/config/schema.ts` and `schema.json` — no configuration fields or schema behavior change.

### Task 1: Harden the merge boundary with one complete TDD cycle

**Files:**
- Modify: `src/config/load.test.ts:1-130` (test helpers and direct/real-loader regressions near the existing merge tests)
- Modify: `src/config/merge.ts:1-51` (private sanitizer and sanitized merge helper)
- Test: `src/config/load.test.ts`

**Interfaces:**
- Consumes: existing `deepMerge(base: unknown, override: unknown, parentKey?: string, opts?: { profileOverlay?: boolean }): unknown`, re-exported by `src/config/load.ts`; existing `loadConfig(opts?: LoadConfigOptions): LoadedConfig`; existing `ACCUMULATING_ARRAY_KEYS` behavior.
- Produces: unchanged exported `deepMerge(...)`, unchanged exported `isPlainObject`, and unchanged exported `ACCUMULATING_ARRAY_KEYS`; private `isUnsafeObjectKey(key: string): boolean`, `sanitizeMergeValue(value: unknown): unknown`, and `mergeSanitized(base: unknown, override: unknown, parentKey?: string, opts?: { profileOverlay?: boolean }): unknown`.

- [ ] **Step 1: Add direct and real-loader regressions before changing production code**

In `src/config/load.test.ts`, add these helpers after the imports and add the tests beside the existing `deepMerge` tests. Every malicious direct fixture is constructed with `JSON.parse()`. The four table cases separately expose the current base, override, nested-object, and replacement-array vulnerabilities, so one early assertion cannot hide the other RED paths.

```ts
const UNSAFE_CONFIG_KEYS = ["__proto__", "constructor", "prototype"] as const

function collectUnsafeOwnKeyPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectUnsafeOwnKeyPaths(item, `${path}[${index}]`))
  }
  if (typeof value !== "object" || value === null) return []

  const record = value as Record<string, unknown>
  const paths: string[] = []
  for (const [key, nested] of Object.entries(record)) {
    const nestedPath = `${path}.${key}`
    if ((UNSAFE_CONFIG_KEYS as readonly string[]).includes(key)) paths.push(nestedPath)
    paths.push(...collectUnsafeOwnKeyPaths(nested, nestedPath))
  }
  return paths
}

function assertSafeConfigTree(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) assertSafeConfigTree(item, `${path}[${index}]`)
    return
  }
  if (typeof value !== "object" || value === null) return

  assert.equal(Object.getPrototypeOf(value), Object.prototype, `${path} must have the ordinary object prototype`)
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    assert.equal(
      (UNSAFE_CONFIG_KEYS as readonly string[]).includes(key),
      false,
      `${path}.${key} must be removed`,
    )
    assertSafeConfigTree(nested, `${path}.${key}`)
  }
}

const MALICIOUS_MERGE_SCENARIOS: readonly {
  name: string
  base: unknown
  override: unknown
  expected: unknown
}[] = [
  {
    name: "the base layer when override is undefined",
    base: JSON.parse(
      '{"__proto__":{"polluted":"base-root"},"constructor":{"polluted":"base-root"},"prototype":{"polluted":"base-root"},"safe":{"kept":"base"},"array":[1,{"safe":true}],"scalar":7,"nullable":null}',
    ),
    override: undefined,
    expected: {
      safe: { kept: "base" },
      array: [1, { safe: true }],
      scalar: 7,
      nullable: null,
    },
  },
  {
    name: "the override layer",
    base: JSON.parse('{"safe":{"base":true},"ordinary":[1],"scalar":"base"}'),
    override: JSON.parse(
      '{"__proto__":{"polluted":"override-root"},"constructor":{"polluted":"override-root"},"prototype":{"polluted":"override-root"},"safe":{"override":true},"ordinary":[2],"scalar":"override","nullable":null}',
    ),
    expected: {
      safe: { base: true, override: true },
      ordinary: [2],
      scalar: "override",
      nullable: null,
    },
  },
  {
    name: "multiple nested object depths",
    base: JSON.parse(
      '{"nested":{"__proto__":{"polluted":"base-nested"},"safeBase":true,"deeper":{"constructor":{"polluted":"base-deep"},"safe":"base"}}}',
    ),
    override: JSON.parse(
      '{"nested":{"prototype":{"polluted":"override-nested"},"safeOverride":true,"deeper":{"__proto__":{"polluted":"override-deep"},"constructor":{"polluted":"override-deep"},"safe":"override"}}}',
    ),
    expected: {
      nested: {
        safeBase: true,
        safeOverride: true,
        deeper: { safe: "override" },
      },
    },
  },
  {
    name: "objects inside a replacement array",
    base: JSON.parse(
      '{"other":[{"safe":"base","__proto__":{"polluted":"base-array"},"constructor":{"polluted":"base-array"},"prototype":{"polluted":"base-array"}}]}',
    ),
    override: JSON.parse(
      '{"other":[{"safe":"override","__proto__":{"polluted":"override-array"}},{"nested":{"constructor":{"polluted":"array-nested"},"prototype":{"polluted":"array-nested"},"safe":true}},null,3]}',
    ),
    expected: {
      other: [
        { safe: "override" },
        { nested: { safe: true } },
        null,
        3,
      ],
    },
  },
]

for (const scenario of MALICIOUS_MERGE_SCENARIOS) {
  test(`deepMerge removes dangerous own keys from ${scenario.name}`, () => {
    const unsafeInputPaths = [
      ...collectUnsafeOwnKeyPaths(scenario.base),
      ...collectUnsafeOwnKeyPaths(scenario.override),
    ]
    for (const key of UNSAFE_CONFIG_KEYS) {
      assert.ok(
        unsafeInputPaths.some((path) => path.endsWith(`.${key}`)),
        `${scenario.name} fixture must contain an own ${key} key`,
      )
    }
    const baseBefore = structuredClone(scenario.base)
    const overrideBefore = structuredClone(scenario.override)

    const merged = deepMerge(scenario.base, scenario.override)

    assert.equal(Reflect.get(Object.prototype, "polluted"), undefined)
    assertSafeConfigTree(merged)
    assert.deepEqual(merged, scenario.expected)
    assert.deepEqual(scenario.base, baseBefore)
    assert.deepEqual(scenario.override, overrideBefore)
  })
}

test("deepMerge preserves ordinary, accumulating, and profile-overlay array policies", () => {
  const base = JSON.parse('{"other":[1,2],"disabledHooks":["base","shared"]}')
  const override = JSON.parse('{"other":[3],"disabledHooks":["shared","override"]}')

  assert.deepEqual(deepMerge(base, override), {
    other: [3],
    disabledHooks: ["base", "shared", "override"],
  })
  assert.deepEqual(deepMerge(base, override, undefined, { profileOverlay: true }), {
    other: [3],
    disabledHooks: ["shared", "override"],
  })
})

test("loadConfig removes dangerous keys parsed from project JSONC including array elements", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ocmm-prototype-hardening-"))
  const saved = new Map<string, string | undefined>()
  for (const key of ["OCMM_PROFILE", "OCMM_NO_PROFILE", "OCMM_FAST"]) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }

  try {
    mkdirSync(join(cwd, ".opencode"), { recursive: true })
    writeFileSync(join(cwd, ".opencode", "ocmm.jsonc"), `{
      // Keep this as JSONC so the real parser and loader boundary are exercised.
      "fastModels": {
        "rules": [{
          "match": { "provider": "prototype-hardening" },
          "options": {
            "__proto__": { "polluted": "top" },
            "constructor": { "polluted": "top" },
            "prototype": { "polluted": "top" },
            "safe": {
              "kept": true,
              "__proto__": { "polluted": "nested" },
              "nested": {
                "constructor": { "polluted": "nested" },
                "prototype": { "polluted": "nested" },
                "value": "ok",
              },
            },
            "items": [{
              "__proto__": { "polluted": "array" },
              "constructor": { "polluted": "array" },
              "prototype": { "polluted": "array" },
              "kept": "array",
            }, null],
          },
        }],
      },
    }`)

    const loaded = loadConfig({ cwd, includeUser: false })
    const options = loaded.config.fastModels.rules[0]?.options

    assert.ok(options)
    assert.equal(Reflect.get(Object.prototype, "polluted"), undefined)
    assertSafeConfigTree(options)
    assert.deepEqual(options, {
      safe: { kept: true, nested: { value: "ok" } },
      items: [{ kept: "array" }, null],
    })
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(cwd, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the targeted test file and verify the RED paths**

Run from the repository root in Windows PowerShell:

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/load.test.ts
```

Expected: exit code is non-zero. The four `deepMerge removes dangerous own keys ...` cases independently report retained unsafe own keys or a changed result prototype, and the `loadConfig removes dangerous keys ...` case reports retained dangerous keys. The array-policy regression remains green. This is the required proof that the current base, override, nested, and array paths are vulnerable before production code changes.

- [ ] **Step 3: Implement one private sanitizer and merge only sanitized trees**

Replace `src/config/merge.ts` with the following implementation. `Object.fromEntries()` creates ordinary data properties for safe entries, arrays are rebuilt element-by-element, and `mergeSanitized()` preserves the existing policy without repeatedly sanitizing recursive branches.

```ts
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"])

function isUnsafeObjectKey(key: string): boolean {
  return UNSAFE_OBJECT_KEYS.has(key)
}

function isPlainObjectValue(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

export const isPlainObject = isPlainObjectValue

export const ACCUMULATING_ARRAY_KEYS = new Set([
  "fallbackModels",
  "disabledAgents",
  "disabledHooks",
  "disabledTools",
  "disabledSkills",
  "disabledCommands",
  "disabledMcps",
])

function sanitizeMergeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeMergeValue(item))
  if (!isPlainObjectValue(value)) return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isUnsafeObjectKey(key))
      .map(([key, nested]) => [key, sanitizeMergeValue(nested)] as const),
  )
}

function mergeSanitized(
  base: unknown,
  override: unknown,
  parentKey?: string,
  opts?: { profileOverlay?: boolean },
): unknown {
  if (override === undefined) return base
  if (Array.isArray(base) && Array.isArray(override)) {
    if (opts?.profileOverlay) return override
    if (parentKey && ACCUMULATING_ARRAY_KEYS.has(parentKey)) {
      const set = new Set<string>([...base, ...override].map((x) => String(x)))
      return Array.from(set)
    }
    return override
  }
  if (isPlainObjectValue(base) && isPlainObjectValue(override)) {
    const out: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(override)) {
      out[key] = mergeSanitized(base[key], value, key, opts)
    }
    return out
  }
  return override
}

/**
 * Deep-merge two plain-object trees.
 *
 * Default array policy: REPLACE (override wins) for predictable override
 * semantics. Model fallback and feature-disable arrays are UNIONED de-duped
 * instead - these accumulate across user+project layers so global/project
 * gates compose predictably.
 *
 * Pass `{ profileOverlay: true }` to force ALL arrays to replace (use when
 * overlaying a profile that should fully own a field rather than accumulate).
 */
export function deepMerge(
  base: unknown,
  override: unknown,
  parentKey?: string,
  opts?: { profileOverlay?: boolean },
): unknown {
  return mergeSanitized(
    sanitizeMergeValue(base),
    sanitizeMergeValue(override),
    parentKey,
    opts,
  )
}
```

- [ ] **Step 4: Re-run the targeted test file and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/load.test.ts
```

Expected: exit code 0; every test in `src/config/load.test.ts` passes. The four direct scenarios contain all three unsafe keys before the call but none afterward, `Object.prototype` stays unpolluted, both inputs remain deeply equal to their snapshots, safe siblings/scalars/arrays/`null` match the expected values, and temporary JSONC loading returns only the safe option tree before deleting its temporary directory.

- [ ] **Step 5: Stop at the implementation review boundary; do not commit without separate authorization**

Review `src/config/merge.ts` and `src/config/load.test.ts` together because the RED tests and sanitizer form one security fix. Do not execute Git writes under the current authorization. If the user later gives separate explicit commit authorization after Task 2 is green, the authorized atomic boundary is:

```powershell
git add docs/superpowers/specs/2026-07-28-config-merge-prototype-hardening-design.md docs/superpowers/plans/2026-07-28-config-merge-prototype-hardening.md src/config/merge.ts src/config/load.test.ts
git commit -m "fix: harden config merge against prototype pollution" -m "Sanitize both merge inputs recursively while preserving array and profile-overlay semantics."
```

### Task 2: Run the full verification and enforce workspace scope

**Files:**
- Verify: `src/config/merge.ts`
- Verify: `src/config/load.test.ts`
- Verify scope: `docs/superpowers/specs/2026-07-28-config-merge-prototype-hardening-design.md`
- Verify scope: `docs/superpowers/plans/2026-07-28-config-merge-prototype-hardening.md`

**Interfaces:**
- Consumes: the unchanged public merge/loader interfaces and regressions produced by Task 1.
- Produces: command evidence for targeted tests, TypeScript type safety, the complete TypeScript/Rust suite, whitespace validity, and an exact four-file workspace scope; no new code interface.

- [ ] **Step 1: Run the targeted Node test**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/load.test.ts
```

Expected: exit code 0 and all `src/config/load.test.ts` tests pass, including the four malicious direct scenarios, unchanged array policies, and temporary-JSONC `loadConfig` regression.

- [ ] **Step 2: Run strict TypeScript checking**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run typecheck
```

Expected: exit code 0 from `tsc -p tsconfig.json --noEmit` with no diagnostics.

- [ ] **Step 3: Run the complete TypeScript and Rust suite**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm test
```

Expected: exit code 0; `pnpm run test:ts` passes the repository's Node tests and `pnpm run test:lsp` passes `cargo test -p ocmm-lsp`.

- [ ] **Step 4: Check the tracked diff for whitespace errors**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; git diff --check
```

Expected: exit code 0 with no output.

- [ ] **Step 5: Enforce the exact approved workspace scope**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null
$expected = @(
  "docs/superpowers/plans/2026-07-28-config-merge-prototype-hardening.md",
  "docs/superpowers/specs/2026-07-28-config-merge-prototype-hardening-design.md",
  "src/config/load.test.ts",
  "src/config/merge.ts"
) | Sort-Object
$actual = @(git status --porcelain=v1 --untracked-files=all | ForEach-Object {
  $_.Substring(3).Replace("\", "/")
}) | Sort-Object
$scopeDelta = @(Compare-Object -ReferenceObject $expected -DifferenceObject $actual)
if ($scopeDelta.Count -ne 0) {
  $scopeDelta | Format-Table -AutoSize
  throw "Workspace scope differs from the approved four files."
}
$actual
```

Expected: exit code 0 and exactly the approved design, this plan, `src/config/merge.ts`, and `src/config/load.test.ts` are listed. Any schema, `schema.json`, loader-path, migration, prompt, skill, Codex, fast-option-helper, nearest-parent, idle, or model-routing file fails this gate.

- [ ] **Step 6: Report completion without performing a Git write**

Report the targeted-test, typecheck, full-suite, `git diff --check`, and exact-scope results. Leave all four approved files uncommitted unless the user separately authorizes the atomic commit command documented in Task 1 Step 5.

---

## Requirement-to-Task Coverage

- Base, override, nested, replacement-array, `override === undefined`, all three exact keys, non-mutation, safe siblings/scalars/`null`, and `Object.prototype` assertions: Task 1 Steps 1-4.
- Ordinary-array replacement, accumulating-array de-duplicating insertion-order union, and profile-overlay replacement: Task 1 Steps 1 and 4.
- Recursive sanitization of both inputs without changing `isPlainObject` or the public merge interface: Task 1 Step 3.
- Real `loadConfig` JSONC parsing/merging with isolated temporary directory and `finally` cleanup: Task 1 Steps 1, 2, and 4.
- Targeted test, typecheck, full suite, whitespace, and exact-scope gates with cleared profile/fast environment variables: Task 2 Steps 1-5.
- No dependency installation, no unrelated follow-up project, and no unauthorized Git write: Global Constraints, Task 1 Step 5, and Task 2 Step 6.
