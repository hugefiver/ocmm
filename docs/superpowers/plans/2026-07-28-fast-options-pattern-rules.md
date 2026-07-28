# Fast Options Pattern Rules Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend OpenCode `--fast` so OCMM-managed routes that are not handled by an explicit/suffix fast model can match ordered provider/model/SDK glob rules and inject deeply merged provider options into `chat.params` without weakening existing reasoning floors.

**Architecture:** Keep validation in `src/config/schema.ts`, isolate whole-string glob matching and non-mutating option merging in a new `src/routing/fast-option-rules.ts`, and replace `selectFastCandidate(): string | null` with a discriminated fast-path result. Publish the selected path and, only for option mode, the effective rule array inside the immutable effective-route snapshot; `chat.params` then matches every invocation against the actual runtime `model.providerID`, `model.modelID`, and `model.api.npm`, merges rule options after ordinary route options, and applies review/plan-critic floors last.

**Tech Stack:** TypeScript 6, Node.js 22+ built-in test runner, Zod 4, pnpm, the existing immutable effective-route registry, Windows PowerShell.

**Global Constraints:**
- Execute commands with Windows PowerShell syntax; do not use Bash-only environment assignment, pipelines, redirection, or chaining.
- Do not install dependencies or software. Implement glob matching and deep merge locally; add no third-party glob or merge package.
- Do not start a live provider or an unnecessary OpenCode process; use the existing in-process config/`chat.params` hook surface for real-surface QA.
- Do not call or reuse `src/rules/index.ts::globToRegExp`; its path-aware single-star behavior is incompatible with these whole-string patterns.
- Keep scope to OpenCode OCMM-managed routes. Do not extend Codex behavior and do not mutate unmanaged OpenCode agents.
- Match only `provider`, `model`, and `sdk`; do not expose arbitrary `provider.info` fields.
- Never log rule `options` or merged option values because they may contain secrets.
- Preserve model-path precedence: allowlisted explicit mapping (including authoritative self-map), already-`-fast` no-op, then allowlisted catalog suffix. A provider outside the promotion allowlist may still enter option mode.
- Fast-off, self-mapped, already-fast, and model-promoted routes must never fall through to option rules.
- Option rules use case-sensitive whole-string globs: `*` crosses `/`, `?` matches exactly one character, and all declared fields are ANDed.
- Merge matching rules in declaration order; recursively merge plain objects, replace arrays/scalars/null, then merge the result over ordinary `output.options`. Review and plan-critic floors write last.
- Carry effective option rules in the route-registry snapshot and preserve atomic publication/reload behavior; do not read live `cfg.fastModels.rules` as a substitute during `chat.params`.
- Any `OcmmConfigSchema` change requires `pnpm run gen-schema` and the same change set must include root `schema.json`.
- Keep changes minimal. Do not modify `prompts/v1`, `skills/v1`, or `docs/v1-maintenance.md`.
- Do not execute `git commit`, `git push`, `git tag`, or any other git write. A commit at a task/review boundary requires separate explicit user authorization.
- Clear inherited `OCMM_PROFILE`, `OCMM_NO_PROFILE`, and `OCMM_FAST` in test commands unless a test helper sets them deliberately; the current planner environment has an ambient profile selection that otherwise perturbs profile tests.

---

## File responsibility map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/config/schema.ts` | Modify | Strict root/profile `fastModels.rules` schemas and inferred `FastOptionRule` types. |
| `src/config/schema.test.ts` | Modify | Root defaults, valid nested options, and invalid rule/match validation. |
| `src/config/profiles.test.ts` | Modify | Whole-array profile replacement and root-rule inheritance when omitted. |
| `schema.json` | Regenerate | Generated root/profile JSON Schema synchronized from Zod. |
| `src/routing/fast-option-rules.ts` | Create | Whole-string glob matcher and ordered, non-mutating deep merge. |
| `src/routing/fast-option-rules.test.ts` | Create | Pure matcher/merge contract, order, replacement, and immutability tests. |
| `src/shared/types.ts` | Modify | `FastPath` discriminated union and required `EffectiveModelRoute.fastPath`. |
| `src/routing/effective-route.ts` | Modify | Fast-path precedence and route construction without fallback-chain regressions. |
| `src/routing/effective-route.test.ts` | Modify | Mapping/no-op/suffix/options/off precedence and route metadata. |
| `src/routing/route-registry.ts` | Modify | Deep clone/freeze option-path rules as part of atomic publication. |
| `src/routing/route-registry.test.ts` | Modify | Snapshot isolation and nested rule-option immutability. |
| `src/hooks/config.test.ts` | Modify | Config-hook publication of option-mode managed routes outside the promotion allowlist; add required `rules` to typed fixtures. |
| `src/hooks/chat-params.ts` | Modify | Retain `model.api.npm`, apply snapshot rules to actual runtime identity, and preserve floor ordering. |
| `src/hooks/chat-params.test.ts` | Modify | Runtime matching, merge precedence, gating, floors, missing SDK, route miss, and unmanaged-agent coverage. |
| `src/index.test.ts` | Modify | Real plugin/config/chat surface and reload-before-republish snapshot behavior; add required `rules` to typed fixtures. |
| `src/runtime-fallback/event-handler-test-fixtures.ts` | Modify | Mark manually published fallback routes with an explicit non-option fast path. |
| `src/runtime-fallback/event-handler-fallback-dispatch.test.ts` | Modify | Keep manual route fixtures type-correct with the new discriminant. |
| `src/runtime-fallback/event-handler-failed-model-resolution.test.ts` | Modify | Keep manual route fixtures type-correct with the new discriminant. |
| `README.md` | Modify | User configuration, precedence, glob, merge, runtime identity, and profile semantics. |
| `docs/architecture.md` | Modify | Route snapshot and `chat.params` data flow plus schema shape. |
| `examples/ocmm.example.jsonc` | Modify | Valid root and profile rule examples, including whole-array replacement. |

## Execution waves

1. Task 1 establishes the validated configuration contract and generated schema.
2. Task 2 implements the independently tested pure matcher/merge unit.
3. Task 3 publishes an explicit route-level fast-path decision and immutable rule snapshot.
4. Task 4 consumes that snapshot in `chat.params` and locks precedence/floor behavior.
5. Task 5 proves reload/republish behavior through the real plugin hook surface and synchronizes user docs.
6. Task 6 runs all targeted, type, full-suite, build, diagnostics, and real-surface gates.

### Task 1: Validate rule configuration and profile array semantics

**Files:**
- Modify: `src/config/schema.ts:224-249, 667-681`
- Modify: `src/config/schema.test.ts:33-132`
- Modify: `src/config/profiles.test.ts:421-457`
- Modify: `schema.json` (generated only)

**Interfaces:**
- Consumes: Existing `FastModelsConfigSchema`, `ProfileFastModelsConfigSchema`, `OcmmConfigSchema`, and `deepMerge(..., { profileOverlay: true })` array-replacement behavior.
- Produces: `FastOptionRuleSchema`, `FastOptionRule`, and `FastModelsConfig.rules: FastOptionRule[]`; root defaults to `[]`, profile `rules` remains optional.

- [ ] **Step 1: Write failing schema and profile tests for the complete configuration contract**

Replace the current fast-model schema assertions and add the invalid-rule matrix in `src/config/schema.test.ts`:

```ts
test("fast model policy applies root defaults including empty option rules", async () => {
  const mod = await import("./schema.ts")
  assert.equal(typeof mod.FastModelsConfigSchema?.parse, "function")
  assert.deepEqual(mod.FastModelsConfigSchema.parse({}), {
    providers: [],
    mappings: {},
    rules: [],
  })
  assert.deepEqual(defaultConfig().fastModels, {
    providers: [],
    mappings: {},
    rules: [],
  })
  assert.deepEqual(OcmmConfigSchema.parse({}).fastModels, {
    providers: [],
    mappings: {},
    rules: [],
  })
})

assert.deepEqual(
  OcmmConfigSchema.parse({
    fastModels: {
      providers: ["openai"],
      mappings: {
        "openai/gpt-5.6-sol": "gpt-5.6-sol-fast",
        "openai/gpt-5.6-codex": "openai/gpt-5.6-codex-fast",
      },
    },
  }).fastModels,
  {
    providers: ["openai"],
    mappings: {
      "openai/gpt-5.6-sol": "gpt-5.6-sol-fast",
      "openai/gpt-5.6-codex": "openai/gpt-5.6-codex-fast",
    },
    rules: [],
  },
)

test("fast option rules accept strict structured matches and arbitrary nested options", () => {
  const rules = OcmmConfigSchema.parse({
    fastModels: {
      rules: [
        {
          match: { provider: "openai-*", model: "gpt-5.?-*", sdk: "@ai-sdk/openai*" },
          options: {
            serviceTier: "priority",
            telemetry: { fast: true, sampleRate: 0.5 },
            stop: ["END"],
            nullable: null,
          },
        },
      ],
    },
  }).fastModels.rules

  assert.deepEqual(rules, [{
    match: { provider: "openai-*", model: "gpt-5.?-*", sdk: "@ai-sdk/openai*" },
    options: {
      serviceTier: "priority",
      telemetry: { fast: true, sampleRate: 0.5 },
      stop: ["END"],
      nullable: null,
    },
  }])
  assert.equal(OcmmConfigSchema.safeParse({
    fastModels: { rules: [{ match: { provider: "*" }, options: {} }] },
  }).success, true)
})

test("fast option rules reject empty matches, empty patterns, unknown fields, and non-object options", () => {
  const invalidRules: unknown[] = [
    { match: {}, options: {} },
    { match: { provider: "" }, options: {} },
    { match: { model: "" }, options: {} },
    { match: { sdk: "" }, options: {} },
    { match: { provider: "openai", region: "us" }, options: {} },
    { match: { provider: "openai" }, options: {}, extra: true },
    { match: { provider: "openai" }, options: [] },
    { match: { provider: "openai" }, options: null },
    { match: { provider: "openai" }, options: "priority" },
  ]
  for (const rule of invalidRules) {
    assert.equal(
      OcmmConfigSchema.safeParse({ fastModels: { rules: [rule] } }).success,
      false,
      JSON.stringify(rule),
    )
  }
})
```

Extend the existing profile schema test so the profile form has no child default. Replace its full `parsed.profiles.fast?.fastModels` expectation as well as adding the focused rule assertion:

```ts
const parsed = OcmmConfigSchema.parse({
  profiles: {
    fast: {
      fastModels: {
        mappings: { "openai/gpt-5.6-sol": "openai/gpt-5.6-flash" },
        rules: [{ match: { model: "gpt-5.6-*" }, options: { serviceTier: "flex" } }],
      },
    },
    empty: {},
  },
})
assert.deepEqual(parsed.profiles.fast?.fastModels, {
  mappings: { "openai/gpt-5.6-sol": "openai/gpt-5.6-flash" },
  rules: [{ match: { model: "gpt-5.6-*" }, options: { serviceTier: "flex" } }],
})
assert.equal("providers" in (parsed.profiles.fast?.fastModels ?? {}), false)
assert.equal("rules" in (parsed.profiles.empty?.fastModels ?? {}), false)
```

Expand `loadOpenCodePluginConfig profile overlay replaces fast providers and deep-merges mappings` in `src/config/profiles.test.ts` with two root rules and two profiles:

```ts
const baseRules = [
  { match: { provider: "base-*" }, options: { serviceTier: "standard" } },
  { match: { model: "base-model" }, options: { telemetry: { base: true } } },
]
const profileRules = [
  { match: { sdk: "@ai-sdk/profile" }, options: { serviceTier: "priority" } },
]
writeConfig(xdg, {
  fastModels: {
    providers: ["base-provider"],
    mappings: {
      "openai/gpt-5": "openai/gpt-5-mini",
      "anthropic/claude-opus": "anthropic/claude-haiku",
    },
    rules: baseRules,
  },
  profiles: {
    fast: {
      fastModels: {
        providers: ["profile-provider"],
        mappings: {
          "openai/gpt-5": "openai/gpt-5-nano",
          "google/gemini-pro": "google/gemini-flash",
        },
        rules: profileRules,
      },
    },
    inheritRules: {
      fastModels: { providers: ["inherit-provider"] },
    },
  },
  activeProfile: "fast",
})

const replaced = loadPluginWithXdg(xdg)
assert.deepEqual(replaced.config.fastModels.rules, profileRules)

const inherited = loadPluginWithXdg(xdg, undefined, { OCMM_PROFILE: "inheritRules" })
assert.deepEqual(inherited.config.fastModels.rules, baseRules)
```

- [ ] **Step 2: Run both focused tests and verify the new contract fails**

Run:

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/profiles.test.ts
```

Expected: both commands are run and at least the schema command exits non-zero because the default lacks `rules` and valid rule input is rejected as an unknown `fastModels` key; the profile command also fails because rules cannot yet survive parsing/overlay.

- [ ] **Step 3: Implement strict root/profile rule schemas**

Add the following definitions immediately before `defaultFastModelsConfig` / `FastModelsConfigSchema` in `src/config/schema.ts`:

```ts
const FastOptionPatternSchema = z.string().min(1)

const FastOptionRuleMatchSchema = z
  .object({
    provider: FastOptionPatternSchema.optional(),
    model: FastOptionPatternSchema.optional(),
    sdk: FastOptionPatternSchema.optional(),
  })
  .strict()
  .refine(
    (match) => match.provider !== undefined || match.model !== undefined || match.sdk !== undefined,
    { message: "Fast option rules require at least one match field." },
  )

export const FastOptionRuleSchema = z
  .object({
    match: FastOptionRuleMatchSchema,
    options: z.record(z.string(), z.unknown()),
  })
  .strict()

export type FastOptionRule = z.infer<typeof FastOptionRuleSchema>

const defaultFastModelsConfig = () => ({
  providers: [],
  mappings: {},
  rules: [],
})
```

Add `rules` to both forms without adding a profile child default:

```ts
export const FastModelsConfigSchema = z
  .object({
    providers: z.array(z.string().min(1)).default([]),
    mappings: z.record(FastModelMappingKeySchema, FastModelMappingValueSchema).default({}),
    rules: z.array(FastOptionRuleSchema).default([]),
  })
  .strict()
  .default(defaultFastModelsConfig)

const ProfileFastModelsConfigSchema = z
  .object({
    providers: z.array(z.string().min(1)).optional(),
    mappings: z.record(FastModelMappingKeySchema, FastModelMappingValueSchema).optional(),
    rules: z.array(FastOptionRuleSchema).optional(),
  })
  .strict()
```

- [ ] **Step 4: Run focused schema/profile tests and verify they pass**

Run each file in its own process to avoid environment-sensitive profile tests interfering with other suites:

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/profiles.test.ts
```

Expected: both commands exit `0`; each summary reports `fail 0`, including the new fast-option schema and profile replacement tests.

- [ ] **Step 5: Regenerate and inspect the JSON Schema**

Run:

```powershell
pnpm run gen-schema
node --input-type=module -e "import {readFileSync} from 'node:fs'; const s=JSON.parse(readFileSync('schema.json','utf8')); const root=s.properties.fastModels.properties.rules; const profile=s.properties.profiles.additionalProperties.properties.fastModels.properties.rules; if(!root || !profile) throw new Error('root/profile fastModels.rules missing'); console.log('fastModels.rules present in root and profile schema')"
```

Expected: `wrote ...\schema.json`, followed by `fastModels.rules present in root and profile schema`; no hand edits to `schema.json`.

**Review boundary:** The validated config contract, profile semantics, and generated schema form one reviewable unit. Committing it requires separate user authorization.

### Task 2: Implement whole-string matching and ordered immutable merge

**Files:**
- Create: `src/routing/fast-option-rules.ts`
- Create: `src/routing/fast-option-rules.test.ts`

**Interfaces:**
- Consumes: `FastOptionRule` from `src/config/schema.ts` and runtime values `{provider, model, sdk?}`.
- Produces: `FastOptionMatchContext`, `matchesFastOptionRule(rule, context): boolean`, `FastOptionMergeResult`, and `mergeFastOptionRules(baseOptions, rules, context): FastOptionMergeResult`.

- [ ] **Step 1: Write failing pure behavior tests**

Create `src/routing/fast-option-rules.test.ts`:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import type { FastOptionRule } from "../config/schema.ts"
import { matchesFastOptionRule, mergeFastOptionRules } from "./fast-option-rules.ts"

test("fast option globs are case-sensitive whole-string matches where star crosses slash and question matches one", () => {
  const context = { provider: "openai-compatible", model: "publishers/google/models/gemini-3", sdk: "@ai-sdk/openai-compatible" }
  assert.equal(matchesFastOptionRule({ match: { provider: "openai-*" }, options: {} }, context), true)
  assert.equal(matchesFastOptionRule({ match: { model: "publishers/*/models/gemini-?" }, options: {} }, context), true)
  assert.equal(matchesFastOptionRule({ match: { model: "google/*" }, options: {} }, context), false)
  assert.equal(matchesFastOptionRule({ match: { provider: "OpenAI-*" }, options: {} }, context), false)
  assert.equal(matchesFastOptionRule({ match: { model: "publishers/*/gemini-??" }, options: {} }, context), false)
})

test("fast option match fields use AND semantics and missing SDK cannot satisfy an SDK rule", () => {
  const rule: FastOptionRule = {
    match: { provider: "openai", model: "gpt-5.*", sdk: "@ai-sdk/openai*" },
    options: {},
  }
  assert.equal(matchesFastOptionRule(rule, { provider: "openai", model: "gpt-5.6-sol", sdk: "@ai-sdk/openai" }), true)
  assert.equal(matchesFastOptionRule(rule, { provider: "openai", model: "gpt-5.6-sol" }), false)
  assert.equal(matchesFastOptionRule(rule, { provider: "openai", model: "gpt-5.5", sdk: "@ai-sdk/anthropic" }), false)
})

test("matching rules deep-merge in declaration order without retaining mutable input references", () => {
  const base = {
    serviceTier: "standard",
    telemetry: { source: "host", retained: true },
    stop: ["BASE"],
    untouched: "keep",
  }
  const rules: FastOptionRule[] = [
    {
      match: { provider: "openai", model: "gpt-*" },
      options: { serviceTier: "priority", telemetry: { fast: true }, stop: ["FIRST"] },
    },
    {
      match: { sdk: "@ai-sdk/openai*" },
      options: { telemetry: { source: "rule" }, stop: ["SECOND"], nullable: null },
    },
    {
      match: { provider: "anthropic" },
      options: { ignored: true },
    },
  ]

  const result = mergeFastOptionRules(base, rules, {
    provider: "openai",
    model: "gpt-5.6-sol",
    sdk: "@ai-sdk/openai-compatible",
  })

  assert.deepEqual(result, {
    options: {
      serviceTier: "priority",
      telemetry: { source: "rule", retained: true, fast: true },
      stop: ["SECOND"],
      untouched: "keep",
      nullable: null,
    },
    matchedRuleIndexes: [0, 1],
  })
  ;(result.options.telemetry as Record<string, unknown>).source = "mutated"
  ;(result.options.stop as string[]).push("MUTATED")
  assert.deepEqual(base.telemetry, { source: "host", retained: true })
  assert.deepEqual(base.stop, ["BASE"])
  assert.deepEqual(rules[1]!.options, { telemetry: { source: "rule" }, stop: ["SECOND"], nullable: null })
})

test("deep merge preserves ordinary prototypes when an option owns __proto__", () => {
  const malicious = JSON.parse('{"nested":{"__proto__":{"polluted":true}}}') as Record<string, unknown>
  const result = mergeFastOptionRules(
    { nested: { safe: true } },
    [{ match: { provider: "openai" }, options: malicious }],
    { provider: "openai", model: "gpt-5.6-sol" },
  )
  const nested = result.options.nested as Record<string, unknown>

  assert.equal(Object.getPrototypeOf(nested), Object.prototype)
  assert.equal(Object.prototype.hasOwnProperty.call(nested, "__proto__"), true)
  assert.deepEqual(nested.__proto__, { polluted: true })
  assert.equal(nested.safe, true)
})
```

- [ ] **Step 2: Run the new test and verify module resolution fails**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/routing/fast-option-rules.test.ts
```

Expected: non-zero exit with `ERR_MODULE_NOT_FOUND` for `fast-option-rules.ts`.

- [ ] **Step 3: Implement the focused helper without external dependencies**

Create `src/routing/fast-option-rules.ts` with these public signatures and logic:

```ts
import type { FastOptionRule } from "../config/schema.ts"

export type FastOptionMatchContext = {
  provider: string
  model: string
  sdk?: string
}

export type FastOptionMergeResult = {
  options: Record<string, unknown>
  matchedRuleIndexes: number[]
}

function escapeRegExpCharacter(character: string): string {
  return /[\\^$.*+?()[\]{}|]/u.test(character) ? `\\${character}` : character
}

function wholeStringGlobMatches(pattern: string, value: string): boolean {
  const source = Array.from(pattern, (character) => {
    if (character === "*") return ".*"
    if (character === "?") return "."
    return escapeRegExpCharacter(character)
  }).join("")
  return new RegExp(`^(?:${source})$`, "su").test(value)
}

export function matchesFastOptionRule(rule: FastOptionRule, context: FastOptionMatchContext): boolean {
  const { provider, model, sdk } = rule.match
  if (provider !== undefined && !wholeStringGlobMatches(provider, context.provider)) return false
  if (model !== undefined && !wholeStringGlobMatches(model, context.model)) return false
  if (sdk !== undefined && (context.sdk === undefined || !wholeStringGlobMatches(sdk, context.sdk))) return false
  return true
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function cloneOptionValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneOptionValue)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneOptionValue(child)]))
}

function mergeOptionValue(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return cloneOptionValue(override)
  const merged = cloneOptionValue(base) as Record<string, unknown>
  for (const [key, value] of Object.entries(override)) {
    const baseValue = Object.prototype.hasOwnProperty.call(base, key) ? base[key] : undefined
    Object.defineProperty(merged, key, {
      value: mergeOptionValue(baseValue, value),
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return merged
}

export function mergeFastOptionRules(
  baseOptions: Readonly<Record<string, unknown>>,
  rules: readonly FastOptionRule[],
  context: FastOptionMatchContext,
): FastOptionMergeResult {
  let options = cloneOptionValue(baseOptions) as Record<string, unknown>
  const matchedRuleIndexes: number[] = []
  rules.forEach((rule, index) => {
    if (!matchesFastOptionRule(rule, context)) return
    matchedRuleIndexes.push(index)
    options = mergeOptionValue(options, rule.options) as Record<string, unknown>
  })
  return { options, matchedRuleIndexes }
}
```

