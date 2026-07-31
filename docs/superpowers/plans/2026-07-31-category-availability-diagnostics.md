# Category Availability Diagnostics Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only category model-availability diagnostics that report `available`, `dead`, or `unknown` through `OCMM_DEBUG` without changing registration, selected primaries, route snapshots, provider defaults, canonical `models[]`, or runtime fallback.

**Architecture:** A pure resolver in `src/routing/category-availability.ts` materializes the already-selected primary, extracts only provider IDs and model keys from the host catalog, evaluates structural guards separately from incomplete catalog evidence, and returns a secret-free immutable-shaped diagnostic. A logging adapter in `src/hooks/category-availability-diagnostics.ts` formats and deduplicates diagnostics for one config-handler lifetime; `src/hooks/config.ts` invokes it only after successful built-in or custom category registration and never consumes its result for routing.

**Tech Stack:** TypeScript 6 strict mode, Node.js 22+ built-in `node:test`/`node:assert`, pnpm, the existing `OCMM_DEBUG` logger, OpenCode config/debug CLI, and PowerShell 7.

**Global Constraints:**
- `target.provider[providerID].models` proves only that a provider/model was observed in the current host config. It does not prove that the catalog is complete or that credentials and runtime access work.
- `requiresModel`, `requiresAnyModel`, and `requiresProvider` are metadata today. The resolver, config registration, effective route, route registry, and runtime fallback do not enforce them as gates.
- Canonical `models[]` is already normalized into `ModelRequirement.fallbackChain`; diagnostics must consume that single runtime chain.
- Explicit user routes must remain registered even when diagnostics report `dead` or `unknown`.
- The default logger is gated by `OCMM_DEBUG`; diagnostics must not add unconditional output.
- Catalog absence or malformed catalog evidence is always `unknown`, never `dead`; only a structural guard conflict or an empty chain is `dead`.
- Diagnostics are observational only: do not gate registration, add route-snapshot metadata, alter selected-primary/catalog-upgrade behavior, change provider/model defaults, rewrite canonical `models[]`, or change runtime fallback.
- Diagnostics may retain only category/provenance/route fields plus provider IDs and model keys; never retain or emit provider options, API keys, URLs, response bodies, credentials, or the full host config.
- Use PowerShell syntax for every command. Do not install software, stop user processes, modify user OpenCode configuration, push/tag/release, or extend this feature authorization into release work.
- Tasks 1–3 are non-Git checkpoints: implementation workers must not stage or commit. Only Task 4 permits the parent agent, after every gate passes, to create the one authorized commit `feat: add category availability diagnostics`.

---

## File map

| Path | Action | Responsibility |
| --- | --- | --- |
| `src/routing/category-availability.ts` | Create | Public diagnostic types, safe catalog observation, candidate evaluation, aggregate status/reason, stable key, and pure resolver. |
| `src/routing/category-availability.test.ts` | Create | Resolver truth table, fail-safe catalog behavior, structural-dead rules, selected-primary materialization, immutability, and secret-boundary tests. |
| `src/hooks/category-availability-diagnostics.ts` | Create | Stable human-readable formatter, `info`/`warn` selection, per-handler deduplication, and non-throwing logger adapter. |
| `src/hooks/category-availability-diagnostics.test.ts` | Create | Reporter levels, exact-once behavior, changed-key behavior, route-preservation marker, and secret/error containment tests. |
| `src/hooks/config.ts` | Modify | Instantiate one reporter per config handler and notify it after successful built-in/custom category registration only. |
| `src/hooks/config.category.test.ts` | Modify | Add typing-only `Record<string, unknown>` target annotations at the three existing diagnostic sites, then prove built-in/custom integration, exclusions, deduplication, explicit-route preservation, unchanged catalog selection, and unchanged route snapshots. |
| `README.md` | Modify | Explain the three statuses, incomplete-catalog limitation, `OCMM_DEBUG`, deduplication, and diagnostics-only semantics. |
| `docs/superpowers/specs/2026-07-31-category-availability-diagnostics-design.md` | Preserve | Approved design; include unchanged in the final authorized feature commit. |
| `docs/superpowers/plans/2026-07-31-category-availability-diagnostics.md` | Create | Executable implementation and verification contract. |

### Task 1: Implement the pure category availability resolver

**Files:**
- Create: `src/routing/category-availability.ts`
- Create: `src/routing/category-availability.test.ts`
- Read only: `src/routing/effective-route.ts`, `src/shared/types.ts`, `src/shared/logger.ts`

**Interfaces:**
- Consumes: `materializeSelectedPrimary(requirement: ModelRequirement, selectedModel: string): ModelRequirement`; `ModelRequirement`, `RequirementSource`, and `PrimarySource`; raw host config as `Record<string, unknown>`.
- Produces: exported `CategoryAvailabilityStatus`, `CategoryCandidateStatus`, `CategoryCandidateReason`, `CategoryCandidateDiagnostic`, `CategoryAvailabilityDiagnostic`, `ResolveCategoryAvailabilityDiagnosticArgs`, and `resolveCategoryAvailabilityDiagnostic(args: ResolveCategoryAvailabilityDiagnosticArgs): CategoryAvailabilityDiagnostic` for Task 2.

- [ ] **Step 1: Write the failing resolver contract tests**

Create `src/routing/category-availability.test.ts` with this complete test matrix:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import type { ModelRequirement } from "../shared/types.ts"
import {
  resolveCategoryAvailabilityDiagnostic,
  type ResolveCategoryAvailabilityDiagnosticArgs,
} from "./category-availability.ts"

function resolve(
  overrides: Partial<ResolveCategoryAvailabilityDiagnosticArgs> = {},
) {
  return resolveCategoryAvailabilityDiagnostic({
    name: "diagnostic-category",
    target: {},
    requirement: {
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }],
    },
    requirementSource: "category-default",
    primarySource: "builtin-requirement",
    selectedModel: "openai/gpt-5.6-sol",
    ...overrides,
  })
}

test("exact catalog matches are available and preserve provenance", () => {
  const diagnostic = resolve({
    target: { provider: { openai: { models: { "gpt-5.6-sol": {} } } } },
  })

  assert.equal(diagnostic.status, "available")
  assert.equal(diagnostic.reason, "catalog-match")
  assert.equal(diagnostic.requirementSource, "category-default")
  assert.equal(diagnostic.primarySource, "builtin-requirement")
  assert.equal(diagnostic.selectedModel, "openai/gpt-5.6-sol")
  assert.equal(diagnostic.routePreserved, true)
  assert.deepEqual(diagnostic.candidates, [{
    index: 0,
    model: "gpt-5.6-sol",
    providers: ["openai"],
    status: "available",
    reasons: ["catalog-match"],
  }])
})

test("requiresAnyModel uses an observed eligible provider only when requiresModel is absent", () => {
  const anyModel = resolve({
    selectedModel: "requested-model",
    target: { provider: { openai: { models: { "different-model": {} } } } },
    requirement: {
      requiresAnyModel: true,
      requiresProvider: ["openai"],
      fallbackChain: [{ providers: [], model: "requested-model" }],
    },
  })
  assert.equal(anyModel.status, "available")
  assert.equal(anyModel.reason, "catalog-any-model")
  assert.deepEqual(anyModel.candidates[0], {
    index: 0,
    model: "requested-model",
    providers: ["openai"],
    status: "available",
    reasons: ["catalog-any-model"],
  })

  const exactGuardWins = resolve({
    selectedModel: "expected-model",
    target: { provider: { openai: { models: { "different-model": {} } } } },
    requirement: {
      requiresModel: "expected-model",
      requiresAnyModel: true,
      fallbackChain: [{ providers: ["openai"], model: "expected-model" }],
    },
  })
  assert.equal(exactGuardWins.status, "unknown")
  assert.deepEqual(exactGuardWins.candidates[0]?.reasons, ["model-unobserved"])
})

test("provider-unspecified candidates use stable observed providers", () => {
  const diagnostic = resolve({
    selectedModel: "shared-model",
    target: {
      provider: {
        zeta: { models: { other: {} } },
        alpha: { models: { "shared-model": {} } },
      },
    },
    requirement: {
      fallbackChain: [{ providers: [], model: "shared-model" }],
    },
  })

  assert.equal(diagnostic.status, "available")
  assert.deepEqual(diagnostic.candidates[0]?.providers, ["alpha", "zeta"])
  assert.deepEqual(diagnostic.candidates[0]?.reasons, ["catalog-match"])
})

