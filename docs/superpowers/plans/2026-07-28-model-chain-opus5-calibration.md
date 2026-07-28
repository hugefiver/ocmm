# Model Chain and Opus 5 Calibration Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Use one fresh coding subagent per task, in the exact serial order below. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the built-in Claude, Kimi, and GPT fallback chains and add an exact, orchestrator-only Claude Opus 5 execution calibration across OpenCode and generated Codex surfaces without changing resolver precedence or concurrent subprojects.

**Architecture:** Static chain data remains the no-catalog baseline, while the existing catalog-upgrade algorithm remains untouched and independently preserves Oracle exact-model precedence. A narrow exported Opus 5 detector feeds the prompt loader; effective config composition combines the existing authoritative role/base prompt with one additive Opus 5 layer only for the orchestrator identity, with a guarded ahead-of-runtime copy in Codex. Tests pin data adjacency, detector grammar, source inventory, effective composition, generated profiles, and the isolated real configuration surface.

**Tech Stack:** TypeScript 6, Node.js 22+ built-in test runner (`node:test`), pnpm 11, PowerShell 7, existing Codex generator, OpenCode CLI, Rust/Cargo for the existing `ocmm-lsp` build.

**Global Constraints:**

- The authoritative specification is `docs/superpowers/specs/2026-07-28-model-chain-opus5-calibration-design.md`; implement its full scope and no adjacent subproject.
- Baseline HEAD is `3f7daff0e5b435e36ca47bad1870ca76decd57bf`.
- Preserve the twelve pre-existing protected dirty paths byte-for-byte; seven are tracked project 1/2 code/tests, four are untracked project 1/2 specs/plans, and one is this subproject's approved spec.
- Do not install software, stop user processes, or run `git add`, `git commit`, `git push`, `git tag`, or any other Git write.
- Before every test, build, or generation command, clear `OCMM_PROFILE`, `OCMM_NO_PROFILE`, and `OCMM_FAST` unless the test itself owns those variables.
- Shell commands are PowerShell. Use `.exe` suffixes for shadowed uutils commands when they are needed.
- Every new Opus or GPT static entry copies its legacy counterpart's complete metadata except `model`; Kimi K3 uses exactly `providers: ["kimi-for-coding", "moonshot"]` and does not copy legacy variant/tuning by assumption.
- Do not expand `ModelFamily`, change variant translation, resolver precedence, provider aliases, `src/routing/model-upgrades.ts`, config schema, `schema.json`, or lockfiles.
- Prompt source edits and `docs/prompt-sync.md` / `docs/v1-maintenance.md` synchronization occur in the same task.
- Generated files are never hand-edited. Accept only deterministic generator output under `.agents/plugins/marketplace.json`, `.codex/agents/`, and `plugins/deepwork/`, and do not assume any particular generated file must change.
- A root `pnpm run build` failure is not a pass. Only a proven `EPERM`/`EBUSY` unlink/delete failure on root `dist\bin\ocmm-lsp*.exe` may use the isolated build fallback; never terminate the locking process.
- The implementation workflow reports suggested semantic commit messages but performs no Git writes. The orchestrator owns the later Oracle + Reviewer final implementation acceptance; this plan and its coding subagents do not invoke them.

---

## File Map

| Path | Responsibility |
| --- | --- |
| `src/data/agents.ts` | Static built-in agent fallback chains and Oracle Terra placement. |
| `src/data/categories.ts` | Static built-in category fallback chains. |
| `src/data/model-requirements.test.ts` | Focused cross-catalog adjacency, metadata, lane, retention, and duplicate contracts. |
| `src/routing/model-upgrades.test.ts` | Proves the unchanged production selector still prioritizes exact Oracle GPT-5.4/5.5 catalog entries before Terra. |
| `src/routing/resolver.test.ts` | Pins the refreshed static Oracle order and reviewer fallback head. |
| `src/intent/model-family.ts` | Exports the exact Opus 5 detector while retaining the broad reasoning family. |
| `src/intent/model-family.test.ts` | Accepted/rejected detector grammar and family-classification tests. |
| `src/intent/prompt-loader.ts` | Adds the `claude-opus-5` source inventory and planner-first, orchestrator-only selection. |
| `src/intent/prompt-loader.test.ts` | Three-workflow inventory, source quality, exact composition, and selection tests. |
| `prompts/omo/deepwork/claude-opus-5.md` | Plain additive Opus 5 calibration. |
| `prompts/v1/deepwork/claude-opus-5.md` | Single-envelope deepwork calibration. |
| `prompts/codex/deepwork/claude-opus-5.md` | Single-envelope guarded ahead-of-runtime calibration. |
| `docs/prompt-sync.md` | Omo inventory, upstream source SHA/path, and partial-adaptation record. |
| `docs/v1-maintenance.md` | v1 source mapping and Codex guard/composition record. |
| `src/hooks/config.ts` | Effective OpenCode and Codex prompt composition. |
| `src/hooks/config.test.ts` | Functional-agent composition, Codex identity exclusions, and refreshed static defaults. |
| `src/hooks/config.category.test.ts` | All-category Opus exclusion and retained Codex GPT-5.6 carriage. |
| `src/codex/plugin-generator.test.ts` | In-memory and temporary generated-profile Opus carriage/exclusion contracts. |
| `.agents/plugins/marketplace.json` | Generator-owned marketplace output; include only an actual deterministic delta. |
| `.codex/agents/` | Generator-owned project agent TOMLs; include only actual deterministic deltas. |
| `plugins/deepwork/` | Generator-owned bundle; include only actual deterministic deltas. |

## Serial Execution and Review Boundaries

1. Task 1 establishes the protected-tree receipt and implements only static chain contracts/data.
2. Task 2 consumes the refreshed Opus identity and implements detector, loader, source prompts, and both mandatory maintenance records as one atomic work unit.
3. Task 3 consumes the loader variant and implements effective prompt composition/exclusions.
4. Task 4 consumes stable config composition, updates generator contracts, and runs deterministic source generation.
5. Task 5 changes no product files; it runs real-surface and repository acceptance gates, verifies scope/protected hashes, and cleans temporary artifacts.

After each task, the parent checks returned evidence, touched paths, targeted GREEN output, and overlap with the next task before dispatching the next fresh worker. Do not pause for a commit and do not create one.

---

### Task 1: Refresh Static Model Chains and Pin Their Contracts

**Files:**
- Create: `src/data/model-requirements.test.ts`
- Modify: `src/data/agents.ts:23-174`
- Modify: `src/data/categories.ts:19-148`
- Modify: `src/routing/model-upgrades.test.ts:38-59`
- Modify: `src/routing/resolver.test.ts:201-211,229-238`
- Do not modify: `src/routing/model-upgrades.ts`

**Interfaces:**
- Consumes: `BUILTIN_AGENTS: Agent[]`, `BUILTIN_CATEGORIES: Category[]`, `FallbackEntry`, and `selectCatalogModel(target, agentName, requirement)`.
- Produces: static fallback heads/adjacency for Tasks 2-5; a single Oracle chain `claude-opus-5 -> claude-opus-4-7 -> gemini-3.1-pro -> gpt-5.4 -> gpt-5.6-terra -> gpt-5.5 -> glm-5.1`; focused data contracts that downstream tasks may rely on.

- [ ] **Step 1: Prove the initial dirty-tree boundary and write the protected-file hash receipt outside the repository**

Run from repository root:

```powershell
$expectedHead = "3f7daff0e5b435e36ca47bad1870ca76decd57bf"
$actualHead = (git rev-parse HEAD).Trim()
if ($actualHead -ne $expectedHead) { throw "Unexpected HEAD: $actualHead" }

$expectedStatus = @(
  " M src/config/load.test.ts",
  " M src/config/merge.ts",
  " M src/runtime-fallback/event-handler-idle-continuation.test.ts",
  " M src/runtime-fallback/event-handler-idle-continuation.ts",
  " M src/runtime-fallback/event-handler.ts",
  " M src/runtime-fallback/idle-state.test.ts",
  " M src/runtime-fallback/idle-state.ts",
  "?? docs/superpowers/plans/2026-07-28-config-merge-prototype-hardening.md",
  "?? docs/superpowers/plans/2026-07-28-idle-continuation-fencing.md",
  "?? docs/superpowers/plans/2026-07-28-model-chain-opus5-calibration.md",
  "?? docs/superpowers/specs/2026-07-28-config-merge-prototype-hardening-design.md",
  "?? docs/superpowers/specs/2026-07-28-idle-continuation-fencing-design.md",
  "?? docs/superpowers/specs/2026-07-28-model-chain-opus5-calibration-design.md"
) | Sort-Object
$actualStatus = @(git status --short --untracked-files=all) | Sort-Object
$statusDelta = @(Compare-Object $expectedStatus $actualStatus)
if ($statusDelta.Count -ne 0) { $statusDelta | Format-Table | Out-String | Write-Error; throw "Initial scope differs" }

$protectedPaths = @(
  "src/config/load.test.ts",
  "src/config/merge.ts",
  "src/runtime-fallback/event-handler-idle-continuation.test.ts",
  "src/runtime-fallback/event-handler-idle-continuation.ts",
  "src/runtime-fallback/event-handler.ts",
  "src/runtime-fallback/idle-state.test.ts",
  "src/runtime-fallback/idle-state.ts",
  "docs/superpowers/plans/2026-07-28-config-merge-prototype-hardening.md",
  "docs/superpowers/plans/2026-07-28-idle-continuation-fencing.md",
  "docs/superpowers/specs/2026-07-28-config-merge-prototype-hardening-design.md",
  "docs/superpowers/specs/2026-07-28-idle-continuation-fencing-design.md",
  "docs/superpowers/specs/2026-07-28-model-chain-opus5-calibration-design.md"
)
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) { throw "Approved temp parent missing" }
$receiptPath = Join-Path $tempParent "ocmm-model-chain-opus5-protected.json"
$hashes = [ordered]@{}
foreach ($path in $protectedPaths) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Protected path missing: $path" }
  $hashes[$path] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}
$receipt = [ordered]@{ head = $actualHead; paths = $hashes }
[IO.File]::WriteAllText(
  $receiptPath,
  ($receipt | ConvertTo-Json -Depth 5),
  [Text.UTF8Encoding]::new($false)
)
"protected_receipt=$receiptPath count=$($protectedPaths.Count)"
```

