# Fast Default Rules Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, snapshotted `fastModels.defaultRules` policy that injects SDK-correct OpenAI Priority Processing options for eligible numeric GPT runtime models while preserving user-rule precedence, route behavior, reload atomicity, and protected reasoning floors.

**Architecture:** Extend the root/profile Zod contract with one scalar switch, carry that switch only on `FastPath.kind === "options"`, and clone/freeze it inside the existing generation-safe route registry. Keep model/SDK eligibility in a pure resolver in `src/routing/fast-option-rules.ts`; `chat.params` evaluates the resolver against the actual runtime fallback identity, merges ordinary options → built-ins → ordered user rules, and applies reviewer/plan-critic floors last.

**Tech Stack:** TypeScript 6, Node.js 22+ built-in test runner, Zod 4, pnpm, immutable effective-route snapshots, Cargo/Rust for the repository-wide LSP gate, Windows PowerShell.

**Global Constraints:**
- Run every command with Windows PowerShell syntax. Clear `OCMM_PROFILE`, `OCMM_NO_PROFILE`, and `OCMM_FAST` before every test, typecheck, schema, or build command unless an existing test helper deliberately supplies one of them.
- Do not install software or dependencies.
- `fastModels.defaultRules` is opt-in and defaults to `false`; the profile field is optional and follows scalar overlay inheritance/override semantics.
- Support exactly `@ai-sdk/openai` with `{ serviceTier: "priority" }` and `@ai-sdk/openai-compatible` with `{ service_tier: "priority" }`; SDK matching is exact and case-sensitive.
- Match only lowercase `gpt-` followed immediately by a decimal major version of at least `4`; exclude exact tokens `nano`, `pro`, `realtime`, `audio`, `transcribe`, `image`, `search`, `tts`, `vision`, and `codex` after splitting on `.`, `_`, and `-`.
- Do not add network capability probes, dynamic capability discovery, public negative-glob syntax, non-GPT behavior, other SDKs, embeddings, fine-tuned/realtime/media/search/Codex support, or Codex-adapter changes.
- Preserve fast-path priority: disabled/invalid → `off`; allowlisted explicit mapping (including self-map) → `model`/`off`; already-`-fast` → `off`; allowlisted catalog suffix → `model`; only then → `options`.
- Built-ins apply only to a managed, published `options` path. Never apply them to fast-off, explicit/self mappings, already-fast models, catalog-promoted models, or unmanaged routes.
- `chat.params` must use one immutable route snapshot and the actual runtime `providerID`, `modelID`, and `model.api.npm`; it must not read live `cfg.fastModels.defaultRules` as a substitute.
- Merge precedence is ordinary route/hook options → built-in options → user `fastModels.rules` in declaration order → reviewer/plan-critic reasoning floors. User rules may overwrite or neutralize a built-in field; floors remain final authority.
- Do not log built-in or merged option values.
- Any `OcmmConfigSchema` change requires `pnpm run gen-schema`; include the generated root `schema.json` change in the same review unit.
- Do not modify `prompts/v1/`, `skills/v1/`, `docs/v1-maintenance.md`, generated Codex bundles, or unrelated runtime-fallback behavior.
- Do not execute `git add`, `git commit`, `git push`, `git tag`, or any other Git write command. The suggested final commit message is `feat: add opt-in fast default rules` and requires separate user authorization.
- If a live `oc.exe` locks a Windows LSP artifact, do not terminate it. Verify the build from an isolated working-tree copy or record the root build gate as blocked while preserving isolated-build evidence.

---

## File responsibility map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/config/schema.ts` | Modify | Root default and optional profile scalar schema for `fastModels.defaultRules`. |
| `src/config/schema.test.ts` | Modify | Strict boolean parsing, root defaults, and profile no-child-default contract. |
| `src/config/profiles.test.ts` | Modify | Profile enable/disable/inherit behavior while preserving rule-array replacement. |
| `schema.json` | Regenerate | Generated root/profile JSON Schema synchronized from Zod. |
| `src/routing/fast-option-rules.ts` | Modify | Pure numeric-GPT/SDK resolver and reusable non-mutating options-layer merge. |
| `src/routing/fast-option-rules.test.ts` | Modify | SDK/model support matrix, exclusions, case sensitivity, fresh-data behavior, and existing merge regressions. |
| `src/shared/types.ts` | Modify | Add snapshotted `defaultRules: boolean` to the `FastPath.options` discriminant. |
| `src/routing/effective-route.ts` | Modify | Copy parsed `defaultRules` into options paths without changing model-path priority. |
| `src/routing/effective-route.test.ts` | Modify | Boolean carriage plus off/model/options priority regression coverage. |
| `src/routing/route-registry.ts` | Modify | Clone/freeze the scalar together with option-path user rules. |
| `src/routing/route-registry.test.ts` | Modify | Snapshot isolation and freeze assertions for the scalar and nested rules. |
| `src/hooks/config.test.ts` | Modify | Config-hook publication of the complete options snapshot and typed-fixture synchronization. |
| `src/hooks/chat-params.ts` | Modify | Runtime built-in resolution and merge ordering before existing final floors. |
| `src/hooks/chat-params.test.ts` | Modify | SDK fields, user override/neutralization, runtime fallback re-match, gating, and floor authority. |
| `src/index.test.ts` | Modify | Real plugin reload/republish proof for an atomic profile switch/rule snapshot. |
| `README.md` | Modify | Public switch, exact SDK/model policy, precedence, and best-effort warning. |
| `docs/architecture.md` | Modify | Snapshot field and runtime resolver/merge data flow. |
| `examples/ocmm.example.jsonc` | Modify | Root opt-in and profile scalar override example. |

## Execution order

1. Task 1 establishes the parsed configuration and generated-schema contract.
2. Task 2 adds the independently testable pure resolver and merge primitive.
3. Task 3 carries the switch through route selection and atomic publication.
4. Task 4 consumes the snapshot at runtime and proves precedence, fallback matching, gating, and floors.
5. Task 5 proves reload/republish behavior through the plugin surface and synchronizes documentation.
6. Task 6 runs stability, focused, repository-wide, build, scope, and real-surface verification.

### Task 1: Add the strict root/profile configuration contract

**Files:**
- Modify: `src/config/schema.ts:224-274`
- Modify: `src/config/schema.test.ts:33-180`
- Modify: `src/config/profiles.test.ts:421-505`
- Regenerate: `schema.json:1106-1155,2252-2301`

**Interfaces:**
- Consumes: Existing `FastModelsConfigSchema`, `ProfileFastModelsConfigSchema`, `defaultConfig()`, and `deepMerge(..., { profileOverlay: true })` behavior.
- Produces: `FastModelsConfig.defaultRules: boolean` with root default `false`; profile `fastModels.defaultRules?: boolean` with no child default.

- [ ] **Step 1: Write failing root and profile schema tests**

Update all three root expectations in `fast model policy applies root defaults` so their exact value is:

```ts
{
  defaultRules: false,
  providers: [],
  mappings: {},
  rules: [],
}
```