This helper deliberately treats only plain objects as recursively mergeable, replaces arrays/scalars/null, and returns fresh arrays/plain objects for both base and rule values.

- [ ] **Step 4: Run the pure helper tests**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/routing/fast-option-rules.test.ts
```

Expected: exit `0`; four named tests pass and the summary reports `fail 0`, including the own-`__proto__` prototype-preservation regression.

**Review boundary:** The pure matcher/merge unit can be reviewed independently from routing and hooks. Committing it requires separate user authorization.

### Task 3: Publish an explicit fast-path decision and immutable rule snapshot

**Files:**
- Modify: `src/shared/types.ts:71-83`
- Modify: `src/routing/effective-route.ts:66-180`
- Modify: `src/routing/effective-route.test.ts:4-17, 47-152, 256-311`
- Modify: `src/routing/route-registry.ts:1-38`
- Modify: `src/routing/route-registry.test.ts:4-19, 131-178`
- Modify: `src/hooks/config.test.ts:1480-1592, 1650-1689, 1815`
- Modify: `src/hooks/chat-params.test.ts:77-222` (manual route fixtures only in this task)
- Modify: `src/index.test.ts:124-301` (add `rules: []` to existing typed `fastModels` overrides)
- Modify: `src/runtime-fallback/event-handler-test-fixtures.ts:133-147`
- Modify: `src/runtime-fallback/event-handler-fallback-dispatch.test.ts:23-36`
- Modify: `src/runtime-fallback/event-handler-failed-model-resolution.test.ts:10-23`

**Interfaces:**
- Consumes: `FastModelsConfig.rules`, selected `provider/model`, catalog membership, existing effective-route publication.
- Produces: `FastPath`, required `EffectiveModelRoute.fastPath`, and `selectFastPath(args): FastPath`; option-mode routes carry the exact effective rule array that `chat.params` will consume.

- [ ] **Step 1: Replace candidate tests with failing fast-path precedence tests**

In `src/routing/effective-route.test.ts`, replace the `selectFastCandidate` import/expectations with `selectFastPath` and ensure the test helper includes `rules: []`:

```ts
const fastModels = (overrides: Partial<FastModelsConfig> = {}): FastModelsConfig => ({
  providers: [],
  mappings: {},
  rules: [],
  ...overrides,
})

const optionRules: FastModelsConfig["rules"] = [
  { match: { model: "gpt-*" }, options: { serviceTier: "priority" } },
]

test("fast path keeps allowlisted explicit mappings authoritative, including slash-containing IDs", () => {
  assert.deepEqual(selectFastPath({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels({
      providers: ["openai"],
      mappings: { "openai/gpt-5.6": "publishers/google/models/gemini-fast" },
      rules: optionRules,
    }),
  }), { kind: "model", modelID: "publishers/google/models/gemini-fast" })
})

test("self mappings and already-fast models are authoritative off paths", () => {
  assert.deepEqual(selectFastPath({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels({
      providers: ["openai"],
      mappings: { "openai/gpt-5.6": "gpt-5.6" },
      rules: optionRules,
    }),
    catalogModels: new Set(["gpt-5.6-fast"]),
  }), { kind: "off" })
  assert.deepEqual(selectFastPath({
    selectedModel: "outside/gpt-5.6-fast",
    fastMode: true,
    fastModels: fastModels({ rules: optionRules }),
  }), { kind: "off" })
})

test("an allowlisted mapping may promote an already-fast selected model before the no-op check", () => {
  assert.deepEqual(selectFastPath({
    selectedModel: "openai/gpt-5.6-fast",
    fastMode: true,
    fastModels: fastModels({
      providers: ["openai"],
      mappings: { "openai/gpt-5.6-fast": "gpt-5.6-turbo" },
      rules: optionRules,
    }),
  }), { kind: "model", modelID: "gpt-5.6-turbo" })
})

test("catalog suffix promotion wins before option mode", () => {
  assert.deepEqual(selectFastPath({
    selectedModel: "openai/gpt-5.6",
    fastMode: true,
    fastModels: fastModels({ providers: ["openai"], rules: optionRules }),
    catalogModels: new Set(["gpt-5.6-fast"]),
  }), { kind: "model", modelID: "gpt-5.6-fast" })
})

test("an unallowlisted provider and an allowlisted catalog miss enter independent option mode", () => {
  for (const fastModelsConfig of [
    fastModels({
      providers: [],
      mappings: { "openai/gpt-5.6": "gpt-5.6-turbo" },
      rules: optionRules,
    }),
    fastModels({ providers: ["OpenAI"], rules: optionRules }),
    fastModels({ providers: ["openai"], rules: optionRules }),
  ]) {
    assert.deepEqual(selectFastPath({
      selectedModel: "openai/gpt-5.6",
      fastMode: true,
      fastModels: fastModelsConfig,
      catalogModels: new Set(),
    }), { kind: "options", rules: optionRules })
  }
})

test("disabled fast mode and invalid selected identities stay off", () => {
  assert.deepEqual(selectFastPath({
    selectedModel: "openai/gpt-5.6",
    fastMode: false,
    fastModels: fastModels({ rules: optionRules }),
  }), { kind: "off" })
  for (const selectedModel of ["gpt-5.6", "/gpt-5.6", "openai/"]) {
    assert.deepEqual(selectFastPath({
      selectedModel,
      fastMode: true,
      fastModels: fastModels({ rules: optionRules }),
    }), { kind: "off" })
  }
})
```

Add a route-construction assertion that an option path changes neither model nor fallback chain:

```ts
test("an option fast path leaves model and requirement unchanged while carrying effective rules", () => {
  const requirement: ModelRequirement = {
    fallbackChain: [{ providers: ["outside"], model: "model" }],
  }
  const route = buildEffectiveModelRoute({
    selectedModel: "outside/model",
    requirement,
    requirementSource: "user-config",
    primarySource: "user-requirement",
    fastMode: true,
    fastModels: fastModels({ rules: optionRules }),
  })
  assert.equal(route.model, "outside/model")
  assert.deepEqual(route.requirement.fallbackChain, [{ providers: ["outside"], model: "model" }])
  assert.deepEqual(route.fastPath, { kind: "options", rules: optionRules })
})
```

Update the existing promoted-route expected object to include:

```ts
fastPath: { kind: "model", modelID: "original-fast" },
```

- [ ] **Step 2: Run the route test and verify the richer API is missing**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/routing/effective-route.test.ts
```

Expected: non-zero exit because `selectFastPath` and `EffectiveModelRoute.fastPath` do not exist.

- [ ] **Step 3: Define the discriminant and implement precedence without changing fallback transformation**

Add to `src/shared/types.ts`:

```ts
import type { FastOptionRule } from "../config/schema.ts"

export type FastPath =
  | Readonly<{ kind: "off" }>
  | Readonly<{ kind: "model"; modelID: string }>
  | Readonly<{ kind: "options"; rules: readonly FastOptionRule[] }>

export type EffectiveModelRoute = {
  readonly model: string
  readonly requirement: ModelRequirement
  readonly requirementSource: RequirementSource
  readonly primarySource: PrimarySource
  readonly fastPath: FastPath
}
```

Add `FastPath` to the existing type import from `src/shared/types.ts`, then replace `selectFastCandidate` in `src/routing/effective-route.ts` with:

```ts
export function selectFastPath(args: {
  selectedModel: string
  fastMode: boolean
  fastModels: FastModelsConfig
  catalogModels?: ReadonlySet<string>
}): FastPath {
  if (!args.fastMode) return { kind: "off" }
  const selected = parseSelectedModelIdentity(args.selectedModel)
  if (!selected) return { kind: "off" }

  const promotionAllowed = args.fastModels.providers?.includes(selected.providerID) ?? false
  const mappings = args.fastModels.mappings ?? {}
  if (promotionAllowed && Object.prototype.hasOwnProperty.call(mappings, args.selectedModel)) {
    const modelID = mappedCandidate(mappings[args.selectedModel]!, selected)
    return modelID ? { kind: "model", modelID } : { kind: "off" }
  }

  if (selected.modelID.endsWith("-fast")) return { kind: "off" }
  if (promotionAllowed) {
    const modelID = `${selected.modelID}-fast`
    if (args.catalogModels?.has(modelID)) return { kind: "model", modelID }
  }

  return { kind: "options", rules: args.fastModels.rules ?? [] }
}
```

In `buildEffectiveModelRoute`, call `selectFastPath(args)`. Return `fastPath` on every route; only `kind === "model"` prepends a promoted entry and changes `route.model`:

```ts
const fastPath = selectFastPath(args)
const selected = parseSelectedModelIdentity(args.selectedModel)

if (fastPath.kind !== "model" || !selected) {
  return {
    model: args.selectedModel,
    requirement,
    requirementSource: args.requirementSource,
    primarySource: args.primarySource,
    fastPath,
  }
}

const original = requirement.fallbackChain[0]!
const fast = { ...cloneEntry(original), providers: [selected.providerID], model: fastPath.modelID }
return {
  model: `${selected.providerID}/${fastPath.modelID}`,
  requirement: {
    ...requirement,
    fallbackChain: stableDedupe([fast, ...requirement.fallbackChain]),
  },
  requirementSource: args.requirementSource,
  primarySource: args.primarySource,
  fastPath,
}
```

- [ ] **Step 4: Add failing registry snapshot tests for nested rule isolation**

Make the `route()` helper in `src/routing/route-registry.test.ts` explicitly off by default, then add:

```ts
const route = (model: string): EffectiveModelRoute => ({
  model,
  requirement: {
    fallbackChain: [{ providers: ["openai"], model: "fallback", thinking: { type: "enabled", budgetTokens: 32 } }],
    requiresProvider: ["openai"],
  },
  requirementSource: "agent-default",
  primarySource: "builtin-requirement",
  fastPath: { kind: "off" },
})

test("publishing option rules clones and freezes nested route metadata", () => {
  const registry = createEffectiveRouteRegistry()
  const mutableOptions = { telemetry: { fast: true }, stop: ["END"] }
  const inputRoute: EffectiveModelRoute = {
    ...route("openai/gpt-5.6-sol"),
    fastPath: {
      kind: "options",
      rules: [{ match: { sdk: "@ai-sdk/openai*" }, options: mutableOptions }],
    },
  }
  assert.equal(registry.publish(registry.beginBuild(), new Map([["builder", inputRoute]])), true)
  const published = registry.snapshot().routes.get("builder")!
  assert.equal(published.fastPath.kind, "options")
  if (published.fastPath.kind !== "options") assert.fail("expected option fast path")

  mutableOptions.telemetry.fast = false
  mutableOptions.stop.push("MUTATED")
  assert.deepEqual(published.fastPath.rules[0]!.options, {
    telemetry: { fast: true },
    stop: ["END"],
  })
  assert.throws(() => {
    ;(published.fastPath.rules[0]!.options.telemetry as Record<string, unknown>).fast = false
  })
  assert.throws(() => {
    ;(published.fastPath.rules[0]!.options.stop as string[]).push("MUTATED")
  })
})
```

- [ ] **Step 5: Run the registry test and verify nested metadata is not yet supported**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/routing/route-registry.test.ts
```

Expected: non-zero exit because the registry does not yet clone/freeze `fastPath.rules` and nested option values.

- [ ] **Step 6: Deep-clone/freeze `fastPath` during atomic publication**

In `src/routing/route-registry.ts`, add `FastPath` to the type import and implement generic JSON-like cloning for rule options:

```ts
function cloneAndFreezeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneAndFreezeUnknown))
  if (value === null || typeof value !== "object") return value
  return Object.freeze(Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, cloneAndFreezeUnknown(child)]),
  ))
}

function cloneAndFreezeFastPath(fastPath: FastPath): FastPath {
  if (fastPath.kind !== "options") return Object.freeze({ ...fastPath })
  const rules = freezeArray(fastPath.rules.map((rule) => Object.freeze({
    match: Object.freeze({ ...rule.match }),
    options: cloneAndFreezeUnknown(rule.options) as Record<string, unknown>,
  })))
  return Object.freeze({ kind: "options", rules })
}
```

Include the frozen path in `cloneAndFreezeRoute`:

```ts
return Object.freeze({
  ...route,
  requirement: Object.freeze(requirement),
  fastPath: cloneAndFreezeFastPath(route.fastPath),
}) as EffectiveModelRoute
```

- [ ] **Step 7: Make every manual route and typed fast-model fixture explicit**

Add this property to manually constructed non-option routes in the three runtime-fallback fixture files listed above:

```ts
fastPath: { kind: "off" },
```

Apply these exact `src/hooks/chat-params.test.ts` fixture values:

```ts
// "uses a published route rather than contradictory raw config"
fastPath: { kind: "off" },

// initial and replacement routes in "retains the last published route..."
fastPath: { kind: "model", modelID: "gpt-5.4-mini-fast" },
fastPath: { kind: "model", modelID: "gpt-5.4-mini-v2-fast" },

// "treats a published user requirement as explicit..."
fastPath: { kind: "off" },

// "matches published fast, original, and later fallback controls..."
fastPath: { kind: "model", modelID: "gpt-5.4-mini-fast" },
```

Add `rules: []` to the seven typed/spread `fastModels` overrides currently at `src/hooks/config.test.ts:1484, 1524, 1554, 1576, 1654, 1676, 1815` and the three overrides at `src/index.test.ts:126, 241, 274`. Raw parser inputs in schema/profile tests continue omitting `rules` where they intentionally verify defaults.

- [ ] **Step 8: Add config-hook integration coverage for option eligibility and unmanaged isolation**

Add to `src/hooks/config.test.ts`:

```ts
test("registry-managed fast option routes do not require the model-promotion allowlist", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const rules = [{
    match: { provider: "outside", sdk: "@ai-sdk/outside" },
    options: { serviceTier: "priority" },
  }]
  const config = {
    ...defaultConfig(),
    fastModels: { providers: [], mappings: {}, rules },
    agents: { worker: { model: "outside/model" } },
  }
  const unrelated = { model: "outside/unmanaged", nested: { untouched: true } }
  const target = { agent: { unrelated: structuredClone(unrelated) }, provider: { outside: { models: {} } } }

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => true,
  })(target, undefined)

  assert.equal((target.agent.worker as Record<string, unknown>).model, "outside/model")
  assert.deepEqual(publishedRoute(routeRegistry, "worker").fastPath, { kind: "options", rules })
  assert.deepEqual(target.agent.unrelated, unrelated)
  assert.equal(routeRegistry.snapshot().routes.has("unrelated"), false)
})
```

- [ ] **Step 9: Run route, registry, config, fallback, and type gates**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/routing/effective-route.test.ts
node --test --experimental-strip-types --test-reporter=spec src/routing/route-registry.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/event-handler-fallback-dispatch.test.ts src/runtime-fallback/event-handler-failed-model-resolution.test.ts
pnpm run typecheck
```