Expected: `protected_receipt=...ocmm-model-chain-opus5-protected.json count=12`; no repository file changes.

- [ ] **Step 2: Write the focused RED contracts before editing either static catalog**

Create `src/data/model-requirements.test.ts` with this complete content:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import { BUILTIN_AGENTS } from "./agents.ts"
import { BUILTIN_CATEGORIES } from "./categories.ts"
import type { FallbackEntry } from "../shared/types.ts"

type ChainOwner = Readonly<{ key: string; chain: FallbackEntry[] }>

const owners: ChainOwner[] = [
  ...BUILTIN_AGENTS.map((agent) => ({ key: `agent:${agent.name}`, chain: agent.requirement.fallbackChain })),
  ...BUILTIN_CATEGORIES.map((category) => ({ key: `category:${category.name}`, chain: category.requirement.fallbackChain })),
]

const OPUS_OWNERS = [
  "agent:clarifier", "agent:oracle", "agent:oracle-2nd", "agent:orchestrator",
  "agent:plan-critic", "agent:planner", "agent:reviewer", "category:complex",
  "category:creative", "category:deep", "category:frontend", "category:hard-reasoning",
  "category:research",
] as const

const SOL_OWNERS = new Set([
  "agent:orchestrator", "agent:builder", "agent:reviewer", "agent:oracle-2nd",
  "agent:planner", "agent:clarifier", "agent:plan-critic", "agent:media-reader",
  "category:frontend", "category:creative", "category:hard-reasoning", "category:research",
  "category:coding", "category:deep",
])

const TERRA_OWNERS = new Set([
  "agent:oracle", "category:normal-task", "category:complex",
])

const KIMI_LEGACY_BY_OWNER: Readonly<Record<string, readonly string[]>> = {
  "agent:orchestrator": ["kimi-k2.6", "k2p5"],
  "agent:media-reader": ["kimi-k2.6"],
  "category:complex": ["k2p5"],
  "category:deep": ["kimi-k2.6"],
  "category:documenting": ["k2p5"],
}

function models(owner: ChainOwner): string[] {
  return owner.chain.map((entry) => entry.model)
}

function metadataWithoutModel(entry: FallbackEntry): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "model"))
}

function ownersContaining(model: string): string[] {
  return owners.filter((owner) => models(owner).includes(model)).map((owner) => owner.key).sort()
}

test("every legacy Opus entry is retained immediately after one metadata-identical Opus 5 entry", () => {
  assert.deepEqual(ownersContaining("claude-opus-4-7"), [...OPUS_OWNERS].sort())
  assert.deepEqual(ownersContaining("claude-opus-5"), [...OPUS_OWNERS].sort())

  for (const owner of owners) {
    const chainModels = models(owner)
    const legacyIndex = chainModels.indexOf("claude-opus-4-7")
    if (legacyIndex === -1) {
      assert.equal(chainModels.includes("claude-opus-5"), false, owner.key)
      continue
    }
    assert.equal(chainModels[legacyIndex - 1], "claude-opus-5", owner.key)
    assert.equal(chainModels.filter((model) => model === "claude-opus-5").length, 1, owner.key)
    assert.deepEqual(
      metadataWithoutModel(owner.chain[legacyIndex - 1]!),
      metadataWithoutModel(owner.chain[legacyIndex]!),
      owner.key,
    )
  }
})

test("every GPT-5.5 entry retains its metadata-identical assigned 5.6 lane immediately before it", () => {
  for (const owner of owners) {
    const chainModels = models(owner)
    const expectedModern = SOL_OWNERS.has(owner.key)
      ? "gpt-5.6-sol"
      : TERRA_OWNERS.has(owner.key)
        ? "gpt-5.6-terra"
        : undefined
    const legacyIndex = chainModels.indexOf("gpt-5.5")
    assert.equal(legacyIndex !== -1, expectedModern !== undefined, owner.key)
    assert.deepEqual(
      chainModels.filter((model) => /^gpt-5\.6-(?:sol|terra)$/.test(model)),
      expectedModern ? [expectedModern] : [],
      owner.key,
    )
    if (!expectedModern) {
      continue
    }
    assert.equal(chainModels[legacyIndex - 1], expectedModern, owner.key)
    assert.equal(chainModels.filter((model) => model === expectedModern).length, 1, owner.key)
    assert.deepEqual(
      metadataWithoutModel(owner.chain[legacyIndex - 1]!),
      metadataWithoutModel(owner.chain[legacyIndex]!),
      owner.key,
    )
  }
})

test("Kimi-bearing chains have one fixed local K3 before the preserved older Kimi sequence", () => {
  for (const owner of owners) {
    const chainModels = models(owner)
    const expectedLegacy = KIMI_LEGACY_BY_OWNER[owner.key] ?? []
    const actualLegacy = chainModels.filter((model) => model === "kimi-k2.6" || model === "k2p5")
    assert.deepEqual(actualLegacy, expectedLegacy, owner.key)
    const k3Indexes = chainModels.flatMap((model, index) => model === "kimi-k3" ? [index] : [])
    assert.equal(k3Indexes.length, expectedLegacy.length > 0 ? 1 : 0, owner.key)
    if (expectedLegacy.length === 0) continue
    const firstLegacyIndex = chainModels.indexOf(expectedLegacy[0]!)
    assert.equal(k3Indexes[0], firstLegacyIndex - 1, owner.key)
    assert.deepEqual(owner.chain[k3Indexes[0]!]!.providers, ["kimi-for-coding", "moonshot"], owner.key)
  }
})

test("Oracle keeps exact cross-generation order and one adjacent Terra entry", () => {
  const oracle = owners.find((owner) => owner.key === "agent:oracle")!
  assert.deepEqual(models(oracle), [
    "claude-opus-5",
    "claude-opus-4-7",
    "gemini-3.1-pro",
    "gpt-5.4",
    "gpt-5.6-terra",
    "gpt-5.5",
    "glm-5.1",
  ])
  assert.equal(models(oracle).filter((model) => model === "gpt-5.6-terra").length, 1)
})
```

In `src/routing/model-upgrades.test.ts`, replace the test at lines 38-59 with:

```ts
test("oracle catalog selection prefers exact cross-generation GPT fallbacks before Terra successors", () => {
  const oracleRequirement = BUILTIN_AGENT_INDEX.get("oracle")!.requirement

  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.4": {}, "gpt-5.6-terra": {} } } } }, "oracle", oracleRequirement),
    "openai/gpt-5.4",
  )
  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.5": {}, "gpt-5.7-terra": {} } } } }, "oracle", oracleRequirement),
    "openai/gpt-5.5",
  )
  assert.equal(
    selectCatalogModel({ provider: { openai: { models: { "gpt-5.7-terra": {} } } } }, "oracle", oracleRequirement),
    "openai/gpt-5.7-terra",
  )
})
```

In `src/routing/resolver.test.ts`, make these exact assertion changes:

```ts
assert.deepEqual(
  gptEntries.map((entry) => `${entry.model}:${entry.variant}`),
  ["gpt-5.4:xhigh", "gpt-5.6-terra:xhigh", "gpt-5.5:xhigh"],
)
assert.equal(chain[0]!.model, "claude-opus-5")
assert.equal(chain[1]!.model, "claude-opus-4-7")
assert.equal(chain[2]!.model, "gemini-3.1-pro")
```

and change the foreign reviewer assertion to:

```ts
assert.equal(r!.entry.model, "gpt-5.6-sol")
```

- [ ] **Step 3: Run the focused tests and capture the expected RED reason**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/data/model-requirements.test.ts src/routing/model-upgrades.test.ts src/routing/resolver.test.ts
```

Expected: non-zero exit. `src/data/model-requirements.test.ts` reports missing `claude-opus-5`, `gpt-5.6-sol`/adjacent Terra, and `kimi-k3`; resolver reports the old first fallback/order. The selector's three exact-priority assertions may already pass because production selection is intentionally unchanged.

- [ ] **Step 4: Insert the exact modern literals into the static chains**

In both data files, insert literals rather than shared constants. Apply these exact rules:

```ts
// Immediately before every existing claude-opus-4-7 entry:
{ providers: ["anthropic"], model: "claude-opus-5", variant: "max" },

// Exactly once, immediately before the first older Kimi entry in each Kimi-bearing chain:
{ providers: ["kimi-for-coding", "moonshot"], model: "kimi-k3" },
```

Insert these GPT literals immediately before each named owner's existing `gpt-5.5` literal, preserving the shown variant:

| Owners | Exact modern literal |
| --- | --- |
| Agents `orchestrator`, `builder`, `clarifier`, `media-reader`; categories `frontend`, `creative`, `research`, `coding` | `{ providers: ["openai", "github-copilot"], model: "gpt-5.6-sol", variant: "high" },` |
| Agents `reviewer`, `oracle-2nd`, `plan-critic`; category `hard-reasoning` | `{ providers: ["openai", "github-copilot"], model: "gpt-5.6-sol", variant: "xhigh" },` |
| Agent `planner`; category `deep` | `{ providers: ["openai", "github-copilot"], model: "gpt-5.6-sol", variant: "max" },` |
| Categories `normal-task`, `complex` | `{ providers: ["openai", "github-copilot"], model: "gpt-5.6-terra", variant: "high" },` |