Also add `defaultRules: false` to the expected parsed object in the existing `fast model policy validates root provider mappings and structured rules` mapping assertion:

```ts
{
  defaultRules: false,
  providers: ["openai"],
  mappings: {
    "openai/gpt-5.6-sol": "gpt-5.6-sol-fast",
    "openai/gpt-5.6-codex": "openai/gpt-5.6-codex-fast",
  },
  rules: [],
}
```

Add this focused strict-scalar test immediately after that test:

```ts
test("fast model default rules parse only explicit booleans", () => {
  assert.equal(OcmmConfigSchema.parse({ fastModels: { defaultRules: true } }).fastModels.defaultRules, true)
  assert.equal(OcmmConfigSchema.parse({ fastModels: { defaultRules: false } }).fastModels.defaultRules, false)

  for (const defaultRules of [0, 1, "true", "false", null, {}, []]) {
    assert.equal(
      OcmmConfigSchema.safeParse({ fastModels: { defaultRules } }).success,
      false,
      JSON.stringify(defaultRules),
    )
  }
})
```

In `fast model policy profile form is strict and partial without child defaults`, set the `fast` profile field and add an explicitly empty fast-model overlay:

```ts
profiles: {
  fast: {
    fastModels: {
      defaultRules: true,
      mappings: {
        "openai/gpt-5.6-sol": "openai/gpt-5.6-flash",
      },
      rules: [
        {
          match: { model: "gpt-5.6.*" },
          options: { reasoning: { effort: "minimal" } },
        },
      ],
    },
  },
  emptyFast: { fastModels: {} },
  empty: {},
},
```

Use these exact assertions for the new scalar behavior while retaining the existing mapping/rule assertions:

```ts
assert.equal(parsed.profiles.fast?.fastModels?.defaultRules, true)
assert.deepEqual(parsed.profiles.emptyFast?.fastModels, {})
assert.equal("defaultRules" in (parsed.profiles.emptyFast?.fastModels ?? {}), false)
assert.equal("fastModels" in (parsed.profiles.empty ?? {}), false)
```

- [ ] **Step 2: Write a failing profile overlay test for enable, disable, inherit, and unchanged rule replacement**

Add to `src/config/profiles.test.ts`:

```ts
test("profile fast default rules use scalar override while option rules keep array replacement", () => {
  const xdg = makeTempXdg()
  const rootRules = [{ match: { sdk: "@ai-sdk/openai" }, options: { source: "root" } }]
  const profileRules = [{ match: { sdk: "@ai-sdk/openai" }, options: { source: "profile" } }]
  try {
    writeConfig(xdg, {
      fastModels: { defaultRules: true, rules: rootRules },
      profiles: {
        disabled: { fastModels: { defaultRules: false, rules: profileRules } },
        inherited: { fastModels: { providers: ["profile-provider"] } },
      },
    })

    const disabled = loadPluginWithXdg(xdg, undefined, { OCMM_PROFILE: "disabled" })
    assert.equal(disabled.config.fastModels.defaultRules, false)
    assert.deepEqual(disabled.config.fastModels.rules, profileRules)

    const inherited = loadPluginWithXdg(xdg, undefined, { OCMM_PROFILE: "inherited" })
    assert.equal(inherited.config.fastModels.defaultRules, true)
    assert.deepEqual(inherited.config.fastModels.rules, rootRules)

    writeConfig(xdg, {
      fastModels: { defaultRules: false, rules: rootRules },
      profiles: {
        enabled: { fastModels: { defaultRules: true } },
      },
    })
    const enabled = loadPluginWithXdg(xdg, undefined, { OCMM_PROFILE: "enabled" })
    assert.equal(enabled.config.fastModels.defaultRules, true)
    assert.deepEqual(enabled.config.fastModels.rules, rootRules)
  } finally {
    rmSync(xdg, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/profiles.test.ts
```

Expected: both commands exit non-zero. The schema suite reports that `defaultRules` is absent/rejected, and the profile suite reports that the scalar does not survive parsing/overlay.

- [ ] **Step 4: Implement the minimal root/profile scalar schema**

Change `defaultFastModelsConfig` and both fast-model schemas in `src/config/schema.ts` to:

```ts
const defaultFastModelsConfig = () => ({
  defaultRules: false,
  providers: [],
  mappings: {},
  rules: [],
})

export const FastModelsConfigSchema = z
  .object({
    defaultRules: z.boolean().default(false),
    providers: z.array(z.string().min(1)).default([]),
    mappings: z.record(FastModelMappingKeySchema, FastModelMappingValueSchema).default({}),
    rules: z.array(FastOptionRuleSchema).default([]),
  })
  .strict()
  .default(defaultFastModelsConfig)

const ProfileFastModelsConfigSchema = z
  .object({
    defaultRules: z.boolean().optional(),
    providers: z.array(z.string().min(1)).optional(),
    mappings: z.record(FastModelMappingKeySchema, FastModelMappingValueSchema).optional(),
    rules: z.array(FastOptionRuleSchema).optional(),
  })
  .strict()
```

Do not add a profile `.default(...)`; `{ fastModels: {} }` must remain `{}` before overlay.

- [ ] **Step 5: Run the focused tests and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/profiles.test.ts
```

Expected: both commands exit `0`; both summaries report `fail 0`, including root `false`, strict boolean rejection, profile true/false overrides, omitted inheritance, and unchanged rule replacement/inheritance.

- [ ] **Step 6: Regenerate and inspect `schema.json`**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run gen-schema
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --input-type=module -e "import {readFileSync} from 'node:fs'; const s=JSON.parse(readFileSync('schema.json','utf8')); const root=s.properties.fastModels.properties.defaultRules; const profile=s.properties.profiles.additionalProperties.properties.fastModels.properties.defaultRules; if(root?.type!=='boolean'||profile?.type!=='boolean') throw new Error('defaultRules missing from root/profile schema'); console.log('fastModels.defaultRules present in root and profile schema')"
```

Expected: generation prints `wrote ...\schema.json`; inspection prints `fastModels.defaultRules present in root and profile schema`. Do not hand-edit the generated file.

**Review boundary:** Schema, profile overlay behavior, and generated schema are one independently reviewable unit. Do not perform a Git write.

### Task 2: Implement the pure built-in resolver

**Files:**
- Modify: `src/routing/fast-option-rules.ts:3-104`
- Modify: `src/routing/fast-option-rules.test.ts:4-131`

**Interfaces:**
- Consumes: Existing `FastOptionMatchContext = { provider: string; model: string; sdk?: string }`.
- Produces: `resolveDefaultFastOptions(context: FastOptionMatchContext): Record<string, unknown> | undefined` and `mergeFastOptions(baseOptions: Readonly<Record<string, unknown>>, overrideOptions: Readonly<Record<string, unknown>>): Record<string, unknown>`.

#### SDK output matrix

