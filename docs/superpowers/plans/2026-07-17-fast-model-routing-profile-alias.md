# Fast Model Routing and Cross-Profile Alias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Use one fresh implementation subagent per Task, keep the orchestrator responsible for integration, and run the final acceptance review only after all Tasks are integrated.

**Goal:** Add deterministic OpenCode-only `ocmm --fast` model promotion and requirement-only `<profile>:<agent>` aliases so OpenCode registration, chat parameters, and runtime fallback consume one snapshot-consistent effective route.

**Architecture:** A dedicated `loadOpenCodePluginConfig` facade will invoke an internal profile-aware load pipeline that retains precedence descriptors and pre-active base agents long enough to materialize qualified aliases atomically; ordinary `loadConfig`, including calls with `host:"opencode"`, will keep its existing signature and behavior and never materialize them. The OpenCode config hook will choose the existing final primary, pass it through a pure primary-materialization/fast-promotion transform, and atomically publish complete routes to a generation-safe registry shared by OpenCode chat and runtime consumers. Runtime fallback state and every deferred 429 operation will carry the registry `snapshotId`, rejecting stale work immediately before dispatch, handoff, accounting, or commit.

**Tech Stack:** TypeScript 6 ESM, Node.js 22 `node:test`, Zod 4, OpenCode plugin hooks, PowerShell 7 on Windows, pnpm, Cargo (existing full-suite gate), generated JSON Schema.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-07-17-fast-model-routing-profile-alias-design.md`; when this plan and the design differ, the design wins and the plan must be corrected before implementation continues.
- Implement with `subagent-driven-development`. A subagent may edit only the files owned by its current Task and must return changed-file and verification evidence to the orchestrator.
- Dispatch implementation and coding work to the `coding` agent. Do not silently substitute another implementation category if `coding` is unavailable; surface the routing blocker instead.
- Do not run `git add`, `git commit`, `git push`, `git tag`, `git reset`, `git checkout`, `git restore`, or any other Git write command. Subagents must not perform Git writes. If a version-control checkpoint is later desired, the orchestrator must separately obtain explicit user permission.
- Use PowerShell 7 syntax only. Do not use Bash environment assignment, `export`, `&&`, `/dev/null`, or shell-specific heredocs.
- `--fast` is CLI-only. Do not add `fast` to `ShimConfigSchema`, `ShimConfig`, `readShimDefaults`, or persistent shim configuration.
- Pure routing/profile helpers receive values as arguments and never read `process.env`. Only `src/cli/shim.ts` writes `OCMM_FAST` into the child environment; only `src/index.ts` parses ambient `OCMM_FAST`, exactly accepting `1` and `true`.
- Every executable PowerShell block must save, clear, and restore `OCMM_PROFILE`, `OCMM_NO_PROFILE`, and `OCMM_FAST` with `try/finally`, even for pure tests, typecheck, schema generation, or read-only inspection. After every native command (`node`, `pnpm`, `rg`, `git`) inspect `$LASTEXITCODE` immediately before any other command.
- Apply strict qualified-alias whole-config failure only at `loadOpenCodePluginConfig`: log one validation/materialization failure and return `defaultConfig()` for the entire merged config. Ordinary `loadConfig` must retain its existing generic validation/failure behavior and must not accept, reject, or partially materialize agents on account of qualified aliases.
- Do not add profile roots, a profile-environment policy, or new `includeUser:false` behavior. OpenCode keeps its existing inline/user-directory/project-directory discovery and current ambient `OCMM_PROFILE`/`OCMM_NO_PROFILE` selection semantics.
- `createConfigHandler` is shared. OpenCode must explicitly supply `routeRegistry` and `getFastMode`; callers that omit them retain the current non-fast/optional-`registeredAgentModels` compatibility path. Strict published-registry semantics apply only to OpenCode-managed runtime consumers.
- Codex is out of scope. Do not modify `src/codex/plugin-generator.ts` or its tests, add Codex-specific tests or documentation, or promise that either capability works there. Its existing first `loadConfig({ host:"codex" })` call and fallback `loadConfig({ host:"opencode" })` call must both remain ordinary, unmaterialized loads. Incidental reuse of shared schema/load helpers is not a compatibility guarantee.
- Never use `host === "opencode"` as the qualified-alias feature gate. Only an explicit call to `loadOpenCodePluginConfig` selects the descriptor-retaining/materializing boundary.
- Schema source changes require `pnpm run gen-schema`. Do not run any other generator.
- The final verification order is fixed: `pnpm run gen-schema` → focused ambient-isolated checks → `pnpm run typecheck` → isolated `pnpm test` → `pnpm run build` → built fake-OpenCode shim surface → runtime A-fast→A surface → read-only status/diff/whitespace checks → final acceptance review. No build may run after the surface evidence begins. Any review-driven edit invalidates all evidence and restarts this exact sequence for the current revision.

## PowerShell Environment-Isolation Contract

Every executable PowerShell block below is self-contained and follows this shape. RED blocks require a non-zero test exit; GREEN blocks require zero.

```powershell
& {
  $savedProfile = $env:OCMM_PROFILE
  $savedNoProfile = $env:OCMM_NO_PROFILE
  $savedFast = $env:OCMM_FAST
  try {
    Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue

    # Run the exact command listed by the step, then inspect $LASTEXITCODE.
  }
  finally {
    if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
    if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
    if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
  }
}
```

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/superpowers/specs/2026-07-17-fast-model-routing-profile-alias-design.md` | Preserve | Approved design and acceptance contract for this feature. |
| `docs/superpowers/plans/2026-07-17-fast-model-routing-profile-alias.md` | Modify | Executable implementation plan, ownership map, and final verification sequence. |
| `src/cli/shim.ts` | Modify | Consume pre-separator `--fast`, build child-only activation environment, document help. |
| `src/cli/shim.test.ts` | Modify | Unit and real-process fake-OpenCode coverage for consume/pass-through/environment behavior. |
| `src/config/schema.ts` | Modify | Root/profile `fastModels` schemas and defaults; keep shim schema unchanged. |
| `src/config/schema.test.ts` | Modify | Fast policy validation/default/profile-partial contracts. |
| `src/config/merge.ts` | Create | Shared non-mutating user/project and profile-overlay merge semantics. |
| `src/config/profile-types.ts` | Create | Cycle-free shared profile descriptor/source contracts. |
| `src/config/load.ts` | Modify | Preserve ordinary `loadConfig`; add exported options, an internal profile-aware pipeline, and the OpenCode-plugin-only materializing facade. |
| `src/config/load.test.ts` | Modify | Dedicated-boundary descriptor precedence/lazy-invalid behavior plus generic `loadConfig` non-materialization and ambient-selection regressions. |
| `src/config/profiles.test.ts` | Modify | OpenCode-plugin-boundary active overlay and qualified-reference integration across inline/user/project sources. |
| `src/config/normalize.ts` | Modify | Export direct requirement normalization while preserving current unqualified aliases. |
| `src/config/normalize.test.ts` | Modify | Direct requirement precedence and existing alias compatibility. |
| `src/config/profile-aliases.ts` | Create | First-colon grammar, scoped tuple traversal, requirement-only materialization. |
| `src/config/profile-aliases.test.ts` | Create | Pure qualified alias view/import/path/cycle tests. |
| `src/shared/types.ts` | Modify | Shared effective-route, requirement-source, and primary-source types. |
| `src/routing/model-upgrades.ts` | Modify | Expose successor match plus baseline index without changing current selection semantics. |
| `src/routing/model-upgrades.test.ts` | Modify | Baseline-index regression coverage. |
| `src/routing/effective-route.ts` | Create | Pure activation parsing, primary materialization, candidate selection, stable chain transform. |
| `src/routing/effective-route.test.ts` | Create | Exhaustive exact/successor/prefix/fast/no-op/dedupe/metadata tests. |
| `src/routing/route-registry.ts` | Create | Generation reservation, atomic full publication, immutable snapshots. |
| `src/routing/route-registry.test.ts` | Create | Never-published/empty/stale/failure/replacement semantics. |
| `src/hooks/config.ts` | Modify | Build and publish every OpenCode-managed route while preserving the existing non-fast shared-caller compatibility path. |
| `src/hooks/config.test.ts` | Modify | Agent/custom/compat/provenance/publication integration. |
| `src/hooks/config.category.test.ts` | Modify | Built-in and configured category route integration. |
| `src/routing/resolver.ts` | Modify | Accept an explicit route requirement or an explicit published-missing sentinel. |
| `src/routing/resolver.test.ts` | Modify | Route override, published-missing, and request-local input variant behavior. |
| `src/routing/resolver.category.test.ts` | Modify | Category route-source behavior remains intact. |
| `src/hooks/chat-params.ts` | Modify | Read one registry snapshot and prohibit raw recomputation after publication. |
| `src/hooks/chat-params.test.ts` | Modify | Registry/raw boundary and provenance orthogonality. |
| `src/runtime-fallback/fallback-state.ts` | Modify | Bind generic fallback state to `snapshotId`. |
| `src/runtime-fallback/fallback-state.test.ts` | Modify | Snapshot-bound initialization and fast→original index coverage. |
| `src/runtime-fallback/event-handler-support.ts` | Modify | Reset mismatched state and align initial model against route requirement. |
| `src/runtime-fallback/event-handler.ts` | Modify | Consume route snapshots and guard generic dispatch/handoff/commit. |
| `src/runtime-fallback/event-handler-generic-fallback.ts` | Modify | Execute generic fallback with snapshot-aware client/commit guards. |
| `src/runtime-fallback/event-handler-test-fixtures.ts` | Modify | Shared route registries, deferred client phases, and split-test helpers. |
| `src/runtime-fallback/event-handler-fallback-dispatch.test.ts` | Modify | Shared-route dispatch, suspended-message staleness, and real A-fast→A surface. |
| `src/runtime-fallback/event-handler-failed-model-resolution.test.ts` | Modify | Route model/requirement lookup, published-missing, and snapshot reset. |
| `src/runtime-fallback/event-handler-dedicated-429-gates.test.ts` | Modify | Dedicated snapshot change before/during dispatch. |
| `src/runtime-fallback/event-handler-dedicated-429-switching.test.ts` | Modify | Prepared switch/account/commit and queued handoff snapshot behavior. |
| `src/runtime-fallback/event-handler-dedicated-429-session-lifecycle.test.ts` | Modify | Route snapshot invalidation alongside session lifecycle invalidation. |
| `src/runtime-fallback/subagent-429-controller.ts` | Modify | Snapshot-aware controller/session replacement APIs. |
| `src/runtime-fallback/subagent-429-session.ts` | Modify | Carry/recheck snapshot through timer, queue, dispatch, handoff, account, commit. |
| `src/runtime-fallback/subagent-429-controller-fixture.ts` | Modify | Shared mutable snapshot harness and snapshot-bearing inputs. |
| `src/runtime-fallback/subagent-429-controller-gate-policy.test.ts` | Modify | Timer/idle pre-dispatch snapshot cancellation. |
| `src/runtime-fallback/subagent-429-controller-lifecycle.test.ts` | Modify | Snapshot/session replacement and stale handoff cancellation. |
| `src/runtime-fallback/subagent-429-controller-settlement.test.ts` | Modify | Queued outcome, accounting, and commit snapshot cancellation. |
| `src/runtime-fallback/subagent-429-controller-matrix.test.ts` | Verify | Existing retry/switch settlement matrix remains valid without source changes. |
| `src/runtime-fallback/subagent-429-controller-delay-scope.test.ts` | Modify | Existing delay/scope cases with current snapshot IDs. |
| `src/runtime-fallback/subagent-429-controller-interruption.test.ts` | Modify | Existing durable interruption-correlation retention cases updated for snapshot-aware controller APIs. |
| `src/runtime-fallback/index.ts` | Modify | Re-export updated runtime types if consumed by hooks/tests. |
| `src/hooks/event.ts` | Verify | Existing event wrapper remains compatible; plugin lifecycle injection is owned by `src/index.ts` and `src/runtime-fallback/index.ts`. |
| `src/index.ts` | Modify | Use `loadOpenCodePluginConfig` for initial/reload loads, own one registry, parse fast activation, and inject all consumers. |
| `src/index.test.ts` | Modify | Exact env values, plugin-only load/reload boundary, and shared wiring coverage. |
| `schema.json` | Regenerate | JSON Schema synchronized from `OcmmConfigSchema`. |
| `README.md` | Modify | User-facing OpenCode fast policy, qualified alias/profile behavior, and runtime snapshot semantics. |
| `docs/architecture.md` | Modify | Plugin-only config-load boundary plus effective-route construction/publication/consumption/reload architecture. |
| `examples/ocmm.example.jsonc` | Modify | Valid `fastModels` and qualified alias examples. |