For `oracle`, do not add another Terra entry. Replace only its `fallbackChain` with this exact sequence:

```ts
fallbackChain: [
  { providers: ["anthropic"], model: "claude-opus-5", variant: "max" },
  { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
  { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "xhigh" },
  { providers: ["openai", "github-copilot"], model: "gpt-5.4", variant: "xhigh" },
  { providers: ["openai", "github-copilot"], model: "gpt-5.6-terra", variant: "xhigh" },
  { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "xhigh" },
  { providers: ["zhipu"], model: "glm-5.1", variant: "xhigh" },
],
```

Kimi insertion points are exactly: agent `orchestrator` before `kimi-k2.6` (leaving `k2p5` after it), agent `media-reader` before `kimi-k2.6`, category `complex` before `k2p5`, category `deep` before `kimi-k2.6`, and category `documenting` before `k2p5`.

- [ ] **Step 5: Run Task 1 GREEN gates and report the boundary**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/data/model-requirements.test.ts src/routing/model-upgrades.test.ts src/routing/resolver.test.ts
if ($LASTEXITCODE -ne 0) { throw "Task 1 focused tests failed" }
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Task 1 typecheck failed" }
```

Expected: all focused tests pass, typecheck exits 0, `src/routing/model-upgrades.ts` remains unmodified. Return touched paths and suggested commit message `feat: refresh built-in model fallback chains`; do not stage or commit.

---

### Task 2: Add the Exact Opus 5 Detector, Prompt Variant, Sources, and Maintenance Records

**Files:**
- Modify: `src/intent/model-family.ts:41-53,107-124`
- Modify: `src/intent/model-family.test.ts:4-15,42-49,75-90`
- Modify: `src/intent/prompt-loader.ts:4-6,17-18,24-40,111-126`
- Modify: `src/intent/prompt-loader.test.ts:7-55,100-113,129-225,353-474`
- Create: `prompts/omo/deepwork/claude-opus-5.md`
- Create: `prompts/v1/deepwork/claude-opus-5.md`
- Create: `prompts/codex/deepwork/claude-opus-5.md`
- Modify: `docs/prompt-sync.md:5-16,29-40,58-73`
- Modify: `docs/v1-maintenance.md:28-40,52-63,88-95,110-124`

**Interfaces:**
- Consumes: `extractModelName(fullId: string): string`, `isPlannerAgent(name: string): boolean`, and Task 1's exact `claude-opus-5` model identity.
- Produces: `isClaudeOpus5Model(modelID: string): boolean`; `DeepworkVariant` support for `"claude-opus-5"`; `pickDeepworkVariantForAgent(...)` returning that variant only for the orchestrator prompt identity; three synchronized prompt sources consumed by Tasks 3-4.

- [ ] **Step 1: Add detector grammar tests first and verify RED**

Add `isClaudeOpus5Model` to the import list in `src/intent/model-family.test.ts`, then add:

```ts
test("isClaudeOpus5Model accepts only exact, provider-prefixed, date, and named snapshots", () => {
  for (const modelID of [
    "claude-opus-5",
    "anthropic/claude-opus-5",
    "providers/anthropic/claude-opus-5",
    "claude-opus-5-20260728",
    "claude-opus-5.20260728",
    "claude-opus-5-20260728-beta.1",
    "claude-opus-5-latest",
    "claude-opus-5.preview",
  ]) {
    assert.equal(isClaudeOpus5Model(modelID), true, modelID)
  }

  for (const modelID of [
    "claude-opus-4-8",
    "claude-opus-5.0",
    "claude-opus-50",
    "claude-sonnet-5",
    "prefix-claude-opus-5",
    "claude-opus-5_20260728",
    "claude-opus-5-19990101",
    "unrelated",
  ]) {
    assert.equal(isClaudeOpus5Model(modelID), false, modelID)
  }
})
```

Add this assertion to the classification test:

```ts
assert.equal(classifyModelFamily({ modelID: "anthropic/claude-opus-5" }), "claude-opus-47-plus")
```

Run:

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/intent/model-family.test.ts
```

Expected: non-zero exit with the missing `isClaudeOpus5Model` export as the concrete RED reason.

- [ ] **Step 2: Implement the exact detector without changing the family enum or translator**

Add immediately before `isClaudeOpus47OrLaterModel`:

```ts
export function isClaudeOpus5Model(modelID: string): boolean {
  const name = extractModelName(modelID)
  return /^claude-opus-5(?:$|[-.](?:20\d{6}(?:[-.][a-z0-9]+)*|[a-z][a-z0-9-]*))$/i.test(name)
}
```

Change only the Opus branch in `classifyModelFamily` to:

```ts
if (isClaudeOpus5Model(name) || isClaudeOpus47OrLaterModel(name)) return "claude-opus-47-plus"
```

Run the detector test again. Expected: PASS; `ModelFamily` remains unchanged and `src/routing/variant-translator.ts` remains untouched.

- [ ] **Step 3: Add loader/source RED contracts before adding the variant or files**

In `src/intent/prompt-loader.test.ts`, add these helpers near `effectiveGpt56Prompt`:

```ts
const DEEPWORK_TEST_VARIANTS = [
  "default", "gpt", "gpt-5.6", "claude-opus-5", "gemini", "glm", "codex", "planner",
] as const
const CLAUDE_OPUS5_MARKER = "# CLAUDE OPUS 5 EXECUTION CALIBRATION"

function effectiveClaudeOpus5Prompt(): string {
  return `${getDeepworkPrompt("default")}\n\n---\n\n${getDeepworkPrompt("claude-opus-5")}`
}
```

Replace each literal deepwork-variant array at the current lines 137, 166, 194, 218, and 420 with `DEEPWORK_TEST_VARIANTS`. For effective-semantics loops, select `effectiveClaudeOpus5Prompt()` when the variant is `"claude-opus-5"`, just as `"gpt-5.6"` selects `effectiveGpt56Prompt("gpt")`.

Add these complete tests after the real-workflow inventory test:

```ts
test("Claude Opus 5 calibrations are compact additive sources synchronized across all workflows", () => {
  const root = join(process.cwd(), "prompts")
  try {
    for (const workflow of GPT56_WORKFLOWS) {
      loadAllPrompts(root, workflow)
      const text = getDeepworkPrompt("claude-opus-5")
      const label = `${workflow}/claude-opus-5`
      const lineCount = text.trim().split(/\r?\n/).length

      assert.ok(lineCount >= 15 && lineCount <= 30, `${label} line count ${lineCount}`)
      assert.equal(countOccurrences(text, CLAUDE_OPUS5_MARKER), 1, label)
      assert.match(text, /requested scope.*neither.*expanding.*nor.*omitting/is, `${label} scope fidelity`)
      assert.match(text, /direct tools.*few calls/is, `${label} direct tools`)
      assert.match(text, /matching specialist domain.*independent, sizeable work track/is, `${label} dispatch threshold`)
      assert.match(text, /Do not dispatch an agent to review the same work.*parent.*completed/is, `${label} duplicate review`)
      assert.match(text, /evidence gate once.*inputs.*unchanged/is, `${label} evidence cadence`)
      assert.match(text, /Preserve every required final review and required evidence/i, `${label} final review`)
      assert.match(text, /Start with one sentence.*quiet between tool calls.*short outcome-first report/is, `${label} narration`)
      assert.match(text, /role prompt.*workflow rules.*authorization.*terminal policies.*authoritative/is, `${label} authority`)
      assert.doesNotMatch(text, /Sisyphus|Prometheus|Hephaestus|Momus|Agent Role:/i, `${label} branding or role replacement`)

      if (workflow === "omo") {
        assert.equal(countOccurrences(text, "<deepwork-mode>"), 0, `${label} wrapper`)
      } else {
        assert.equal(countOccurrences(text, "<deepwork-mode>"), 1, `${label} opening wrapper`)
        assert.equal(countOccurrences(text, "</deepwork-mode>"), 1, `${label} closing wrapper`)
        assert.match(text, /^<deepwork-mode>[\s\S]*<\/deepwork-mode>\s*$/, `${label} single envelope`)
      }
      if (workflow === "codex") {
        assert.match(text, /Apply it only when.*`claude-opus-5`.*every other runtime model.*ignore/is, `${label} guard`)
      }

      const effective = effectiveClaudeOpus5Prompt()
      assert.match(effective, /DEEPWORK MODE ENABLED!/, `${label} default base`)
      assert.equal(countOccurrences(effective, CLAUDE_OPUS5_MARKER), 1, `${label} effective marker`)
    }
  } finally {
    loadAllPrompts(root, "omo")
  }
})

test("pickDeepworkVariantForAgent keeps planner precedence and selects Opus 5 only for orchestrator", () => {
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "planner", preferenceModel: "anthropic/claude-opus-5" }),
    "planner",
  )
  for (const preferenceModel of [
    "claude-opus-5",
    "anthropic/claude-opus-5",
    "anthropic/claude-opus-5-20260728-beta",
  ]) {
    assert.equal(
      pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel }),
      "claude-opus-5",
      preferenceModel,
    )
  }
  for (const agentName of ["builder", "reviewer", "clarifier", "plan-critic"]) {
    assert.equal(
      pickDeepworkVariantForAgent({ agentName, preferenceModel: "anthropic/claude-opus-5" }),
      "default",
      agentName,
    )
  }
  assert.equal(
    pickDeepworkVariantForAgent({ agentName: "orchestrator", preferenceModel: "claude-opus-5.0" }),
    "default",
  )
})
```