| Exact `context.sdk` | Eligible-model result | Field deliberately absent |
| --- | --- | --- |
| `@ai-sdk/openai` | `{ serviceTier: "priority" }` | `service_tier` |
| `@ai-sdk/openai-compatible` | `{ service_tier: "priority" }` | `serviceTier` |
| missing, case variant, or any other package | `undefined` | both fields |

#### Model support/exclusion matrix

| Classification | Representative IDs | Expected |
| --- | --- | --- |
| GPT 4/5 standard and mini | `gpt-4`, `gpt-4o`, `gpt-4.1-mini`, `gpt-5`, `gpt-5.6-sol` | Match |
| Snapshot | `gpt-5.6-sol-2026-07-28` | Match |
| Future numeric major | `gpt-42.3-2099-01-01` | Match automatically |
| Below floor | `gpt-3.5-turbo` | Reject |
| Wrong prefix/fine-tune/case | `claude-4`, `ft:gpt-5:tenant:model`, `GPT-5` | Reject |
| Excluded exact token | `gpt-5-nano`, `gpt-5.4-pro`, `gpt-5-realtime`, `gpt-5-audio`, `gpt-5-transcribe`, `gpt-5-image`, `gpt-5-search`, `gpt-5-tts`, `gpt-5-vision`, `gpt-5-codex` | Reject every row |

- [ ] **Step 1: Add failing resolver tests for both SDK fields, the complete model matrix, and fresh data**

Extend the import in `src/routing/fast-option-rules.test.ts`:

```ts
import {
  matchesFastOptionRule,
  mergeFastOptionRules,
  resolveDefaultFastOptions,
} from "./fast-option-rules.ts"
```

Add these tests before the existing glob/merge tests:

```ts
test("default fast options use the exact SDK-specific Priority field", () => {
  assert.deepEqual(resolveDefaultFastOptions({
    provider: "custom-openai",
    model: "gpt-5.6-sol",
    sdk: "@ai-sdk/openai",
  }), { serviceTier: "priority" })
  assert.deepEqual(resolveDefaultFastOptions({
    provider: "another-name",
    model: "gpt-5.6-sol",
    sdk: "@ai-sdk/openai-compatible",
  }), { service_tier: "priority" })

  for (const sdk of [undefined, "@AI-SDK/openai", "@ai-sdk/anthropic", "openai"]) {
    assert.equal(resolveDefaultFastOptions({
      provider: "openai",
      model: "gpt-5.6-sol",
      ...(sdk === undefined ? {} : { sdk }),
    }), undefined, String(sdk))
  }
})

test("default fast options accept standard, snapshot, mini, and future numeric GPT families", () => {
  for (const model of [
    "gpt-4",
    "gpt-4o",
    "gpt-4.1-mini",
    "gpt-5",
    "gpt-5.6-sol",
    "gpt-5.6-sol-2026-07-28",
    "gpt-42.3-2099-01-01",
  ]) {
    assert.deepEqual(
      resolveDefaultFastOptions({ provider: "openai", model, sdk: "@ai-sdk/openai" }),
      { serviceTier: "priority" },
      model,
    )
  }
})

test("default fast options reject old, non-GPT, fine-tuned, case-mismatched, and excluded models", () => {
  const excludedTokens = [
    "nano",
    "pro",
    "realtime",
    "audio",
    "transcribe",
    "image",
    "search",
    "tts",
    "vision",
    "codex",
  ]
  const rejectedModels = [
    "gpt-3.5-turbo",
    "claude-4",
    "ft:gpt-5:tenant:model",
    "GPT-5",
    ...excludedTokens.map((token) => `gpt-5-${token}`),
  ]

  for (const model of rejectedModels) {
    assert.equal(
      resolveDefaultFastOptions({ provider: "openai", model, sdk: "@ai-sdk/openai" }),
      undefined,
      model,
    )
  }
})

test("default fast options return fresh mutable data without retaining global state", () => {
  const context = { provider: "openai", model: "gpt-5.6-sol", sdk: "@ai-sdk/openai" }
  const first = resolveDefaultFastOptions(context)!
  const second = resolveDefaultFastOptions(context)!

  assert.notEqual(first, second)
  first.serviceTier = "mutated"
  assert.deepEqual(second, { serviceTier: "priority" })
  assert.deepEqual(resolveDefaultFastOptions(context), { serviceTier: "priority" })
})
```

- [ ] **Step 2: Run the pure suite and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/fast-option-rules.test.ts
```

Expected: non-zero exit because `resolveDefaultFastOptions` is not exported.

- [ ] **Step 3: Implement the pure model/SDK policy and expose the existing safe merge primitive**

Add these constants and functions after `FastOptionMergeResult`:

```ts
const DEFAULT_FAST_EXCLUDED_MODEL_TOKENS = new Set([
  "nano",
  "pro",
  "realtime",
  "audio",
  "transcribe",
  "image",
  "search",
  "tts",
  "vision",
  "codex",
])

function supportsDefaultFastOptions(model: string): boolean {
  const majorMatch = /^gpt-(\d+)/u.exec(model)
  if (!majorMatch || Number.parseInt(majorMatch[1]!, 10) < 4) return false
  return !model.split(/[._-]/u).some((token) => DEFAULT_FAST_EXCLUDED_MODEL_TOKENS.has(token))
}

export function resolveDefaultFastOptions(
  context: FastOptionMatchContext,
): Record<string, unknown> | undefined {
  if (!supportsDefaultFastOptions(context.model)) return undefined
  if (context.sdk === "@ai-sdk/openai") return { serviceTier: "priority" }
  if (context.sdk === "@ai-sdk/openai-compatible") return { service_tier: "priority" }
  return undefined
}
```

Rename the existing private `mergeOptions` function to this exported function, including its recursive call:

```ts
export function mergeFastOptions(
  baseOptions: Readonly<Record<string, unknown>>,
  overrideOptions: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const merged = cloneOptions(baseOptions)
  for (const key of Object.keys(overrideOptions)) {
    const overrideValue = ownValue(overrideOptions, key)
    const baseValue = ownValue(merged, key)
    defineValue(
      merged,
      key,
      isPlainObject(baseValue) && isPlainObject(overrideValue)
        ? mergeFastOptions(baseValue, overrideValue)
        : cloneOptionValue(overrideValue),
    )
  }
  return merged
}
```

Change the one call inside `mergeFastOptionRules` to:

```ts
options = mergeFastOptions(options, rule.options)
```

The resolver must not read configuration, environment, network, or module-level mutable state. It intentionally ignores the user-defined provider name and uses only exact SDK metadata plus the model policy.

- [ ] **Step 4: Run the pure suite and verify GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/fast-option-rules.test.ts
```

Expected: exit `0`; all new matrix/fresh-data tests and all existing glob, ordered deep-merge, cloning, and prototype-pollution regressions report `fail 0`.

**Review boundary:** The pure resolver and merge primitive can be reviewed without route or hook changes. Do not perform a Git write.

### Task 3: Carry and freeze the switch in the route snapshot