## Requirement-to-Task Coverage

| Design requirement | Covered by |
|---|---|
| CLI separator, child env, exact activation, no shim persistence | Tasks 1, 10; final surface wave |
| Allowlist/mapping/schema/default/profile merge | Tasks 1, 4, 11 |
| Qualified profile aliases, plugin-only load boundary, descriptors, existing OpenCode source precedence, strict errors | Tasks 2, 3, 10 |
| Final-primary materialization and fast chain | Task 4 |
| Shared route shape and atomic registry | Tasks 4, 5 |
| All managed agents/categories/compat, unmanaged untouched | Task 6 |
| Chat consumes route; published-missing/raw boundary; input variant | Task 7 |
| Generic runtime route/snapshot and fast failure order | Task 8 |
| 429 timer/queue/prepared/handoff/dispatch/commit stale barriers | Task 9 |
| Plugin lifecycle ownership, shared-handler compatibility, and reload activation | Task 10 |
| OpenCode docs, example, and generated JSON Schema | Task 11; final verification wave |

---

### Task 1: Establish CLI Activation and Fast-Policy Schema

**Files:**
- Modify: `src/cli/shim.ts`
- Modify: `src/cli/shim.test.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/config/schema.test.ts`

**Interfaces:**
- Consumes: shim argv before/after `--`, parent `NodeJS.ProcessEnv`, JSON/JSONC `fastModels` input.
- Produces: `ShimArgs.fast: boolean`, `buildChildEnv(parent, args)`, root `FastModelsConfig`, partial profile override, `defaultConfig().fastModels`.
- Invariant: `ShimConfigSchema` remains unchanged and non-strict: an unknown `shim.fast` field is stripped rather than becoming a typed or persistent setting. Existing `ProfileEntrySchema` defaults, including `disabledHooks`, remain unchanged.

- [ ] **Step 1: Write failing CLI parsing and child-environment tests.**

  Add focused cases to `src/cli/shim.test.ts`:

  ```ts
  it("consumes --fast only before the passthrough separator", () => {
    assert.deepEqual(parseArgs(["--fast", "run", "x"]), {
      noProviders: false,
      noPlugins: false,
      noProfile: false,
      fast: true,
      keepOmo: false,
      reset: false,
      help: false,
      passthrough: ["run", "x"],
    })

    const separated = parseArgs(["--", "--fast"])
    assert.equal(separated.fast, false)
    assert.deepEqual(separated.passthrough, ["--fast"])
  })

  it("sets OCMM_FAST only in the derived child environment", () => {
    const parent: NodeJS.ProcessEnv = { KEEP_ME: "yes" }
    const enabled = buildChildEnv(parent, parseArgs(["--fast"]))
    const disabled = buildChildEnv(parent, parseArgs([]))
    assert.equal(enabled.OCMM_FAST, "1")
    assert.equal(disabled.OCMM_FAST, undefined)
    assert.equal(parent.OCMM_FAST, undefined)
    assert.equal(enabled.KEEP_ME, "yes")
  })
  ```

- [ ] **Step 2: Write failing schema/default/profile-partial tests.**

  Extend `src/config/schema.test.ts` with these contracts:

  ```ts
  import {
    defaultConfig,
    FastModelsConfigSchema,
    OcmmConfigSchema,
    ProfileEntrySchema,
    ShimConfigSchema,
  } from "./schema.ts"

  test("fastModels defaults to an explicit disabled policy", () => {
    assert.deepEqual(defaultConfig().fastModels, { providers: [], mappings: {} })
    assert.deepEqual(FastModelsConfigSchema.parse({}), { providers: [], mappings: {} })
    assert.deepEqual(OcmmConfigSchema.parse({ fastModels: { providers: [] } }).fastModels, {
      providers: [], mappings: {},
    })
  })

  test("fastModels validates qualified keys and nonblank same-provider model IDs", () => {
    assert.deepEqual(FastModelsConfigSchema.parse({
      providers: ["openai"],
      mappings: { "openai/gpt-5.6-sol": "gpt-5.6-sol/turbo" },
    }).mappings, { "openai/gpt-5.6-sol": "gpt-5.6-sol/turbo" })
    for (const mappings of [{ gpt: "fast" }, { "/gpt": "fast" }, { "openai/gpt": "   " }]) {
      assert.equal(FastModelsConfigSchema.safeParse({ providers: ["openai"], mappings }).success, false)
    }
  })

  test("profile fastModels is partial without child defaults", () => {
    const parsed = ProfileEntrySchema.parse({ fastModels: { mappings: { "openai/a": "a-fast" } } })
    assert.deepEqual(parsed.fastModels, { mappings: { "openai/a": "a-fast" } })
    assert.deepEqual(parsed.disabledHooks, ["directory-readme-injector"])
    const shim = ShimConfigSchema.parse({ fast: true })
    assert.equal("fast" in shim, false)
  })
  ```

- [ ] **Step 3: Run the CLI/schema RED tests in an isolated environment.**

  **Isolated RED command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/cli/shim.test.ts src/config/schema.test.ts
      $code = $LASTEXITCODE
      if ($code -eq 0) { throw "RED unexpectedly passed before CLI/schema implementation" }
      Write-Host "Expected RED: ShimArgs.fast/buildChildEnv/FastModelsConfigSchema are absent."
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: non-zero with missing exports/properties or failed `--fast` assertions.

- [ ] **Step 4: Implement the minimal CLI-only flag and child environment helper.**

  In `src/cli/shim.ts`, add `fast: boolean` to `ShimArgs`, initialize it to `false`, consume only the pre-separator switch case, and derive the environment without mutating the parent:

  ```ts
  export function buildChildEnv(parent: NodeJS.ProcessEnv, args: Pick<ShimArgs, "profile" | "noProfile" | "fast">): NodeJS.ProcessEnv {
    const env = { ...parent }
    if (args.profile) env.OCMM_PROFILE = args.profile
    if (args.noProfile) env.OCMM_NO_PROFILE = "1"
    if (args.fast) env.OCMM_FAST = "1"
    return env
  }
  ```

  Replace the inline environment writes in `main()` with `buildChildEnv(process.env, args)`. Add `--fast` to usage/help with text that it requires an allowlisted Provider. Do not read or write it in `readShimDefaults()`.

- [ ] **Step 5: Implement the root and profile fast-policy schemas.**

  In `src/config/schema.ts`, use the same key/value validators in both root and profile forms:

  ```ts
  const FastMappingKeySchema = z.string().regex(/^[^/]+\/.+$/)
  const FastMappingValueSchema = z.string().refine((value) => value.trim().length > 0, {
    message: "fast model ID must contain a non-whitespace character",
  })

  const defaultFastModelsConfig = () => ({ providers: [], mappings: {} })

  export const FastModelsConfigSchema = z.object({
    providers: z.array(z.string().min(1)).default([]),
    mappings: z.record(FastMappingKeySchema, FastMappingValueSchema).default({}),
  }).strict().default(defaultFastModelsConfig)

  const ProfileFastModelsConfigSchema = z.object({
    providers: z.array(z.string().min(1)).optional(),
    mappings: z.record(FastMappingKeySchema, FastMappingValueSchema).optional(),
  }).strict()
  ```

  Add `fastModels: FastModelsConfigSchema` to `OcmmConfigSchema`, `fastModels: ProfileFastModelsConfigSchema.optional()` to `ProfileEntrySchema`, and export `FastModelsConfig`. Do not place defaults on the profile object or either profile child, and do not alter any existing profile defaults such as `FeatureGateArrayFields.disabledHooks`.