Run:

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts
```

Expected: non-zero exit because the loader does not inventory `claude-opus-5`, the source files are absent, and orchestrator selection still returns `default`.

- [ ] **Step 4: Add the loader variant and planner-first, orchestrator-only selection**

In `src/intent/prompt-loader.ts`, update the layout comment and type/array exactly:

```ts
// deepwork/{default,gpt,gpt-5.6,claude-opus-5,gemini,glm,codex,planner}.md
type DeepworkVariant = "default" | "gpt" | "gpt-5.6" | "claude-opus-5" | "gemini" | "glm" | "codex" | "planner"
const DEEPWORK_VARIANTS: DeepworkVariant[] = [
  "default", "gpt", "gpt-5.6", "claude-opus-5", "gemini", "glm", "codex", "planner",
]
```

Import `isClaudeOpus5Model` from `./model-family.ts`. Keep planner precedence first, then add exactly this branch before GPT-5.6 selection:

```ts
if (isPlannerAgent(opts.agentName)) return "planner"
if (opts.agentName === "orchestrator" && isClaudeOpus5Model(opts.preferenceModel)) {
  return "claude-opus-5"
}
if (isGpt56Model(opts.preferenceModel)) return "gpt-5.6"
```

- [ ] **Step 5: Create the three exact short additive prompt sources**

Create `prompts/omo/deepwork/claude-opus-5.md`:

```markdown
# CLAUDE OPUS 5 EXECUTION CALIBRATION

Apply this additive layer only to a Claude Opus 5 orchestrator. The role prompt, workflow rules, explicit authorization, verification requirements, and effective terminal policies remain authoritative.

## Scope fidelity

- Deliver the requested scope exactly, neither silently expanding it nor omitting required parts.
- Prefer a complete bounded result over extra ceremony or adjacent improvements.

## Tool and delegation economy

- Use direct tools when a few calls can complete the work.
- Dispatch only for a matching specialist domain or an independent, sizeable work track.
- Do not dispatch an agent to review the same work the parent just completed.

## Evidence cadence

- Run each evidence gate once while its inputs remain unchanged.
- Preserve every required final review and required evidence; efficiency never removes them.

## Communication

- Start with one sentence stating the intended outcome, stay quiet between tool calls, and finish with a short outcome-first report.
```

Create `prompts/v1/deepwork/claude-opus-5.md`:

```markdown
<deepwork-mode>

# CLAUDE OPUS 5 EXECUTION CALIBRATION

Apply this additive layer only to a Claude Opus 5 orchestrator. The role prompt, workflow rules, explicit authorization, verification requirements, injected skills, and effective terminal policies remain authoritative.

## Scope fidelity

- Deliver the requested scope exactly, neither silently expanding it nor omitting required parts.
- Prefer a complete bounded result over extra ceremony or adjacent improvements.

## Tool and delegation economy

- Use direct tools when a few calls can complete the work.
- Dispatch only for a matching specialist domain or an independent, sizeable work track.
- Do not dispatch an agent to review the same work the parent just completed.

## Evidence cadence

- Run each evidence gate once while its inputs remain unchanged.
- Preserve every required final review and required evidence; efficiency never removes them.

## Communication

- Start with one sentence stating the intended outcome, stay quiet between tool calls, and finish with a short outcome-first report.

</deepwork-mode>
```

Create `prompts/codex/deepwork/claude-opus-5.md`:

```markdown
<deepwork-mode>

# CLAUDE OPUS 5 EXECUTION CALIBRATION

Codex profiles may carry this layer ahead of runtime model selection. Apply it only when the runtime model name matches `claude-opus-5`; every other runtime model must ignore it. The role prompt, workflow rules, explicit authorization, verification requirements, embedded skills, Codex tool-compatibility rules, and effective terminal policies remain authoritative.

## Scope fidelity

- Deliver the requested scope exactly, neither silently expanding it nor omitting required parts.
- Prefer a complete bounded result over extra ceremony or adjacent improvements.

## Tool and delegation economy

- Use direct tools when a few calls can complete the work.
- Dispatch only for a matching specialist domain or an independent, sizeable work track.
- Do not dispatch an agent to review the same work the parent just completed.

## Evidence cadence

- Run each evidence gate once while its inputs remain unchanged.
- Preserve every required final review and required evidence; efficiency never removes them.

## Communication

- Start with one sentence stating the intended outcome, stay quiet between tool calls, and finish with a short outcome-first report.

</deepwork-mode>
```

- [ ] **Step 6: Synchronize both maintenance documents in the same work unit**

In `docs/prompt-sync.md`:

1. Change the deepwork inventory to `deepwork/{default,gpt,gpt-5.6,claude-opus-5,gemini,glm,codex,planner}.md`.
2. Add this Model-Family Prompt Mapping row after `gpt-5.6.md`:

```markdown
| `deepwork/claude-opus-5.md` | `./omo@79a15710a4a637d7958ba8f54d8070cf8e8a883d`, `packages/omo-opencode/src/agents/sisyphus/claude-opus-5.ts` | Partial local adaptation only: compact orchestrator-only additive calibration for exact-scope delivery, direct-tool/specialist delegation economy, unchanged-input one-pass evidence gates, and concise narration. Local sources intentionally omit upstream provider inventory, Sisyphus branding, and the complete upstream role prompt; role/workflow/authorization/terminal contracts remain authoritative. Codex alone carries a guarded ahead-of-runtime copy. |
```

3. Add this dated record after the GPT-5.6 simplification section:

```markdown
## Claude Opus 5 Partial Adaptation (2026-07-28)

- Reviewed ignored upstream checkout `./omo@79a15710a4a637d7958ba8f54d8070cf8e8a883d`, source `packages/omo-opencode/src/agents/sisyphus/claude-opus-5.ts`.
- Adapted only exact-scope fidelity, direct-tool and bounded specialist/independent-track delegation, unchanged-input one-pass evidence, and concise narration.
- Did not copy upstream provider inventory, branding, or the complete role prompt. The layer is additive, orchestrator-only, and subordinate to local role, workflow, authorization, evidence, final-review, and terminal-policy authority.
- The Codex source starts with a runtime applicability guard so only the generated orchestrator may carry it ahead of runtime selection without applying it to another model.
```

In `docs/v1-maintenance.md`:

1. Add this Codex plugin bullet after the GPT-5.6 bullet:

```markdown
- **Claude Opus 5 calibration (2026-07-28):** `prompts/codex/deepwork/claude-opus-5.md` is a compact additive, orchestrator-only layer. Its first paragraph guards ahead-of-runtime carriage so every non-`claude-opus-5` runtime model ignores it. The role prompt, embedded skills, workflow/authorization/evidence rules, final acceptance, Codex compatibility, and terminal contract remain authoritative.
```

2. Add this Prompt Source Mapping row after `deepwork/gpt-5.6.md`:

```markdown
| deepwork/claude-opus-5.md | brainstorming (injected); 5 on-demand | selected scope/delegation/evidence/narration calibration from `./omo@79a15710a4a637d7958ba8f54d8070cf8e8a883d` `packages/omo-opencode/src/agents/sisyphus/claude-opus-5.ts` | upstream provider inventory, branding, and complete role prompt | One `<deepwork-mode>` envelope; exact Opus 5 detector; orchestrator-only additive composition; complete requested scope, direct tools for a few calls, specialist or independent sizeable-track delegation only, unchanged-input one-pass evidence, preserved required final review/evidence, and concise reporting. Codex uses the parallel guarded source for ahead-of-runtime carriage. |
```

3. Extend the shared-envelope inventory sentence to state that the new v1 file also has exactly one `<deepwork-mode>` envelope, and extend the Codex mapping paragraph to state that its applicability guard precedes ahead-of-runtime carriage.

- [ ] **Step 7: Run Task 2 GREEN gates**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/intent/model-family.test.ts src/intent/prompt-loader.test.ts
if ($LASTEXITCODE -ne 0) { throw "Task 2 focused tests failed" }
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Task 2 typecheck failed" }
```

Expected: detector accepted/rejected tables pass; all three source files load; source line/envelope/guard/content tests pass; planner wins over Opus selection; only orchestrator returns `claude-opus-5`. Return touched paths and suggested commit message `feat: add Claude Opus 5 calibration sources`; do not stage or commit.

---

### Task 3: Compose Opus 5 Only for the Effective Orchestrator Identity

**Files:**
- Modify: `src/hooks/config.ts:376-431`
- Modify: `src/hooks/config.test.ts:1-13,940-1152,1778-1806`
- Modify: `src/hooks/config.category.test.ts:105-163`

**Interfaces:**
- Consumes: `pickDeepworkVariantForAgent(...)`, `getDeepworkPrompt("claude-opus-5")`, `agent.promptSource ?? agent.name`, and the three prompt sources from Task 2.
- Produces: OpenCode effective orchestrator prompt `role + workflow wrapper(default + claude-opus-5)` exactly once; Codex orchestrator `gpt + guarded gpt-5.6 + guarded claude-opus-5`; all non-orchestrator identities and categories exclude the Opus layer.

- [ ] **Step 1: Add effective-composition RED tests and update only static-derived expectations**

Add this helper near the other prompt helpers in `src/hooks/config.test.ts`:

```ts
function countText(text: string, needle: string): number {
  return text.split(needle).length - 1
}
```

Add these tests near the GPT-5.6 prompt tests:

```ts
test("omo and v1 compose default plus Opus 5 exactly once for orchestrator only", async () => {
  const promptsRoot = join(process.cwd(), "prompts")
  const marker = "# CLAUDE OPUS 5 EXECUTION CALIBRATION"
  try {
    for (const workflow of ["omo", "v1"] as const) {
      loadAllPrompts(promptsRoot, workflow)
      const configured = {
        ...defaultConfig(),
        workflow,
        agents: {
          orchestrator: { model: "anthropic/claude-opus-5" },
          builder: { model: "anthropic/claude-opus-5" },
          reviewer: { model: "anthropic/claude-opus-5" },
          planner: { model: "anthropic/claude-opus-5" },
        },
      }
      const target: { agent: Record<string, unknown> } = { agent: {} }
      await createConfigHandler({ getConfig: () => configured })(target, undefined)

      const orchestrator = String((target.agent.orchestrator as Record<string, unknown>).prompt)
      assert.match(orchestrator, /Agent Role: orchestrator/, workflow)
      assert.match(orchestrator, /DEEPWORK MODE ENABLED!/, `${workflow} default base`)
      assert.equal(countText(orchestrator, marker), 1, `${workflow} marker`)
      assert.ok(orchestrator.indexOf("Agent Role: orchestrator") < orchestrator.indexOf(marker), workflow)

      for (const name of ["builder", "reviewer", "planner"] as const) {
        const prompt = String((target.agent[name] as Record<string, unknown>).prompt)
        assert.equal(countText(prompt, marker), 0, `${workflow}/${name}`)
      }
      assert.match(String((target.agent.planner as Record<string, unknown>).prompt), /Deepwork Planner Injection/)
    }
  } finally {
    loadAllPrompts(promptsRoot, "omo")
  }
})

test("Codex carries guarded Opus 5 only for the orchestrator prompt identity", async () => {
  const promptsRoot = join(process.cwd(), "prompts")
  const marker = "# CLAUDE OPUS 5 EXECUTION CALIBRATION"
  loadAllPrompts(promptsRoot, "codex")
  try {
    const configured = {
      ...defaultConfig(),
      workflow: "codex" as const,
      agents: {
        orchestrator: { model: "anthropic/claude-opus-5" },
        builder: { model: "anthropic/claude-opus-5" },
        reviewer: { model: "anthropic/claude-opus-5", variants: { high: "max" as const } },
        planner: { model: "anthropic/claude-opus-5", variants: { high: "max" as const } },
      },
    }
    const target: { agent: Record<string, unknown> } = { agent: {} }
    await createConfigHandler({ getConfig: () => configured })(target, undefined)

    for (const [name, raw] of Object.entries(target.agent)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
      const prompt = String((raw as Record<string, unknown>).prompt ?? "")
      if (!prompt) continue
      assert.equal(countText(prompt, marker), name === "orchestrator" ? 1 : 0, name)
    }
    const orchestrator = String((target.agent.orchestrator as Record<string, unknown>).prompt)
    assert.match(orchestrator, /Apply it only when.*`claude-opus-5`.*every other runtime model.*ignore/is)
    assert.equal(countText(orchestrator, "# GPT-5.6 EXECUTION CALIBRATION"), 1)
  } finally {
    loadAllPrompts(promptsRoot, "omo")
  }
})
```

Update only these static-derived assertions elsewhere in `src/hooks/config.test.ts`:

```ts
// "config keeps existing defaults without a matching GPT-5.6 catalog entry"
assert.equal((cfg.agent.orchestrator as Record<string, unknown>).model, "anthropic/claude-opus-5")
assert.equal((cfg.agent.deep as Record<string, unknown>).model, "openai/gpt-5.6-sol")
assert.equal((cfg.agent.complex as Record<string, unknown>).model, "openai/gpt-5.6-terra")

// "config keeps GLM 5.1 baseline without a newer GLM catalog entry"
assert.equal((cfg.agent.orchestrator as Record<string, unknown>).model, "anthropic/claude-opus-5")
assert.equal((cfg.agent.deep as Record<string, unknown>).model, "openai/gpt-5.6-sol")

// Both unresolved-qualified-alias compatibility tests
assert.equal((target.agent.reviewer as Record<string, unknown>).model, "openai/gpt-5.6-sol")
assert.equal((target.agent["hard-reasoning"] as Record<string, unknown>).model, "openai/gpt-5.6-sol")
```

Do not change legacy literals in explicit model/config fixtures.

In `src/hooks/config.category.test.ts`, add:

```ts
test("host-selected Opus 5 never attaches the orchestrator calibration to categories", async () => {
  loadAllPrompts(PROMPTS_ROOT, "omo")
  const target: { agent: Record<string, unknown> } = {
    agent: Object.fromEntries(
      BUILTIN_CATEGORIES.map((category) => [category.name, { model: "anthropic/claude-opus-5" }]),
    ),
  }
  await createConfigHandler({ getConfig: () => defaultConfig() })(target, undefined)

  for (const category of BUILTIN_CATEGORIES) {
    const prompt = String((target.agent[category.name] as Record<string, unknown>).prompt)
    assert.doesNotMatch(prompt, /CLAUDE OPUS 5 EXECUTION CALIBRATION/, category.name)
    assert.ok(prompt.startsWith(getCategoryPrompt(category.name).trim()), category.name)
  }
})
```

In the existing Codex category test, load `const opus5 = getDeepworkPrompt("claude-opus-5").trim()` and add inside its loop:

```ts
assert.ok(!prompt.includes(opus5), `${category.name}: Opus 5 calibration must remain excluded`)
assert.doesNotMatch(prompt, /CLAUDE OPUS 5 EXECUTION CALIBRATION/, category.name)
```

Run RED:

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts
```

Expected: non-zero exit. OpenCode orchestrator lacks the default base when the new specialization is selected, and Codex orchestrator lacks the guarded Opus marker. Non-orchestrator/category exclusions should already remain clean.

- [ ] **Step 2: Implement minimal identity-aware effective composition**

In `src/hooks/config.ts`, replace the body from `const prefModel` through the final return of `deepworkPromptForAgent` with this exact composition logic:

```ts
const prefModel = selectedModel ?? chain[0]?.model ?? ""
const promptName = agent.promptSource ?? agent.name
const gpt56Specialization = isGpt56Model(prefModel) ? getDeepworkPrompt("gpt-5.6") : ""
// Codex profiles are generated ahead of runtime model overrides. Carry the
// separately guarded GPT-5.6 layer in every Codex profile, and carry the
// separately guarded Opus 5 layer only for the orchestrator prompt identity.
if (workflow === "codex") {
  return [
    getDeepworkPrompt("gpt"),
    getDeepworkPrompt("gpt-5.6"),
    promptName === "orchestrator" ? getDeepworkPrompt("claude-opus-5") : "",
  ].filter(Boolean).join("\n\n---\n\n")
}
const variant = pickDeepworkVariantForAgent({
  agentName: promptName,
  preferenceModel: prefModel,
})
if (variant === "gpt-5.6") {
  return `${getDeepworkPrompt("gpt")}\n\n---\n\n${getDeepworkPrompt("gpt-5.6")}`
}
if (variant === "claude-opus-5") {
  return `${getDeepworkPrompt("default")}\n\n---\n\n${getDeepworkPrompt("claude-opus-5")}`
}
const base = getDeepworkPrompt(variant)
return gpt56Specialization ? `${base}\n\n---\n\n${gpt56Specialization}` : base
```

Do not change `promptForBuiltinCategory`: its existing `workflow === "codex" || isGpt56Model(selectedModel)` condition is the intentional category exclusion boundary.

- [ ] **Step 3: Run Task 3 GREEN gates**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts src/intent/prompt-loader.test.ts
if ($LASTEXITCODE -ne 0) { throw "Task 3 focused tests failed" }
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Task 3 typecheck failed" }
```

Expected: OpenCode default + Opus marker exactly once for orchestrator in omo/v1; Codex marker/guard exactly once only for source identity `orchestrator`; planner and configured planning/review variants exclude it; every category excludes it while Codex GPT-5.6 carriage remains. Return touched paths and suggested commit message `feat: scope Opus 5 calibration to orchestrator`; do not stage or commit.

---

### Task 4: Pin Generated Codex Carriage and Regenerate Deterministically

**Files:**
- Modify: `src/codex/plugin-generator.test.ts:61-104,297-383,773-981`
- Generate through command only: `.agents/plugins/marketplace.json`
- Generate through command only: `.codex/agents/`
- Generate through command only: `plugins/deepwork/`
- Do not modify: `src/codex/plugin-generator.ts` unless a new failing unit test proves composition cannot be expressed through Task 3's existing generator path; the expected implementation needs no production generator change.

**Interfaces:**
- Consumes: `buildCodexAgents(...)`, `generateCodexPlugin(...)`, Task 3's Codex effective prompts, and Task 1's static GPT heads.
- Produces: exact in-memory/generated evidence that only `sourceName === "orchestrator"` / `dw-orchestrator.toml` carries one Opus marker/guard; deterministic tracked generator output with exact 22-profile plugin/project inventories.

- [ ] **Step 1: Demonstrate the pre-update generator RED from refreshed static defaults**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
```

Expected: non-zero exit because the existing in-memory assertions still expect orchestrator/builder model `gpt-5.5` while Task 1 now selects `gpt-5.6-sol`. Record that exact mismatch; unrelated generator contracts remain intact.

- [ ] **Step 2: Update static-derived expectations and add all-profile carriage assertions**

Near the existing GPT-5.6 helper constants, add:

```ts
const CLAUDE_OPUS5_MARKER = "# CLAUDE OPUS 5 EXECUTION CALIBRATION"