Expected: every command exits `0`; test summaries report `fail 0`; TypeScript reports no missing `fastPath` or `rules` properties and exits without diagnostics.

**Review boundary:** Fast-path selection, route publication, and fixture migration form one cross-module contract. Committing it requires separate user authorization.

### Task 4: Apply option rules in `chat.params` using actual runtime identity

**Files:**
- Modify: `src/hooks/chat-params.ts:16-18, 185-232, 240-440`
- Modify: `src/hooks/chat-params.test.ts:26-43, 77-222, 292-703`

**Interfaces:**
- Consumes: One `EffectiveRouteRegistry.snapshot()`, `route.fastPath`, `mergeFastOptionRules(...)`, and raw OpenCode `model.api.npm`.
- Produces: Normalized `ChatParamsInput.model.sdk?: string` and option injection that executes only for `route.fastPath.kind === "options"`; configured options win ordinary options while `applyReviewOutputFloor` remains the final protected write.

- [ ] **Step 1: Extend the test input builder with the real SDK surface**

Add `sdk?: string` to `makeInput` overrides and emit the OpenCode shape rather than an internal shortcut:

```ts
function makeInput(overrides?: Partial<{
  sessionID: string
  agentName: string
  providerID: string
  modelID: string
  sdk: string
  variant: string
}>) {
  return {
    sessionID: overrides?.sessionID ?? "sess-1",
    agent: { name: overrides?.agentName ?? "reviewer" },
    model: {
      providerID: overrides?.providerID ?? "openai",
      modelID: overrides?.modelID ?? "gpt-5.5",
      ...(overrides?.sdk ? { api: { npm: overrides.sdk } } : {}),
    },
    provider: { id: overrides?.providerID ?? "openai" },
    message: overrides?.variant ? { variant: overrides.variant } : {},
  }
}
```

- [ ] **Step 2: Write failing integration tests for merge order, actual fallback identity, gating, and floors**

Add these tests to `src/hooks/chat-params.test.ts` (use the existing `publishRoutes` helper):

```ts
test("chat.params merges ordered option rules over ordinary options using provider model and model.api.npm", async () => {
  const registry = createEffectiveRouteRegistry()
  const rules = [
    {
      match: { provider: "open*", model: "gpt-5.?-*", sdk: "@ai-sdk/openai*" },
      options: { serviceTier: "priority", telemetry: { fast: true }, stop: ["FIRST"] },
    },
    {
      match: { model: "gpt-5.6-*" },
      options: { telemetry: { source: "rule" }, stop: ["SECOND"], nullable: null },
    },
  ]
  publishRoutes(registry, new Map<string, EffectiveModelRoute>([["builder", {
    model: "openai/gpt-5.6-sol",
    requirement: { fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }] },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "options", rules },
  }]]))
  const baseOptions = {
    serviceTier: "standard",
    telemetry: { source: "host", retained: true },
    stop: ["BASE"],
    untouched: "keep",
  }
  const output = { options: baseOptions }

  await createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })(
    makeInput({ agentName: "builder", modelID: "gpt-5.6-sol", sdk: "@ai-sdk/openai-compatible" }),
    output,
  )

  assert.deepEqual(output.options, {
    serviceTier: "priority",
    telemetry: { source: "rule", retained: true, fast: true },
    stop: ["SECOND"],
    untouched: "keep",
    nullable: null,
  })
  ;(output.options.telemetry as Record<string, unknown>).source = "mutated"
  assert.deepEqual(baseOptions.telemetry, { source: "host", retained: true })
  assert.deepEqual(rules[1]!.options.telemetry, { source: "rule" })
})

test("chat.params re-matches option rules against each actual runtime fallback identity", async () => {
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map<string, EffectiveModelRoute>([["builder", {
    model: "openai/gpt-5.6-sol",
    requirement: { fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol" },
      { providers: ["anthropic"], model: "claude-sonnet-4-6" },
    ] },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: {
      kind: "options",
      rules: [{
        match: { provider: "anthropic", model: "claude-*", sdk: "@ai-sdk/anthropic" },
        options: { serviceTier: "priority" },
      }],
    },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const fallback = { options: {} as Record<string, unknown> }
  await handler(makeInput({
    agentName: "builder",
    providerID: "anthropic",
    modelID: "claude-sonnet-4-6",
    sdk: "@ai-sdk/anthropic",
  }), fallback)
  assert.equal(fallback.options.serviceTier, "priority")

  const primary = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.6-sol", sdk: "@ai-sdk/openai" }), primary)
  assert.equal(primary.options.serviceTier, undefined)

  const missingSdk = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", providerID: "anthropic", modelID: "claude-sonnet-4-6" }), missingSdk)
  assert.equal(missingSdk.options.serviceTier, undefined)
})

test("chat.params option fallback is gated by the published fast path and managed route", async () => {
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map<string, EffectiveModelRoute>([
    ["off-worker", {
      model: "openai/gpt-5.6-sol",
      requirement: { fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }] },
      requirementSource: "user-config",
      primarySource: "user-requirement",
      fastPath: { kind: "off" },
    }],
    ["model-worker", {
      model: "openai/gpt-5.6-sol-fast",
      requirement: { fallbackChain: [
        { providers: ["openai"], model: "gpt-5.6-sol-fast" },
        { providers: ["openai"], model: "gpt-5.6-sol" },
      ] },
      requirementSource: "user-config",
      primarySource: "user-requirement",
      fastPath: { kind: "model", modelID: "gpt-5.6-sol-fast" },
    }],
  ]))
  const configWithCatchAll = OcmmConfigSchema.parse({
    fastModels: {
      rules: [{ match: { model: "*" }, options: { shouldNotAppear: true } }],
    },
  })
  const handler = createChatParamsHandler({ getConfig: () => configWithCatchAll, routeRegistry: registry })
  for (const [agentName, modelID] of [
    ["off-worker", "gpt-5.6-sol"],
    ["model-worker", "gpt-5.6-sol-fast"],
    ["unmanaged", "gpt-5.6-sol"],
  ] as const) {
    const output = { options: {} as Record<string, unknown> }
    await handler(makeInput({ agentName, modelID, sdk: "@ai-sdk/openai" }), output)
    assert.equal(output.options.shouldNotAppear, undefined, agentName)
  }
})

test("chat.params applies review and plan-critic floors after option rules", async () => {
  const registry = createEffectiveRouteRegistry()
  const routes = new Map<string, EffectiveModelRoute>()
  for (const agentName of ["reviewer", "plan-critic"] as const) {
    routes.set(agentName, {
      model: "openai/gpt-5.5",
      requirement: { fallbackChain: [{ providers: ["openai"], model: "gpt-5.5", variant: "minimal" }] },
      requirementSource: "user-config",
      primarySource: "user-requirement",
      fastPath: {
        kind: "options",
        rules: [{ match: { sdk: "@ai-sdk/openai" }, options: { reasoningEffort: "low", serviceTier: "priority" } }],
      },
    })
  }
  publishRoutes(registry, routes)
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })
  for (const agentName of ["reviewer", "plan-critic"] as const) {
    const output = { options: {} as Record<string, unknown> }
    await handler(makeInput({ agentName, sdk: "@ai-sdk/openai" }), output)
    assert.equal(output.options.serviceTier, "priority", agentName)
    assert.equal(output.options.reasoningEffort, "xhigh", agentName)
  }
})
```