- [ ] **Step 6: Run the focused GREEN tests.**

  **Isolated GREEN command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/cli/shim.test.ts src/config/schema.test.ts
      if ($LASTEXITCODE -ne 0) { throw "CLI/schema focused tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all tests pass; `parseArgs(["--", "--fast"])` still passes the token through and `ShimConfigSchema` strips unknown `fast` without persisting it.

- [ ] **Step 7: Run an integration typecheck for the new inferred config shape.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      pnpm run typecheck
      if ($LASTEXITCODE -ne 0) { throw "typecheck failed after Task 1" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: exit 0. Defer `schema.json` generation to Task 11 so the generated schema is written after schema behavior stabilizes.

---

### Task 2: Add a Plugin-Only Profile Pipeline Without Changing Generic Loading

**Files:**
- Create: `src/config/merge.ts`
- Create: `src/config/profile-types.ts`
- Modify: `src/config/load.ts`
- Modify: `src/config/load.test.ts`
- Modify: `src/config/profiles.test.ts`

**Interfaces:**
- Consumes: raw user/project config plus the existing inline, user-directory, and OpenCode project-directory profile sources, selected by an explicit load entry point rather than inferred from `host`.
- Produces: ordinary `loadConfig` results with unchanged behavior, plus a plugin-only load result backed by precedence-preserving `ProfileDescriptor` maps; no inactive directory profile is inserted into `config.profiles`.
- Final signatures introduced here and used by Tasks 3 and 10:

  ```ts
  export type LoadConfigOptions = { cwd?: string; host?: ConfigHost; includeUser?: boolean }
  export function loadConfig(options?: LoadConfigOptions): LoadedConfig
  export function loadOpenCodePluginConfig(
    options?: Omit<LoadConfigOptions, "host">,
  ): LoadedConfig

  export type ProfileSource = "inline" | "user-directory" | "project-directory"
  export type ProfileDescriptorError = { kind: "parse" | "shape"; message: string }
  export type ProfileDescriptor = {
    name: string
    source: ProfileSource
    path?: string
    value?: unknown
    error?: ProfileDescriptorError
  }
  export type ProfileDescriptorMap = ReadonlyMap<string, ProfileDescriptor>

  export function loadProfilesFromDir(dir: string): Record<string, unknown>
  export function loadProfileDescriptorsFromDir(
    dir: string,
    source: Exclude<ProfileSource, "inline">,
  ): Map<string, ProfileDescriptor>
  ```

  Define descriptor/source types in `src/config/profile-types.ts`. Both `load.ts` and Task 3's `profile-aliases.ts` import them from that leaf module; neither imports descriptor types from the other. Export the current option shape as `LoadConfigOptions`, but keep `loadConfig`'s accepted options, default host, return type, profile behavior, and ambient selection rules unchanged. `loadProfilesFromDir` remains the compatibility helper used by the generic path; the descriptor helper is selected only by the explicit OpenCode-plugin pipeline mode.

- [ ] **Step 1: Add descriptor tests without replacing generic-loader regressions.**

  In `src/config/load.test.ts`, keep existing `loadProfilesFromDir` assertions and add focused `loadProfileDescriptorsFromDir` coverage:

  ```ts
  test("loadProfileDescriptorsFromDir keeps the preferred invalid jsonc descriptor", () => {
    const root = mkdtempSync(join(tmpdir(), "ocmm-profile-descriptor-"))
    try {
      writeFileSync(join(root, "precision.json"), JSON.stringify({ agents: { reviewer: { model: "openai/lower" } } }))
      writeFileSync(join(root, "precision.jsonc"), "{ broken")
      const descriptor = loadProfileDescriptorsFromDir(root, "project-directory").get("precision")
      assert.equal(descriptor?.source, "project-directory")
      assert.equal(descriptor?.path, join(root, "precision.jsonc"))
      assert.equal(descriptor?.error?.kind, "parse")
      assert.equal(descriptor?.value, undefined)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  ```

  Add a second case where a parseable non-object or schema-invalid object yields `error.kind === "shape"` while retaining `value` and `path`.

- [ ] **Step 2: Add failing plugin-boundary source and active-selection integration tests.**

  Cover these cases through `loadOpenCodePluginConfig` in `src/config/load.test.ts` and `src/config/profiles.test.ts`:

  1. Existing OpenCode precedence remains inline < current user profile directory < project `.opencode/ocmm-profiles`.
  2. An invalid active project-directory descriptor shadows valid user/inline descriptors and returns the complete default config.
  3. Invalid, unreferenced inactive directory descriptors are inert.
  4. The current ambient selection contract remains exact: `OCMM_NO_PROFILE` values `1|true` disable selection; otherwise a non-empty `OCMM_PROFILE` wins over configured `activeProfile`.
  5. A missing active profile still warns and returns the unchanged base config.
  6. `fastModels.providers` replaces and `fastModels.mappings` deep-merges under a profile overlay.

  Use an unmistakable default fallback assertion such as `config.fastModels.providers` equals `[]` and the invalid config's custom agent is absent. Preserve the existing ordinary `loadConfig` tests as generic regressions; do not add a new profile root, selection option, host inference, or altered `includeUser:false` contract.

- [ ] **Step 3: Run the profile-source RED tests.**

  **Isolated RED command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/config/load.test.ts src/config/profiles.test.ts
      $code = $LASTEXITCODE
      if ($code -eq 0) { throw "RED unexpectedly passed before precedence-preserving profile descriptors exist" }
      Write-Host "Expected RED: the explicit OpenCode-plugin descriptor pipeline does not exist."
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: non-zero from the missing descriptor helper/plugin facade or from invalid-shadow/lazy-validation assertions.

- [ ] **Step 4: Extract merge behavior without changing semantics.**

  Move `isPlainObject`, `ACCUMULATING_ARRAY_KEYS`, and `deepMerge` into `src/config/merge.ts`. Keep `deepMerge` non-mutating, preserve user/project accumulation keys, and preserve `profileOverlay:true` array replacement. Re-export `deepMerge` from `src/config/load.ts` so existing imports remain valid.

- [ ] **Step 5: Implement plugin-pipeline descriptor discovery and precedence.**

  Add `loadProfileDescriptorsFromDir` for the plugin pipeline: group `.json`/`.jsonc` candidates by basename, choose `.jsonc` before parsing when both exist, and always store that chosen descriptor. Parse errors and `ProfileEntrySchema` shape errors remain in the descriptor rather than falling through. Do not strip forbidden `profiles` or `activeProfile` fields from descriptors; retain them as shape-invalid so active/referenced plugin use rejects them while inactive use remains inert. Compose plugin precedence with ordered `Map.set` operations: inline, then user directory, then project directory. Keep the existing `loadProfilesFromDir` signature and generic skip/clean behavior unchanged.

  For the OpenCode path, keep exactly the currently discovered roots: inline profiles, the current OpenCode user profile directory, and project `.opencode/ocmm-profiles`. Do not add a host-specific project profile root or change any existing loader option semantics. Shared-loader reuse outside OpenCode is incidental and receives no feature guarantee.

- [ ] **Step 6: Integrate an explicit plugin mode while preserving generic loading.**

  Refactor common reads/merges into a private pipeline with an explicit generic-versus-OpenCode-plugin mode. The public caller chooses the mode; `host` only selects file locations and must never select materialization behavior. `loadConfig(options)` invokes generic mode and reproduces its current result. `loadOpenCodePluginConfig(options)` fixes `host:"opencode"`, invokes plugin mode, and uses this fixed order:

  1. Validate the unprofiled merged root with `OcmmConfigSchema.safeParse` so every inline profile is validated even when inactive.
  2. Build inline descriptors from the raw merged `profiles`, then overlay user/project descriptor maps.
  3. Reuse the existing ambient selection logic unchanged: exact `OCMM_NO_PROFILE=1|true`, then non-empty `OCMM_PROFILE`, then configured `activeProfile`.
  4. A missing active descriptor warns and preserves base config.
  5. An active descriptor with `error` throws one config-materialization error; a valid active descriptor overlays its raw object with `profileOverlay:true`.
  6. Validate the final overlaid root and retain its pre-active `baseAgents` plus descriptor map internally for Task 3; return the same public `LoadedConfig` shape.

  `loadOpenCodePluginConfig` catches plugin-pipeline validation errors, logs them, and returns `{ config: defaultConfig(), sources, activeProfile? }` atomically. Ordinary `loadConfig` keeps its current validation/fallback path and never receives descriptor strictness merely because `host` is `opencode`.

- [ ] **Step 7: Run focused profile GREEN tests.**

  **Isolated GREEN command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/config/load.test.ts src/config/profiles.test.ts
      if ($LASTEXITCODE -ne 0) { throw "profile source/environment tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all tests pass; the dedicated boundary treats a bad higher-precedence descriptor as authoritative but inert unless active, while ordinary `loadConfig` regressions remain unchanged.

- [ ] **Step 8: Verify schema and loader callers still typecheck.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      pnpm run typecheck
      if ($LASTEXITCODE -ne 0) { throw "typecheck failed after Task 2" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: exit 0; existing generic callers compile without migration, and no caller relies on directory profiles being copied into `config.profiles`.

---

### Task 3: Materialize Requirement-Only Qualified Agent Aliases

**Files:**
- Create: `src/config/profile-aliases.ts`
- Create: `src/config/profile-aliases.test.ts`
- Modify: `src/config/normalize.ts`
- Modify: `src/config/normalize.test.ts`
- Modify: `src/config/load.ts`
- Modify: `src/config/load.test.ts`
- Modify: `src/config/profiles.test.ts`

**Interfaces:**
- Consumes: the validated active `OcmmConfig`, pre-active merged base agents, and precedence-resolved profile descriptors retained only by the explicit OpenCode-plugin pipeline.
- Produces: `loadOpenCodePluginConfig` results whose direct/transitive qualified aliases carry a cloned complete `ModelRequirement`; source behavior fields remain local. Ordinary `loadConfig` returns aliases containing `:` unchanged.
- Pure alias APIs plus the explicit loader boundary:

  ```ts
  export type QualifiedAgentAlias = { profile: string; agent: string }
  export function parseQualifiedAgentAlias(alias: string): QualifiedAgentAlias | null
  export function materializeQualifiedAgentAliases(args: {
    config: OcmmConfig
    baseAgents: Record<string, AgentEntry>
    profiles: ProfileDescriptorMap
  }): OcmmConfig
  export function normalizeDirectRequirement(entry: AgentEntry | CategoryEntry | undefined): ModelRequirement | undefined
  export function loadOpenCodePluginConfig(
    options?: Omit<LoadConfigOptions, "host">,
  ): LoadedConfig
  ```

- [ ] **Step 1: Add failing grammar, import-boundary, and scoped-resolution tests.**

  In `src/config/profile-aliases.test.ts`, cover:

  ```ts
  test("qualified aliases split only at the first colon", () => {
    assert.deepEqual(parseQualifiedAgentAlias("precision:review:strict"), {
      profile: "precision", agent: "review:strict",
    })
    assert.equal(parseQualifiedAgentAlias("reviewer"), null)
    for (const invalid of [":reviewer", "precision:", "bad profile:reviewer"]) {
      assert.throws(() => parseQualifiedAgentAlias(invalid), /invalid qualified agent alias/)
    }
  })
  ```

  Add fixtures proving:

  - target effective view is `base agents + target profile agents`, while the current active profile's overlay does not leak;
  - target-scope unqualified aliases and cross-profile qualified hops resolve;
  - same-named agents in different scopes do not falsely cycle;
  - a real multi-profile cycle reports every scoped node in order;
  - `fallbackChain`, requirement `variant`, `requiresModel`, `requiresAnyModel`, `requiresProvider`, Provider order, entry variant, `reasoningEffort`, `temperature`, `topP`, `maxTokens`, and `thinking` are cloned;
  - target `description`, `disabled`, `tools`, `permission`, `skills`, `promptAppend`, and agent-level inference controls are not imported, while the source entry's values remain;
  - direct `requirement`, `model`, or `fallbackModels` on the source wins over its alias.

- [ ] **Step 2: Add failing plugin-boundary strict-error, precedence, and generic-regression tests.**

  In `src/config/load.test.ts`/`profiles.test.ts`, call `loadOpenCodePluginConfig` for every qualified-alias integration fixture and prove:

  - project descriptor overrides user, user overrides inline;
  - a referenced invalid project descriptor shadows a valid lower descriptor and returns full defaults;
  - missing profile, invalid alias grammar, missing target agent, target without a requirement, and scoped cycle each reject the complete config;
  - the logged error text contains the complete scoped path;
  - an invalid unreferenced inactive directory profile remains inert;
  - a qualified reference imports requirements into the active config but does not activate the target profile's `runtimeFallback`, `fastModels`, permissions, prompts, or disabled lists.

  Add a separate regression using the same valid qualified-alias fixture but call ordinary `loadConfig({ cwd, host:"opencode" })`. Assert the source still has `alias === "precision:reviewer"`, has no own materialized `requirement`, and does not fail merely because the alias contains `:`. Repeat with `alias:"missing:reviewer"` and assert the generic result preserves the configured agent instead of returning whole-config defaults; the dedicated facade counterpart must return defaults. This exact host value proves that host selection is not the feature gate and that strict qualified errors belong only to the facade.

- [ ] **Step 3: Run the qualified-alias RED suite.**

  **Isolated RED command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/config/profile-aliases.test.ts src/config/normalize.test.ts src/config/load.test.ts src/config/profiles.test.ts
      $code = $LASTEXITCODE
      if ($code -eq 0) { throw "RED unexpectedly passed before qualified alias materialization" }
      Write-Host "Expected RED: profile-alias module is absent and qualified aliases cannot resolve."
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: non-zero from missing module/exports and unresolved qualified requirements.

- [ ] **Step 4: Extract direct requirement normalization without altering unqualified aliases.**

  Implement `normalizeDirectRequirement` in `src/config/normalize.ts` with the existing precedence: full `requirement` first; otherwise `model` followed by `fallbackModels`; otherwise `undefined`. Have `normalizeShorthand` call it before its existing unqualified alias callback. Keep existing `normalizeAgentShorthand` behavior and cycle messages for purely unqualified config.

- [ ] **Step 5: Implement collision-safe scoped traversal.**

  In `src/config/profile-aliases.ts`, represent nodes structurally:

  ```ts
  type AliasScope = { kind: "active" } | { kind: "profile"; name: string }
  type ScopedAliasNode = readonly [AliasScope, string]
  const scopedNodeKey = (node: ScopedAliasNode): string => JSON.stringify(node)
  ```

  Resolve a node by checking `normalizeDirectRequirement` first. For an unqualified alias, recurse within the same scope/view. For a qualified alias, look up exactly one precedence-selected descriptor, reject its stored error, build/cache `deepMerge(baseAgents, descriptor.value.agents, undefined, { profileOverlay: true })`, and recurse in `{kind:"profile", name}`. Maintain an ordered node stack plus keyed membership set; every thrown error formats the complete stack, including the missing/invalid terminal node.

  Clone requirements so target objects cannot be mutated through the source:

  ```ts
  function cloneRequirement(requirement: ModelRequirement): ModelRequirement {
    return {
      ...requirement,
      fallbackChain: requirement.fallbackChain.map((entry) => ({
        ...entry,
        providers: [...entry.providers],
        ...(entry.thinking ? { thinking: { ...entry.thinking } } : {}),
      })),
      ...(requirement.requiresProvider ? { requiresProvider: [...requirement.requiresProvider] } : {}),
    }
  }
  ```

- [ ] **Step 6: Materialize only active qualified sources.**

  Iterate active `config.agents`. When an entry has no direct requirement and its alias contains `:`, resolve it and replace only that source entry with `{ ...sourceEntry, requirement: clonedRequirement }`; retain its original alias and all local behavior fields. Recursive target-profile nodes are resolved in memory and are not copied into `config.profiles` or made active. Purely unqualified active aliases remain handled by `normalizeAgentShorthand`.

- [ ] **Step 7: Integrate materialization atomically into the plugin-only facade.**

  In the explicit plugin mode used only by `loadOpenCodePluginConfig`, take `baseAgents` and descriptors from the internal pipeline. After the active overlay's full root validation, call `materializeQualifiedAgentAliases`, validate the returned config once more with `OcmmConfigSchema`, and return only the fully materialized result. Let any alias error reach the facade's whole-config fallback; do not catch per agent. The generic mode and `loadConfig` must not call the materializer, and `host:"opencode"` must not alter that rule.

- [ ] **Step 8: Run the qualified-alias GREEN suite.**

  **Isolated GREEN command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/config/profile-aliases.test.ts src/config/normalize.test.ts src/config/load.test.ts src/config/profiles.test.ts
      if ($LASTEXITCODE -ne 0) { throw "qualified alias tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all tests pass; strict qualified failures return defaults only through `loadOpenCodePluginConfig`, unreferenced invalid directory descriptors remain inert there, and ordinary `loadConfig({ host:"opencode" })` leaves the qualified alias untouched.

- [ ] **Step 9: Run resolver/config alias regressions before route work begins.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/routing/resolver.test.ts src/config/normalize.test.ts
      if ($LASTEXITCODE -ne 0) { throw "existing unqualified alias regressions failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: existing direct/unqualified/default aliases retain their behavior.

---

### Task 4: Build the Pure Final-Primary and Fast-Route Transform

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/routing/model-upgrades.ts`
- Modify: `src/routing/model-upgrades.test.ts`
- Create: `src/routing/effective-route.ts`
- Create: `src/routing/effective-route.test.ts`

**Interfaces:**
- Consumes: selected primary string, baseline `ModelRequirement`, orthogonal provenance, explicit fast activation/policy, selected Provider's catalog model IDs.
- Produces: immutable `EffectiveModelRoute` with selected primary materialized and optional fast head.
- Shared types/signatures:

  ```ts
  export type RequirementSource = "user-config" | "agent-default" | "category-default"
  export type PrimarySource = "existing-model" | "user-requirement" | "catalog-upgrade" | "builtin-requirement"
  export type EffectiveModelRoute = {
    model: string
    requirement: ModelRequirement
    requirementSource: RequirementSource
    primarySource: PrimarySource
  }

  export function parseFastModeValue(value: string | undefined): boolean
  export function materializeSelectedPrimary(requirement: ModelRequirement, selectedModel: string): ModelRequirement
  export function selectFastCandidate(args: {
    selectedModel: string
    fastMode: boolean
    fastModels: FastModelsConfig
    catalogModels?: ReadonlySet<string>
  }): string | null
  export function buildEffectiveModelRoute(args: {
    selectedModel: string
    requirement: ModelRequirement
    requirementSource: RequirementSource
    primarySource: PrimarySource
    fastMode: boolean
    fastModels: FastModelsConfig
    catalogModels?: ReadonlySet<string>
  }): EffectiveModelRoute
  ```

- [ ] **Step 1: Write failing activation/candidate tests.**

  In `src/routing/effective-route.test.ts`, assert exact activation values (`1`/`true` only), case-sensitive Provider allowlisting, explicit mapping precedence without catalog visibility, mapping self-target no-op, mapping of an already `-fast` model to a distinct model, catalog-confirmed automatic `A-fast`, and no-op outcomes for omitted/empty providers, malformed/unqualified selected model, missing automatic catalog candidate, and already-fast automatic input.

- [ ] **Step 2: Write failing primary materialization tests.**

  Use metadata-rich requirements to assert:

  - exact match copies entry controls, pins the selected Provider, removes only the matched baseline index;
  - successor match uses existing GPT/GLM metadata and removes its returned baseline index;
  - boundary prefix match copies metadata and removes only that matched index;
  - no match synthesizes `O` with selected Provider/model and requirement-level native variant, followed by the complete original chain;
  - unqualified selected model returns the baseline unchanged and never creates `providers:[]`;
  - equal model IDs with different ordered Provider arrays remain distinct;
  - ordered-Provider/model duplicates are stably deduplicated.

- [ ] **Step 3: Write failing fast-chain tests.**

  Assert the exact chain `[F, O, followed by the stable remainder]`, with `F` copied from `O` except for model ID; both pinned to the selected Provider; all entry controls inherited; requirement constraints/native variant retained; and exact duplicates of `F`/`O` removed without removing entries whose Provider list differs.

- [ ] **Step 4: Run the pure-transform RED tests.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/routing/effective-route.test.ts src/routing/model-upgrades.test.ts
      if ($LASTEXITCODE -eq 0) { throw "RED unexpectedly passed before effective-route implementation" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: non-zero with missing module/exports.

- [ ] **Step 5: Expose successor baseline identity without changing current callers.**

  Add:

  ```ts
  export type RequirementSuccessorMatch = { entry: FallbackEntry; baselineIndex: number }
  export function matchRequirementSuccessorWithIndex(
    requirement: ModelRequirement,
    providerID: string | undefined,
    modelID: string,
  ): RequirementSuccessorMatch | null
  ```

  Refactor the existing successor algorithm to return the chosen baseline index with its synthesized entry. Keep `matchRequirementSuccessor(...)` as a wrapper returning `match?.entry ?? null`, preserving resolver/runtime behavior and existing tests.

- [ ] **Step 6: Implement collision-safe stable identity and primary materialization.**

  Use `JSON.stringify([entry.providers, entry.model])` as the exact identity. Match in fixed order: exact → successor-with-index → boundary prefix. Construct `O`, remove one matched baseline by index, then stable-dedupe the resulting chain while retaining the first identity. Return `{ ...requirement, fallbackChain }`; never mutate the source requirement or entries.

- [ ] **Step 7: Implement candidate selection and final route construction.**

  Parse selected identities at the first slash and require non-empty Provider/model parts. If activation or allowlist fails, return the primary-materialized route. Test mapping ownership with `Object.prototype.hasOwnProperty.call(mappings, selectedModel)` so an explicit self-map remains authoritative and does not fall through to automatic discovery. Automatic candidate is `${modelID}-fast` and requires `catalogModels.has(candidate)`.

  `buildEffectiveModelRoute` must always materialize a qualified primary first, then optionally prepend `F`, and set `route.model` to `provider/F` only when promotion occurs; otherwise it remains the original selected string. Copy provenance arguments unchanged; do not manufacture `input-variant`.

- [ ] **Step 8: Run focused pure-transform GREEN tests.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/routing/effective-route.test.ts src/routing/model-upgrades.test.ts src/routing/resolver.test.ts
      if ($LASTEXITCODE -ne 0) { throw "effective route/model-upgrade tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all tests pass, including unchanged successor routing and exact fast/original ordering.

- [ ] **Step 9: Run typecheck to lock shared interface consistency.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      pnpm run typecheck
      if ($LASTEXITCODE -ne 0) { throw "typecheck failed after Task 4" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: exit 0; `EffectiveModelRoute.requirementSource` cannot accept chat-only provenance (`input-variant`, `no-op`, or `host-profile-floor`).

---

### Task 5: Add the Generation-Safe Effective Route Registry

**Files:**
- Create: `src/routing/route-registry.ts`
- Create: `src/routing/route-registry.test.ts`

**Interfaces:**
- Consumes: one complete local `ReadonlyMap<string, EffectiveModelRoute>` per config build.
- Produces: immutable snapshot objects with `{ published, snapshotId, routes }`, monotonically increasing build generations, and stale-publication rejection.

  ```ts
  export type EffectiveRouteSnapshot = Readonly<{
    published: boolean
    snapshotId: number
    routes: ReadonlyMap<string, EffectiveModelRoute>
  }>

  export type EffectiveRouteRegistry = {
    beginBuild(): number
    publish(generation: number, routes: ReadonlyMap<string, EffectiveModelRoute>): boolean
    snapshot(): EffectiveRouteSnapshot
    isCurrentSnapshot(snapshotId: number): boolean
  }

  export function createEffectiveRouteRegistry(): EffectiveRouteRegistry
  ```

- [ ] **Step 1: Write failing registry state-transition tests.**

  In `src/routing/route-registry.test.ts`, assert:

  1. Initial snapshot is `{ published:false, snapshotId:0, routes:empty }`.
  2. Publishing an empty map succeeds, yields `published:true`, and increments to snapshot 1.
  3. A later successful full publication replaces rather than accumulates routes and increments exactly once.
  4. If generation 1 begins, generation 2 begins, then generation 1 attempts to publish, it returns `false` and leaves the last successful snapshot object/data intact.
  5. Beginning a build that never publishes models a failed build and leaves the last success intact.
  6. `publish` copies the input map; mutating the caller's map afterward cannot alter the snapshot.
  7. `isCurrentSnapshot` changes only after a successful publication, not after `beginBuild` or stale publication.

- [ ] **Step 2: Run the registry RED test.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/routing/route-registry.test.ts
      if ($LASTEXITCODE -eq 0) { throw "RED unexpectedly passed before route registry implementation" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: non-zero with a missing module/exports error.

- [ ] **Step 3: Implement private state with atomic snapshot replacement.**

  Keep `latestStartedGeneration` and the current snapshot in the closure. `beginBuild()` pre-increments and returns the generation. `publish()` succeeds only on exact equality with the latest started generation, copies `routes` into a new `Map`, creates one new snapshot object with `snapshotId + 1`, and swaps the closure reference once. Never mutate the current snapshot's map during a build.

- [ ] **Step 4: Run the registry GREEN test.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/routing/route-registry.test.ts
      if ($LASTEXITCODE -ne 0) { throw "route registry tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all transitions pass, including published-empty versus never-published.

- [ ] **Step 5: Verify registry and route types compile together.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      pnpm run typecheck
      if ($LASTEXITCODE -ne 0) { throw "typecheck failed after Task 5" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: exit 0 with no mutable-map type leak from the public snapshot.

---

### Task 6: Register Final Routes for Every OCMM-Managed Surface

**Files:**
- Modify: `src/hooks/config.ts`
- Modify: `src/hooks/config.test.ts`
- Modify: `src/hooks/config.category.test.ts`

**Interfaces:**
- Consumes: materialized `OcmmConfig`, current OpenCode target (including provider catalog and existing same-name models), `EffectiveRouteRegistry`, explicit `getFastMode()`.
- Produces in OpenCode-managed mode: target models taken from `route.model` and one complete registry publication covering enabled built-ins, configured custom agents, built-in categories, configured categories, and compatibility aliases.
- Compatibility invariant: callers that omit registry dependencies keep current non-fast registration and may still request the legacy `registeredAgentModels` map; they do not publish routes.
- Config handler dependency contract:

  ```ts
  type ConfigHandlerBaseArgs = {
    getConfig: () => OcmmConfig
    skillsRoot?: string
    cwd?: string
  }

  type ConfigHandlerRouteMode =
    | {
        routeRegistry: EffectiveRouteRegistry
        getFastMode: () => boolean
        registeredAgentModels?: never
      }
    | {
        routeRegistry?: undefined
        getFastMode?: undefined
        registeredAgentModels?: Map<string, string>
      }

  export function createConfigHandler(
    args: ConfigHandlerBaseArgs & ConfigHandlerRouteMode,
  ): (input: unknown, output: unknown) => Promise<void>
  ```

- [ ] **Step 1: Replace model-map assertions with failing route/provenance assertions.**

  In `src/hooks/config.test.ts`, construct a registry and assert the provenance matrix explicitly:

  ```ts
  const snapshot = routeRegistry.snapshot()
  assert.equal(snapshot.published, true)
  assert.deepEqual(
    {
      requirementSource: snapshot.routes.get("reviewer")?.requirementSource,
      primarySource: snapshot.routes.get("reviewer")?.primarySource,
    },
    { requirementSource: "user-config", primarySource: "existing-model" },
  )
  ```

  Add table cases for user requirement/user primary, built-in/existing, built-in/catalog upgrade, built-in/head, and built-in category/catalog or head. Assert no route has `requirementSource` equal to `input-variant`, `no-op`, or `host-profile-floor`.

- [ ] **Step 2: Add failing managed-surface and policy integration tests.**

  Cover all of the following:

  - built-in agent, configured custom agent, built-in category, and configured non-built-in category each publish a route and set target model from it;
  - explicit mapping wins without catalog visibility but only for an allowlisted Provider;
  - automatic `A-fast` needs the selected Provider's `target.provider[provider].models[A-fast]`;
  - no allowlist yields a materialized original route, not fast promotion;
  - an unrelated existing OpenCode agent remains byte-for-byte deep-equal and has no route;
  - successful rebuild removes a deleted custom route instead of accumulating it;
  - `registerBuiltinAgents:false` successfully publishes an empty map;
  - a thrown registration build retains the prior successful snapshot;
  - existing same-name and catalog-selected qualified primaries appear at requirement index 0 even with fast mode false;
  - calling the shared handler without registry dependencies preserves current non-fast model selection and rebuilds an optional `registeredAgentModels` map without publishing strict route state.

- [ ] **Step 3: Add failing compatibility-alias ownership tests.**

  Configure `code-search` and a pre-existing `explore` with distinct models. With both fast candidates cataloged, assert `explore` receives its own route built from its final merged `explore` model, not the `code-search` route object or chain. Assert `explore`'s requirement begins `explore-fast`, `explore-original`; `code-search` has its own pair.

- [ ] **Step 4: Run config registration RED tests.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/hooks/config.test.ts src/hooks/config.category.test.ts
      if ($LASTEXITCODE -eq 0) { throw "RED unexpectedly passed before config route publication" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: non-zero because `routeRegistry/getFastMode` and effective routes are not yet integrated.

- [ ] **Step 5: Refactor primary selection into explicit route seeds.**

  Preserve the exact primary precedence for each managed name:

  ```text
  existing same-name target model
  configured normalized requirement head
  catalog-confirmed upgrade
  built-in requirement head
  ```

  Record `primarySource` at the selected branch. Resolve baseline requirement/provenance with `resolveEffectiveRequirement` after qualified aliases have already materialized. For custom agents/categories, use `existing-model` or `user-requirement`; do not invent catalog upgrades. Register configured categories not present in the built-in category list as `mode:"subagent"` when they have a direct normalized requirement, with agent config taking priority over a same-name category config.

- [ ] **Step 6: Build each final route from the actual selected primary.**

  Convert only the selected Provider's catalog `models` keys into a `Set<string>` and call `buildEffectiveModelRoute`. Write `route.model` back to the managed target entry even when the target originally supplied the model; this remains safe because that same existing model already won primary selection before optional fast promotion. Keep agent-level OpenCode controls on the target entry and out of fallback entries.

- [ ] **Step 7: Rebuild compatibility routes after alias merging.**

  Call `registerCompatAgentAliases` first, then route `explore` from its final merged target model. Choose alias provenance as follows: pre-existing alias model → `existing-model`; explicit alias requirement in `cfg.agents` → `user-requirement`; otherwise inherit the target route's `primarySource`. Resolve `requirementSource` independently through `resolveEffectiveRequirement({agentName:"explore"})`.

- [ ] **Step 8: Publish exactly once after a complete successful build.**

  In the registry-managed branch, reserve `generation = routeRegistry.beginBuild()` at handler invocation start and build `nextRoutes` locally. Do not clear the live registry. On malformed hook input, thrown registration, or any early failure, return/throw without publication. For `registerBuiltinAgents:false`, finish skills/MCP/command registration and publish the intentionally empty map. Publish only after target registration, compatibility aliases, permissions, and route model writes finish; ignore a `false` stale-publication result.

  In the compatibility branch, preserve the current non-fast registration flow and optional map rebuild. Do not call `beginBuild`, `publish`, or the fast transform. This branch exists only to keep shared callers source-compatible and is not a second runtime-registry contract.

- [ ] **Step 9: Run config registration GREEN tests.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/hooks/config.test.ts src/hooks/config.category.test.ts src/routing/effective-route.test.ts src/routing/route-registry.test.ts
      if ($LASTEXITCODE -ne 0) { throw "config route integration tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all managed surfaces publish exact final routes; unmanaged OpenCode agents stay unchanged.

- [ ] **Step 10: Inspect for accidental catalog mutation.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      rg -n "target\.provider.*=|provider\[.*\].*=|\.models.*=" src/hooks/config.ts src/routing/effective-route.ts
      if ($LASTEXITCODE -notin @(0, 1)) { throw "catalog mutation scan failed to run" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: no assignment that rewrites Provider catalog entries; reading keys for automatic confirmation is allowed.

---

### Task 7: Make Chat Routing Honor Published Routes and Published Absence

**Files:**
- Modify: `src/routing/resolver.ts`
- Modify: `src/routing/resolver.test.ts`
- Modify: `src/routing/resolver.category.test.ts`
- Modify: `src/hooks/chat-params.ts`
- Modify: `src/hooks/chat-params.test.ts`

**Interfaces:**
- Consumes: request-local model/provider/variant plus one registry snapshot.
- Produces: resolution against `route.requirement` and `route.requirementSource`; raw config is consulted only when the registry has never published.
- Resolver override contract:

  ```ts
  export type EffectiveRequirementOverride = {
    requirement: ModelRequirement
    source: RequirementSource
  }

  export type ResolveOpts = {
    agentName?: string
    modelID: string
    providerID?: string
    inputVariant?: string
    effectiveRequirement?: EffectiveRequirementOverride | null
    agentsConfig?: Record<string, AgentEntry>
    categoriesConfig?: Record<string, CategoryEntry>
    disabledAgents?: readonly string[]
  }
  ```

  `effectiveRequirement === undefined` means pre-publication raw resolution is allowed; an object means use only that requirement; `null` means a published snapshot intentionally has no route and raw resolution is forbidden.

- [ ] **Step 1: Add failing resolver sentinel tests.**

  In `src/routing/resolver.test.ts`, assert an explicit route requirement overrides contradictory raw config, explicit `null` plus no input variant returns `null`, and explicit `null` plus a valid input variant returns `source:"input-variant"`. Assert category max-policy still applies when the explicit requirement source is `category-default`. Retain a raw-resolution regression proving `disabledAgents` still suppresses a disabled review profile before any route has been published.

- [ ] **Step 2: Add failing chat registry boundary tests.**

  In `src/hooks/chat-params.test.ts`, build these snapshots:

  1. Never published: existing raw-config tests continue to pass.
  2. Published route contradicting raw config: output controls and ledger source come from route requirement/source.
  3. Published route whose `primarySource` is `existing-model` but `requirementSource` is `user-config`: explicit controls stay explicit.
  4. Published empty/missing route plus raw managed config: no raw recomputation and ledger records `no-op`.
  5. Published missing route plus unmanaged `inputVariant`: request-local variant still applies and records `input-variant`.

- [ ] **Step 3: Run resolver/chat RED tests.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/routing/resolver.test.ts src/routing/resolver.category.test.ts src/hooks/chat-params.test.ts
      if ($LASTEXITCODE -eq 0) { throw "RED unexpectedly passed before chat route-registry consumption" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: non-zero from unsupported explicit requirement and registry dependencies.

- [ ] **Step 4: Implement resolver override semantics without duplicating matching logic.**

  In `resolveModelRouting`, choose the effective requirement as:

  ```ts
  const effective = opts.effectiveRequirement === undefined
    ? (opts.agentName ? resolveEffectiveRequirement({
        agentName: opts.agentName,
        agentsConfig: opts.agentsConfig,
        categoriesConfig: opts.categoriesConfig,
        disabledAgents: opts.disabledAgents,
      }) : null)
    : opts.effectiveRequirement
  ```

  Reuse `resolveAgainstRequirement`, category variant policy, and the final request-local input-variant branch. Do not store or synthesize `input-variant` outside this call.

- [ ] **Step 5: Read one registry snapshot in `chat.params`.**

  Add `routeRegistry: EffectiveRouteRegistry` to `createChatParamsHandler`. For a named agent, form the resolver override as:

  ```ts
  const snapshot = args.routeRegistry.snapshot()
  const route = agentName ? snapshot.routes.get(agentName) : undefined
  const effectiveRequirement = snapshot.published
    ? (route ? { requirement: route.requirement, source: route.requirementSource } : null)
    : undefined
  ```

  Pass raw agents/categories only for the pre-publication path. Leave model matching against `input.model` unchanged so fast, original, successors, and later fallbacks inherit their own entry controls.

- [ ] **Step 6: Run resolver/chat GREEN tests.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/routing/resolver.test.ts src/routing/resolver.category.test.ts src/hooks/chat-params.test.ts
      if ($LASTEXITCODE -ne 0) { throw "resolver/chat route tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all tests pass; a published missing route never falls back to raw managed config, while unmanaged input variants still work.

- [ ] **Step 7: Verify request provenance remains orthogonal.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      rg -n "primarySource|input-variant" src/hooks/chat-params.ts src/routing/resolver.ts src/routing/route-registry.ts
      if ($LASTEXITCODE -ne 0) { throw "provenance scan found no expected references" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: `chat-params.ts` does not use `primarySource` to decide explicitness, and no registry code writes `input-variant`.

---

### Task 8: Bind Generic Runtime Fallback to Route Snapshots

**Files:**
- Modify: `src/runtime-fallback/fallback-state.ts`
- Modify: `src/runtime-fallback/fallback-state.test.ts`
- Modify: `src/runtime-fallback/event-handler-support.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler-generic-fallback.ts`
- Modify: `src/runtime-fallback/event-handler-test-fixtures.ts`
- Modify: `src/runtime-fallback/event-handler-fallback-dispatch.test.ts`
- Modify: `src/runtime-fallback/event-handler-failed-model-resolution.test.ts`

**Interfaces:**
- Consumes: one route snapshot captured for each event and the route's final model/requirement.
- Produces: snapshot-bound `FallbackState`; guarded generic fallback dispatch/commit; raw fallback only before first publication.

  ```ts
  export type FallbackState = {
    snapshotId: number
    originalModel: string
    fallbackIndex: number
    attempts: number
    failedModels: Map<string, number>
    activeModel?: string
  }

  export function createFallbackState(originalModel: string, snapshotId: number): FallbackState
  export function getOrCreateFallbackState(
    sessionStates: Map<string, FallbackState>,
    sessionID: string,
    requirement: ModelRequirement,
    identity: ModelIdentity,
    snapshotId: number,
  ): FallbackState

  export type GenericFallbackInput = {
    sessionID: string
    generation: number
    snapshotId: number
    agent?: string
    classification: ErrorClassification
    requirement: ModelRequirement | null
    state?: FallbackState
    failedTarget?: Subagent429Target
    runtimeConfig: RuntimeFallbackConfig
  }

  export type GenericFallbackContext = {
    lifecycle: RuntimeFallbackSessionLifecycle
    client?: OcmmClient
    directory?: string
    clock: () => number
    isCurrentSnapshot: (snapshotId: number) => boolean
  }

  export type RuntimeFallbackDeps = {
    getConfig: () => OcmmConfig
    client?: OcmmClient
    directory?: string
    idleState?: IdleContinuationState
    clearSessionIntent?: (sessionID: string) => void
    routeRegistry?: EffectiveRouteRegistry
    scheduler?: Subagent429Scheduler
    clock?: () => number
    random?: () => number
  }

  export type RuntimeFallbackSessionLifecycle = {
    beginSession: (sessionID: string) => number
    invalidateSession: (sessionID: string) => void
    hasSession: (sessionID: string) => boolean
    currentGeneration: (sessionID: string) => number
    isCurrent: (sessionID: string, generation: number) => boolean
    trackDispatch: <T>(sessionID: string, generation: number, promise: Promise<T>) => Promise<T>
    waitForStaleDispatches: (sessionID: string, generation: number) => Promise<void>
    guardedClient: (
      sessionID: string,
      generation: number,
      isOperationCurrent?: () => boolean,
    ) => OcmmClient
  }
  ```

- [ ] **Step 1: Add failing state reset and fast-index tests.**

  Update every `createFallbackState` test call to pass a concrete snapshot and assert it is stored. Add a `getOrCreateFallbackState` test proving a same-session state is replaced when snapshot changes and initialized against the new route's actual primary index. Add a pure fast chain test proving failure at index 0 selects original `A` at index 1.

- [ ] **Step 2: Add failing runtime route-consumption and mid-dispatch staleness tests.**

  Split assertions by current ownership: route/initial-model cases in `event-handler-failed-model-resolution.test.ts`; generic dispatch and fast surface cases in `event-handler-fallback-dispatch.test.ts`. Assert:

  - published route model supplies the initial identity when the event omits model information;
  - published route requirement contradicting raw config controls the dispatched fallback;
  - published missing route does not raw-recompute a managed requirement;
  - never-published registry preserves existing raw-config behavior;
  - after a successful new snapshot, the next error for the same session restarts fallback index/attempts against the new route;
  - a snapshot change while a generic dispatch is awaiting `messages` makes the guarded client return no retryable parts, so the old target never reaches `session.prompt` and old state is not committed;
  - a snapshot change after `messages` resolves but before `prompt` is invoked is rejected by the prompt preflight guard;
  - a snapshot change before generic dispatch starts yields no client abort/messages/prompt calls.

  Extend `event-handler-test-fixtures.ts` with a controlled client that exposes separate deferred `abort`, `messages`, and `prompt` phases plus call counters. This test must publish snapshot 2 while snapshot 1's `messages` promise is pending, release it, then assert old prompt count and old commit/next-index effects are both zero.

- [ ] **Step 3: Add the required real runtime fast-failure surface test.**

  Name the test exactly `runtime surface: A-fast retryable failure dispatches original A`. Publish a route with model `provider/A-fast` and requirement chain `[A-fast, A, later]`, send a retryable 503 event for `A-fast`, and assert the mock `client.session.prompt` receives `providerID:"provider", modelID:"A"` before any later fallback.

- [ ] **Step 4: Run generic runtime RED tests in an isolated environment.**

  **Isolated RED command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/runtime-fallback/fallback-state.test.ts src/runtime-fallback/event-handler-fallback-dispatch.test.ts src/runtime-fallback/event-handler-failed-model-resolution.test.ts
      $code = $LASTEXITCODE
      if ($code -eq 0) { throw "RED unexpectedly passed before runtime snapshot integration" }
      Write-Host "Expected RED: FallbackState lacks snapshotId and event fallback still reads raw config/model map."
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: non-zero from snapshot/route assertions.

- [ ] **Step 5: Make generic state creation snapshot-aware.**

  Require `snapshotId` in `createFallbackState`. In `getOrCreateFallbackState`, return an existing state only when `existing.snapshotId === snapshotId`; otherwise replace it and align `fallbackIndex` using exact → successor → boundary prefix matching against the effective requirement. Preserve `-1` for a qualified model outside the chain so the next search begins at chain index 0.

- [ ] **Step 6: Resolve requirement and initial model from one route snapshot.**

  Add optional `routeRegistry?: EffectiveRouteRegistry` to `RuntimeFallbackDeps` and create one local never-published registry only when an isolated direct caller omits it; Task 10 always injects the shared production registry. For each `session.error`, capture `const routeSnapshot = routeRegistry.snapshot()` once. Use exact named route when present; use `resolveEffectiveRequirement` only if `routeSnapshot.published === false`; when published and missing, use no managed requirement. Replace `registeredAgentModels.get(agent)` with `route?.model` and pass `routeSnapshot.snapshotId` to state creation.

- [ ] **Step 7: Guard generic work at every asynchronous cut point.**

  Add `snapshotId` to `GenericFallbackInput`. Check `routeRegistry.isCurrentSnapshot(snapshotId)`:

  1. at `runGenericFallback` entry, before marking/peeking;
  2. after `waitForStaleDispatches` and immediately before `dispatchFallbackRetry`;
  3. inside the client passed to `dispatchFallbackRetry`, immediately before each actual `abort`, `messages`, and `prompt` call, and after each awaited response before the next phase;
  4. after dispatch resolves and immediately before `commitFallback`;
  5. before invoking a generic handoff closure supplied to the 429 controller.

  Implement the inner guard by extending `RuntimeFallbackSessionLifecycle.guardedClient(sessionID, generation, isOperationCurrent)` in `event-handler-support.ts`. Each method requires both the existing lifecycle generation and `isOperationCurrent()`; stale `messages` returns `{messages:[]}`, stale `prompt` throws the existing stale-operation error, and a stale post-await response is discarded. In `event-handler-generic-fallback.ts`, pass `() => routeRegistry.isCurrentSnapshot(input.snapshotId)` when constructing the guarded client. Snapshot mismatch returns without old-model prompt or commit. Lifecycle-generation checks remain in addition to snapshot checks.

- [ ] **Step 8: Run generic runtime GREEN tests.**

  **Isolated GREEN command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/runtime-fallback/fallback-state.test.ts src/runtime-fallback/event-handler-fallback-dispatch.test.ts src/runtime-fallback/event-handler-failed-model-resolution.test.ts
      if ($LASTEXITCODE -ne 0) { throw "generic runtime snapshot tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all tests pass; the named runtime surface dispatches `A`, not `later`.

- [ ] **Step 9: Run the named runtime surface alone as an executable acceptance probe.**

  **Isolated GREEN command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types --test-name-pattern="runtime surface: A-fast retryable failure dispatches original A" src/runtime-fallback/event-handler-fallback-dispatch.test.ts
      if ($LASTEXITCODE -ne 0) { throw "A-fast to A runtime surface failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: one matching test passes and captured prompt target is exactly `provider/A`.

---

### Task 9: Cancel Stale 429 Timers, Queues, Switches, Handoffs, Dispatches, and Commits

**Files:**
- Modify: `src/runtime-fallback/subagent-429-controller.ts`
- Modify: `src/runtime-fallback/subagent-429-session.ts`
- Modify: `src/runtime-fallback/subagent-429-controller-fixture.ts`
- Modify: `src/runtime-fallback/subagent-429-controller-gate-policy.test.ts`
- Modify: `src/runtime-fallback/subagent-429-controller-lifecycle.test.ts`
- Modify: `src/runtime-fallback/subagent-429-controller-settlement.test.ts`
- Verify: `src/runtime-fallback/subagent-429-controller-matrix.test.ts`
- Modify: `src/runtime-fallback/subagent-429-controller-delay-scope.test.ts`
- Modify: `src/runtime-fallback/subagent-429-controller-interruption.test.ts`
- Modify: `src/runtime-fallback/event-handler.ts`
- Modify: `src/runtime-fallback/event-handler-test-fixtures.ts`
- Modify: `src/runtime-fallback/event-handler-dedicated-429-gates.test.ts`
- Modify: `src/runtime-fallback/event-handler-dedicated-429-switching.test.ts`
- Modify: `src/runtime-fallback/event-handler-dedicated-429-session-lifecycle.test.ts`

**Interfaces:**
- Consumes: route `snapshotId` captured at controller/session/event operation creation and an `isCurrentSnapshot` callback.
- Produces: stale controller shutdown with zero stale dispatch, generic handoff, retry accounting, or prepared-switch commit.
- Updated contracts:

  ```ts
  export type Subagent429DispatchInput = {
    sessionID: string
    snapshotId: number
    agent?: string
    target: Subagent429Target
    reason: string
  }

  export type Subagent429PreparedSwitch = {
    snapshotId: number
    target: Subagent429Target
    attempt: number
    commit: () => void
  }

  export type Subagent429ErrorInput = {
    sessionID: string
    snapshotId: number
    agent?: string
    target: Subagent429Target
    classification: { reason: string; recoveryDelayMs?: number }
    runtimeConfig: RuntimeFallbackConfig
    prepareSwitch: (failedTarget: Subagent429Target, blocker: FallbackCandidateBlocker) => Subagent429PrepareResult
  }

  export type Subagent429OtherErrorInput = {
    sessionID: string
    snapshotId: number
    runGenericFallback: Subagent429GenericHandoff
  }

  export type Subagent429ControllerDeps = {
    isCurrentSnapshot: (snapshotId: number) => boolean
    scheduler?: Subagent429Scheduler
    clock?: () => number
    random?: () => number
    dispatchRetry?: (input: Subagent429DispatchInput) => Promise<boolean>
    logger?: Pick<typeof defaultLog, "debug" | "info" | "warn">
  }
  ```

- [ ] **Step 1: Add failing timer and pre-dispatch cancellation tests.**

  Extend `subagent-429-controller-fixture.ts` with mutable `currentSnapshotId`, default snapshot-bearing `errorInput`, and `isCurrentSnapshot`. Add timer-first/idle-first cases to `subagent-429-controller-gate-policy.test.ts`: create a pending retry/switch at snapshot 1, advance to 2 before timer/idle release, and assert scheduler execution causes zero `dispatchRetry` calls and removes/stops the old session state.

- [ ] **Step 2: Add failing queue and generic-handoff cancellation tests.**

  Add these cases to `subagent-429-controller-lifecycle.test.ts` and `subagent-429-controller-settlement.test.ts`: start a deferred dispatch at snapshot 1, queue a 429 and separately queue an `other` outcome, publish snapshot 2, settle the old dispatch, and assert there is no second dispatch, no `prepareSwitch`, and no generic handoff. Assert the old controller no longer suppresses later idle continuation.

- [ ] **Step 3: Add failing prepared-switch/account/commit tests.**

  Add these cases to `subagent-429-controller-settlement.test.ts`: with `maxRetries:0`, prepare a switch at snapshot 1 and count `commit()` calls. Cover snapshot change (a) before dispatch, and (b) while dispatch is deferred but before accounting. Both cases must keep commits at 0 and must not increment retry/switch accounting. Retain the existing success-path assertion that a current switch commits exactly once.

- [ ] **Step 4: Add failing event-handler defense-in-depth tests.**

  Use current split ownership: `event-handler-dedicated-429-gates.test.ts` covers a route change before dispatch and while dedicated `messages` is suspended; `event-handler-dedicated-429-switching.test.ts` covers prepared commit/accounting; `event-handler-dedicated-429-session-lifecycle.test.ts` covers route-snapshot invalidation independent of delete/recreate. Prove the controller's `dispatchRetry` closure passes the snapshot-aware guarded client from Task 8, and the prepared commit closure independently checks the captured snapshot. Publish snapshot 2 while snapshot 1's dedicated `messages` promise is pending, release it, then assert old target prompt, accounting, and commit are all zero.

- [ ] **Step 5: Run 429 snapshot RED tests in an isolated environment.**

  **Isolated RED command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      $tests = @(
        "src/runtime-fallback/subagent-429-controller-gate-policy.test.ts",
        "src/runtime-fallback/subagent-429-controller-lifecycle.test.ts",
        "src/runtime-fallback/subagent-429-controller-settlement.test.ts",
        "src/runtime-fallback/subagent-429-controller-matrix.test.ts",
        "src/runtime-fallback/subagent-429-controller-delay-scope.test.ts",
        "src/runtime-fallback/subagent-429-controller-interruption.test.ts",
        "src/runtime-fallback/event-handler-dedicated-429-gates.test.ts",
        "src/runtime-fallback/event-handler-dedicated-429-switching.test.ts",
        "src/runtime-fallback/event-handler-dedicated-429-session-lifecycle.test.ts"
      )
      & node --test --experimental-strip-types @tests
      $code = $LASTEXITCODE
      if ($code -eq 0) { throw "RED unexpectedly passed before 429 snapshot barriers" }
      Write-Host "Expected RED: 429 work does not yet carry or recheck route snapshots."
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: non-zero from missing snapshot fields/dependency and stale side-effect assertions.

- [ ] **Step 6: Bind each controller session to one snapshot.**

  Give `Session429State` a readonly `snapshotId` constructor argument and a `matchesSnapshot(snapshotId)` query. Change controller APIs to `onSessionCreated(sessionID, isChild, snapshotId)`, `onIdle(sessionID, snapshotId)`, and `getActiveDispatchTarget(sessionID, snapshotId)`. On an `on429` snapshot mismatch, stop the old live state, create a fresh child controller at the incoming snapshot, and process the current error. On `onOtherError`, idle, or target lookup mismatch, stop old state and return unhandled/untracked so current generic logic can rebuild from the current route.

- [ ] **Step 7: Carry snapshot identity through every deferred structure.**

  Add `snapshotId` to `PreparedDispatch`, `PendingGate`, `ActiveDispatch`, `Queued429`, and `QueuedOtherError`. The value is captured from the incoming error when each object/closure is created; it is never reread from mutable event input. Include it in `Subagent429DispatchInput` and `Subagent429PreparedSwitch`. Update the shared controller fixture once so the existing matrix/delay/scope suites explicitly run at snapshot 0 and continue proving their original behavior.

- [ ] **Step 8: Recheck immediately before each side effect.**

  Centralize `isSnapshotCurrent(id) = deps.isCurrentSnapshot(id) && id === this.snapshotId`. On mismatch call `stop()` and return. Invoke it in all of these locations:

  1. scheduler callback before setting `delayReady`;
  2. `maybeStart` before creating `ActiveDispatch`;
  3. `settle` immediately before `dispatchRetry`;
  4. `settle` after awaited dispatch and before accounting/queued processing;
  5. `processQueued` before another 429 or generic handoff;
  6. `account` before retry-count mutation or prepared commit;
  7. event-handler dedicated dispatch closure immediately before runtime dispatch;
  8. event-handler prepared `commit` closure immediately before `commitFallback`.

  The dedicated dispatch closure must also pass `() => routeRegistry.isCurrentSnapshot(snapshotId)` to `lifecycle.guardedClient`. This supplies the Task 8 pre/post checks around actual `messages` and `prompt` client calls, preventing a route change during `messages` from reaching an old-model prompt.

- [ ] **Step 9: Preserve lifecycle-generation guards alongside snapshot guards.**

  Do not replace `lifecycleGeneration`, `timerGeneration`, or `nextDispatchGeneration`. `isCurrent(active)` must require live object identity, lifecycle generation, and current snapshot. Session delete/recreate tests must still invalidate stale work even when snapshot ID is unchanged.

- [ ] **Step 10: Run 429 snapshot GREEN tests.**

  **Isolated GREEN command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      $tests = @(
        "src/runtime-fallback/subagent-429-controller-gate-policy.test.ts",
        "src/runtime-fallback/subagent-429-controller-lifecycle.test.ts",
        "src/runtime-fallback/subagent-429-controller-settlement.test.ts",
        "src/runtime-fallback/subagent-429-controller-matrix.test.ts",
        "src/runtime-fallback/subagent-429-controller-delay-scope.test.ts",
        "src/runtime-fallback/subagent-429-controller-interruption.test.ts",
        "src/runtime-fallback/event-handler-dedicated-429-gates.test.ts",
        "src/runtime-fallback/event-handler-dedicated-429-switching.test.ts",
        "src/runtime-fallback/event-handler-dedicated-429-session-lifecycle.test.ts"
      )
      & node --test --experimental-strip-types @tests
      if ($LASTEXITCODE -ne 0) { throw "429 snapshot barrier tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: current-snapshot behavior remains unchanged; stale timer/queue/prepared/handoff paths have zero stale side effects.

- [ ] **Step 11: Run all runtime fallback files as an integration gate.**

  **Isolated GREEN command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      $runtimeTests = @(Get-ChildItem -LiteralPath "src/runtime-fallback" -Filter "*.test.ts" -File | ForEach-Object { $_.FullName })
      if ($runtimeTests.Count -eq 0) { throw "no runtime fallback test files found" }
      & node --test --experimental-strip-types @runtimeTests
      if ($LASTEXITCODE -ne 0) { throw "runtime fallback integration tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: every runtime fallback test passes from the explicit PowerShell-expanded file array.

---

### Task 10: Wire One Registry and Exact Fast Activation Through the Plugin Lifecycle

**Files:**
- Verify: `src/hooks/event.ts`
- Modify: `src/runtime-fallback/index.ts`
- Modify: `src/index.ts`
- Modify: `src/index.test.ts`
- Modify: `src/hooks/config.test.ts`
- Modify: `src/hooks/chat-params.test.ts`
- Modify: `src/runtime-fallback/event-handler-failed-model-resolution.test.ts`

**Interfaces:**
- Consumes: `loadOpenCodePluginConfig({ cwd })` and ambient `OCMM_FAST` once at plugin create/reload boundary.
- Produces: initial and reloaded configs materialized only through the plugin facade, plus one persistent `EffectiveRouteRegistry` injected into config, chat, and event handlers; mutable captured activation refreshed only by `reload()`.
- Final OpenCode runtime boundary: `registeredAgentModels` is removed from plugin ownership, chat/event wiring, and runtime fallback; it remains available only as the shared config handler's out-of-scope compatibility option.
- Config-load invariant: `src/index.ts` imports and calls `loadOpenCodePluginConfig`, never ordinary `loadConfig`; the initial `loadOrDefault()` call and the call reached by `reload()` share that same explicit boundary.

- [ ] **Step 1: Add failing exact-value and reload-boundary tests.**

  Extend the isolated helper in `src/index.test.ts` to save/clear/restore all three OCMM variables. Add table cases proving `OCMM_FAST` values `1` and `true` enable fast mode, while `TRUE`, `True`, ` yes `, `0`, and empty/absent disable it. Use a project config with an allowlisted Provider and a target catalog containing `A-fast`; invoke the real plugin `config` hook and inspect the registered managed model.

  Add a config-load boundary fixture whose source agent has only `alias:"precision:reviewer"`. Prove `createPlugin` exposes the materialized requirement on initial load; rewrite the fixture to target a different profile requirement, call `reload()`, and prove the reloaded config is materialized through the same facade. Add the fast boundary test separately: create the plugin with `OCMM_FAST=1`, change ambient value to `0` before invoking its config hook, and confirm the captured activation remains enabled; call `reload()`, invoke config again, and confirm it is now disabled.

- [ ] **Step 2: Add failing shared-instance behavior tests.**

  Through `createPlugin`, invoke config publication, then `chat.params` and a runtime error. Assert chat controls and runtime fallback both reflect the published fast route. Change project config and call `reload()` without invoking the config hook; consumers must retain the last successful route snapshot. Invoke config successfully and assert the new snapshot behavior replaces the old one.

- [ ] **Step 3: Run plugin wiring RED tests in an isolated environment.**

  **Isolated RED command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/index.test.ts
      $code = $LASTEXITCODE
      if ($code -eq 0) { throw "RED unexpectedly passed before plugin-only loading and shared registry/activation wiring" }
      Write-Host "Expected RED: createPlugin still uses ordinary loading, owns registeredAgentModels, and does not parse fast activation."
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: non-zero from fast activation or cross-consumer route assertions.

- [ ] **Step 4: Own the plugin-only loader, registry, and captured activation in `createPlugin`.**

  Use:

  ```ts
  const routeRegistry = createEffectiveRouteRegistry()
  let fastMode = parseFastModeValue(process.env.OCMM_FAST)
  const getFastMode = (): boolean => fastMode
  ```

  Replace the `src/index.ts` import and loading call with `loadOpenCodePluginConfig({ cwd })` inside `loadOrDefault()`. Because both initial assignment and `reload()` call `loadOrDefault()`, this makes both lifecycle loads use the dedicated materializing facade; there must be no ordinary `loadConfig` reference in `src/index.ts`. Inject the exact registry above into `createConfigHandler`, `createChatParamsHandler`, and `createEventHandler`; inject `getFastMode` only into config. In `reload()`, re-run `loadOrDefault()`, then set `fastMode = parseFastModeValue(process.env.OCMM_FAST)`. Never clear or recreate the registry during reload; a later successful config-hook publication advances it.

- [ ] **Step 5: Complete the atomic `registeredAgentModels` cutover.**

  Remove the map from `src/index.ts`, `createEventHandler`, `RuntimeFallbackDeps`, and OpenCode runtime tests. Route model lookup in OpenCode chat/runtime must come exclusively from the shared snapshot. Update OpenCode test harnesses to publish routes or intentionally use an unpublished registry. Preserve `createConfigHandler`'s mutually exclusive optional `registeredAgentModels` compatibility branch from Task 6; do not inject that branch into `createPlugin`.

- [ ] **Step 6: Run plugin wiring GREEN tests.**

  **Isolated GREEN command:**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      node --test --experimental-strip-types src/index.test.ts src/hooks/config.test.ts src/hooks/chat-params.test.ts src/runtime-fallback/event-handler-failed-model-resolution.test.ts
      if ($LASTEXITCODE -ne 0) { throw "shared plugin registry tests failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all tests pass; initial load and reload materialize qualified aliases through the facade, and direct ambient fast-mode changes have no effect until `reload()`.

- [ ] **Step 7: Prove the old model store is gone and the plugin loader is explicit.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      rg -n "registeredAgentModels" src/index.ts src/hooks/event.ts src/hooks/chat-params.ts src/runtime-fallback --glob "!*.test.ts" --glob "!*-fixture.ts"
      $code = $LASTEXITCODE
      if ($code -eq 0) { throw "registeredAgentModels remains in an OpenCode runtime consumer" }
      if ($code -ne 1) { throw "OpenCode registeredAgentModels scan failed" }
      rg -n "\bloadConfig\b" src/index.ts
      $genericLoadCode = $LASTEXITCODE
      if ($genericLoadCode -eq 0) { throw "src/index.ts still uses ordinary loadConfig" }
      if ($genericLoadCode -ne 1) { throw "ordinary loadConfig scan failed" }
      rg -n "loadOpenCodePluginConfig" src/index.ts
      if ($LASTEXITCODE -ne 0) { throw "src/index.ts does not use the plugin-only config facade" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: ripgrep exit 1 for the old model store across OpenCode plugin/runtime consumers and for ordinary `loadConfig` in `src/index.ts`; the dedicated loader is present, while generic compatibility references remain confined to their shared, out-of-scope surfaces.

- [ ] **Step 8: Prove shared-handler source compatibility without migration.**

  Leave `src/codex/plugin-generator.ts` and its tests unmodified. Its existing `loadConfig({ cwd: projectRoot, host:"codex", includeUser:false })` call and fallback `loadConfig({ cwd: projectRoot, host:"opencode", includeUser:false })` call both remain generic and must not materialize qualified aliases; this is guaranteed by the explicit facade boundary, not by host detection. Its existing `createConfigHandler({ getConfig, cwd, skillsRoot })` call must compile because the registry-managed arguments are optional only through the explicitly defined compatibility union; it remains on current non-fast behavior. This is source compatibility, not a feature guarantee or migration.

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      pnpm run typecheck
      if ($LASTEXITCODE -ne 0) { throw "shared createConfigHandler callers no longer compile" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: exit 0 with OpenCode using the plugin-only config facade and strict registry branch, while every unchanged out-of-scope caller—including the generator's OpenCode-host fallback—compiles through ordinary loading and the non-fast compatibility branch.

---

### Task 11: Document the OpenCode Contract and Synchronize Schema-Owned Artifacts

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `examples/ocmm.example.jsonc`
- Regenerate: `schema.json`

**Interfaces:**
- Consumes: final OpenCode CLI/config/qualified-alias/route-publication/reload behavior and schema source.
- Produces: accurate OpenCode user docs, architecture docs, schema-valid example config, and synchronized root JSON Schema.

- [ ] **Step 1: Run a failing documentation/schema contract check before editing docs or generating schema.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      $checks = @(
        @{ Path = "README.md"; Pattern = "ocmm --fast" },
        @{ Path = "README.md"; Pattern = "fastModels" },
        @{ Path = "README.md"; Pattern = "precision:reviewer" },
        @{ Path = "docs/architecture.md"; Pattern = "loadOpenCodePluginConfig" },
        @{ Path = "docs/architecture.md"; Pattern = "EffectiveModelRoute" },
        @{ Path = "docs/architecture.md"; Pattern = "snapshotId" },
        @{ Path = "examples/ocmm.example.jsonc"; Pattern = '"fastModels"' }
      )
      $missing = foreach ($check in $checks) {
        rg -q -- $check.Pattern $check.Path
        if ($LASTEXITCODE -eq 1) { "$($check.Path):$($check.Pattern)" }
        elseif ($LASTEXITCODE -ne 0) { throw "documentation contract scan failed for $($check.Path)" }
      }
      if (@($missing).Count -eq 0) { throw "RED unexpectedly passed before documentation updates" }
      $missing
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: prints the missing new contracts.

- [ ] **Step 2: Update user-facing CLI and fast-policy documentation.**

  In `README.md`, document `ocmm --fast run "Review this change"`, pre-separator consumption, `ocmm -- --fast` passthrough, exact direct-plugin env values, explicit Provider allowlist, authoritative same-provider mappings, catalog-confirmed automatic suffix, and no promotion when providers are omitted/empty. State that fast mode applies only to OCMM-managed routes and does not mutate unmanaged OpenCode agents or provider catalogs.

- [ ] **Step 3: Update profile and qualified-alias documentation.**

  Document the OpenCode-plugin-only qualified-alias contract, existing inline < user directory < project `.opencode/ocmm-profiles` precedence, unchanged ambient active-profile selection, lazy invalid directory profiles, and invalid-shadow behavior. Explain first-colon grammar and show `oracle.alias = "precision:reviewer"`; enumerate imported requirement fields and explicitly state that permissions/prompts/tools/agent controls/profile-wide fields remain local. Do not imply Codex or ordinary programmatic `loadConfig` calls materialize the alias.

- [ ] **Step 4: Update architecture and runtime semantics.**

  In `docs/architecture.md`, document the explicit `loadOpenCodePluginConfig` initial/reload boundary, its internal descriptor/base-agent pipeline and atomic default fallback, and ordinary `loadConfig` non-materialization even for `host:"opencode"`. Then replace OpenCode raw recomputation/model-map descriptions with final primary selection → unconditional materialization → optional fast transform → generation-safe full publication. Document route shape/provenance orthogonality, never-published versus published-empty/missing behavior, OpenCode config/chat/runtime consumers, compatibility-branch boundary, reload retention, generic `FallbackState.snapshotId`, and every 429 stale side-effect barrier.

- [ ] **Step 5: Update the example with schema-valid policy and alias.**

  Add an opt-in `fastModels` object with at least one allowlisted Provider and one same-provider mapping. Add a `precision` inline profile carrying a complete requirement, and a source agent using `alias:"precision:reviewer"` plus local behavior fields to demonstrate requirement-only import. Keep JSONC valid and explain that profile `providers` replaces while `mappings` deep-merges.

- [ ] **Step 6: Regenerate and verify `schema.json`.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      pnpm run gen-schema
      if ($LASTEXITCODE -ne 0) { throw "gen-schema failed" }
      node --input-type=module -e "import { readFileSync } from 'node:fs'; const s=JSON.parse(readFileSync('schema.json','utf8')); if(!s.properties?.fastModels) process.exit(1); const p=s.properties?.profiles?.additionalProperties?.properties?.fastModels; if(!p) process.exit(2);"
      if ($LASTEXITCODE -ne 0) { throw "generated schema lacks root/profile fastModels" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: both root and profile schemas exist; root carries defaults and profile children remain optional without defaults.

- [ ] **Step 7: Run documentation/schema GREEN checks.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      foreach ($check in @(
        @{ Path = "README.md"; Pattern = "ocmm --fast" },
        @{ Path = "README.md"; Pattern = "fastModels" },
        @{ Path = "README.md"; Pattern = "precision:reviewer" },
        @{ Path = "docs/architecture.md"; Pattern = "loadOpenCodePluginConfig" },
        @{ Path = "docs/architecture.md"; Pattern = "EffectiveModelRoute" },
        @{ Path = "docs/architecture.md"; Pattern = "snapshotId" },
        @{ Path = "examples/ocmm.example.jsonc"; Pattern = '"fastModels"' }
      )) {
        rg -q -- $check.Pattern $check.Path
        if ($LASTEXITCODE -ne 0) { throw "missing documented contract $($check.Pattern) in $($check.Path)" }
      }
      node --experimental-strip-types -e "import { readFileSync } from 'node:fs'; import { stripJsoncCommentsAndTrailingCommas } from './src/config/load.ts'; import { OcmmConfigSchema } from './src/config/schema.ts'; const raw=readFileSync('./examples/ocmm.example.jsonc','utf8'); OcmmConfigSchema.parse(JSON.parse(stripJsoncCommentsAndTrailingCommas(raw)));"
      if ($LASTEXITCODE -ne 0) { throw "example config is not schema-valid" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all scans and example parse pass. No non-schema generator is invoked.

---

## Final Verification and Acceptance Wave

- [ ] **Run final gate 1: regenerate the root JSON Schema.**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      pnpm run gen-schema
      if ($LASTEXITCODE -ne 0) { throw "final gen-schema failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: exit 0 and `schema.json` reflects the current `OcmmConfigSchema` revision.

- [ ] **Run final gate 2: execute the focused ambient-isolated matrix.**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      $focusedTests = @(
        "src/cli/shim.test.ts",
        "src/config/schema.test.ts",
        "src/config/load.test.ts",
        "src/config/profiles.test.ts",
        "src/config/normalize.test.ts",
        "src/config/profile-aliases.test.ts",
        "src/routing/model-upgrades.test.ts",
        "src/routing/effective-route.test.ts",
        "src/routing/route-registry.test.ts",
        "src/routing/resolver.test.ts",
        "src/routing/resolver.category.test.ts",
        "src/hooks/config.test.ts",
        "src/hooks/config.category.test.ts",
        "src/hooks/chat-params.test.ts",
        "src/index.test.ts"
      )
      $runtimeTests = @(Get-ChildItem -LiteralPath "src/runtime-fallback" -Filter "*.test.ts" -File | ForEach-Object { $_.FullName })
      if ($runtimeTests.Count -eq 0) { throw "no runtime fallback tests found" }
      & node --test --experimental-strip-types @focusedTests @runtimeTests
      if ($LASTEXITCODE -ne 0) { throw "final focused OpenCode test matrix failed" }

      foreach ($check in @(
        @{ Path = "README.md"; Pattern = "ocmm --fast" },
        @{ Path = "README.md"; Pattern = "fastModels" },
        @{ Path = "README.md"; Pattern = "precision:reviewer" },
        @{ Path = "docs/architecture.md"; Pattern = "loadOpenCodePluginConfig" },
        @{ Path = "docs/architecture.md"; Pattern = "EffectiveModelRoute" },
        @{ Path = "docs/architecture.md"; Pattern = "snapshotId" },
        @{ Path = "examples/ocmm.example.jsonc"; Pattern = '"fastModels"' }
      )) {
        rg -q -- $check.Pattern $check.Path
        if ($LASTEXITCODE -ne 0) { throw "missing documented contract $($check.Pattern) in $($check.Path)" }
      }
      node --experimental-strip-types -e "import { readFileSync } from 'node:fs'; import { stripJsoncCommentsAndTrailingCommas } from './src/config/load.ts'; import { OcmmConfigSchema } from './src/config/schema.ts'; const raw=readFileSync('./examples/ocmm.example.jsonc','utf8'); OcmmConfigSchema.parse(JSON.parse(stripJsoncCommentsAndTrailingCommas(raw)));"
      if ($LASTEXITCODE -ne 0) { throw "final example schema validation failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: all focused OpenCode/schema/profile/routing/runtime tests and documentation/example checks pass with ambient profile/fast state cleared.

- [ ] **Run final gate 3: typecheck the complete source tree.**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      pnpm run typecheck
      if ($LASTEXITCODE -ne 0) { throw "final typecheck failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: exit 0, including unchanged shared-handler callers using the compatibility branch.

- [ ] **Run final gate 4: execute the isolated full test suite.**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      pnpm test
      if ($LASTEXITCODE -ne 0) { throw "final full test suite failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: complete existing TypeScript and Rust suites exit 0; this is a repository regression gate, not an expansion of out-of-scope behavior guarantees.

- [ ] **Run final gate 5: build once for all subsequent surface evidence.**

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      pnpm run build
      if ($LASTEXITCODE -ne 0) { throw "final build failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: final TypeScript/Rust build exits 0. Do not run another build unless a later edit restarts the entire final sequence from gate 1.

- [ ] **Run final gate 6: exercise the built shim against an isolated fake OpenCode fixture.**

  Gate 5 produced the exact `dist` under test. Execute this probe without rebuilding afterward:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    $savedXdg = $env:XDG_CONFIG_HOME
    $probeRoot = Join-Path $env:LOCALAPPDATA "Temp\opencode\ocmm-fast-shim-probe"
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      if (Test-Path -LiteralPath $probeRoot) { Remove-Item -LiteralPath $probeRoot -Recurse -Force }
      New-Item -ItemType Directory -Path $probeRoot | Out-Null
      $env:XDG_CONFIG_HOME = $probeRoot
      $fake = Join-Path $probeRoot "fake-opencode.mjs"
      @'
import { writeFileSync } from "node:fs"
const [capture, ...args] = process.argv.slice(2)
writeFileSync(capture, JSON.stringify({ args, fast: process.env.OCMM_FAST ?? null }))
'@ | Set-Content -LiteralPath $fake -Encoding utf8
      $node = (Get-Command node).Source

      $fastCapture = Join-Path $probeRoot "fast.json"
      & node "dist\cli\shim.js" --mode none --no-providers --no-plugins --opencode $node --fast $fake $fastCapture run "Review this change"
      if ($LASTEXITCODE -ne 0) { throw "built shim fast probe failed" }
      $fast = Get-Content -LiteralPath $fastCapture -Raw | ConvertFrom-Json
      if ($fast.fast -ne "1") { throw "built shim did not set OCMM_FAST=1" }
      if (@($fast.args) -contains "--fast") { throw "built shim leaked consumed --fast" }

      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      $passCapture = Join-Path $probeRoot "separator.json"
      & node "dist\cli\shim.js" --mode none --no-providers --no-plugins --opencode $node -- $fake $passCapture --fast
      if ($LASTEXITCODE -ne 0) { throw "built shim separator probe failed" }
      $pass = Get-Content -LiteralPath $passCapture -Raw | ConvertFrom-Json
      if ($null -ne $pass.fast) { throw "separator passthrough unexpectedly enabled fast mode" }
      if (@($pass.args) -notcontains "--fast") { throw "separator did not pass --fast to fake OpenCode" }

      $plainCapture = Join-Path $probeRoot "plain.json"
      & node "dist\cli\shim.js" --mode none --no-providers --no-plugins --opencode $node $fake $plainCapture run "Review this change"
      if ($LASTEXITCODE -ne 0) { throw "built shim plain probe failed" }
      $plain = Get-Content -LiteralPath $plainCapture -Raw | ConvertFrom-Json
      if ($null -ne $plain.fast) { throw "plain shim invocation unexpectedly set OCMM_FAST" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
      if ($null -eq $savedXdg) { Remove-Item Env:\XDG_CONFIG_HOME -ErrorAction SilentlyContinue } else { $env:XDG_CONFIG_HOME = $savedXdg }
      if (Test-Path -LiteralPath $probeRoot) { Remove-Item -LiteralPath $probeRoot -Recurse -Force }
    }
  }
  ```

  Expected: consumed fast flag yields child env `1`; separator preserves `--fast` with no activation; plain launch has no activation.

- [ ] **Run final gate 7: exercise the A-fast→A runtime surface.**

  Run this block from the repository root after the built shim probe. Do not rebuild first.

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue

      node --test --experimental-strip-types --test-name-pattern="runtime surface: A-fast retryable failure dispatches original A" src/runtime-fallback/event-handler-fallback-dispatch.test.ts
      if ($LASTEXITCODE -ne 0) { throw "final runtime surface failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: the named runtime test passes and the first dispatched fallback target is exactly `provider/A`, before any later chain entry.

- [ ] **Run final gate 8: verify unrelated files, intended diff, and whitespace without Git writes.**

  Run:

  ```powershell
  & {
    $savedProfile = $env:OCMM_PROFILE; $savedNoProfile = $env:OCMM_NO_PROFILE; $savedFast = $env:OCMM_FAST
    try {
      Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue
      Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue
      $planPath = "docs/superpowers/plans/2026-07-17-fast-model-routing-profile-alias.md"
      $planText = Get-Content -LiteralPath $planPath -Raw
      $fileMap = [regex]::Match($planText, '(?s)## File Map\r?\n.*?(?=\r?\n## Requirement-to-Task Coverage)').Value
      $planOwned = @([regex]::Matches($fileMap, '\| `([^`]+)` \|') | ForEach-Object { $_.Groups[1].Value })
      if ($planOwned.Count -eq 0) { throw "could not extract plan-owned files" }
      foreach ($path in $planOwned) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "plan-owned file is missing: $path" }
      }
      & rg -n "[ \t]+$" -- @planOwned
      $whitespaceCode = $LASTEXITCODE
      if ($whitespaceCode -eq 0) { throw "trailing whitespace found in a plan-owned file" }
      if ($whitespaceCode -ne 1) { throw "plan-owned whitespace scan failed" }

      git status --short
      if ($LASTEXITCODE -ne 0) { throw "git status failed" }
      git diff --check
      if ($LASTEXITCODE -ne 0) { throw "git diff --check failed" }
      git diff --name-only
      if ($LASTEXITCODE -ne 0) { throw "git diff --name-only failed" }
    }
    finally {
      if ($null -eq $savedProfile) { Remove-Item Env:\OCMM_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_PROFILE = $savedProfile }
      if ($null -eq $savedNoProfile) { Remove-Item Env:\OCMM_NO_PROFILE -ErrorAction SilentlyContinue } else { $env:OCMM_NO_PROFILE = $savedNoProfile }
      if ($null -eq $savedFast) { Remove-Item Env:\OCMM_FAST -ErrorAction SilentlyContinue } else { $env:OCMM_FAST = $savedFast }
    }
  }
  ```

  Expected: status/diff output contains no unexpected plan-owned path; `git diff --check` reports no whitespace errors; no commit, push, tag, stage, reset, restore, or checkout was performed.

- [ ] **Run final gate 9: obtain final acceptance review without Git writes.**

  Load `requesting-code-review`. Because this change is cross-cutting and stateful, dispatch `oracle` and `reviewer` in parallel with the approved spec, this plan, the current diff, and evidence from final gates 1–8. Ask them to verify the explicit OpenCode-plugin config-load boundary, ordinary `loadConfig` non-materialization including the generator's OpenCode-host fallback, shared-handler compatibility, schema/docs synchronization, route snapshot correctness, and generic/429 stale-side-effect barriers. Do not dispatch `oracle-high` unless the user separately configures and requests that supplemental lane. Reviewers are read-only and must not run Git write commands.

  If review causes any product, test, docs, example, or schema edit, invalidate every prior result and rerun the current revision from final gate 1 through final gate 9 in the exact documented order. Evidence from a pre-edit revision is never acceptable, and no late build may occur between the rebuilt artifact and gates 6–7.

  Expected: both reviews report no unresolved blocking findings against the most recently verified revision.

## Acceptance Criteria

The implementation is complete only when the orchestrator can report all of the following with exact command output or assertions:

- CLI unit and built fake-OpenCode surfaces prove consume/pass-through/child-only env behavior.
- Schema/profile tests prove disabled-by-default policy without changing existing profile defaults, mapping validation, profile merge, plugin-boundary source precedence, invalid shadow, lazy invalid inactivity, strict qualified errors, and ordinary `loadConfig({ host:"opencode" })` non-materialization.
- Pure route tests prove exact/successor/prefix materialization, metadata inheritance, Provider pinning, unqualified no-op, mapping/catalog policy, and stable `[F,O,remainder]`.
- Registry/config/chat tests prove atomic latest-generation publication, published-empty distinction, all managed surfaces, unmanaged preservation, provenance orthogonality, and published-missing behavior.
- Runtime tests prove route-model alignment, snapshot resets, A-fast→A fallback, and zero stale side effects at every generic/429 cut point.
- OpenCode initial load and reload explicitly use `loadOpenCodePluginConfig` and inject the registry and fast activation. Ordinary `loadConfig` remains unmaterialized regardless of host, while unchanged out-of-scope shared-handler callers compile and remain on the current non-fast compatibility path; strict alias and published semantics are not promised outside OpenCode-managed runtime consumers.
- README, architecture docs, example config, and `schema.json` describe and validate only the approved OpenCode contract.
- Final schema generation, focused checks, typecheck, isolated full tests, build, built shim probe, runtime probe, read-only status/diff/whitespace checks, and final review all pass in that order for one unchanged revision.
- No implementation subagent performed a Git write.