function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1
}
```

In `"Codex agents are generated from Deepwork prompts and Codex-compatible fallback models"`, change only:

```ts
assert.equal(orchestrator.model, "gpt-5.6-sol")
assert.equal(builder.model, "gpt-5.6-sol")
```

Keep `documenting.model === "gpt-5.5"` because that chain has no GPT baseline and still uses the generator fallback. Add after all agents are available:

```ts
const opusCarriers = agents
  .filter((agent) => countMarker(agent.developerInstructions, CLAUDE_OPUS5_MARKER) > 0)
  .map((agent) => agent.sourceName)
assert.deepEqual(opusCarriers, ["orchestrator"])
assert.equal(countMarker(orchestrator.developerInstructions, CLAUDE_OPUS5_MARKER), 1)
assert.match(
  orchestrator.developerInstructions,
  /Apply it only when.*`claude-opus-5`.*every other runtime model.*ignore/is,
)
```

In `"generateCodexPlugin writes a self-contained bundle"`, after reading generated agent TOMLs, add:

```ts
const generatedAgentFiles = readdirSync(join(result.pluginRoot, "agents"))
  .filter((name) => name.endsWith(".toml"))
  .sort()
const generatedOpusCarriers: string[] = []
for (const filename of generatedAgentFiles) {
  const toml = readFileSync(join(result.pluginRoot, "agents", filename), "utf8")
  const instructions = parseGeneratedDeveloperInstructions(toml, filename)
  const count = countMarker(instructions, CLAUDE_OPUS5_MARKER)
  if (count > 0) generatedOpusCarriers.push(filename)
  assert.equal(count, filename === "dw-orchestrator.toml" ? 1 : 0, filename)
}
assert.deepEqual(generatedOpusCarriers, ["dw-orchestrator.toml"])
assert.match(
  parseGeneratedDeveloperInstructions(orchestrator, "generated orchestrator TOML"),
  /Apply it only when.*`claude-opus-5`.*every other runtime model.*ignore/is,
)
```

Do not weaken or remove any existing GPT-5.6 compactness/guard assertions.

- [ ] **Step 3: Run generator unit GREEN before touching tracked generated roots**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -ne 0) { throw "Codex generator unit tests failed" }
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Task 4 typecheck failed" }
```

Expected: all generator tests pass; temporary bundle evidence identifies only `dw-orchestrator.toml`; GPT-5.6 assertions remain GREEN.

- [ ] **Step 4: Build TypeScript and run the generator twice with a content-hash stability gate**

Run this complete PowerShell block from repository root:

```powershell
function Clear-OcmmProfileEnv {
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  $env:OCMM_FAST = $null
}

function Get-GeneratedTreeHash {
  $files = @(
    Get-Item -LiteralPath ".agents/plugins/marketplace.json"
    Get-ChildItem -LiteralPath ".codex/agents" -File -Recurse
    Get-ChildItem -LiteralPath "plugins/deepwork" -File -Recurse
  ) | Sort-Object FullName
  $records = foreach ($file in $files) {
    $relative = [IO.Path]::GetRelativePath((Get-Location).Path, $file.FullName).Replace("\", "/")
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$relative`t$hash"
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes([string]::Join("`n", $records))
  [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

Clear-OcmmProfileEnv
pnpm run build:ts
if ($LASTEXITCODE -ne 0) { throw "build:ts failed" }
Clear-OcmmProfileEnv
pnpm run gen:codex-plugin
if ($LASTEXITCODE -ne 0) { throw "first generator run failed" }
$firstHash = Get-GeneratedTreeHash
Clear-OcmmProfileEnv
pnpm run gen:codex-plugin
if ($LASTEXITCODE -ne 0) { throw "second generator run failed" }
$secondHash = Get-GeneratedTreeHash
if ($firstHash -ne $secondHash) { throw "Generator instability: $firstHash != $secondHash" }
"generator_stable=$secondHash"
```

Expected: `build:ts` exits 0; both generator runs report their written roots; `generator_stable=<same 64-hex hash>` is printed. Do not hand-edit any generated file before or after this block.

- [ ] **Step 5: Verify exact generated inventories, plugin/project equality, and Opus/GPT guards**

```powershell
$expectedAgents = @(
  "dw-builder.toml", "dw-clarifier.toml", "dw-code-search.toml", "dw-coding.toml",
  "dw-complex.toml", "dw-creative.toml", "dw-deep.toml", "dw-doc-search.toml",
  "dw-documenting.toml", "dw-explore.toml", "dw-frontend.toml", "dw-hard-reasoning.toml",
  "dw-media-reader.toml", "dw-normal-task.toml", "dw-oracle-2nd.toml", "dw-oracle.toml",
  "dw-orchestrator.toml", "dw-plan-critic.toml", "dw-planner.toml", "dw-quick.toml",
  "dw-research.toml", "dw-reviewer.toml"
) | Sort-Object
$pluginAgents = @(Get-ChildItem -LiteralPath "plugins/deepwork/agents" -File -Filter "*.toml").Name | Sort-Object
$projectAgents = @(Get-ChildItem -LiteralPath ".codex/agents" -File -Filter "*.toml").Name | Sort-Object
if (@(Compare-Object $expectedAgents $pluginAgents).Count -ne 0) { throw "Plugin agent inventory drift" }
if (@(Compare-Object $expectedAgents $projectAgents).Count -ne 0) { throw "Project agent inventory drift" }

$opusMarker = "# CLAUDE OPUS 5 EXECUTION CALIBRATION"
$gptMarker = "# GPT-5.6 EXECUTION CALIBRATION"
$carriers = @()
foreach ($name in $expectedAgents) {
  $pluginPath = Join-Path "plugins/deepwork/agents" $name
  $projectPath = Join-Path ".codex/agents" $name
  $pluginHash = (Get-FileHash -LiteralPath $pluginPath -Algorithm SHA256).Hash
  $projectHash = (Get-FileHash -LiteralPath $projectPath -Algorithm SHA256).Hash
  if ($pluginHash -ne $projectHash) { throw "Generated copies differ: $name" }
  $text = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $pluginPath))
  $opusCount = ([regex]::Matches($text, [regex]::Escape($opusMarker))).Count
  if ($opusCount -gt 0) { $carriers += $name }
  $expectedCount = if ($name -eq "dw-orchestrator.toml") { 1 } else { 0 }
  if ($opusCount -ne $expectedCount) { throw "Unexpected Opus marker count $opusCount in $name" }
  if (-not $text.Contains($gptMarker)) { throw "GPT-5.6 guard missing from $name" }
}
if ([string]::Join(",", $carriers) -ne "dw-orchestrator.toml") { throw "Unexpected Opus carriers" }
$orchestratorText = [IO.File]::ReadAllText((Resolve-Path -LiteralPath "plugins/deepwork/agents/dw-orchestrator.toml"))
if ($orchestratorText -notmatch "Apply it only when.*claude-opus-5.*every other runtime model.*ignore") {
  throw "Generated orchestrator Opus guard missing"
}
"generated_inventory=22 opus_carrier=dw-orchestrator.toml copies=identical"
```

Expected: exact 22-file inventories, byte-identical project/plugin TOMLs, one Opus carrier with one guard, and retained GPT-5.6 marker in all generated profiles. Inspect `git status --short` and accept only actual deterministic deltas under the three declared roots; do not require any named file to be dirty.

- [ ] **Step 6: Run Task 4 final focused GREEN and report the generated boundary**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts src/hooks/config.test.ts src/hooks/config.category.test.ts
if ($LASTEXITCODE -ne 0) { throw "Task 4 integration tests failed" }
git diff --check
if ($LASTEXITCODE -ne 0) { throw "Whitespace check failed" }
```

Expected: all tests and `git diff --check` pass. Return hand-edited paths separately from actual generator-owned deltas and suggested commit message `chore: regenerate Codex Opus 5 profiles`; do not stage or commit.

---

### Task 5: Run Isolated Real-Surface QA and Final Repository Acceptance

**Files:**
- Verify only: all paths from Tasks 1-4.
- Temporary only: unique children of `C:\Users\HUGEFI~1\AppData\Local\Temp\opencode`.
- Modify: no repository file.

**Interfaces:**
- Consumes: built `dist/index.js`, generated profile inventory, `opencode debug paths`, `opencode debug agent orchestrator`, `dist/cli/ocmm-lsp.js`, protected receipt `ocmm-model-chain-opus5-protected.json`, and all Task 1-4 tests.
- Produces: isolated real configuration evidence for `anthropic/claude-opus-5` plus exactly one prompt marker; targeted/full/typecheck/build evidence; an explicit root-build PASS or truthful native-lock BLOCKED result with isolated fallback evidence; clean scope/hash/index/secret/whitespace receipts.

- [ ] **Step 1: Run the complete targeted integration set once**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
node --test --experimental-strip-types --test-reporter=spec `
  src/data/model-requirements.test.ts `
  src/routing/model-upgrades.test.ts `
  src/routing/resolver.test.ts `
  src/intent/model-family.test.ts `
  src/intent/prompt-loader.test.ts `
  src/hooks/config.test.ts `
  src/hooks/config.category.test.ts `
  src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -ne 0) { throw "Targeted integration set failed" }