test("missing and malformed catalog evidence remains unknown", () => {
  const cases: Array<{
    name: string
    target: Record<string, unknown>
    reason: "provider-unobserved" | "model-unobserved"
  }> = [
    { name: "provider field absent", target: {}, reason: "provider-unobserved" },
    { name: "provider field malformed", target: { provider: [] }, reason: "provider-unobserved" },
    { name: "provider entry malformed", target: { provider: { openai: "invalid" } }, reason: "provider-unobserved" },
    { name: "models field absent", target: { provider: { openai: {} } }, reason: "model-unobserved" },
    { name: "models field malformed", target: { provider: { openai: { models: [] } } }, reason: "model-unobserved" },
    { name: "model key absent", target: { provider: { openai: { models: {} } } }, reason: "model-unobserved" },
  ]

  for (const item of cases) {
    const diagnostic = resolve({ target: item.target })
    assert.equal(diagnostic.status, "unknown", item.name)
    assert.equal(diagnostic.reason, "catalog-incomplete", item.name)
    assert.deepEqual(diagnostic.candidates[0]?.reasons, [item.reason], item.name)
  }
})

test("only exact-model and provider guard conflicts make candidates dead", () => {
  const modelConflict = resolve({
    requirement: {
      requiresModel: "required-model",
      fallbackChain: [{ providers: ["openai"], model: "other-model" }],
    },
  })
  assert.equal(modelConflict.status, "dead")
  assert.equal(modelConflict.reason, "structural-conflict")
  assert.deepEqual(modelConflict.candidates[0]?.reasons, ["requires-model-mismatch"])

  const providerConflict = resolve({
    requirement: {
      requiresProvider: ["anthropic"],
      fallbackChain: [{ providers: ["openai"], model: "gpt-5.6-sol" }],
    },
  })
  assert.equal(providerConflict.status, "dead")
  assert.equal(providerConflict.reason, "structural-conflict")
  assert.deepEqual(providerConflict.candidates[0]?.reasons, ["requires-provider-mismatch"])
})

test("mixed dead and catalog-unknown candidates aggregate to unknown", () => {
  const diagnostic = resolve({
    selectedModel: "unqualified-selection",
    requirement: {
      requiresProvider: ["openai"],
      fallbackChain: [
        { providers: ["anthropic"], model: "blocked" },
        { providers: ["openai"], model: "unobserved" },
      ],
    },
  })

  assert.equal(diagnostic.status, "unknown")
  assert.equal(diagnostic.reason, "catalog-incomplete")
  assert.deepEqual(diagnostic.candidates.map(({ status, reasons }) => ({ status, reasons })), [
    { status: "dead", reasons: ["requires-provider-mismatch"] },
    { status: "unknown", reasons: ["provider-unobserved"] },
  ])
})

test("an empty chain is dead even when selectedModel is qualified", () => {
  const diagnostic = resolve({
    selectedModel: "openai/synthetic-must-not-revive-empty-chain",
    requirement: { fallbackChain: [] },
  })

  assert.equal(diagnostic.status, "dead")
  assert.equal(diagnostic.reason, "no-candidates")
  assert.deepEqual(diagnostic.candidates, [])
})

test("selected-primary materialization is used without mutating route inputs", () => {
  const requirement: ModelRequirement = {
    variant: "max",
    requiresProvider: ["openai", "anthropic"],
    fallbackChain: [
      { providers: ["openai"], model: "gpt-5.5", temperature: 0.2 },
      { providers: ["anthropic"], model: "claude-opus-4-7" },
    ],
  }
  const target = {
    provider: { openai: { models: { "gpt-5.7-sol": {} } } },
  }
  const requirementBefore = structuredClone(requirement)
  const targetBefore = structuredClone(target)

  const diagnostic = resolve({
    requirement,
    target,
    selectedModel: "openai/gpt-5.7-sol",
    primarySource: "catalog-upgrade",
  })

  assert.equal(diagnostic.candidates[0]?.model, "gpt-5.7-sol")
  assert.deepEqual(diagnostic.candidates[0]?.providers, ["openai"])
  assert.equal(diagnostic.candidates[0]?.status, "available")
  assert.equal(diagnostic.primarySource, "catalog-upgrade")
  assert.deepEqual(requirement, requirementBefore)
  assert.deepEqual(target, targetBefore)
})

test("diagnostics and keys contain no provider options or model-entry secrets", () => {
  const sentinel = "CATEGORY_AVAILABILITY_SECRET_SENTINEL"
  const target = {
    provider: {
      openai: {
        apiKey: sentinel,
        options: { baseURL: `https://${sentinel}.invalid` },
        models: { known: { token: sentinel } },
      },
    },
  }
  const diagnostic = resolve({
    target,
    selectedModel: "openai/known",
    requirement: { fallbackChain: [{ providers: ["openai"], model: "known" }] },
  })

  assert.equal(diagnostic.status, "available")
  assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(sentinel))
})
```

- [ ] **Step 2: Run the resolver tests and confirm RED**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/routing/category-availability.test.ts
```

Expected RED: exit code is nonzero because `src/routing/category-availability.ts` and `resolveCategoryAvailabilityDiagnostic` do not exist. Do not weaken assertions to obtain GREEN.

- [ ] **Step 3: Implement the resolver and public diagnostic contract**

Create `src/routing/category-availability.ts` exactly around the approved data contract and fail-safe rules:

```ts
import { isRecord } from "../shared/logger.ts"
import type {
  ModelRequirement,
  PrimarySource,
  RequirementSource,
} from "../shared/types.ts"
import { materializeSelectedPrimary } from "./effective-route.ts"

export type CategoryAvailabilityStatus = "available" | "dead" | "unknown"

export type CategoryCandidateStatus = "available" | "dead" | "unknown"

export type CategoryCandidateReason =
  | "catalog-match"
  | "catalog-any-model"
  | "requires-model-mismatch"
  | "requires-provider-mismatch"
  | "provider-unobserved"
  | "model-unobserved"

export type CategoryCandidateDiagnostic = Readonly<{
  index: number
  model: string
  providers: readonly string[]
  status: CategoryCandidateStatus
  reasons: readonly CategoryCandidateReason[]
}>

export type CategoryAvailabilityDiagnostic = Readonly<{
  key: string
  name: string
  status: CategoryAvailabilityStatus
  reason:
    | "catalog-match"
    | "catalog-any-model"
    | "structural-conflict"
    | "no-candidates"
    | "catalog-incomplete"
  requirementSource: RequirementSource
  primarySource: PrimarySource
  selectedModel: string
  routePreserved: true
  candidates: readonly CategoryCandidateDiagnostic[]
}>

export type ResolveCategoryAvailabilityDiagnosticArgs = {
  name: string
  target: Record<string, unknown>
  requirement: ModelRequirement
  requirementSource: RequirementSource
  primarySource: PrimarySource
  selectedModel: string
}

type ObservedCatalog = ReadonlyMap<string, ReadonlySet<string> | null>

function observeCatalog(target: Record<string, unknown>): ObservedCatalog {
  const observed = new Map<string, ReadonlySet<string> | null>()
  if (!isRecord(target.provider)) return observed

  for (const providerID of Object.keys(target.provider).sort()) {
    const rawProvider = target.provider[providerID]
    if (!isRecord(rawProvider)) continue
    observed.set(
      providerID,
      isRecord(rawProvider.models)
        ? new Set(Object.keys(rawProvider.models).sort())
        : null,
    )
  }
  return observed
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function providersForCandidate(
  explicitProviders: readonly string[],
  requirement: ModelRequirement,
  catalog: ObservedCatalog,
): string[] {
  if (explicitProviders.length > 0) return dedupe(explicitProviders)
  if (requirement.requiresProvider !== undefined) return dedupe(requirement.requiresProvider)
  return [...catalog.keys()]
}

function unknownReasons(
  providers: readonly string[],
  model: string,
  catalog: ObservedCatalog,
): CategoryCandidateReason[] {
  if (providers.length === 0) return ["provider-unobserved"]

  let providerUnobserved = false
  let modelUnobserved = false
  for (const provider of providers) {
    if (!catalog.has(provider)) {
      providerUnobserved = true
      continue
    }
    const models = catalog.get(provider)
    if (models === null || models === undefined || !models.has(model)) modelUnobserved = true
  }
  return [
    ...(providerUnobserved ? ["provider-unobserved" as const] : []),
    ...(modelUnobserved ? ["model-unobserved" as const] : []),
  ]
}

function evaluateCandidate(
  index: number,
  entry: ModelRequirement["fallbackChain"][number],
  requirement: ModelRequirement,
  catalog: ObservedCatalog,
): CategoryCandidateDiagnostic {
  const providers = providersForCandidate(entry.providers, requirement, catalog)
  if (requirement.requiresModel !== undefined && entry.model !== requirement.requiresModel) {
    return {
      index,
      model: entry.model,
      providers,
      status: "dead",
      reasons: ["requires-model-mismatch"],
    }
  }

  const eligibleProviders = requirement.requiresProvider === undefined
    ? providers
    : providers.filter((provider) => requirement.requiresProvider!.includes(provider))
  if (
    entry.providers.length > 0
    && requirement.requiresProvider !== undefined
    && eligibleProviders.length === 0
  ) {
    return {
      index,
      model: entry.model,
      providers,
      status: "dead",
      reasons: ["requires-provider-mismatch"],
    }
  }

  if (eligibleProviders.length === 0) {
    return {
      index,
      model: entry.model,
      providers,
      status: "unknown",
      reasons: ["provider-unobserved"],
    }
  }

  if (requirement.requiresModel === undefined && requirement.requiresAnyModel === true) {
    const anyObservedModel = eligibleProviders.some((provider) => {
      const models = catalog.get(provider)
      return models !== null && models !== undefined && models.size > 0
    })
    if (anyObservedModel) {
      return {
        index,
        model: entry.model,
        providers,
        status: "available",
        reasons: ["catalog-any-model"],
      }
    }
  } else {
    const exactMatch = eligibleProviders.some((provider) => catalog.get(provider)?.has(entry.model) === true)
    if (exactMatch) {
      return {
        index,
        model: entry.model,
        providers,
        status: "available",
        reasons: ["catalog-match"],
      }
    }
  }

  return {
    index,
    model: entry.model,
    providers,
    status: "unknown",
    reasons: unknownReasons(eligibleProviders, entry.model, catalog),
  }
}

export function resolveCategoryAvailabilityDiagnostic(
  args: ResolveCategoryAvailabilityDiagnosticArgs,
): CategoryAvailabilityDiagnostic {
  const catalog = observeCatalog(args.target)
  const materialized = args.requirement.fallbackChain.length === 0
    ? args.requirement
    : materializeSelectedPrimary(args.requirement, args.selectedModel)
  const candidates = materialized.fallbackChain.map((entry, index) =>
    evaluateCandidate(index, entry, materialized, catalog)
  )

  const firstAvailable = candidates.find((candidate) => candidate.status === "available")
  const status: CategoryAvailabilityStatus = firstAvailable
    ? "available"
    : candidates.length === 0 || candidates.every((candidate) => candidate.status === "dead")
      ? "dead"
      : "unknown"
  const reason: CategoryAvailabilityDiagnostic["reason"] = firstAvailable
    ? firstAvailable.reasons[0] === "catalog-any-model"
      ? "catalog-any-model"
      : "catalog-match"
    : candidates.length === 0
      ? "no-candidates"
      : status === "dead"
        ? "structural-conflict"
        : "catalog-incomplete"

  const fields = {
    name: args.name,
    status,
    reason,
    requirementSource: args.requirementSource,
    primarySource: args.primarySource,
    selectedModel: args.selectedModel,
    routePreserved: true as const,
    candidates,
  }
  return { key: JSON.stringify(fields), ...fields }
}
```

The empty-chain branch is deliberate: `materializeSelectedPrimary()` synthesizes a qualified selected model when no baseline matches, but the approved aggregate contract requires an actually empty input chain to remain `dead` with `no-candidates`.