- [ ] **Step 3: Run the focused hook test and verify option injection is absent**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-params.test.ts
```

Expected: non-zero exit; new assertions report missing `serviceTier`/merged values because `model.api.npm` is not retained and route rules are not applied.

- [ ] **Step 4: Normalize only the supported SDK identifier**

Change the normalized input type in `src/hooks/chat-params.ts`:

```ts
type ChatParamsInput = {
  sessionID: string
  agent: { name?: string } | string
  model: { providerID: string; modelID: string; sdk?: string }
  provider: { id: string }
  message: { variant?: string }
}
```

In `readInput`, read only `raw.model.api.npm`:

```ts
const sdk = isRecord(raw.model.api) && typeof raw.model.api.npm === "string"
  ? raw.model.api.npm
  : undefined

return {
  sessionID,
  agent: { name: agentName ?? "" },
  model: { providerID, modelID, ...(sdk !== undefined ? { sdk } : {}) },
  provider: { id: typeof raw.provider === "object" && raw.provider && "id" in raw.provider ? String((raw.provider as Record<string, unknown>).id ?? providerID) : providerID },
  message: { variant: typeof message.variant === "string" ? message.variant : undefined },
}
```

Do not copy `raw.provider.info` or any other provider metadata.

- [ ] **Step 5: Merge snapshot rules at both handler exits and keep floors last**

Import `mergeFastOptionRules` and `EffectiveModelRoute`, then add:

```ts
function applyFastOptionRoute(args: {
  route: EffectiveModelRoute | undefined
  input: ChatParamsInput
  output: ChatParamsOutput
}): number[] {
  if (args.route?.fastPath.kind !== "options") return []
  const merged = mergeFastOptionRules(
    args.output.options,
    args.route.fastPath.rules,
    {
      provider: args.input.model.providerID,
      model: args.input.model.modelID,
      ...(args.input.model.sdk !== undefined ? { sdk: args.input.model.sdk } : {}),
    },
  )
  args.output.options = merged.options
  return merged.matchedRuleIndexes
}
```

In the `!resolution` branch, call it before `applyHostProfileReviewFloor` so protected host-profile floors still write last:

```ts
if (!resolution) {
  applyFastOptionRoute({ route, input, output })
  const hostFloor = applyHostProfileReviewFloor({ agentName, input, output })
```

Insert only the `applyFastOptionRoute(...)` line between the existing `if (!resolution)` opening and the existing `const hostFloor` line; leave the already-tested host-floor and resolution-ledger branches unchanged.

In the normal branch, call it after the ordinary variant/entry writes and immediately before the existing final floor:

```ts
if (resolution.entry.maxTokens !== undefined && resolution.entry.maxTokens > 0) {
  output.maxOutputTokens = resolution.entry.maxTokens
}
applyFastOptionRoute({ route, input, output })
applyReviewOutputFloor({
  agentName,
  family,
  modelID: input.model.modelID,
  appliedVariant,
  outputOptions: output.options,
})
```

Do not add option values to either debug log. If matched indexes are later logged, log only the numeric indexes/count and the route path.

- [ ] **Step 6: Run hook tests and typecheck**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-params.test.ts
pnpm run typecheck
```

Expected: both commands exit `0`; the hook suite reports `fail 0`; floor assertions remain `xhigh`; TypeScript reports no diagnostics.

**Review boundary:** Runtime SDK normalization, option application, and protected-floor ordering are one behavior unit. Committing it requires separate user authorization.

### Task 5: Prove reload publication and synchronize user-facing documentation

**Files:**
- Modify: `src/index.test.ts:124-301`
- Modify: `README.md:399-423, 812-836`
- Modify: `docs/architecture.md:286-289, 306-325, 333-349`
- Modify: `examples/ocmm.example.jsonc:15-23, 193-205`

**Interfaces:**
- Consumes: Real `createPlugin()` hooks, `reload()`, config-hook atomic publication, profile selection, and option-mode `chat.params` behavior from Tasks 1-4.
- Produces: End-to-end evidence that reload alone retains the old route snapshot, republishing swaps profile rules atomically, and user docs exactly describe the public contract.

- [ ] **Step 1: Write a failing real-surface reload test**

Add to `src/index.test.ts`:

```ts
test("plugin option rules use the published profile snapshot until config republishes after reload", async () => {
  const initialConfig = {
    fastModels: {
      providers: [],
      mappings: {},
      rules: [{ match: { sdk: "@ai-sdk/openai" }, options: { serviceTier: "root" } }],
    },
    profiles: {
      fast: {
        fastModels: {
          rules: [{ match: { sdk: "@ai-sdk/openai" }, options: { serviceTier: "flex" } }],
        },
      },
    },
    activeProfile: "fast",
    agents: { worker: { model: "openai/gpt-5.6-sol" } },
  }

  await withIsolatedConfig(initialConfig, async (cwd) => {
    const configPath = join(cwd, ".opencode", "ocmm.jsonc")
    const { pluginInterface, reload } = createPlugin({ directory: cwd })
    const publish = () => publishPluginConfig(pluginInterface, {
      agent: {},
      provider: { openai: { models: {} } },
    })
    let invocation = 0
    const invoke = async () => {
      const output = { options: {} as Record<string, unknown> }
      await pluginInterface["chat.params"]?.({
        sessionID: `fast-options-${++invocation}`,
        agent: { name: "worker" },
        model: {
          providerID: "openai",
          modelID: "gpt-5.6-sol",
          api: { npm: "@ai-sdk/openai" },
        },
        provider: { id: "openai" },
        message: {},
      }, output)
      return output.options.serviceTier
    }

    await publish()
    assert.equal(await invoke(), "flex")

    writeFileSync(configPath, JSON.stringify({
      ...initialConfig,
      profiles: {
        fast: {
          fastModels: {
            rules: [{ match: { sdk: "@ai-sdk/openai" }, options: { serviceTier: "priority" } }],
          },
        },
      },
    }))
    reload()

    assert.equal(await invoke(), "flex", "reload without config publication keeps the old snapshot")
    await publish()
    assert.equal(await invoke(), "priority", "successful config publication atomically replaces rules")
  }, { OCMM_FAST: "1" })
})
```

- [ ] **Step 2: Run the real-surface acceptance test against the integrated behavior**

Run:

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="published profile snapshot" src/index.test.ts
```

Expected: exit `0`; the named test observes `flex`, retained `flex`, then `priority`. This is an integration/acceptance test for the already TDD-developed units in Tasks 1-4, not a new production behavior implementation in Task 5.

- [ ] **Step 3: Document the complete public rule contract in README**

Extend the configuration example with an actual rule:

```jsonc
"fastModels": {
  "providers": ["openai"],
  "mappings": {
    "openai/<original-model>": "<provider-local-fast-model>"
  },
  "rules": [
    {
      "match": {
        "provider": "openai-*",
        "model": "gpt-5.*",
        "sdk": "@ai-sdk/openai*"
      },
      "options": { "serviceTier": "priority" }
    }
  ]
}
```

Add this prose to **Fast model routing**, after the existing mapping/suffix paragraphs:

```markdown
When fast mode is active and neither an authoritative mapping/no-op nor a catalog-backed `-fast` model handles an OCMM-managed route, `fastModels.rules` becomes the fallback. Rules do not use `fastModels.providers` as an allowlist; constrain them with `match.provider` instead. Unmanaged OpenCode agents and Codex are unchanged.

Each rule may match `provider`, `model`, and/or `sdk` (`model.api.npm` at runtime). Patterns are case-sensitive whole-string globs: `*` matches any number of characters including `/`, `?` matches exactly one character, and all declared fields must match. A rule that declares `sdk` does not match when SDK metadata is absent.

Every matching rule contributes in declaration order. Plain objects merge recursively, arrays/scalars/null replace earlier values, and later rules win. The merged rule options override ordinary provider/route `output.options`; OCMM's review and plan-critic reasoning floors remain the final protected write. Runtime fallbacks are re-matched against their actual provider, model, and SDK on every `chat.params` call.
```

Add `fastModels.rules` to the profile merge table as an explicitly replaced array and state that omitting it inherits root rules.

- [ ] **Step 4: Update architecture and example config without broadening scope**

In `docs/architecture.md`, document:

```markdown
- `config` resolves each managed route to `fastPath.kind = "off" | "model" | "options"`; option paths carry the effective rule array in the immutable registry snapshot.
- `chat.params` reads one snapshot, normalizes SDK identity only from `model.api.npm`, matches the actual runtime provider/model/SDK, merges option rules after ordinary route controls, then enforces review/plan-critic floors.
- `FastModelsConfig` is root `{providers, mappings, rules}` with empty defaults. Profile fields are optional; a declared `rules` array replaces the root array in full.
```

Add `fast-option-rules.ts` to the `routing/` code-layout description. Do not claim Codex parity.

In `examples/ocmm.example.jsonc`, use this root example:

```jsonc
"fastModels": {
  "providers": ["openai"],
  "mappings": {
    "openai/gpt-5.5": "gpt-5.5-fast"
  },
  "rules": [
    {
      "match": {
        "provider": "openai*",
        "model": "gpt-5.*",
        "sdk": "@ai-sdk/openai*"
      },
      "options": {
        "serviceTier": "priority",
        "telemetry": { "fast": true }
      }
    }
  ]
}
```

In the `precision` profile, include one complete replacement rule and update the comment:

```jsonc
// `providers` and `rules` arrays replace the root arrays; `mappings`
// deep-merges by qualified original-model key. Omitting `rules` inherits root rules.
"fastModels": {
  "providers": ["openai"],
  "mappings": {
    "openai/gpt-5.5": "gpt-5.5-fast"
  },
  "rules": [
    {
      "match": { "sdk": "@ai-sdk/openai-compatible" },
      "options": { "serviceTier": "flex" }
    }
  ]
}
```

- [ ] **Step 5: Run integration and documentation checks**

Run:

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/index.test.ts
node --input-type=module -e "import {readFileSync} from 'node:fs'; for (const [p, needles] of Object.entries({'README.md':['fastModels.rules','model.api.npm'],'docs/architecture.md':['fastPath','fast-option-rules.ts'],'examples/ocmm.example.jsonc':['rules','@ai-sdk/openai-compatible']})) { const s=readFileSync(p,'utf8'); for (const n of needles) if(!s.includes(n)) throw new Error(p+' missing '+n) } console.log('fast option docs synchronized')"
```

Expected: index tests exit `0` with `fail 0`; documentation check prints `fast option docs synchronized`.

**Review boundary:** Reload behavior plus public documentation is one externally observable surface. Committing it requires separate user authorization.

### Task 6: Run final cross-module verification and real-surface QA

**Files:**
- Verify: every TypeScript file listed in Tasks 1-5
- Verify: `schema.json`, `README.md`, `docs/architecture.md`, `examples/ocmm.example.jsonc`

**Interfaces:**
- Consumes: All task outputs and repository-standard verification commands.
- Produces: Reproducible evidence that focused behaviors, generated schema, types, all tests, build artifacts, diagnostics, and the real config/`chat.params` surface are clean.

- [ ] **Step 1: Prove generated schema is stable**

Run:

```powershell
$before = (Get-FileHash -Algorithm SHA256 schema.json).Hash; pnpm run gen-schema; if ($LASTEXITCODE -ne 0) { throw "gen-schema failed" }; $after = (Get-FileHash -Algorithm SHA256 schema.json).Hash; if ($before -ne $after) { throw "schema.json was stale before final verification" }; "schema.json is current"
```

Expected: exit `0` and `schema.json is current`.

- [ ] **Step 2: Run all focused suites in dependency order**

Run:

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/profiles.test.ts
node --test --experimental-strip-types --test-reporter=spec src/routing/fast-option-rules.test.ts
node --test --experimental-strip-types --test-reporter=spec src/routing/effective-route.test.ts src/routing/route-registry.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts
node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-params.test.ts
node --test --experimental-strip-types --test-reporter=spec src/runtime-fallback/event-handler-fallback-dispatch.test.ts src/runtime-fallback/event-handler-failed-model-resolution.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/index.test.ts
```

Expected: every process exits `0`; every summary reports `fail 0`. The index suite is the real-surface proof: it drives the existing config hook and `chat.params` hook without a live provider and observes `flex` → retained `flex` → `priority` across reload/republish.

- [ ] **Step 3: Require clean language-server diagnostics on changed TypeScript files**

Invoke the repository's `lsp_diagnostics` tool with `severity: "all"` for:

```text
src/config/schema.ts
src/config/schema.test.ts
src/config/profiles.test.ts
src/routing/fast-option-rules.ts
src/routing/fast-option-rules.test.ts
src/shared/types.ts
src/routing/effective-route.ts
src/routing/effective-route.test.ts
src/routing/route-registry.ts
src/routing/route-registry.test.ts
src/hooks/config.test.ts
src/hooks/chat-params.ts
src/hooks/chat-params.test.ts
src/index.test.ts
src/runtime-fallback/event-handler-test-fixtures.ts
src/runtime-fallback/event-handler-fallback-dispatch.test.ts
src/runtime-fallback/event-handler-failed-model-resolution.test.ts
```

Expected: no error/warning diagnostics on any changed TypeScript file. If the TypeScript language server is unavailable, do not install it; report this gate as blocked rather than claiming it passed, while still running `pnpm run typecheck` below.

- [ ] **Step 4: Run repository-wide type, test, and build gates**

Run each command after clearing ambient route/profile activation:

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run typecheck
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm test
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run build
```

Expected: each exits `0`; typecheck emits no TypeScript errors; `pnpm test` completes both TypeScript and Cargo suites; build emits TypeScript output and release/native LSP artifacts under `dist/` with no failure.

- [ ] **Step 5: Inspect scope, formatting, and secret-safe logging**

Run:

```powershell
git diff --check
git status --short
rg -n "fastModels\.rules|fastPath|matchedRuleIndexes" src README.md docs/architecture.md examples/ocmm.example.jsonc
$secretLogs = rg -n "log\.(debug|info|warn|error).*options|JSON\.stringify\([^\r\n]*options" src/hooks/chat-params.ts src/routing/fast-option-rules.ts; if ($LASTEXITCODE -eq 0) { $secretLogs; throw "option values may be logged" }; if ($LASTEXITCODE -ne 1) { throw "secret-log scan failed" }; "no option-value logging found"
$forbidden = git status --short -- prompts/v1 skills/v1 plugins .codex docs/v1-maintenance.md; if ($forbidden) { $forbidden; throw "out-of-scope workflow or Codex files changed" }; "no forbidden workflow/Codex changes"
```

Expected: `git diff --check` exits `0`; status contains only the planned files plus the pre-existing uncommitted design spec and this plan; the first search finds the intended implementation/docs; the final scans print `no option-value logging found` and `no forbidden workflow/Codex changes`.

**Final review boundary:** Stop after recording the command outputs, clean diagnostics result, and any blocked gate. Do not perform a git write; a future commit requires explicit user authorization.