```

Expected: exit 0 with all listed test files passing.

- [ ] **Step 2: Run typecheck and the full TypeScript + Rust test suite**

```powershell
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
pnpm test
if ($LASTEXITCODE -ne 0) { throw "full test suite failed" }
```

Expected: strict TypeScript check exits 0; all Node tests and `cargo test -p ocmm-lsp` pass. The absence of a TypeScript LSP server is not a failure because typecheck is the hard diagnostic gate; do not install one.

- [ ] **Step 3: Run the root full build and classify only the known live-native-lock case**

```powershell
$root = (Get-Location).Path
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) { throw "Approved temp parent missing" }
$buildEvidenceDir = Join-Path $tempParent ("ocmm-opus5-build-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $buildEvidenceDir | Out-Null
$buildLog = Join-Path $buildEvidenceDir "root-build.log"
$env:OCMM_PROFILE = $null
$env:OCMM_NO_PROFILE = $null
$env:OCMM_FAST = $null
pnpm run build *>&1 | Tee-Object -FilePath $buildLog
$rootBuildExit = $LASTEXITCODE
$rootBuildBlockedByNativeLock = $false
if ($rootBuildExit -ne 0) {
  $buildText = [IO.File]::ReadAllText($buildLog)
  $binaryPattern = [regex]::Escape((Join-Path $root "dist\bin\ocmm-lsp")) + ".*\.exe"
  $rootBuildBlockedByNativeLock =
    $buildText -match "(?i)\b(?:EPERM|EBUSY)\b" -and
    $buildText -match "(?i)\b(?:unlink|delete|remove)\b" -and
    $buildText -match $binaryPattern
  $disallowedCause = $buildText -match "(?i)could not compile|error\[E\d+\]|command not found|not recognized|cannot find module|target.*release.*not found"
  if (-not $rootBuildBlockedByNativeLock -or $disallowedCause) {
    throw "Root build failed for a cause other than the allowed live native lock; inspect $buildLog"
  }
  "ROOT_BUILD_BLOCKED_BY_LIVE_NATIVE_LOCK log=$buildLog"
} else {
  "ROOT_BUILD_PASS"
}
$buildStatePath = Join-Path $tempParent "ocmm-model-chain-opus5-build-state.json"
$buildState = [ordered]@{
  evidenceDir = $buildEvidenceDir
  rootBuildBlockedByNativeLock = $rootBuildBlockedByNativeLock
}
[IO.File]::WriteAllText(
  $buildStatePath,
  ($buildState | ConvertTo-Json),
  [Text.UTF8Encoding]::new($false)
)
```

Expected primary path: `ROOT_BUILD_PASS`. Allowed fallback trigger only: `ROOT_BUILD_BLOCKED_BY_LIVE_NATIVE_LOCK` with all three lock predicates true and no compiler/tool/module/target cause. Never call process-list/termination commands. Keep `$buildEvidenceDir` and `$rootBuildBlockedByNativeLock` for the next step.

- [ ] **Step 4: Smoke-test the LSP wrapper from the successful root build or an isolated direct build**

Use this assertion helper in the same PowerShell session:

```powershell
$root = (Get-Location).Path
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
$buildStatePath = Join-Path $tempParent "ocmm-model-chain-opus5-build-state.json"
if (-not (Test-Path -LiteralPath $buildStatePath -PathType Leaf)) { throw "Build state missing" }
$buildState = [IO.File]::ReadAllText($buildStatePath) | ConvertFrom-Json
$buildEvidenceDir = [string]$buildState.evidenceDir
$rootBuildBlockedByNativeLock = [bool]$buildState.rootBuildBlockedByNativeLock

function Assert-LspToolsList([string]$wrapperPath) {
  $request = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  $responseText = ($request | node $wrapperPath mcp | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "LSP wrapper failed: $wrapperPath" }
  $response = $responseText | ConvertFrom-Json
  $actual = @($response.result.tools | ForEach-Object { $_.name }) | Sort-Object
  $expected = @(
    "diagnostics", "find_references", "find_symbol_related", "goto_definition",
    "prepare_rename", "rename", "status", "symbols"
  ) | Sort-Object
  if (@(Compare-Object $expected $actual).Count -ne 0) { throw "Unexpected LSP tools list" }
  "lsp_tools=8 wrapper=$wrapperPath"
}
```

If the root build passed:

```powershell
Assert-LspToolsList (Join-Path $root "dist\cli\ocmm-lsp.js")
```

If and only if `$rootBuildBlockedByNativeLock` is true, run the isolated fallback:

```powershell
$isolatedRoot = Join-Path $tempParent ("ocmm-opus5-isolated-build-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $isolatedRoot | Out-Null
try {
  robocopy.exe $root $isolatedRoot /E /XD .git node_modules dist target omo | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "robocopy failed with $LASTEXITCODE" }
  New-Item -ItemType Junction -Path (Join-Path $isolatedRoot "node_modules") -Target (Join-Path $root "node_modules") | Out-Null

  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  $env:OCMM_FAST = $null
  node (Join-Path $isolatedRoot "node_modules\typescript\bin\tsc") -p (Join-Path $isolatedRoot "tsconfig.json")
  if ($LASTEXITCODE -ne 0) { throw "isolated TypeScript build failed" }
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  $env:OCMM_FAST = $null
  node --experimental-strip-types (Join-Path $isolatedRoot "scripts\build-ocmm-lsp.ts")
  if ($LASTEXITCODE -ne 0) { throw "isolated native build failed" }
  Assert-LspToolsList (Join-Path $isolatedRoot "dist\cli\ocmm-lsp.js")
  "ISOLATED_BUILD_PASS root_build_status=BLOCKED"
} finally {
  $junction = Join-Path $isolatedRoot "node_modules"
  if (Test-Path -LiteralPath $junction) { Remove-Item -LiteralPath $junction -Force }
  if (Test-Path -LiteralPath $isolatedRoot) { Remove-Item -LiteralPath $isolatedRoot -Recurse -Force }
}
```

Expected: exactly eight primary MCP tools. If fallback was necessary, report root build as `BLOCKED`, never as passed, and separately report `ISOLATED_BUILD_PASS`. The junction is removed before recursive cleanup so root `node_modules` cannot be deleted.

- [ ] **Step 5: Run a credential-free, isolated OpenCode configuration surface check without dumping the full output**

Run this complete block; it restores every environment variable and deletes raw temporary logs in `finally`:

```powershell
$root = (Get-Location).Path
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
$liveRoot = Join-Path $tempParent ("ocmm-opus5-live-" + [guid]::NewGuid().ToString("N"))
$xdgNames = @("XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME")
$controlledNames = @($xdgNames + @(
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_CONTENT",
  "OPENCODE_CONFIG_DIR",
  "OPENCODE_DISABLE_AUTOUPDATE",
  "OCMM_DEBUG"
))
$savedEnv = @{}
foreach ($name in $controlledNames) {
  $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

try {
  foreach ($path in @(
    $liveRoot,
    (Join-Path $liveRoot ".opencode"),
    (Join-Path $liveRoot "xdg-config"),
    (Join-Path $liveRoot "xdg-data"),
    (Join-Path $liveRoot "xdg-state"),
    (Join-Path $liveRoot "xdg-cache"),
    (Join-Path $liveRoot "evidence")
  )) { New-Item -ItemType Directory -Path $path -Force | Out-Null }

  $pluginPath = (Join-Path $root "dist\index.js").Replace("\", "\\")
  $opencodeJson = @"
{
  "`$schema": "https://opencode.ai/config.json",
  "autoupdate": false,
  "share": "disabled",
  "plugin": ["$pluginPath"],
  "disabled_providers": ["opencode", "openrouter", "github-copilot", "openai", "google"],
  "provider": {
    "anthropic": {
      "npm": "@ai-sdk/anthropic",
      "models": {
        "claude-opus-5": {
          "name": "Claude Opus 5 QA",
          "limit": { "context": 200000, "output": 8192 }
        }
      }
    }
  }
}
"@
  $ocmmJson = @"
{
  "workflow": "omo",
  "debug": true,
  "agents": {
    "orchestrator": { "model": "anthropic/claude-opus-5", "variant": "max" }
  }
}
"@
  [IO.File]::WriteAllText((Join-Path $liveRoot "opencode.json"), $opencodeJson, [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $liveRoot ".opencode\ocmm.jsonc"), $ocmmJson, [Text.UTF8Encoding]::new($false))

  $env:XDG_CONFIG_HOME = Join-Path $liveRoot "xdg-config"
  $env:XDG_DATA_HOME = Join-Path $liveRoot "xdg-data"
  $env:XDG_STATE_HOME = Join-Path $liveRoot "xdg-state"
  $env:XDG_CACHE_HOME = Join-Path $liveRoot "xdg-cache"
  $env:OPENCODE_CONFIG = $null
  $env:OPENCODE_CONFIG_CONTENT = $null
  $env:OPENCODE_CONFIG_DIR = $null
  $env:OPENCODE_DISABLE_AUTOUPDATE = "1"
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  $env:OCMM_FAST = $null
  $env:OCMM_DEBUG = "1"

  Push-Location $liveRoot
  try {
    $pathsOutput = (& opencode debug paths 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "opencode debug paths failed" }
    [IO.File]::WriteAllText((Join-Path $liveRoot "evidence\opencode-debug-paths.txt"), $pathsOutput, [Text.UTF8Encoding]::new($false))
    foreach ($dir in @($env:XDG_CONFIG_HOME, $env:XDG_DATA_HOME, $env:XDG_STATE_HOME, $env:XDG_CACHE_HOME)) {
      $resolvedDir = (Resolve-Path -LiteralPath $dir).Path
      if (-not $pathsOutput.Contains($dir) -and -not $pathsOutput.Contains($resolvedDir)) {
        throw "Isolation path missing from debug paths: $dir"
      }
    }

    $agentOutput = (& opencode debug agent orchestrator --print-logs --log-level DEBUG 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "opencode debug agent orchestrator failed" }
    [IO.File]::WriteAllText((Join-Path $liveRoot "evidence\orchestrator.txt"), $agentOutput, [Text.UTF8Encoding]::new($false))
    if ($agentOutput -notmatch '"providerID"\s*:\s*"anthropic"') { throw "anthropic provider selection missing" }
    if ($agentOutput -notmatch '"modelID"\s*:\s*"claude-opus-5"') { throw "Opus 5 model selection missing" }
    $markerCount = ([regex]::Matches($agentOutput, [regex]::Escape("# CLAUDE OPUS 5 EXECUTION CALIBRATION"))).Count
    if ($markerCount -ne 1) { throw "Expected one Opus marker, got $markerCount" }
    "live_surface=PASS provider=anthropic model=claude-opus-5 marker_count=1 isolated_paths=PASS"
  } finally {
    Pop-Location
  }
} finally {
  foreach ($name in $controlledNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], "Process")
  }
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  $env:OCMM_FAST = $null
  if (Test-Path -LiteralPath $liveRoot) { Remove-Item -LiteralPath $liveRoot -Recurse -Force }
}
```

Expected: one concise `live_surface=PASS ...` line. No model request is sent, no credential is present, and full debug config/prompt content stays in the temporary evidence directory until cleanup rather than being printed in the implementation report.

- [ ] **Step 6: Verify protected hashes, exact scope, empty index, secret hygiene, and whitespace**

Run from repository root:

```powershell
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
$receiptPath = Join-Path $tempParent "ocmm-model-chain-opus5-protected.json"
if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) { throw "Protected receipt missing" }
$receipt = [IO.File]::ReadAllText($receiptPath) | ConvertFrom-Json
if ($receipt.head -ne (git rev-parse HEAD).Trim()) { throw "HEAD changed during implementation" }
foreach ($property in $receipt.paths.PSObject.Properties) {
  $actualHash = (Get-FileHash -LiteralPath $property.Name -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne [string]$property.Value) { throw "Protected path changed: $($property.Name)" }
}

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw "Git index is not empty" }