- [ ] **Step 4: Run the resolver tests and confirm GREEN**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/routing/category-availability.test.ts
```

Expected GREEN: exit code `0`, all nine named tests pass, and the summary reports `fail 0`.

- [ ] **Step 5: Record the Task 1 non-Git checkpoint**

```powershell
$task1Files = @(
  "src/routing/category-availability.ts",
  "src/routing/category-availability.test.ts"
)
$missingTask1Files = @($task1Files | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
if ($missingTask1Files.Count -gt 0) { throw "Task 1 files missing: $($missingTask1Files -join ', ')" }
Write-Output "Task 1 non-Git checkpoint complete: resolver GREEN and both files present"
```

Expected: both files exist and the command prints the Task 1 checkpoint message. Do not run any Git write command; staging and committing are reserved for the parent-only Task 4 boundary.

### Task 2: Add the deduplicating debug reporter

**Files:**
- Create: `src/hooks/category-availability-diagnostics.ts`
- Create: `src/hooks/category-availability-diagnostics.test.ts`
- Read only: `src/shared/logger.ts`, `src/hooks/subagent-depth-diagnostics.ts`

**Interfaces:**
- Consumes: `ResolveCategoryAvailabilityDiagnosticArgs`, `CategoryAvailabilityDiagnostic`, and `resolveCategoryAvailabilityDiagnostic()` from Task 1; existing `log.info()`/`log.warn()` methods gated by `OCMM_DEBUG`.
- Produces: `CategoryAvailabilityDiagnosticLogger` and `createCategoryAvailabilityDiagnosticReporter(logger?: CategoryAvailabilityDiagnosticLogger): (args: ResolveCategoryAvailabilityDiagnosticArgs) => void` for Task 3.

- [ ] **Step 1: Write the failing reporter tests**

Create `src/hooks/category-availability-diagnostics.test.ts`:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import type { ResolveCategoryAvailabilityDiagnosticArgs } from "../routing/category-availability.ts"
import { createCategoryAvailabilityDiagnosticReporter } from "./category-availability-diagnostics.ts"

type LoggedCall = { level: "info" | "warn"; message: string }

function args(
  overrides: Partial<ResolveCategoryAvailabilityDiagnosticArgs> = {},
): ResolveCategoryAvailabilityDiagnosticArgs {
  return {
    name: "reporter-category",
    target: {},
    requirement: { fallbackChain: [{ providers: ["openai"], model: "wanted" }] },
    requirementSource: "user-config",
    primarySource: "user-requirement",
    selectedModel: "openai/wanted",
    ...overrides,
  }
}

function capture() {
  const calls: LoggedCall[] = []
  const reporter = createCategoryAvailabilityDiagnosticReporter({
    info(...values: unknown[]) {
      calls.push({ level: "info", message: String(values[0]) })
    },
    warn(...values: unknown[]) {
      calls.push({ level: "warn", message: String(values[0]) })
    },
  })
  return { calls, reporter }
}

test("available and unknown report at info while dead reports at warn", () => {
  const { calls, reporter } = capture()

  reporter(args({ target: { provider: { openai: { models: { wanted: {} } } } } }))
  reporter(args({ name: "unknown-category" }))
  reporter(args({
    name: "dead-category",
    requirement: {
      requiresModel: "required",
      fallbackChain: [{ providers: ["openai"], model: "other" }],
    },
  }))

  assert.deepEqual(calls.map(({ level }) => level), ["info", "info", "warn"])
  assert.match(calls[0]!.message, /name="reporter-category" status=available reason=catalog-match/)
  assert.match(calls[1]!.message, /name="unknown-category" status=unknown reason=catalog-incomplete/)
  assert.match(calls[2]!.message, /name="dead-category" status=dead reason=structural-conflict/)
  for (const call of calls) {
    assert.match(call.message, /routePreserved=true/)
    assert.match(call.message, /requirementSource=user-config primarySource=user-requirement/)
    assert.match(call.message, /candidates=\[#0\(/)
  }
})

test("one reporter emits each stable key once and emits a changed key", () => {
  const { calls, reporter } = capture()
  const providerMissing = args()
  const modelMissing = args({ target: { provider: { openai: { models: {} } } } })

  reporter(providerMissing)
  reporter(providerMissing)
  reporter(modelMissing)
  reporter(providerMissing)

  assert.equal(calls.length, 2)
  assert.match(calls[0]!.message, /reasons=\["provider-unobserved"\]/)
  assert.match(calls[1]!.message, /reasons=\["model-unobserved"\]/)
})

test("messages exclude unrelated host data and logger failures never escape", () => {
  const sentinel = "CATEGORY_REPORTER_SECRET_SENTINEL"
  const { calls, reporter } = capture()
  reporter(args({
    target: {
      unrelated: sentinel,
      provider: {
        openai: {
          apiKey: sentinel,
          models: { wanted: { privateValue: sentinel } },
        },
      },
    },
  }))
  assert.equal(calls.length, 1)
  assert.doesNotMatch(calls[0]!.message, new RegExp(sentinel))

  const throwingReporter = createCategoryAvailabilityDiagnosticReporter({
    info() {
      throw new Error("logger info failed")
    },
    warn() {
      throw new Error("logger warn failed")
    },
  })
  assert.doesNotThrow(() => throwingReporter(args()))
  assert.doesNotThrow(() => throwingReporter(args({
    name: "dead-throwing-logger",
    requirement: { fallbackChain: [] },
  })))
})
```

- [ ] **Step 2: Run reporter plus resolver tests and confirm RED**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/routing/category-availability.test.ts src/hooks/category-availability-diagnostics.test.ts
```

Expected RED: the resolver suite remains GREEN, but the command exits nonzero because `src/hooks/category-availability-diagnostics.ts` and `createCategoryAvailabilityDiagnosticReporter` do not exist.

- [ ] **Step 3: Implement stable formatting, levels, deduplication, and error containment**

Create `src/hooks/category-availability-diagnostics.ts`:

```ts
import {
  resolveCategoryAvailabilityDiagnostic,
  type CategoryAvailabilityDiagnostic,
  type ResolveCategoryAvailabilityDiagnosticArgs,
} from "../routing/category-availability.ts"
import { log } from "../shared/logger.ts"

export type CategoryAvailabilityDiagnosticLogger = {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
}

function formatCandidate(
  candidate: CategoryAvailabilityDiagnostic["candidates"][number],
): string {
  return `#${candidate.index}(model=${JSON.stringify(candidate.model)},providers=${JSON.stringify(candidate.providers)},status=${candidate.status},reasons=${JSON.stringify(candidate.reasons)})`
}

function formatDiagnostic(diagnostic: CategoryAvailabilityDiagnostic): string {
  return [
    `category availability: name=${JSON.stringify(diagnostic.name)}`,
    `status=${diagnostic.status}`,
    `reason=${diagnostic.reason}`,
    `requirementSource=${diagnostic.requirementSource}`,
    `primarySource=${diagnostic.primarySource}`,
    `selectedModel=${JSON.stringify(diagnostic.selectedModel)}`,
    "routePreserved=true",
    `candidates=[${diagnostic.candidates.map(formatCandidate).join(";")}]`,
  ].join(" ")
}

export function createCategoryAvailabilityDiagnosticReporter(
  logger: CategoryAvailabilityDiagnosticLogger = log,
): (args: ResolveCategoryAvailabilityDiagnosticArgs) => void {
  const emitted = new Set<string>()

  return (args) => {
    try {
      const diagnostic = resolveCategoryAvailabilityDiagnostic(args)
      if (emitted.has(diagnostic.key)) return
      emitted.add(diagnostic.key)
      const level = diagnostic.status === "dead" ? "warn" : "info"
      logger[level](formatDiagnostic(diagnostic))
    } catch {
      // Diagnostics are observational and may never interrupt route registration.
    }
  }
}
```

The reporter intentionally uses the existing logger as its default, so normal execution remains silent unless `OCMM_DEBUG` is enabled. The catch adds no fallback output and prevents a custom or console logger failure from changing registration.

- [ ] **Step 4: Run reporter plus resolver tests and confirm GREEN**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/routing/category-availability.test.ts src/hooks/category-availability-diagnostics.test.ts
```

Expected GREEN: exit code `0`; all resolver and reporter tests pass with `fail 0`; the level sequence is `info`, `info`, `warn`, duplicate keys emit once, and throwing loggers do not escape.

- [ ] **Step 5: Record the Task 2 non-Git checkpoint**

```powershell
$task2Files = @(
  "src/hooks/category-availability-diagnostics.ts",
  "src/hooks/category-availability-diagnostics.test.ts"
)
$missingTask2Files = @($task2Files | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
if ($missingTask2Files.Count -gt 0) { throw "Task 2 files missing: $($missingTask2Files -join ', ')" }
Write-Output "Task 2 non-Git checkpoint complete: reporter GREEN and both files present"
```

Expected: both files exist and the command prints the Task 2 checkpoint message. Do not run any Git write command; staging and committing are reserved for the parent-only Task 4 boundary.

### Task 3: Integrate diagnostics after category registration and document the statuses

**Files:**
- Modify: `src/hooks/config.ts:30-31,635-640,820-867,909-950`
- Modify: `src/hooks/config.category.test.ts:146-164,255-280` (typing-only target annotations), `src/hooks/config.category.test.ts:1-53,282-372` (helpers and focused integration tests)
- Modify: `README.md:717-736` (insert the diagnostics section after built-in category guidance and before prompt architecture)

**Interfaces:**
- Consumes: `createCategoryAvailabilityDiagnosticReporter()` from Task 2; existing `applyAgentEntry()`, `registerEffectiveRoute()`, `selectRoutePrimary()`, `resolveRouteRequirement()`, and `createEffectiveRouteRegistry()` behavior.
- Produces: typing-only `target.agent: Record<string, unknown>` annotations that clear the three pre-existing Compiler API diagnostics without changing assertions or runtime objects; one reporter instance per `createConfigHandler()` lifetime; post-registration notifications for enabled built-in categories and successfully registered registry-managed custom categories; user documentation for the three-state observational contract.

- [ ] **Step 1: Capture the three pre-existing target-inference diagnostics as RED evidence**

Run this read-only Compiler API probe before editing `src/hooks/config.category.test.ts`:

```powershell
@'
import path from "node:path"
import ts from "typescript"

const file = path.resolve("src/hooks/config.category.test.ts")
const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json")
if (!configPath) throw new Error("tsconfig.json not found")
const loaded = ts.readConfigFile(configPath, ts.sys.readFile)
if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"))
const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath), undefined, configPath)
const rootNames = [...new Set([...parsed.fileNames.map((entry) => path.resolve(entry)), file])]
const program = ts.createProgram({ rootNames, options: { ...parsed.options, noEmit: true } })
const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) =>
  diagnostic.file !== undefined && path.resolve(diagnostic.file.fileName).toLowerCase() === file.toLowerCase()
)
for (const diagnostic of diagnostics) {
  let location = "<no-location>"
  if (diagnostic.file !== undefined && diagnostic.start !== undefined) {
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
    location = `${position.line + 1}:${position.character + 1}`
  } else if (diagnostic.file !== undefined) {
    location = diagnostic.file.fileName
  }
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ").replace(/\s+/g, " ").trim()
  console.error(
    `TS${diagnostic.code} ${location} ${message}`,
  )
}
console.error(`config.category.test.ts diagnostics: ${diagnostics.length}`)
process.exit(diagnostics.length === 0 ? 0 : 1)
'@ | node --input-type=module
```

Expected RED on HEAD `f40b3c5`: exit code is nonzero and output contains exactly these three diagnostics and no fourth diagnostic:

```text
TS7053 161:28 Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{}'. No index signature with a parameter of type 'string' was found on type '{}'.
TS7053 278:17 Element implicitly has an 'any' type because expression of type '"hard-reasoning"' can't be used to index type '{}'. Property 'hard-reasoning' does not exist on type '{}'.
TS2339 279:30 Property 'quick' does not exist on type '{}'.
config.category.test.ts diagnostics: 3
```

The formatter is executable JavaScript: it checks both `diagnostic.file` and `diagnostic.start` before computing a line/column and falls back to the file name or `<no-location>` for locationless diagnostics.

- [ ] **Step 2: Apply only the two target declaration annotations that clear the three diagnostics**

In the existing test `Opus 5 category selections never attach the orchestrator calibration`, change only the `target` declaration; preserve its object literal, loop, and all assertions:

```ts
  const target: {
    agent: Record<string, unknown>
    provider: Record<string, unknown>
  } = {
    agent: {},
    provider: { anthropic: { models: { "claude-opus-5": {} } } },
  }
```

In the existing test `registry-managed categories publish category provenance and write final route models`, make the same typing-only declaration change; preserve both route assertions and both `target.agent` assertions exactly:

```ts
  const target: {
    agent: Record<string, unknown>
    provider: Record<string, unknown>
  } = {
    agent: {},
    provider: { openai: { models: { "gpt-5.7-sol": {} } } },
  }
```

These annotations have no emitted JavaScript and must not change either object literal, handler call, model/prompt assertion, or route expectation.

- [ ] **Step 3: Re-run the focused Compiler API probe and confirm the typing-only GREEN transition**

```powershell
@'
import path from "node:path"
import ts from "typescript"

const file = path.resolve("src/hooks/config.category.test.ts")
const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json")
if (!configPath) throw new Error("tsconfig.json not found")
const loaded = ts.readConfigFile(configPath, ts.sys.readFile)
if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"))
const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath), undefined, configPath)
const rootNames = [...new Set([...parsed.fileNames.map((entry) => path.resolve(entry)), file])]
const program = ts.createProgram({ rootNames, options: { ...parsed.options, noEmit: true } })
const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) =>
  diagnostic.file !== undefined && path.resolve(diagnostic.file.fileName).toLowerCase() === file.toLowerCase()
)
if (diagnostics.length) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  }
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host))
  process.exit(1)
}
console.log("config.category.test.ts diagnostics: 0")
'@ | node --input-type=module
if ($LASTEXITCODE -ne 0) { throw "typing-only config.category.test.ts diagnostic repair failed" }
```

Expected GREEN: exit code `0` and `config.category.test.ts diagnostics: 0`. Re-run the existing file before adding new integration tests to prove the annotations preserve all current runtime assertions:

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/hooks/config.category.test.ts
```

Expected: exit code `0`, all pre-existing category tests pass, and the summary reports `fail 0`.

- [ ] **Step 4: Add integration helpers and failing config tests**

In `src/hooks/config.category.test.ts`, add these helpers after `publishedCategoryRoute()`:

```ts
type CategoryDiagnosticLog = { level: "info" | "warn"; message: string }

function categoryDiagnosticLogger(logs: CategoryDiagnosticLog[]) {
  return {
    info(...args: unknown[]) {
      logs.push({ level: "info", message: String(args[0]) })
    },
    warn(...args: unknown[]) {
      logs.push({ level: "warn", message: String(args[0]) })
    },
  }
}

function categoryDiagnosticMessages(
  logs: readonly CategoryDiagnosticLog[],
  name: string,
): CategoryDiagnosticLog[] {
  return logs.filter(({ message }) =>
    message.startsWith(`category availability: name=${JSON.stringify(name)} `)
  )
}
```

Append these three tests after the existing custom-category registration tests:

```ts
test("category diagnostics report built-in and custom registrations once per handler", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    categories: {
      "custom-observed": { models: ["qa/custom-model"] },
    },
  }
  const logs: CategoryDiagnosticLog[] = []
  const handler = createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
    logger: categoryDiagnosticLogger(logs),
  })
  const createTarget = () => ({
    agent: {},
    provider: {
      openai: { models: { "gpt-5.7-sol": {} } },
      qa: { models: { "custom-model": {} } },
    },
  })

  const firstTarget = createTarget()
  await handler(firstTarget, undefined)
  await handler(createTarget(), undefined)

  const builtin = categoryDiagnosticMessages(logs, "hard-reasoning")
  const custom = categoryDiagnosticMessages(logs, "custom-observed")
  assert.equal(builtin.length, 1)
  assert.equal(custom.length, 1)
  assert.equal(builtin[0]?.level, "info")
  assert.equal(custom[0]?.level, "info")
  assert.match(builtin[0]!.message, /status=available .*primarySource=catalog-upgrade .*routePreserved=true/)
  assert.match(custom[0]!.message, /status=available .*primarySource=user-requirement .*routePreserved=true/)
  assert.equal(publishedCategoryRoute(routeRegistry, "hard-reasoning").model, "openai/gpt-5.7-sol")
  assert.equal(publishedCategoryRoute(routeRegistry, "custom-observed").model, "qa/custom-model")
})