**Files:**
- Modify: `src/shared/types.ts:79-90`
- Modify: `src/routing/effective-route.ts:128-151`
- Modify: `src/routing/effective-route.test.ts:13-149,253-274`
- Modify: `src/routing/route-registry.ts:46-53`
- Modify: `src/routing/route-registry.test.ts:181-233`
- Modify: `src/hooks/config.test.ts:1480-1600,1602-1624,1682-1723,1845-1849`
- Modify: `src/hooks/chat-params.test.ts:231-420` (fixture shape only; behavior changes remain in Task 4)

**Interfaces:**
- Consumes: `FastModelsConfig.defaultRules`, existing `selectFastPath(...)`, and generation-safe `EffectiveRouteRegistry.publish(...)`.
- Produces: `Readonly<{ kind: "options"; defaultRules: boolean; rules: readonly FastOptionRule[] }>` and a deeply frozen published copy.

- [ ] **Step 1: Write failing fast-path carriage and priority assertions**

Update the helper in `src/routing/effective-route.test.ts`:

```ts
const fastModels = (overrides: Partial<FastModelsConfig> = {}): FastModelsConfig => ({
  defaultRules: false,
  providers: [],
  mappings: {},
  rules: [],
  ...overrides,
})
```

In `fast paths fall through to options for provider and catalog promotion misses`, configure every rule-bearing case with `defaultRules: true` and expect:

```ts
{ kind: "options", defaultRules: true, rules }
```

Keep the empty default case and expect:

```ts
{ kind: "options", defaultRules: false, rules: [] }
```

In `an options fast path leaves the selected model and materialized fallback chain unchanged`, use:

```ts
fastModels: fastModels({ defaultRules: true, rules }),
```

and assert:

```ts
assert.deepEqual(route.fastPath, { kind: "options", defaultRules: true, rules })
```

Retain unchanged expectations for disabled/invalid, explicit mapping, self-map, already-`-fast`, and catalog suffix tests. Their `off`/`model` results prove that the boolean is unavailable to runtime on higher-priority paths.

- [ ] **Step 2: Run the route suite and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/effective-route.test.ts
```

Expected: non-zero exit because option paths do not carry `defaultRules`.

- [ ] **Step 3: Extend `FastPath.options` and copy the parsed scalar**

Change only the options member in `src/shared/types.ts`:

```ts
export type FastPath =
  | Readonly<{ kind: "off" }>
  | Readonly<{ kind: "model"; modelID: string }>
  | Readonly<{
      kind: "options"
      defaultRules: boolean
      rules: readonly FastOptionRule[]
    }>
```

Change the final return in `selectFastPath`:

```ts
return {
  kind: "options",
  defaultRules: args.fastModels.defaultRules,
  rules: args.fastModels.rules,
}
```

Do not alter any earlier return or `buildEffectiveModelRoute` fallback transformation.

- [ ] **Step 4: Add failing registry clone/freeze assertions**

In `publishing deeply clones and freezes option fast paths`, construct and expect the full path:

```ts
fastPath: { kind: "options", defaultRules: true, rules },
```

```ts
assert.deepEqual(published.fastPath, {
  kind: "options",
  defaultRules: true,
  rules: [{
    match: { provider: "openai", model: "gpt-*" },
    options: Object.fromEntries([
      ["serviceTier", "flex"],
      ["nested", { enabled: true, presets: [{ name: "fast" }] }],
      ["__proto__", { mustRemainData: true }],
    ]),
  }],
})
```

After narrowing `published.fastPath.kind`, add:

```ts
assert.throws(() => {
  ;(published.fastPath as { defaultRules: boolean }).defaultRules = false
})
```

- [ ] **Step 5: Run the registry suite and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/route-registry.test.ts
```

Expected: non-zero exit because `cloneAndFreezeFastPath` omits the scalar.

- [ ] **Step 6: Clone/freeze the scalar with the existing user-rule snapshot**

Change the options return in `cloneAndFreezeFastPath` in `src/routing/route-registry.ts`:

```ts
return Object.freeze({
  kind: "options" as const,
  defaultRules: fastPath.defaultRules,
  rules: freezeArray(fastPath.rules.map(cloneAndFreezeFastOptionRule)),
})
```

No registry lifecycle, generation, map-view, or failure-retention code changes are needed.

- [ ] **Step 7: Synchronize complete typed fixtures and config publication coverage**

Add `defaultRules: false` to every complete `fastModels` replacement literal in `src/hooks/config.test.ts` at the current tests beginning near lines 1480, 1522, 1553, 1602, 1682, 1705, and 1845. For example:

```ts
fastModels: { defaultRules: false, providers: ["openai"], mappings: {}, rules: [] },
```

In `registry-managed registration publishes option fast paths without promoting models`, deliberately enable the feature:

```ts
fastModels: { defaultRules: true, providers: [], mappings: {}, rules },
```

and change the published-path assertion to:

```ts
assert.deepEqual(route.fastPath, { kind: "options", defaultRules: true, rules })
```

Add `defaultRules: false` to the three existing manual option paths in `src/hooks/chat-params.test.ts` that test only user-rule behavior (current tests near lines 231, 301, and 393):

```ts
fastPath: { kind: "options", defaultRules: false, rules },
```

For multiline paths, place `defaultRules: false` immediately after `kind: "options"`. Task 4 will deliberately switch selected fixtures to `true` when testing built-ins.

- [ ] **Step 8: Run route, registry, config-hook, chat fixture, and type gates**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/effective-route.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/route-registry.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-params.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run typecheck
```

Expected: every command exits `0`; test summaries report `fail 0`; TypeScript reports no missing `defaultRules` properties. Existing registry stale-generation and prior-snapshot retention tests remain green.

**Review boundary:** Route selection, immutable publication, and fixture migration form one cross-module snapshot contract. Do not perform a Git write.

### Task 4: Resolve and merge built-ins against the runtime identity

**Files:**
- Modify: `src/hooks/chat-params.ts:12,203-216,299-420`
- Modify: `src/hooks/chat-params.test.ts:231-420`

**Interfaces:**
- Consumes: `route.fastPath.defaultRules`, `resolveDefaultFastOptions(context)`, `mergeFastOptions(base, override)`, `mergeFastOptionRules(base, rules, context)`, and runtime `model.api.npm` already normalized as `input.model.sdk`.
- Produces: Runtime merge order `ordinary → built-in → user rules`, followed by the unchanged final `applyReviewOutputFloor(...)` authority.

- [ ] **Step 1: Add failing SDK-field and built-in-before-user tests**

Add to `src/hooks/chat-params.test.ts`:

```ts
test("chat.params applies only the SDK-specific built-in field over ordinary options", async () => {
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.6-sol",
    requirement: { fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }] },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "options", defaultRules: true, rules: [] },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const official = { options: { serviceTier: "standard" } as Record<string, unknown> }
  await handler(makeInput({
    agentName: "builder",
    modelID: "gpt-5.6-sol",
    sdk: "@ai-sdk/openai",
  }), official)
  assert.deepEqual(official.options, { serviceTier: "priority" })
  assert.equal(official.options.service_tier, undefined)

  const compatible = { options: { service_tier: "standard" } as Record<string, unknown> }
  await handler(makeInput({
    agentName: "builder",
    modelID: "gpt-5.6-sol",
    sdk: "@ai-sdk/openai-compatible",
  }), compatible)
  assert.deepEqual(compatible.options, { service_tier: "priority" })
  assert.equal(compatible.options.serviceTier, undefined)
})