$allowedExact = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
@(
  "src/config/load.test.ts",
  "src/config/merge.ts",
  "src/runtime-fallback/event-handler-idle-continuation.test.ts",
  "src/runtime-fallback/event-handler-idle-continuation.ts",
  "src/runtime-fallback/event-handler.ts",
  "src/runtime-fallback/idle-state.test.ts",
  "src/runtime-fallback/idle-state.ts",
  "docs/superpowers/plans/2026-07-28-config-merge-prototype-hardening.md",
  "docs/superpowers/plans/2026-07-28-idle-continuation-fencing.md",
  "docs/superpowers/specs/2026-07-28-config-merge-prototype-hardening-design.md",
  "docs/superpowers/specs/2026-07-28-idle-continuation-fencing-design.md",
  "docs/superpowers/specs/2026-07-28-model-chain-opus5-calibration-design.md",
  "docs/superpowers/plans/2026-07-28-model-chain-opus5-calibration.md",
  "src/data/agents.ts",
  "src/data/categories.ts",
  "src/data/model-requirements.test.ts",
  "src/routing/model-upgrades.test.ts",
  "src/routing/resolver.test.ts",
  "src/intent/model-family.ts",
  "src/intent/model-family.test.ts",
  "src/intent/prompt-loader.ts",
  "src/intent/prompt-loader.test.ts",
  "prompts/omo/deepwork/claude-opus-5.md",
  "prompts/v1/deepwork/claude-opus-5.md",
  "prompts/codex/deepwork/claude-opus-5.md",
  "docs/prompt-sync.md",
  "docs/v1-maintenance.md",
  "src/hooks/config.ts",
  "src/hooks/config.test.ts",
  "src/hooks/config.category.test.ts",
  "src/codex/plugin-generator.test.ts"
) | ForEach-Object { [void]$allowedExact.Add($_) }

$dirtyLines = @(git status --porcelain=v1 --untracked-files=all)
$dirtyPaths = foreach ($line in $dirtyLines) {
  if ($line.Length -lt 4) { throw "Malformed status line: $line" }
  $line.Substring(3).Replace("\", "/")
}
foreach ($path in $dirtyPaths) {
  $generated =
    $path -eq ".agents/plugins/marketplace.json" -or
    $path.StartsWith(".codex/agents/", [StringComparison]::Ordinal) -or
    $path.StartsWith("plugins/deepwork/", [StringComparison]::Ordinal)
  if (-not $allowedExact.Contains($path) -and -not $generated) { throw "Out-of-scope dirty path: $path" }
}

$forbidden = @(
  "schema.json", "package.json", "pnpm-lock.yaml", "src/config/schema.ts",
  "src/routing/model-upgrades.ts", "src/routing/resolver.ts"
)
foreach ($path in $forbidden) {
  if ($dirtyPaths -contains $path) { throw "Forbidden production/scope path changed: $path" }
}

$addedDiff = (git diff --no-ext-diff --unified=0 | Out-String)
$secretPattern = '(?im)^\+(?!\+\+\+).*(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["''][A-Za-z0-9_\-]{16,})'
if ($addedDiff -match $secretPattern) { throw "Potential secret in added tracked lines" }
$newFiles = @(
  "src/data/model-requirements.test.ts",
  "prompts/omo/deepwork/claude-opus-5.md",
  "prompts/v1/deepwork/claude-opus-5.md",
  "prompts/codex/deepwork/claude-opus-5.md",
  "docs/superpowers/plans/2026-07-28-model-chain-opus5-calibration.md"
)
foreach ($path in $newFiles) {
  $text = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $path))
  if ($text -match '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-[A-Za-z0-9]{20,}') {
    throw "Potential secret in new file: $path"
  }
}

git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check failed" }
"scope=PASS protected=12 index=empty secrets=clean diff_check=clean dirty_count=$($dirtyPaths.Count)"
```

Expected: protected count 12 unchanged; HEAD unchanged; empty index; no out-of-scope path; no schema, production upgrade/resolver, package, or lockfile changes; secret scan clean; `git diff --check` exits 0. Generated dirty paths are accepted only under the three declared generator roots.

- [ ] **Step 7: Clean temporary receipts and return the final implementation evidence**

```powershell
$tempParent = "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode"
$receiptPath = Join-Path $tempParent "ocmm-model-chain-opus5-protected.json"
$buildStatePath = Join-Path $tempParent "ocmm-model-chain-opus5-build-state.json"
$buildEvidenceDir = $null
if (Test-Path -LiteralPath $buildStatePath -PathType Leaf) {
  $buildState = [IO.File]::ReadAllText($buildStatePath) | ConvertFrom-Json
  $buildEvidenceDir = [string]$buildState.evidenceDir
}
if (Test-Path -LiteralPath $receiptPath) { Remove-Item -LiteralPath $receiptPath -Force }
if ($buildEvidenceDir -and (Test-Path -LiteralPath $buildEvidenceDir)) { Remove-Item -LiteralPath $buildEvidenceDir -Recurse -Force }
if (Test-Path -LiteralPath $buildStatePath) { Remove-Item -LiteralPath $buildStatePath -Force }
if (Test-Path -LiteralPath $receiptPath) { throw "Protected receipt cleanup failed" }
if ($buildEvidenceDir -and (Test-Path -LiteralPath $buildEvidenceDir)) { throw "Build evidence cleanup failed" }
if (Test-Path -LiteralPath $buildStatePath) { throw "Build state cleanup failed" }
"temporary_cleanup=PASS"
```

Expected: all task-created temporary artifacts are absent. Return: targeted/typecheck/full-test results; root build `PASS` or truthful `BLOCKED` plus isolated build `PASS`; LSP 8-tool receipt; live-surface receipt; deterministic generator hash; exact hand-edited and generated dirty paths; protected/scope/index/secret/diff receipts. Suggested aggregate commit message: `feat: calibrate Opus 5 and refresh model chains`; do not stage or commit. The parent orchestrator may now dispatch the configured Oracle + Reviewer once for final implementation acceptance over the complete working-tree diff.

---

## Requirements-to-Task Traceability

| Authoritative requirement | Implemented/proved by |
| --- | --- |
| Exact Opus/GPT counterpart metadata, Kimi local aliases/order, legacy retention, lane ownership | Task 1 focused data contract and exact insertions |
| Oracle Terra adjacency plus exact 5.4/5.5 catalog priority | Task 1 Oracle order and real `selectCatalogModel` test |
| Exact detector grammar and unchanged broad family | Task 2 detector RED/GREEN |
| Eight-source inventory, planner precedence, orchestrator-only selector | Task 2 loader/source tests |
| Short additive prompts, no branding/role replacement, final-review preservation, Codex guard | Task 2 source text and quality contracts |
| Omo/v1 default + Opus once; Codex guarded orchestrator carriage; agent/category exclusions | Task 3 effective config tests |
| Prompt maintenance records with upstream SHA/path and partial adaptation | Task 2 synchronized docs |
| In-memory/generated identity, exact inventory, GPT guard retention, deterministic generator | Task 4 tests and two-pass generation |
| Targeted/typecheck/full tests/build/LSP surface | Task 5 Steps 1-4 |
| Credential-free isolated real config surface | Task 5 Step 5 |
| Concurrent work preservation, no stage/Git writes, generated-only roots, secret and whitespace checks | Task 1 receipt and Task 5 Steps 6-7 |

## Final Handoff Boundary

This plan contains five serial coding tasks. Coding subagents stop after their task's GREEN evidence and suggested commit message; they never stage, commit, dispatch plan review, or dispatch implementation acceptance reviewers. After Task 5, the orchestrator owns one complex cross-module final acceptance pass using the configured Oracle + Reviewer over the complete working-tree diff.