test("category diagnostics omit disabled, host-disabled, and category-shadowed registrations", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    disabledAgents: ["frontend"],
    agents: {
      "agent-owned": { model: "qa/agent-model" },
    },
    categories: {
      "host-disabled": { model: "qa/category-model" },
      "metadata-only": { description: "no route requirement" },
      "agent-owned": { model: "qa/category-must-not-own" },
    },
  }
  const target: { agent: Record<string, unknown> } = {
    agent: {
      "host-disabled": { model: "host/existing", disable: true },
    },
  }
  const logs: CategoryDiagnosticLog[] = []

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
    logger: categoryDiagnosticLogger(logs),
  })(target, undefined)

  for (const name of ["frontend", "host-disabled", "metadata-only", "agent-owned"]) {
    assert.deepEqual(categoryDiagnosticMessages(logs, name), [], name)
  }
  assert.equal(routeRegistry.snapshot().routes.has("frontend"), false)
  assert.equal(routeRegistry.snapshot().routes.has("host-disabled"), false)
  assert.equal(routeRegistry.snapshot().routes.has("metadata-only"), false)
  assert.equal(publishedCategoryRoute(routeRegistry, "agent-owned").model, "qa/agent-model")
})

test("diagnostics preserve canonical, legacy, and structurally dead explicit routes and snapshots", async () => {
  const routeRegistry = createEffectiveRouteRegistry()
  const config = {
    ...defaultConfig(),
    categories: {
      "canonical-route": { models: ["qa/observed", "missing/fallback"] },
      "legacy-route": { model: "missing/legacy" },
      "dead-route": {
        requirement: {
          requiresProvider: ["qa"],
          fallbackChain: [{ providers: ["blocked"], model: "conflict" }],
        },
      },
    },
  }
  const target: {
    agent: Record<string, unknown>
    provider: Record<string, unknown>
  } = {
    agent: {},
    provider: { qa: { models: { observed: {} } } },
  }
  const providerBefore = structuredClone(target.provider)
  const logs: CategoryDiagnosticLog[] = []

  await createConfigHandler({
    getConfig: () => config,
    routeRegistry,
    getFastMode: () => false,
    logger: categoryDiagnosticLogger(logs),
  })(target, undefined)

  assert.match(categoryDiagnosticMessages(logs, "canonical-route")[0]!.message, /status=available/)
  assert.match(categoryDiagnosticMessages(logs, "legacy-route")[0]!.message, /status=unknown/)
  assert.match(categoryDiagnosticMessages(logs, "dead-route")[0]!.message, /status=dead/)
  assert.equal(categoryDiagnosticMessages(logs, "dead-route")[0]?.level, "warn")

  const canonical = publishedCategoryRoute(routeRegistry, "canonical-route")
  const legacy = publishedCategoryRoute(routeRegistry, "legacy-route")
  const dead = publishedCategoryRoute(routeRegistry, "dead-route")
  assert.equal((target.agent["canonical-route"] as Record<string, unknown>).model, "qa/observed")
  assert.equal((target.agent["legacy-route"] as Record<string, unknown>).model, "missing/legacy")
  assert.equal((target.agent["dead-route"] as Record<string, unknown>).model, "blocked/conflict")
  assert.deepEqual(canonical.requirement.fallbackChain, [
    { providers: ["qa"], model: "observed" },
    { providers: ["missing"], model: "fallback" },
  ])
  assert.deepEqual(legacy.requirement.fallbackChain, [
    { providers: ["missing"], model: "legacy" },
  ])
  assert.deepEqual(dead.requirement, {
    requiresProvider: ["qa"],
    fallbackChain: [{ providers: ["blocked"], model: "conflict" }],
  })
  for (const route of [canonical, legacy, dead]) {
    assert.deepEqual(
      Object.keys(route).sort(),
      ["fastPath", "model", "primarySource", "requirement", "requirementSource"],
    )
    assert.equal(route.requirementSource, "user-config")
    assert.equal(route.primarySource, "user-requirement")
    assert.deepEqual(route.fastPath, { kind: "off" })
    assert.equal(Object.hasOwn(route, "availability"), false)
    assert.equal(Object.hasOwn(route, "diagnostic"), false)
  }
  assert.deepEqual(target.provider, providerBefore)
})
```

- [ ] **Step 5: Run the integration suite and confirm behavior RED without regressing diagnostic GREEN**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/routing/category-availability.test.ts src/hooks/category-availability-diagnostics.test.ts src/hooks/config.category.test.ts
```

Expected behavior RED: resolver and reporter tests pass; the new config tests fail because no `category availability:` messages are emitted. The three pre-existing type diagnostics are already GREEN from Step 3, and every existing category registration/prompt/route assertion—including the assertions formerly at lines 161, 278, and 279—must remain unchanged and pass.

- [ ] **Step 6: Wire one reporter into only the two category registration paths**

In `src/hooks/config.ts`, add the import beside the existing subagent-depth reporter:

```ts
import { createCategoryAvailabilityDiagnosticReporter } from "./category-availability-diagnostics.ts"
import { createSubagentDepthDiagnosticReporter, type SubagentDepthDiagnosticLogger } from "./subagent-depth-diagnostics.ts"
```

Inside `createConfigHandler()`, instantiate the reporter once, beside `reportSubagentDepth` and outside the returned hook callback:

```ts
  const logger = args.logger ?? log
  const reportSubagentDepth = createSubagentDepthDiagnosticReporter(logger)
  const reportCategoryAvailability = createCategoryAvailabilityDiagnosticReporter(logger)
```

In the enabled built-in category loop, notify only after `applyAgentEntry()` succeeds and after the existing route-registration call:

```ts
      if (applyAgentEntry(agentMap, baseAgent, merged, extras)) {
        registerEffectiveRoute({
          build: routeBuild,
          agentMap,
          target,
          cfg,
          name: c.name,
          requirement: effective.requirement,
          requirementSource: effective.source,
          primary,
        })
        reportCategoryAvailability({
          name: c.name,
          target,
          requirement: effective.requirement,
          requirementSource: effective.source,
          primarySource: primary.source,
          selectedModel: primary.model,
        })
      }
```

In the registry-managed custom category loop, make the same post-success notification:

```ts
        if (applyAgentEntry(agentMap, synthetic, merged, { mode: "subagent", model: primary.model })) {
          registerEffectiveRoute({
            build: routeBuild,
            agentMap,
            target,
            cfg,
            name,
            requirement: effective.requirement,
            requirementSource: effective.source,
            primary,
          })
          reportCategoryAvailability({
            name,
            target,
            requirement: effective.requirement,
            requirementSource: effective.source,
            primarySource: primary.source,
            selectedModel: primary.model,
          })
        }
```

Do not add calls in built-in agent, expanded planning/review profile, generic custom agent, compatibility-alias, route-registry, chat-params, or runtime-fallback paths. Do not branch on the reporter result; it returns `void`.

- [ ] **Step 7: Run focused integration tests and confirm behavior GREEN**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/routing/category-availability.test.ts src/hooks/category-availability-diagnostics.test.ts src/hooks/config.category.test.ts
```

Expected behavior GREEN: exit code `0` and `fail 0`; the unchanged pre-existing prompt/route assertions remain GREEN; built-in/custom reports appear once per stable key; disabled/unregistered/category-shadowed entries remain silent; catalog upgrade remains `openai/gpt-5.7-sol`; and available/unknown/dead explicit routes all remain registered with the unchanged five-field snapshot shape.

- [ ] **Step 8: Document the diagnostics-only contract**

In `README.md`, insert this section immediately after the built-in-category explanation and before `## Prompt architecture`:

```markdown
### Category model-availability diagnostics

With `OCMM_DEBUG=1`, the config hook emits one deduplicated availability diagnostic for each successfully registered built-in or custom category and each distinct observed diagnostic state. Every message includes the category name, requirement/primary provenance, selected model, candidate summaries, and `routePreserved=true`.

| Status | Meaning |
| --- | --- |
| `available` | The current host catalog contains an exact eligible provider/model key, or `requiresAnyModel` is active and an eligible observed provider exposes at least one model. |
| `dead` | The normalized fallback chain is empty, or every candidate is structurally impossible because it conflicts with `requiresModel` or `requiresProvider`. |
| `unknown` | At least one candidate is structurally eligible, but the host catalog is missing, malformed, incomplete, or does not currently show the provider/model. |

These diagnostics are read-only. `target.provider[*].models` is observation evidence, not proof of credentials or runtime access, and catalog absence never disables a category. A `dead` or `unknown` category remains registered; diagnostics do not change selected primaries, catalog upgrades, provider defaults, canonical `models[]`, effective-route snapshots, or runtime fallback. Messages contain provider IDs and model keys only—never provider options, API keys, URLs, response bodies, or the full host config. The existing logger keeps all of this output silent unless `OCMM_DEBUG` is enabled.
```

- [ ] **Step 9: Re-run focused tests after documentation and record the Task 3 non-Git checkpoint**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/routing/category-availability.test.ts src/hooks/category-availability-diagnostics.test.ts src/hooks/config.category.test.ts
$task3Files = @(
  "README.md",
  "src/hooks/config.ts",
  "src/hooks/config.category.test.ts"
)
$missingTask3Files = @($task3Files | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) })
if ($missingTask3Files.Count -gt 0) { throw "Task 3 files missing: $($missingTask3Files -join ', ')" }
Write-Output "Task 3 non-Git checkpoint complete: config integration and documentation GREEN"
```

Expected: focused tests exit `0` with `fail 0`, all three Task 3 paths exist, and the command prints the Task 3 checkpoint message. Do not run any Git write command; whitespace, exact scope, staging, and committing belong only to Task 4.

### Task 4: Run final gates, real-surface QA, exact-scope checks, and the single parent commit

**Files:**
- Verify: every path in the file map
- Verify cleanup: `$env:LOCALAPPDATA\Temp\opencode\ocmm-category-availability-$PID`
- Commit once, parent only: the exact nine-path feature scope listed in Step 7

**Interfaces:**
- Consumes: the complete Tasks 1–3 revision, built modules under `dist/`, installed repository dependencies, the existing `opencode` executable, and user authorization for exactly one final parent commit.
- Produces: focused/typecheck/full-test/build/compiler-diagnostic/isolated-OpenCode/scope receipts and, only after every receipt is GREEN, one local commit titled `feat: add category availability diagnostics`; no push, tag, release, or publication.

- [ ] **Step 1: Run the focused diagnostic and config tests**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/routing/category-availability.test.ts src/hooks/category-availability-diagnostics.test.ts src/hooks/config.category.test.ts
```

Expected: exit code `0`, every named diagnostic/config test passes, and the summary reports `fail 0`.

- [ ] **Step 2: Run typecheck, the complete test suite, and the true repository build**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
pnpm test
if ($LASTEXITCODE -ne 0) { throw "full test suite failed" }
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "repository build failed" }
```

Expected: all three commands exit `0`; strict TypeScript reports no errors, Node and Cargo tests report zero failures, and TypeScript plus native LSP build artifacts are produced under `dist/`. If an existing user process locks a build output, do not terminate it; report the gate as blocked and do not commit.

- [ ] **Step 3: Run Compiler API diagnostics over every changed TypeScript and test file**

Run this installed-compiler check; it explicitly adds test files excluded by `tsconfig.json` to the compiler program:

```powershell
@'
import path from "node:path"
import ts from "typescript"