test("chat.params applies ordered user rules after built-ins so users can override or reset them", async () => {
  const registry = createEffectiveRouteRegistry()
  const rules = [
    {
      match: { sdk: "@ai-sdk/openai" },
      options: { serviceTier: "flex", nested: { fromUser: true } },
    },
    {
      match: { model: "gpt-5.6-neutral" },
      options: { serviceTier: "default" },
    },
  ]
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.6-sol",
    requirement: { fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol" },
      { providers: ["openai"], model: "gpt-5.6-neutral" },
    ] },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "options", defaultRules: true, rules },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const overridden = { options: { nested: { ordinary: true } } as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.6-sol", sdk: "@ai-sdk/openai" }), overridden)
  assert.deepEqual(overridden.options, {
    serviceTier: "flex",
    nested: { ordinary: true, fromUser: true },
  })

  const reset = { options: {} as Record<string, unknown> }
  await handler(makeInput({ agentName: "builder", modelID: "gpt-5.6-neutral", sdk: "@ai-sdk/openai" }), reset)
  assert.equal(reset.options.serviceTier, "default")
})
```

- [ ] **Step 2: Add failing runtime-fallback, no-op, path-gating, and final-floor tests**

Add this runtime re-match test:

```ts
test("chat.params re-resolves built-ins for each actual runtime fallback model and SDK", async () => {
  const registry = createEffectiveRouteRegistry()
  publishRoutes(registry, new Map([["builder", {
    model: "openai/gpt-5.6-sol",
    requirement: { fallbackChain: [
      { providers: ["openai"], model: "gpt-5.6-sol" },
      { providers: ["compatible"], model: "gpt-42.3-2099-01-01" },
      { providers: ["openai"], model: "gpt-5-codex" },
    ] },
    requirementSource: "agent-default",
    primarySource: "builtin-requirement",
    fastPath: { kind: "options", defaultRules: true, rules: [] },
  }]]))
  const handler = createChatParamsHandler({ getConfig: defaultConfig, routeRegistry: registry })

  const futureFallback = { options: {} as Record<string, unknown> }
  await handler(makeInput({
    agentName: "builder",
    providerID: "compatible",
    modelID: "gpt-42.3-2099-01-01",
    sdk: "@ai-sdk/openai-compatible",
  }), futureFallback)
  assert.deepEqual(futureFallback.options, { service_tier: "priority" })

  for (const input of [
    { agentName: "builder", modelID: "gpt-5-codex", sdk: "@ai-sdk/openai" },
    { agentName: "builder", modelID: "gpt-5.6-sol" },
    { agentName: "builder", modelID: "gpt-5.6-sol", sdk: "@ai-sdk/anthropic" },
  ]) {
    const output = { options: { unchanged: true } as Record<string, unknown> }
    await handler(makeInput(input), output)
    assert.deepEqual(output.options, { unchanged: true }, JSON.stringify(input))
  }
})
```

Change `chat.params never applies live fast option rules to off, model, or unmanaged snapshot routes` so its live config contains both surfaces:

```ts
fastModels: {
  defaultRules: true,
  rules: [{ match: { provider: "*" }, options: { fromLiveConfig: true } }],
},
```

Pass `sdk: "@ai-sdk/openai"` for off/model/unmanaged invocations and assert both are absent:

```ts
assert.equal(output.options.fromLiveConfig, undefined)
assert.equal(output.options.serviceTier, undefined)
```

The `selectFastPath` tests from Task 3 map explicit/self/already-fast/catalog cases to these `off`/`model` gates; do not duplicate route construction inside the hook suite.

In `chat.params restores review and plan-critic reasoning floors after fast options`, set:

```ts
fastPath: {
  kind: "options",
  defaultRules: true,
  rules: [{
    match: { provider: "openai", model: "gpt-5.5" },
    options: { reasoningEffort: "low" },
  }],
},
```

Pass `sdk: "@ai-sdk/openai"` and retain/add these assertions:

```ts
assert.equal(output.options.serviceTier, "priority", `${agentName} service tier`)
assert.equal(output.options.reasoningEffort, "xhigh", `${agentName} reasoning floor`)
```

- [ ] **Step 3: Run the hook suite and verify RED**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-params.test.ts
```

Expected: non-zero exit; new assertions report missing `serviceTier`/`service_tier`, while existing user-rule behavior remains available.

- [ ] **Step 4: Implement built-in-first/user-last merging without changing floor placement**

Change the import in `src/hooks/chat-params.ts`:

```ts
import {
  mergeFastOptionRules,
  mergeFastOptions,
  resolveDefaultFastOptions,
  type FastOptionMatchContext,
} from "../routing/fast-option-rules.ts"
```

Replace `applyFastOptionRoute` with:

```ts
function applyFastOptionRoute(args: {
  route: EffectiveModelRoute | undefined
  input: ChatParamsInput
  output: ChatParamsOutput
}): number[] {
  if (args.route?.fastPath.kind !== "options") return []

  const context: FastOptionMatchContext = {
    provider: args.input.model.providerID,
    model: args.input.model.modelID,
    ...(args.input.model.sdk !== undefined ? { sdk: args.input.model.sdk } : {}),
  }
  const defaultOptions = args.route.fastPath.defaultRules
    ? resolveDefaultFastOptions(context)
    : undefined
  const optionsWithDefaults = defaultOptions === undefined
    ? args.output.options
    : mergeFastOptions(args.output.options, defaultOptions)
  const merged = mergeFastOptionRules(optionsWithDefaults, args.route.fastPath.rules, context)
  args.output.options = merged.options
  return merged.matchedRuleIndexes
}
```

Keep both existing call sites in place:

```ts
applyFastOptionRoute({ route, input, output })
```

The unresolved branch must still call it before `applyHostProfileReviewFloor`; the normal branch must still call it immediately before `applyReviewOutputFloor`. Do not add option values to debug or ledger output.