const files = [
  "src/routing/category-availability.ts",
  "src/routing/category-availability.test.ts",
  "src/hooks/category-availability-diagnostics.ts",
  "src/hooks/category-availability-diagnostics.test.ts",
  "src/hooks/config.ts",
  "src/hooks/config.category.test.ts",
]
const configPath = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json")
if (!configPath) throw new Error("tsconfig.json not found")
const loaded = ts.readConfigFile(configPath, ts.sys.readFile)
if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, "\n"))
const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath), undefined, configPath)
const absoluteFiles = files.map((file) => path.resolve(file))
const targets = new Set(absoluteFiles.map((file) => file.toLowerCase()))
const rootNames = [...new Set([...parsed.fileNames.map((file) => path.resolve(file)), ...absoluteFiles])]
const program = ts.createProgram({ rootNames, options: { ...parsed.options, noEmit: true } })
const missing = absoluteFiles.filter((file) => program.getSourceFile(file) === undefined)
if (missing.length) throw new Error(`diagnostic targets missing from compiler program: ${missing.join(", ")}`)
const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) =>
  diagnostic.file === undefined || targets.has(path.resolve(diagnostic.file.fileName).toLowerCase())
)
if (diagnostics.length) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  }
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, host))
  process.exit(1)
}
console.log(`changed-file compiler diagnostics: 0 (${files.length} files)`)
'@ | node --input-type=module
if ($LASTEXITCODE -ne 0) { throw "changed-file Compiler API diagnostics failed" }
```

Expected: exit code `0` and `changed-file compiler diagnostics: 0 (6 files)`. Because `src/hooks/config.category.test.ts` is explicitly one of those six roots, this also proves that the typing-only Task 3 repair kept TS7053 at the former lines 161/278 and TS2339 at the former line 279 absent after all new integration tests were appended. Do not install a language server or compiler; this uses the repository's installed TypeScript.

- [ ] **Step 4: Run isolated OpenCode `OCMM_DEBUG` QA and prove all statuses preserve routes**

Run from the repository root after `pnpm run build`. This performs no model request and uses only disposable XDG/config/state/cache paths under the approved OS temporary parent:

```powershell
if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
  throw "opencode is unavailable; do not install it—report the real-surface gate as blocked"
}
$pluginPath = (Resolve-Path -LiteralPath "dist\index.js").Path
$tempParent = Join-Path $env:LOCALAPPDATA "Temp\opencode"
if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) {
  throw "approved OpenCode temporary parent is missing"
}
$testRoot = Join-Path $tempParent ("ocmm-category-availability-" + $PID)
$sandbox = Join-Path $testRoot "sandbox"
$evidence = Join-Path $testRoot "evidence"
$oldXdgConfig = $env:XDG_CONFIG_HOME
$oldXdgData = $env:XDG_DATA_HOME
$oldXdgState = $env:XDG_STATE_HOME
$oldXdgCache = $env:XDG_CACHE_HOME
$oldDebug = $env:OCMM_DEBUG
$locationPushed = $false
$qaPassed = $false
try {
  New-Item -ItemType Directory -Force -Path `
    (Join-Path $sandbox ".opencode"), `
    (Join-Path $sandbox "xdg-config"), `
    (Join-Path $sandbox "xdg-data"), `
    (Join-Path $sandbox "xdg-state"), `
    (Join-Path $sandbox "xdg-cache"), `
    $evidence | Out-Null
  $env:XDG_CONFIG_HOME = Join-Path $sandbox "xdg-config"
  $env:XDG_DATA_HOME = Join-Path $sandbox "xdg-data"
  $env:XDG_STATE_HOME = Join-Path $sandbox "xdg-state"
  $env:XDG_CACHE_HOME = Join-Path $sandbox "xdg-cache"
  $env:OCMM_DEBUG = "1"

  $openCodeConfig = @{
    '$schema' = 'https://opencode.ai/config.json'
    plugin = @($pluginPath)
    disabled_providers = @('opencode', 'openrouter', 'github-copilot', 'openai')
    provider = @{
      qa = @{
        npm = '@ai-sdk/openai-compatible'
        name = 'Category Availability QA'
        options = @{
          apiKey = 'CATEGORY_QA_DUMMY_SECRET'
          baseURL = 'http://127.0.0.1:1'
        }
        models = @{
          observed = @{ name = 'Observed QA Model' }
        }
      }
    }
  } | ConvertTo-Json -Depth 12
  Set-Content -LiteralPath (Join-Path $sandbox "opencode.json") -Value $openCodeConfig -Encoding utf8

  $ocmmConfig = @{
    categories = @{
      'available-category' = @{ models = @('qa/observed') }
      'unknown-category' = @{ model = 'missing/not-observed' }
      'dead-category' = @{
        requirement = @{
          requiresProvider = @('qa')
          fallbackChain = @(@{ providers = @('blocked'); model = 'conflict' })
        }
      }
    }
    debug = $true
  } | ConvertTo-Json -Depth 12
  Set-Content -LiteralPath (Join-Path $sandbox ".opencode\ocmm.jsonc") -Value $ocmmConfig -Encoding utf8

  Push-Location -LiteralPath $sandbox
  $locationPushed = $true
  $pathsOutput = @(opencode debug paths 2>&1 | Tee-Object -FilePath (Join-Path $evidence "opencode-debug-paths.txt"))
  if ($LASTEXITCODE -ne 0) { throw "opencode debug paths failed" }
  $configOutput = @(opencode debug config --print-logs --log-level DEBUG 2>&1 | Tee-Object -FilePath (Join-Path $evidence "opencode-debug-config.txt"))
  if ($LASTEXITCODE -ne 0) { throw "opencode debug config failed" }
  $env:OCMM_DEBUG = "0"
  $availableOutput = @(opencode debug agent available-category --print-logs --log-level DEBUG 2>&1 | Tee-Object -FilePath (Join-Path $evidence "available-agent.txt"))
  if ($LASTEXITCODE -ne 0) { throw "available-category was not registered" }
  $unknownOutput = @(opencode debug agent unknown-category --print-logs --log-level DEBUG 2>&1 | Tee-Object -FilePath (Join-Path $evidence "unknown-agent.txt"))
  if ($LASTEXITCODE -ne 0) { throw "unknown-category was not registered" }
  $deadOutput = @(opencode debug agent dead-category --print-logs --log-level DEBUG 2>&1 | Tee-Object -FilePath (Join-Path $evidence "dead-agent.txt"))
  if ($LASTEXITCODE -ne 0) { throw "dead-category was not registered" }
  Pop-Location
  $locationPushed = $false

  $pathsText = $pathsOutput -join "`n"
  $diagnosticText = ($configOutput | Where-Object { $_ -match 'category availability:' }) -join "`n"
  if ($pathsText -notmatch [regex]::Escape($sandbox)) { throw "OpenCode XDG paths escaped the sandbox" }
  if ($diagnosticText -notmatch 'name="available-category" status=available') { throw "available diagnostic missing" }
  if ($diagnosticText -notmatch 'name="unknown-category" status=unknown') { throw "unknown diagnostic missing" }
  if ($diagnosticText -notmatch 'name="dead-category" status=dead') { throw "dead diagnostic missing" }
  if (($diagnosticText | Select-String -Pattern 'routePreserved=true' -AllMatches).Matches.Count -lt 3) { throw "route preservation markers missing" }
  if ($diagnosticText -match 'CATEGORY_QA_DUMMY_SECRET|127\.0\.0\.1') { throw "secret-bearing provider options leaked into diagnostics" }
  if (($availableOutput -join "`n") -notmatch 'qa/observed') { throw "available route model mismatch" }
  if (($unknownOutput -join "`n") -notmatch 'missing/not-observed') { throw "unknown route was gated or changed" }
  if (($deadOutput -join "`n") -notmatch 'blocked/conflict') { throw "dead route was gated or changed" }
  $qaPassed = $true
}
finally {
  if ($locationPushed) { Pop-Location }
  $env:XDG_CONFIG_HOME = $oldXdgConfig
  $env:XDG_DATA_HOME = $oldXdgData
  $env:XDG_STATE_HOME = $oldXdgState
  $env:XDG_CACHE_HOME = $oldXdgCache
  $env:OCMM_DEBUG = $oldDebug
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
if (-not $qaPassed) { throw "isolated OpenCode category availability QA failed" }
if (Test-Path -LiteralPath $testRoot) { throw "isolated OpenCode temporary state remains" }
Write-Output "isolated OpenCode category availability QA passed and temporary state was removed"
```

Expected: all five OpenCode debug commands exit `0`; debug-config output contains `available`, `unknown`, and `dead` diagnostics with `routePreserved=true`; the three debug-agent commands run with `OCMM_DEBUG=0` so their model assertions cannot be satisfied by diagnostic text, and they resolve all three category models unchanged; only extracted diagnostic lines are checked for dummy-secret/URL leakage; no model call occurs; final output confirms cleanup.

- [ ] **Step 5: Prove exact scope, no route/runtime/release drift, empty index, and clean whitespace**

```powershell
git diff --check
if ($LASTEXITCODE -ne 0) { throw "tracked-file whitespace check failed" }
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw "index must be empty before the parent-only commit boundary" }
$expected = @(
  "README.md",
  "docs/superpowers/plans/2026-07-31-category-availability-diagnostics.md",
  "docs/superpowers/specs/2026-07-31-category-availability-diagnostics-design.md",
  "src/hooks/category-availability-diagnostics.test.ts",
  "src/hooks/category-availability-diagnostics.ts",
  "src/hooks/config.category.test.ts",
  "src/hooks/config.ts",
  "src/routing/category-availability.test.ts",
  "src/routing/category-availability.ts"
) | Sort-Object -Unique
$actual = @(
  git diff --name-only HEAD
  git ls-files --others --exclude-standard
) | Where-Object { $_ } | Sort-Object -Unique
$unexpected = @($actual | Where-Object { $_ -notin $expected })
$missing = @($expected | Where-Object { $_ -notin $actual })
if ($unexpected.Count -gt 0) { throw "unexpected changed paths: $($unexpected -join ', ')" }
if ($missing.Count -gt 0) { throw "expected changed paths missing: $($missing -join ', ')" }
$approvedSpecHash = "4f5a8ce7315f0d661a41f19524c1e1ad655bccf9caff9d96a24fbbded72c83f1"
$actualSpecHash = (Get-FileHash -LiteralPath "docs/superpowers/specs/2026-07-31-category-availability-diagnostics-design.md" -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSpecHash -ne $approvedSpecHash) { throw "approved design specification changed" }
if ((git diff --name-only HEAD -- src/runtime-fallback src/routing/route-registry.ts src/routing/effective-route.ts src/routing/model-upgrades.ts src/shared/types.ts src/config/schema.ts schema.json package.json .github).Count -ne 0) {
  throw "forbidden routing, runtime, schema, package, or release scope changed"
}
git status --short
```

Expected: the index is empty; actual scope equals the nine paths exactly; the approved spec retains SHA-256 `4f5a8ce7315f0d661a41f19524c1e1ad655bccf9caff9d96a24fbbded72c83f1`; no runtime-fallback, route contract, route construction, catalog selection, shared type, schema, package/version, generated bundle, workflow, or release file changed.

- [ ] **Step 6: Re-run the final focused test after scope inspection**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/routing/category-availability.test.ts src/hooks/category-availability-diagnostics.test.ts src/hooks/config.category.test.ts
if ($LASTEXITCODE -ne 0) { throw "final focused regression failed" }
```