- [ ] **Step 5: Run runtime integration tests and typecheck GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/fast-option-rules.test.ts src/hooks/chat-params.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run typecheck
```

Expected: both commands exit `0`; test summary reports `fail 0`; only one SDK field appears per built-in invocation; user values win; excluded/missing/unknown runtime identities remain unchanged; runtime fallback uses its actual identity; reviewer and plan-critic remain `xhigh`.

**Review boundary:** Runtime resolution, merge order, path gating, and floor authority are one behavior unit. Do not perform a Git write.

### Task 5: Prove reload atomicity and document the public contract

**Files:**
- Modify: `src/index.test.ts:239-319`
- Modify: `README.md:416-433,834-856`
- Modify: `docs/architecture.md:73-83,142-150,308-321`
- Modify: `examples/ocmm.example.jsonc:15-41,212-230`

**Interfaces:**
- Consumes: `createPlugin()`, `reload()`, config-hook publication, profile overlay, route snapshots, and `chat.params` built-in/user merge from Tasks 1-4.
- Produces: End-to-end evidence that reload does not leak a live scalar/rule change and successful republish atomically swaps both; synchronized user and architecture documentation.

- [ ] **Step 1: Replace the existing profile-snapshot integration fixture with a scalar-plus-rule atomicity test**

Keep the existing test harness and name it:

```ts
test("plugin default and user fast rules use one published profile snapshot across reload", async () => {
```

Use this configuration:

```ts
const initialConfig = {
  fastModels: {
    defaultRules: false,
    providers: ["openai"],
    mappings: {},
    rules: [{ match: { sdk: "@ai-sdk/openai" }, options: { profileMarker: "root" } }],
  },
  profiles: {
    fast: {
      fastModels: {
        defaultRules: true,
        rules: [{ match: { sdk: "@ai-sdk/openai" }, options: { profileMarker: "v1" } }],
      },
    },
  },
  activeProfile: "fast",
  agents: { worker: { model: "openai/gpt-5.6-sol" } },
}
```

Keep `publish()` on an empty OpenAI catalog so the route remains options-only. Change `invoke()` to return both observable fields:

```ts
const invoke = async () => {
  const output = { options: {} as Record<string, unknown> }
  await pluginInterface["chat.params"]?.(
    {
      sessionID: `fast-defaults-${++invocation}`,
      agent: { name: "worker" },
      model: {
        providerID: "openai",
        modelID: "gpt-5.6-sol",
        api: { npm: "@ai-sdk/openai" },
      },
      provider: { id: "openai" },
      message: {},
    },
    output,
  )
  return {
    serviceTier: output.options.serviceTier,
    profileMarker: output.options.profileMarker,
  }
}
```

Assert initial publication:

```ts
assert.deepEqual(await invoke(), { serviceTier: "priority", profileMarker: "v1" })
```

Rewrite the selected profile before `reload()`:

```ts
writeFileSync(configPath, JSON.stringify({
  ...initialConfig,
  profiles: {
    fast: {
      fastModels: {
        defaultRules: false,
        rules: [{ match: { sdk: "@ai-sdk/openai" }, options: { profileMarker: "v2" } }],
      },
    },
  },
}))
reload()
```

Assert old snapshot retention and atomic replacement:

```ts
assert.deepEqual(
  await invoke(),
  { serviceTier: "priority", profileMarker: "v1" },
  "reload without config publication keeps the complete old snapshot",
)
await publish()
assert.deepEqual(
  await invoke(),
  { serviceTier: undefined, profileMarker: "v2" },
  "successful config publication atomically replaces the switch and rules",
)
```

Retain the existing assertion that the options path does not change the selected model. Run this test with the existing helper option `{ OCMM_FAST: "1" }`.

- [ ] **Step 2: Run the real plugin-surface test GREEN**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="one published profile snapshot" src/index.test.ts
```

Expected: exactly the intended integration test runs and exits `0`, observing priority/v1 before and after reload, then absent priority/v2 only after republish.

- [ ] **Step 3: Update `README.md` with the default-off opt-in and exact policy**

Add the switch to the main config example before `rules`:

```jsonc
"fastModels": {
  "defaultRules": true,
  "providers": ["openai"],
  "mappings": {
    "openai/<original-model>": "<provider-local-fast-model>"
  },
  "rules": [
```

Remove `serviceTier: "standard"` from the existing provider-only broad rule so it keeps only its telemetry example. Replace the existing wildcard SDK rule with two exact rules so the documented user-rule surface follows the same adapter-specific field contract:

```jsonc
{
  "match": { "model": "gpt-5.*", "sdk": "@ai-sdk/openai" },
  "options": { "serviceTier": "priority", "telemetry": { "sampled": true } }
},
{
  "match": { "model": "gpt-5.*", "sdk": "@ai-sdk/openai-compatible" },
  "options": { "service_tier": "priority", "telemetry": { "sampled": true } }
}
```

Do not retain `@ai-sdk/openai*`: that glob also matches the compatible adapter but would apply the official adapter's camel-case field.

Add this public contract immediately before the existing `fastModels.rules` details:

```markdown
`fastModels.defaultRules` defaults to `false`. When enabled on an options-only fast path, ocmm applies a best-effort OpenAI Priority Processing default based on the runtime `model.api.npm` and model ID: `@ai-sdk/openai` receives `serviceTier: "priority"`, while `@ai-sdk/openai-compatible` receives the wire-compatible `service_tier: "priority"`. Other or missing SDK metadata is unchanged.

The model must start with lowercase `gpt-` followed immediately by numeric major version 4 or newer. Standard, mini, snapshot, and future numeric GPT generations are eligible; IDs containing an exact `.`, `_`, or `-` delimited token from `nano`, `pro`, `realtime`, `audio`, `transcribe`, `image`, `search`, `tts`, `vision`, or `codex` are excluded. GPT 3.5, non-GPT, fine-tuned, and case-mismatched IDs are excluded. This heuristic is intentionally best-effort: OpenAI can change Priority support, and an OpenAI-compatible backend remains the final authority and may reject `service_tier`.
```

Update precedence prose to state exactly:

```markdown
For an options path, ordinary route/hook options are the base, enabled built-ins overlay that base, matching user rules overlay the built-ins in declaration order, and protected reviewer/plan-critic reasoning floors write last. A user rule can therefore override a built-in field or reset the official provider with `serviceTier: "default"`; the two SDK-specific names are not emitted together unless a user rule explicitly adds the other name.

Profile `fastModels.defaultRules` is a scalar: omission inherits the root value, while explicit `true` or `false` overrides it. Profile-declared `fastModels.rules` continues to replace the root array wholesale; omission continues to inherit the root rules.
```

- [ ] **Step 4: Update architecture and example config without broadening scope**

In `docs/architecture.md`:

1. Change the `EffectiveModelRoute` field description to include `fastPath`.
2. State that options paths carry `{ defaultRules, rules }`, both captured in the same immutable publication; reload alone exposes neither new value.
3. Extend the `chat.params` flow to `ordinary options → SDK/model built-in resolver → ordered user rules → protected floors` against actual runtime fallback identity.
4. Change the schema summary to root `{defaultRules, providers, mappings, rules}`, where `defaultRules` defaults to `false` and the profile scalar is optional.
5. Name `src/routing/fast-option-rules.ts` as the pure resolver/merge boundary and state that it performs no network or configuration access.

Use this root example in `examples/ocmm.example.jsonc`:

```jsonc
"fastModels": {
  // Off by default. Uses serviceTier for @ai-sdk/openai and service_tier for
  // @ai-sdk/openai-compatible when the runtime numeric GPT policy matches.
  "defaultRules": true,
  "providers": ["openai"],
  "mappings": {
    "openai/gpt-5.5": "gpt-5.5-fast"
  },
  "rules": [
```

Replace the root example's provider-only and wildcard rules with the same adapter-safe three-rule shape used in README:

```jsonc
{
  "match": { "provider": "openai" },
  "options": { "telemetry": { "fast": true } }
},
{
  "match": { "model": "gpt-5.*", "sdk": "@ai-sdk/openai" },
  "options": { "serviceTier": "priority", "telemetry": { "sampled": true } }
},
{
  "match": { "model": "gpt-5.*", "sdk": "@ai-sdk/openai-compatible" },
  "options": { "service_tier": "priority", "telemetry": { "sampled": true } }
}
```

This removes both the root `@ai-sdk/openai*` wildcard and the SDK-agnostic `serviceTier: "standard"` field.

In the `precision` profile, add an explicit scalar override and update the comment:

```jsonc
// `defaultRules` is a scalar override; omitting it inherits the root value.
// `providers` and `rules` arrays replace root arrays; `mappings` deep-merges
// by qualified original-model key. Omitting `rules` inherits root rules.
"fastModels": {
  "defaultRules": false,
  "providers": ["openai"],
```

In the existing `precision.fastModels.rules` compatible-adapter example, replace the wrong field:

```jsonc
{
  "match": { "sdk": "@ai-sdk/openai-compatible" },
  "options": { "service_tier": "flex" }
}
```

Do not touch workflow prompts, skills, maintenance docs, or Codex artifacts.

- [ ] **Step 5: Run integration and documentation checks**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/index.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --input-type=module -e "import {readFileSync} from 'node:fs'; const checks={'README.md':['fastModels.defaultRules','@ai-sdk/openai-compatible','service_tier','best-effort'],'docs/architecture.md':['defaultRules','fast-option-rules.ts','protected floors'],'examples/ocmm.example.jsonc':['defaultRules','@ai-sdk/openai-compatible']}; for(const [p,needles] of Object.entries(checks)){const s=readFileSync(p,'utf8'); for(const n of needles) if(!s.includes(n)) throw new Error(p+' missing '+n)} console.log('fast default rule docs synchronized')"
$wrongWildcard = rg -n '@ai-sdk/openai\*' README.md examples/ocmm.example.jsonc; if ($LASTEXITCODE -eq 0) { $wrongWildcard; throw "wildcard SDK example conflates official and compatible adapters" }; if ($LASTEXITCODE -ne 1) { throw "wildcard SDK scan failed" }
$wrongGenericField = rg -n '"serviceTier": "standard"' README.md examples/ocmm.example.jsonc; if ($LASTEXITCODE -eq 0) { $wrongGenericField; throw "SDK-agnostic camel-case service tier example remains" }; if ($LASTEXITCODE -ne 1) { throw "generic service tier scan failed" }
$wrongCompatibleField = rg -n -U '"sdk": "@ai-sdk/openai-compatible"[\s\S]{0,120}"options": \{ "serviceTier"' README.md examples/ocmm.example.jsonc; if ($LASTEXITCODE -eq 0) { $wrongCompatibleField; throw "compatible SDK example uses camel-case serviceTier" }; if ($LASTEXITCODE -ne 1) { throw "compatible SDK field scan failed" }
$compatibleWireField = rg -n -U '"sdk": "@ai-sdk/openai-compatible"[\s\S]{0,120}"options": \{ "service_tier"' README.md examples/ocmm.example.jsonc; if ($LASTEXITCODE -ne 0) { throw "compatible SDK wire-field example missing" }; $officialField = rg -n -U '"sdk": "@ai-sdk/openai"[\s\S]{0,120}"options": \{ "serviceTier"' README.md; if ($LASTEXITCODE -ne 0) { throw "official SDK camel-case example missing" }; "SDK-specific documentation examples verified"
```

Expected: index suite exits `0` with `fail 0`; documentation checks print `fast default rule docs synchronized` and `SDK-specific documentation examples verified`, with no wildcard or compatible/camel-case mismatch.

**Review boundary:** Reload behavior and all user-facing documentation form one observable acceptance unit. Do not perform a Git write.

### Task 6: Run final verification and real-surface QA

**Files:**
- Verify: every TypeScript and documentation file listed in Tasks 1-5
- Verify: generated `schema.json`
- Verify: repository build outputs without terminating a user process

**Interfaces:**
- Consumes: All five implementation units and repository-standard scripts.
- Produces: Stable-schema evidence, targeted/full-suite results, build evidence, real-surface evidence, clean diagnostics/scope checks, and a recorded residual-risk statement.

- [ ] **Step 1: Prove generated schema stability**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; $before = (Get-FileHash -Algorithm SHA256 schema.json).Hash; pnpm run gen-schema; if ($LASTEXITCODE -ne 0) { throw "gen-schema failed" }; $after = (Get-FileHash -Algorithm SHA256 schema.json).Hash; if ($before -ne $after) { throw "schema.json was stale before final verification" }; "schema.json is current"
```

Expected: exit `0` and `schema.json is current`.

- [ ] **Step 2: Run focused suites in dependency order**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/schema.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/config/profiles.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/fast-option-rules.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/routing/effective-route.test.ts src/routing/route-registry.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/hooks/chat-params.test.ts
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; node --test --experimental-strip-types --test-reporter=spec src/index.test.ts
```

Expected: every process exits `0`; every summary reports `fail 0`. The index suite is the real-surface QA: it drives the actual config and `chat.params` hooks and proves old snapshot retention plus atomic scalar/rule replacement.

- [ ] **Step 3: Require clean language-server diagnostics on changed TypeScript files**

Invoke `lsp_diagnostics` with `severity: "all"` for:

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
```

Expected: no error or warning diagnostics. If the language server is unavailable, do not install it; record this gate as unavailable and rely on the mandatory typecheck rather than claiming diagnostics passed.

- [ ] **Step 4: Run repository-wide type, test, and build gates**

```powershell
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run typecheck
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm test
$env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm run build
```

Expected: each exits `0`; typecheck emits no diagnostics; `pnpm test` completes TypeScript and Cargo tests; build emits TypeScript plus release/native LSP artifacts under `dist/`.

If and only if the root build fails because a live Windows process locks an `ocmm-lsp` artifact, preserve the failure output, do not terminate that process, and run this isolated-copy build:

```powershell
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"; if (-not (Test-Path -LiteralPath $tempParent)) { throw "approved temp parent missing" }; $isolated = Join-Path $tempParent ("ocmm-fast-default-build-" + [Guid]::NewGuid().ToString("N")); New-Item -ItemType Directory -Path $isolated | Out-Null; try { robocopy.exe . $isolated /E /XD .git node_modules dist target /NFL /NDL /NJH /NJS /NP | Out-Null; $copyExit = $LASTEXITCODE; if ($copyExit -ge 8) { throw "robocopy failed with exit $copyExit" }; if (-not (Test-Path -LiteralPath (Join-Path $PWD "node_modules"))) { throw "existing node_modules missing; do not install" }; New-Item -ItemType Junction -Path (Join-Path $isolated "node_modules") -Target (Join-Path $PWD "node_modules") | Out-Null; $env:OCMM_PROFILE = $null; $env:OCMM_NO_PROFILE = $null; $env:OCMM_FAST = $null; pnpm --dir $isolated run build; if ($LASTEXITCODE -ne 0) { throw "isolated build failed" }; "isolated build passed; root artifact remained locked" } finally { rm.exe -rf $isolated }
```

Expected fallback evidence: `isolated build passed; root artifact remained locked`. Mark the root build as blocked by the live lock and the isolated build as passed; do not represent the root build itself as green. Any non-lock build failure remains a real failure and must not use this exception.

- [ ] **Step 5: Inspect formatting, scope, logging, and the final working tree**

```powershell
git diff --check
git status --short
rg -n "defaultRules|resolveDefaultFastOptions|serviceTier|service_tier" src README.md docs/architecture.md examples/ocmm.example.jsonc schema.json
$optionLogs = rg -n "log\.(debug|info|warn|error).*?(serviceTier|service_tier|defaultOptions|output\.options)|JSON\.stringify\([^\r\n]*options" src/hooks/chat-params.ts src/routing/fast-option-rules.ts; if ($LASTEXITCODE -eq 0) { $optionLogs; throw "fast option values may be logged" }; if ($LASTEXITCODE -ne 1) { throw "option logging scan failed" }; "no fast option value logging found"
$forbidden = git status --short -- prompts/v1 skills/v1 docs/v1-maintenance.md plugins .codex; if ($forbidden) { $forbidden; throw "out-of-scope workflow or Codex files changed" }; "no forbidden workflow/Codex changes"
```

Expected: `git diff --check` exits `0`; status contains only the planned implementation/docs, generated schema, the pre-existing uncommitted approved spec, and this plan; the symbol scan finds both SDK fields and the resolver; the final scans print `no fast option value logging found` and `no forbidden workflow/Codex changes`.

- [ ] **Step 6: Record acceptance evidence and stop without Git writes**

Record:

```text
schema stability: passed/failed
focused suites: passed/failed with command summaries
LSP diagnostics: passed/unavailable/failed
typecheck: passed/failed
full tests: passed/failed
root build: passed/blocked-by-live-lock/failed
isolated build: not-needed/passed/failed
real plugin surface: passed/failed
git diff --check: passed/failed
scope/log scans: passed/failed
```

Do not stage, commit, tag, or push. If every mandatory gate passes (allowing only the explicitly recorded live-lock/isolated-build case), recommend the commit message `feat: add opt-in fast default rules` for a separately authorized commit.

**Final review boundary:** Stop after evidence collection. No Git write is authorized by this plan.

## Specification coverage matrix

| Approved-spec requirement | Plan task(s) | Acceptance evidence |
| --- | --- | --- |
| Root strict boolean default `false`; profile optional scalar | Task 1 | Schema/root/profile RED-GREEN tests and generated-schema inspection |
| Profile enable, disable, omitted inheritance; rules replacement unchanged | Task 1 | `profile fast default rules use scalar override...` |
| `FastPath.options` snapshots boolean and rules | Task 3 | Effective-route assertions and config-hook published path |
| Registry deep clone/freeze and atomic publication | Task 3, Task 5 | Registry mutation assertions; reload retains old pair; republish swaps pair |
| Official OpenAI SDK camel-case field | Task 2, Task 4 | Resolver matrix and runtime `serviceTier` assertion |
| OpenAI-compatible SDK wire field | Task 2, Task 4 | Resolver matrix and runtime `service_tier` assertion |
| Numeric GPT 4+, mini, snapshot, future major support | Task 2 | Accepted model table including `gpt-42.3-2099-01-01` |
| GPT 3.5, non-GPT, fine-tuned, case mismatch, every excluded token | Task 2 | Rejected model matrix and token loop |
| Missing/unknown SDK and unsupported models are no-ops | Task 2, Task 4 | Pure `undefined` and unchanged runtime options assertions |
| Existing mapping/self/already-fast/catalog/off priority unchanged | Task 3 | Existing route-priority tests remain `off`/`model` and never expose options fields |
| Unmanaged routes do not apply defaults | Task 4 | Published route-miss assertion with live switch enabled |
| Runtime fallback re-matches actual model and SDK | Task 4 | Future-major compatible fallback test |
| Ordinary options → built-in → user rules | Task 4 | Ordinary override, user `flex`, deep merge, and explicit `default` reset assertions |
| Reviewer/plan-critic floors remain final | Task 4 | Built-in plus low user reasoning still yields `xhigh` |
| Reload/profile republish replaces snapshot atomically | Task 5 | Real `createPlugin()` priority/v1 → retained priority/v1 → absent priority/v2 |
| README, architecture, and example updates | Task 5 | Exact content checks |
| Schema stability, typecheck, tests, build, diff check | Task 6 | Exact repository-wide commands and expected evidence |
| No workflow/Codex expansion and no option-value logs | Task 6 | Explicit scope and log scans |

## Plan self-review

- **Spec coverage:** PASS — every configuration, resolver, route, runtime, reload, failure/no-op, testing, and documentation requirement maps to an executable task and evidence row above.
- **Completeness scan:** PASS — every code-changing step supplies exact snippets or exact field-level replacements, every behavior change starts with a failing test, and every command has an expected RED/GREEN outcome.
- **Type/interface consistency:** PASS — `defaultRules` is required only on parsed root `FastModelsConfig` and `FastPath.options`; the profile scalar stays optional; resolver and merge signatures are defined before hook consumption.
- **Path/symbol consistency:** PASS — all paths and symbols match HEAD `23f6d58`, including `selectFastPath`, `mergeFastOptionRules`, `EffectiveRouteRegistry.publish`, `createChatParamsHandler`, `createPlugin`, and `scripts/gen-schema.ts`.
- **Scope:** PASS — no production file outside the approved config/routing/chat path is changed; runtime-fallback, Codex, prompt, skill, and maintenance-doc behavior remain untouched.
- **QA executability:** PASS — commands are PowerShell-compatible, clear ambient profile/fast variables, install nothing, include schema stability and `git diff --check`, and provide a non-destructive isolated-build path for a live Windows artifact lock.

## Residual risks and assumptions

- The numeric-GPT heuristic is intentionally best-effort; OpenAI or an OpenAI-compatible backend can reject Priority Processing even when the local policy matches. Existing request/fallback handling remains the backend error path.
- `providerID` is intentionally not an eligibility gate because provider names are user-defined; exact `model.api.npm` plus the model policy is authoritative.
- The resolver treats excluded tokens exactly and case-sensitively after delimiter splitting, matching the approved policy rather than introducing broader fuzzy exclusions.
- A live Windows process may keep the root LSP artifact locked. The plan preserves that process and distinguishes a blocked root build from a passing isolated-copy build.
- Plan-review receipt status: `waiting for receipt`; the planner role does not dispatch `plan-critic` or execute the implementation.