Expected: exit `0` and `fail 0`. No source input changed after the earlier full gates, so do not rerun identical full gates unless this step or scope inspection led to an edit.

- [ ] **Step 7: Parent agent creates the one authorized commit, with no push/tag/release**

Only the parent agent may execute this step, and only if Steps 1–6 are all GREEN:

```powershell
git add -- `
  README.md `
  docs/superpowers/plans/2026-07-31-category-availability-diagnostics.md `
  docs/superpowers/specs/2026-07-31-category-availability-diagnostics-design.md `
  src/hooks/category-availability-diagnostics.test.ts `
  src/hooks/category-availability-diagnostics.ts `
  src/hooks/config.category.test.ts `
  src/hooks/config.ts `
  src/routing/category-availability.test.ts `
  src/routing/category-availability.ts
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "staged whitespace check failed" }
$expectedStaged = @(
  "README.md",
  "docs/superpowers/plans/2026-07-31-category-availability-diagnostics.md",
  "docs/superpowers/specs/2026-07-31-category-availability-diagnostics-design.md",
  "src/hooks/category-availability-diagnostics.test.ts",
  "src/hooks/category-availability-diagnostics.ts",
  "src/hooks/config.category.test.ts",
  "src/hooks/config.ts",
  "src/routing/category-availability.test.ts",
  "src/routing/category-availability.ts"
) | Sort-Object
$actualStaged = @(git diff --cached --name-only) | Sort-Object
if (Compare-Object $expectedStaged $actualStaged) { throw "staged scope differs from the authorized nine paths" }
git commit -m "feat: add category availability diagnostics" -m "Add diagnostics-only resolution, deduplicated debug reporting, config integration, tests, and documentation."
if ($LASTEXITCODE -ne 0) { throw "authorized feature commit failed" }
if ((git log -1 --pretty=%s) -ne "feat: add category availability diagnostics") { throw "unexpected commit title" }
$remaining = @(git status --short)
if ($remaining.Count -ne 0) { throw "worktree is not clean after the authorized commit: $($remaining -join '; ')" }
git show --stat --oneline --summary HEAD
```

Expected: exactly nine paths are staged; staged whitespace check passes; one commit is created with the exact title `feat: add category availability diagnostics` and the brief body shown above; the worktree is clean. Do not amend, push, tag, dispatch release work, publish packages, or run release-completion checks.

## Acceptance-criteria coverage map

| Acceptance criterion | Plan evidence |
| --- | --- |
| 1. Diagnostics use exactly `available`, `dead`, and `unknown`. | Task 1 exported unions and resolver matrix; Task 2 level matrix; Task 4 live debug-config assertions. |
| 2. Missing/incomplete catalog evidence never produces `dead`. | Task 1 malformed/absent provider/model matrix and mixed dead/unknown aggregate test. |
| 3. Only structural guard conflicts or an empty chain produce `dead`. | Task 1 exact-model conflict, provider-intersection conflict, and qualified-selection empty-chain tests. |
| 4. Exact observations and `requiresAnyModel` observations produce `available`. | Task 1 exact-match, provider-unspecified, and `requiresAnyModel` tests, including `requiresModel` precedence. |
| 5. Built-in and custom categories use `OCMM_DEBUG`-gated reporting with per-handler deduplication. | Task 2 defaults to existing `log`; Task 3 integration/dedup test; Task 4 isolated `OCMM_DEBUG=1` OpenCode run. |
| 6. Every report states `routePreserved=true`. | Task 2 message assertions, README contract, and Task 4 live line-count assertion. |
| 7. Registration, selected primary, route snapshot, runtime fallback, provider defaults, and canonical `models[]` remain unchanged. | Task 3 catalog-upgrade and exact five-field route assertions; Task 4 forbidden-scope and exact-path checks; no route/runtime/schema production path is edited. |
| 8. Explicit user routes remain registered for all statuses. | Task 3 canonical/legacy/dead custom route test and Task 4 three `opencode debug agent` checks. |
| 9. No secret-bearing host fields appear in diagnostics. | Task 1 diagnostic/key sentinel test; Task 2 formatter sentinel test; Task 4 extracted diagnostic-line sentinel/URL check. |
| Final verification contract. | Task 3 records the exact three-diagnostic RED baseline and typing-only zero-diagnostic GREEN transition; Task 4 repeats the six-file Compiler API gate after all integration additions, plus focused tests, typecheck, full Node/Cargo tests, build, isolated OpenCode QA, cleanup, `git diff --check`, exact scope, and one parent-only commit. |

## Inline self-review receipt

- **Spec coverage:** Passed. Every design acceptance criterion maps to a named test, implementation task, and final evidence channel above.
- **Completeness-marker scan:** Passed. The plan contains no incomplete markers, deferred implementation choice, omitted test body, cross-task shorthand, or unspecified command expectation.
- **Type/interface consistency:** Passed. Task 1 defines the exact resolver argument/result types consumed by Task 2; Task 2 defines the structural `info`/`warn` logger accepted by the existing config-handler logger; Task 3 adds only two `target` annotations with `agent: Record<string, unknown>`/`provider: Record<string, unknown>`, preserves their object literals and assertions, and passes the already resolved `effective.requirement`, provenance, and `primary.model` without introducing a route type.
- **Behavior consistency:** Passed. Candidate evaluation gives `requiresModel` precedence, uses only structural conflicts/empty chain for `dead`, treats all catalog absence as `unknown`, materializes non-empty chains with the existing helper, and never feeds diagnostics back into registration.
- **Task sizing/order:** Passed. Four serial tasks each end with an independently testable deliverable: pure resolver, reporter, typing-repaired config/docs integration, and repository/real-surface acceptance. The typing-only RED/GREEN cycle precedes behavior-test additions so its evidence is attributable to exactly two declarations.
- **QA executability:** Passed. Commands are PowerShell, use installed dependencies only, record the exact TS7053/TS2339 baseline, include `src/hooks/config.category.test.ts` and all other excluded tests in Compiler API roots, make no model call, restore environment variables, and delete isolated OpenCode state in `finally`. Every script piped to plain `node --input-type=module` is executable JavaScript; no non-null assertion, type assertion, `satisfies`, interface, enum, or type declaration remains in those JavaScript blocks.
- **Scope/Git safety:** Passed. Tasks 1–3 are explicit non-Git checkpoints; Task 4 checks an empty index and exact nine-path scope before allowing the parent to make one authorized commit. No push, tag, release, install, or publication is authorized.
- **Review-blocker resolution:** Passed. The plan repairs exactly the two `{ agent: {} }` target declarations responsible for all three HEAD diagnostics, proves the current three-error RED baseline with a plain-JavaScript location guard/fallback, proves a zero-error GREEN transition before feature integration, preserves every existing assertion, and repeats the same file in Task 4's six-file zero-diagnostic gate.
- **Ambiguity review:** Passed. `unknown` owns every incomplete-catalog case; `dead` is limited to structural impossibility; explicit routes are always preserved; no snapshot metadata, gating, provider-default change, or runtime-fallback change is permitted.
- **Receipt status:** `waiting for receipt`. This planner did not dispatch `plan-critic`; formal review dispatch belongs to the orchestrator.
