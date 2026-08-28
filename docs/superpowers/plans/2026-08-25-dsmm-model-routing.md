# DSMM v0.6 Model Routing Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement DSMM v0.6 so scoped requests on the exact `deepseek-official/deepseek-v4-pro` route receive adapter-advertised reasoning effort according to the approved `off`/`auto`/`strict` policy, without changing provider, model, or unrelated request state.

**Architecture:** Add three focused modules: a pure provider-aware model-family classifier, one shared session-preset resolver, and a model-routing policy/registration module. The request listener runs as a child of the DSH `llm` service, awaits the `agent/request` waterfall first, applies policy only to active deepwork or DSMM-preset scope and the exact official route, negotiates an advertised effort through `ctx.llm.resolveModelInfo()`, and otherwise fails open to the unchanged downstream config. Prompt, settings, package, documentation, and pinned DSH runtime-smoke surfaces consume the same helpers; working-tree `dsmm/lib/**` is generated only in the final integration task and once for each source revision that reaches review.

**Tech Stack:** TypeScript 6 ESM/NodeNext, Node.js 22 `node:test`, Schemastery, Cordis `^4.0.1`, DeepSeek Harness `0.1.1-rc.2`, pnpm workspace, npm pack dry-run, Docker packaged-runtime smoke.

**Spec:** `docs/superpowers/specs/2026-08-25-dsmm-model-routing-design.md`

**Global Constraints:**
- Treat the approved spec as authoritative; do not redesign the settings or routing policy during implementation.
- Keep the flat compatibility key `deepseekV4ProCalibration` and add only `deepseekV4ProDefaultReasoningEffort` and `deepseekV4ProMaxReasoningPresets` beside it.
- Do not switch provider or model.
- Do not infer task class from prompt or request text.
- Do not alter provider message encoding or reasoning-content/tool-call continuity.
- Do not add fallback routing, retry behavior, or runtime recovery.
- Never apply the overlay or request policy to a non-exact route, even when `classifyModelFamily()` returns `deepseek`.
- Preserve every downstream request field other than the selected `reasoningEffort`; never mutate the downstream object in place.
- Select only adapter-advertised effort IDs; never choose an arbitrary first effort or emit an unadvertised effort.
- Let downstream `next()` errors propagate; fail open only for capability resolution or unsupported policy representation, with one sanitized warning per affected request.
- Settings remain restart-scoped.
- DSH runtime evidence must use exact `@deepseek-ai/dsh@0.1.1-rc.2` public `agent/request` and `ctx.llm.resolveModelInfo(provider, model, signal)` contracts and must make no paid provider call.
- Preserve tracked HEAD `cedd30b1abd03cf00b9ce330fa3b1805d76cb401` and the existing untracked approved spec; do not stage, commit, stash, reset, checkout, rebase, clean, push, or tag.
- Do not install host dependencies or change provider/model configuration. The existing pinned Docker smoke may install its declared DSH package only inside its disposable image/profile.
- Do not run a working-tree DSMM build before Task 8. Targeted RED/GREEN checks build only an OS-temporary mirror.
- Generate working-tree `dsmm/lib/**` only in Task 8 and exactly once per source revision, after all source integration for that revision is complete. Any later source correction invalidates Task 8 and requires restarting it from generation.
- Run the root `pnpm test` gate once per source revision that reaches Task 8 review, with no retry on an unchanged revision. If the known unrelated Windows Job parallel flake occurs, preserve and report the exact failing test/error as a separate blocker; do not hide it with retries, serialization, threshold changes, or test edits.
- Final acceptance requires one current working-tree identity shared by an approved Oracle receipt and an approved Reviewer receipt.
- No Git commit is authorized by design/plan delegation; implementation ends in the unstaged working tree unless the user separately authorizes a Git write.

---

## Requirement and evidence map

| Approved requirement | Implementation task | Primary evidence |
|---|---|---|
| Reusable provider-aware classifier | Task 1 | `dsmm/test/model-family.test.ts` |
| One preset precedence rule for prompt, guards, and routing | Task 2 | `dsmm/test/session-scope.test.ts`, consumer regressions |
| Flat settings, defaults, schema, canonical preset normalization | Task 3 | `dsmm/test/settings.test.ts` |
| Exact route and capability fallback policy | Task 4 | pure table tests in `dsmm/test/model-routing.test.ts` |
| `agent/request` post-waterfall semantics, fail-open warning, root registration, lifecycle | Task 5 | listener and child-replacement tests in `dsmm/test/model-routing.test.ts` |
| Exact prompt overlay, effective policy text, docs, package exports | Task 6 | prompt/mode/package tests and `dsmm/docs/model-routing.md` |
| Real DSH rc.2 waterfall with fake resolver and no provider stream | Task 7 | `MODEL_ROUTING_WATERFALL_OK` from Docker smoke |
| One-time generated lib, pack inventory, DSMM/root gates, identity-bound reviews | Task 8 | exact commands, pack inventory, two current-identity receipts |

## File map

### New focused modules and tests

- Create `dsmm/src/model-family.ts` — pure provider-aware family classification; no DSH dependency and no mutation authority.
- Create `dsmm/test/model-family.test.ts` — family/alias/provider/unknown matrix.
- Create `dsmm/src/session-scope.ts` — newest-valid-event then header preset resolution.
- Create `dsmm/test/session-scope.test.ts` — canonical precedence and malformed-event matrix.
- Create `dsmm/src/model-routing.ts` — exact-route match, desired effort, capability selection, and `agent/request` registration.
- Create `dsmm/test/model-routing.test.ts` — pure policy, request waterfall, preservation, warning, and lifecycle tests.
- Create `dsmm/docs/model-routing.md` — public v0.6 runtime/settings contract.

### Existing source and tests

- Modify `dsmm/src/dsh-types.ts` — minimal structural rc.2 LLM config/model-info/runtime/frame/event contracts with index signatures where downstream fields must survive.
- Modify `dsmm/src/settings.ts` and `dsmm/test/settings.test.ts` — approved fields, defaults, Schemastery schemas, canonical normalization, and restart-scoped base/effective settings.
- Modify `dsmm/src/mode.ts`, `dsmm/src/guards.ts`, `dsmm/test/mode.test.ts`, and `dsmm/test/guards.test.ts` — consume `resolveSelectedAgentPreset()`.
- Modify `dsmm/src/prompts.ts`, `dsmm/prompts/deepseek-v4-pro.md`, and `dsmm/test/prompts.test.ts` — exact-route overlay and rendered effective policy.
- Modify `dsmm/src/index.ts` and `dsmm/test/package.test.ts` — root registration and public exports.
- Modify `dsmm/scripts/docker-smoke.mjs` and `dsmm/test/docker-smoke-assets.test.ts` — pinned real waterfall/fake-adapter proof.
- Modify `dsmm/package.json`, `dsmm/README.md`, and `dsmm/docs/roadmap.md` — ship/link docs and mark v0.6 implemented only after Task 7 runtime/package evidence passes.

### Generated output

- Regenerate once in Task 8: `dsmm/lib/**` — add `model-family.*`, `session-scope.*`, and `model-routing.*`; update declarations/source maps for changed source while preserving all v0.5 LSP and safety/preset outputs.

## Dependency order and review boundaries

1. Tasks 1 and 2 have disjoint new modules, but execute them serially because Task 2 also edits shared prompt/guard consumers.
2. Task 3 defines the settings types consumed by routing.
3. Task 4 defines pure routing contracts; Task 5 adds the listener and root lifecycle over those contracts.
4. Task 6 consumes Tasks 3-5 for prompt text and package exports.
5. Task 7 is the first real pinned DSH/package runtime gate and must pass before roadmap status changes.
6. Task 8 is the only working-tree generation point and the final integration/review boundary. A post-review source correction returns to its owning task and then restarts Task 8; source never changes after the generation used by an accepted receipt.
7. Every task ends with a read-only diff/status check. There are no per-task commits because no Git write is authorized.

## Targeted TDD without working-tree `dsmm/lib/**` generation

Define this PowerShell helper once in the implementation session and run it from the repository root. It copies current DSMM source/tests/assets into one exact OS-temporary mirror, junctions the already-present `dsmm/node_modules`, generates only the mirror's `lib`, runs named tests, and removes only the verified mirror. It never installs dependencies and never writes working-tree `dsmm/lib/**`.

```powershell
function Invoke-DsmmModelRoutingMirrorTests {
  param([Parameter(Mandatory = $true)][string[]]$Tests)

  $workspaceRoot = (Resolve-Path -LiteralPath ".").Path
  $dsmmRoot = Join-Path $workspaceRoot "dsmm"
  $tempParent = [IO.Path]::GetTempPath().TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) { throw "OS temp parent is unavailable: $tempParent" }
  $mirror = Join-Path $tempParent ("dsmm-model-routing-test-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $mirror | Out-Null

  try {
    foreach ($directory in @("src", "test", "skills", "prompts", "agent-presets", "docs", "patches", "scripts", "docker")) {
      $sourceDirectory = Join-Path $dsmmRoot $directory
      if (Test-Path -LiteralPath $sourceDirectory) {
        Copy-Item -LiteralPath $sourceDirectory -Destination (Join-Path $mirror $directory) -Recurse
      }
    }
    foreach ($file in @("package.json", "tsconfig.json", "tsconfig.test.json", "cordis.patch.yml", "README.md")) {
      Copy-Item -LiteralPath (Join-Path $dsmmRoot $file) -Destination (Join-Path $mirror $file)
    }

    $existingModules = Join-Path $dsmmRoot "node_modules"
    if (-not (Test-Path -LiteralPath $existingModules -PathType Container)) {
      throw "dsmm/node_modules must already exist; do not install from this helper"
    }
    New-Item -ItemType Junction -Path (Join-Path $mirror "node_modules") -Target $existingModules | Out-Null

    pnpm --dir $dsmmRoot exec tsc -p (Join-Path $mirror "tsconfig.json")
    if ($LASTEXITCODE -ne 0) { throw "temporary DSMM source build failed" }
    $resolvedTests = @($Tests | ForEach-Object { Join-Path $mirror $_ })
    node --test --experimental-strip-types $resolvedTests
    if ($LASTEXITCODE -ne 0) { throw "temporary DSMM targeted test failed" }
  } finally {
    $resolvedMirror = [IO.Path]::GetFullPath($mirror)
    $expectedPrefix = [IO.Path]::GetFullPath($tempParent + [IO.Path]::DirectorySeparatorChar)
    if (-not $resolvedMirror.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -or $resolvedMirror -eq $expectedPrefix.TrimEnd([IO.Path]::DirectorySeparatorChar)) {
      throw "refusing to remove unexpected mirror path: $resolvedMirror"
    }
    Remove-Item -LiteralPath $resolvedMirror -Recurse -Force
  }
}
```

For each RED step, require the named missing symbol/assertion and reject unrelated compiler/environment failures. For each GREEN step, require exit `0`. After Tasks 1-7, `git diff --name-only -- dsmm/lib` must remain empty.

---

### Task 1: Pure model-family classifier

**Files:**
- Create: `dsmm/src/model-family.ts`
- Create: `dsmm/test/model-family.test.ts`

**Interfaces:**
- Consumes: model/provider strings only; no DSH, settings, session, or request objects.
- Produces:
  - `export type DsmmModelFamily = "gpt" | "codex" | "claude" | "gemini" | "glm" | "kimi" | "deepseek" | "unknown"`
  - `export function classifyModelFamily(input: { providerID?: string; modelID?: string }): DsmmModelFamily`

- [ ] **Step 1: Write the failing family matrix**

Create `dsmm/test/model-family.test.ts` with `node:test`/`node:assert/strict` and this exact table:

```ts
const cases = [
  [{ providerID: "openai", modelID: "gpt-5.6" }, "gpt"],
  [{ providerID: "openai-codex", modelID: "gpt-5.6-codex" }, "codex"],
  [{ providerID: "anthropic", modelID: "claude-opus-5" }, "claude"],
  [{ providerID: "google-vertex", modelID: "gemini-3-pro" }, "gemini"],
  [{ providerID: "github-copilot", modelID: "google.gemini-2.5-pro" }, "gemini"],
  [{ providerID: "zhipu", modelID: "glm-5" }, "glm"],
  [{ providerID: "moonshot", modelID: "kimi-k2.5" }, "kimi"],
  [{ providerID: "gateway", modelID: "k2-p7" }, "kimi"],
  [{ providerID: "deepseek", modelID: "deepseek-chat" }, "deepseek"],
  [{ providerID: "openrouter", modelID: "deepseek/deepseek-v4-pro" }, "deepseek"],
  [{ providerID: "custom", modelID: "custom-model" }, "unknown"],
  [{}, "unknown"]
] as const;

for (const [input, expected] of cases) {
  assert.equal(classifyModelFamily(input), expected, JSON.stringify(input));
}
assert.equal(classifyModelFamily({ providerID: "codex", modelID: "gpt-5.6" }), "codex", "codex has priority over gpt");
```

- [ ] **Step 2: Run RED**

Run:

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/model-family.test.ts")
```

Expected: FAIL because `lib/model-family.js` and `classifyModelFamily` do not exist. No working-tree `dsmm/lib/**` path changes.

- [ ] **Step 3: Implement the classifier**

Implement a pure normalization pipeline in `model-family.ts`: lowercase trimmed provider/model values; strip the final `/` namespace and recognized dotted vendor/region prefixes adapted from `src/intent/model-family.ts`; then classify in this priority order: codex, gpt, claude, gemini, glm, kimi, deepseek, unknown. Provider hints may classify a family, but this module must not import or call model-routing code.

```ts
export type DsmmModelFamily = "gpt" | "codex" | "claude" | "gemini" | "glm" | "kimi" | "deepseek" | "unknown";

export function classifyModelFamily(input: { providerID?: string; modelID?: string }): DsmmModelFamily {
  const provider = input.providerID?.trim().toLowerCase() ?? "";
  const fullModel = input.modelID?.trim().toLowerCase() ?? "";
  const model = extractModelName(fullModel);
  if (provider.includes("codex") || model.includes("codex")) return "codex";
  if (model.includes("gpt")) return "gpt";
  if (provider.includes("anthropic") || model.includes("claude")) return "claude";
  if (provider === "google" || provider === "google-vertex" || model.startsWith("gemini-")) return "gemini";
  if (provider.includes("zhipu") || model.includes("glm")) return "glm";
  if (provider.includes("moonshot") || provider.includes("kimi") || model.includes("kimi") || /k2[-.]?p[567]/u.test(model)) return "kimi";
  if (provider.includes("deepseek") || model.includes("deepseek")) return "deepseek";
  return "unknown";
}
```

Keep `extractModelName()` private unless a test proves another module needs it; routing authorization must not depend on this classifier.

- [ ] **Step 4: Run GREEN and inspect scope**

Run:

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/model-family.test.ts")
git diff --check -- dsmm/src/model-family.ts dsmm/test/model-family.test.ts
git diff --name-only -- dsmm/lib
```

Expected: family tests PASS, diff check PASS, and the final command prints nothing.

---

### Task 2: Shared selected-preset scope

**Files:**
- Create: `dsmm/src/session-scope.ts`
- Create: `dsmm/test/session-scope.test.ts`
- Modify: `dsmm/src/mode.ts`
- Modify: `dsmm/src/guards.ts`
- Modify: `dsmm/test/mode.test.ts`
- Modify: `dsmm/test/guards.test.ts`

**Interfaces:**
- Consumes: `DshSession.events`, `DshSession.header?.agentPreset`, `isDsmmRoleId()`, and existing controller active-state checks.
- Produces:
  - `export function resolveSelectedAgentPreset(session: DshSession | undefined): string | undefined`
  - `mode.ts`, `guards.ts`, and later `model-routing.ts` use this one precedence implementation.

- [ ] **Step 1: Write the failing precedence table and consumer regressions**

Create `session-scope.test.ts` with these cases:

```ts
const cases = [
  [undefined, undefined],
  [{ events: [], header: { agentPreset: "dsmm-reviewer" }, append() {} }, "dsmm-reviewer"],
  [{ events: [{ type: "agent-preset/selected", data: { agentPreset: "dsmm-reviewer" } }], header: { agentPreset: "standard" }, append() {} }, "dsmm-reviewer"],
  [{ events: [{ type: "agent-preset/selected", data: { agentPreset: "dsmm-reviewer" } }, { type: "agent-preset/selected", data: { agentPreset: "standard" } }], header: { agentPreset: "dsmm-plan-critic" }, append() {} }, "standard"],
  [{ events: [{ type: "agent-preset/selected", data: { agentPreset: "dsmm-reviewer" } }, { type: "agent-preset/selected", data: { agentPreset: 3 } }], header: { agentPreset: "standard" }, append() {} }, "dsmm-reviewer"],
  [{ events: [{ type: "agent-preset/selected", data: null }, { type: "agent-preset/selected", data: { agentPreset: 3 } }], header: { agentPreset: "dsmm-plan-critic" }, append() {} }, "dsmm-plan-critic"]
] as const;
```

Assert exact equality for each result. Retain the mode test proving the newest valid DSMM preset suppresses duplicate skill bodies and the guards table proving event selection overrides/falls back to the header.

- [ ] **Step 2: Run RED**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/session-scope.test.ts", "test/mode.test.ts", "test/guards.test.ts")
```

Expected: FAIL because `resolveSelectedAgentPreset` is missing; consumer tests expose the duplicated local implementations.

- [ ] **Step 3: Implement one resolver and migrate both consumers**

Create `session-scope.ts`:

```ts
import type { DshSession } from "./dsh-types.js";

export function resolveSelectedAgentPreset(session: DshSession | undefined): string | undefined {
  const events = session?.events ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "agent-preset/selected") continue;
    const data = event.data;
    if (typeof data === "object" && data !== null && "agentPreset" in data && typeof data.agentPreset === "string") {
      return data.agentPreset;
    }
  }
  return typeof session?.header?.agentPreset === "string" ? session.header.agentPreset : undefined;
}
```

Delete the private `selectedAgentPreset()` functions from `mode.ts` and `guards.ts`. Import `resolveSelectedAgentPreset()` and preserve all existing prompt, skill-body, and guard behavior.

- [ ] **Step 4: Run GREEN and prove no duplicate resolver remains**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/session-scope.test.ts", "test/mode.test.ts", "test/guards.test.ts")
rg "function selectedAgentPreset|function resolveSelectedAgentPreset" dsmm/src
git diff --name-only -- dsmm/lib
```

Expected: tests PASS; search returns only the exported function in `session-scope.ts`; no generated working-tree file changes.

---

### Task 3: Approved settings and canonical max-preset normalization

**Files:**
- Modify: `dsmm/src/settings.ts`
- Modify: `dsmm/test/settings.test.ts`

**Interfaces:**
- Consumes: canonical `DSMM_ROLE_IDS`, `isDsmmRoleId()`, existing Schemastery configuration, and restart-scoped `registerSettings()`.
- Produces:
  - `export type DeepseekCalibration = "off" | "auto" | "strict"` (unchanged)
  - `export type DeepseekDefaultReasoningEffort = "off" | "low" | "high"`
  - `DsmmPluginConfig.deepseekV4ProDefaultReasoningEffort?: DeepseekDefaultReasoningEffort`
  - `DsmmPluginConfig.deepseekV4ProMaxReasoningPresets?: DsmmRoleId[]`
  - `DsmmSettings.deepseekV4ProDefaultReasoningEffort: DeepseekDefaultReasoningEffort`
  - `DsmmSettings.deepseekV4ProMaxReasoningPresets: DsmmRoleId[]`
  - defaults `"high"` and `["dsmm-plan-critic", "dsmm-reviewer"]`

- [ ] **Step 1: Add failing default/schema/normalization tests**

Extend every exact `DEFAULT_DSMM_SETTINGS` and `resolveConfig()` expectation with:

```ts
deepseekV4ProDefaultReasoningEffort: "high",
deepseekV4ProMaxReasoningPresets: ["dsmm-plan-critic", "dsmm-reviewer"]
```

Add assertions for all allowed default efforts and this canonicalization case:

```ts
const normalized = resolveConfig({
  deepseekV4ProDefaultReasoningEffort: "low",
  deepseekV4ProMaxReasoningPresets: [
    "dsmm-reviewer",
    "invalid-role",
    "dsmm-plan-critic",
    "dsmm-reviewer"
  ]
} as unknown as DsmmPluginConfig);

assert.equal(normalized.deepseekV4ProDefaultReasoningEffort, "low");
assert.deepEqual(normalized.deepseekV4ProMaxReasoningPresets, ["dsmm-plan-critic", "dsmm-reviewer"]);
assert.deepEqual(resolveConfig({ deepseekV4ProMaxReasoningPresets: [] }).deepseekV4ProMaxReasoningPresets, []);
```

Assert the settings registry still receives `{ applies: "restart" }`. Add an attached-scope case whose runtime value contains duplicated/out-of-order preset IDs plus `"invalid-role"`; the getter and `install()` callback must both observe only `["dsmm-plan-critic", "dsmm-reviewer"]` in canonical order.

- [ ] **Step 2: Run RED**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/settings.test.ts")
```

Expected: FAIL because defaults, schema, and resolved settings do not contain the two approved fields.

- [ ] **Step 3: Implement types, defaults, Schemastery fields, and normalization**

Add exact flat config/settings properties. Define a union schema for `off|low|high`. Define the preset schema as `Schema.array(String)` with the canonical default so persisted/runtime input can be cleaned instead of rejected before normalization; cast only the schema's static TypeScript surface to `DsmmRoleId[]`. Add both fields to `DSMM_CONFIG_SCHEMA` and `DSMM_SETTINGS_SCHEMA`.

Normalize presets with canonical role order rather than input order:

```ts
function resolveMaxReasoningPresets(input: readonly unknown[] | undefined): DsmmRoleId[] {
  const requested = new Set(input ?? DEFAULT_DSMM_SETTINGS.deepseekV4ProMaxReasoningPresets);
  return DSMM_ROLE_IDS.filter((id) => requested.has(id));
}
```

In `resolveConfig()`, copy the default/normalized arrays so callers cannot mutate `DEFAULT_DSMM_SETTINGS`. In `registerSettings()`, change the attached getter to normalize each restart-scoped value through `resolveConfig(scope.get() as DsmmPluginConfig)` before `onChange`, `install`, or request-time reads; this ensures persisted invalid/duplicate IDs cannot bypass normalization. Preserve the existing rollback and same-registry lifecycle behavior. Do not add nested calibration settings or accept `max` as a default effort.

- [ ] **Step 4: Run GREEN and verify the public shape**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/settings.test.ts")
rg "deepseekV4Pro(DefaultReasoningEffort|MaxReasoningPresets)" dsmm/src/settings.ts dsmm/test/settings.test.ts
git diff --name-only -- dsmm/lib
```

Expected: settings tests PASS; both names appear in config, settings, defaults, schemas, resolver, and tests; no working-tree generation.

---

### Task 4: DSH structural contracts and pure routing policy

**Files:**
- Modify: `dsmm/src/dsh-types.ts`
- Create: `dsmm/src/model-routing.ts`
- Create: `dsmm/test/model-routing.test.ts`

**Interfaces:**
- Consumes: Task 3 `DsmmSettings`, `DeepseekDefaultReasoningEffort`, and max preset list.
- Produces in `dsh-types.ts`:
  - `DshLlmCallConfig` with required `provider`, `model`; optional `reasoningEffort`, `temperature`, `maxTokens`, `stop`; and `[key: string]: unknown`
  - `DshReasoningEffortInfo { id: string; name: string; [key: string]: unknown }`
  - `DshModelReasoningInfo { efforts: readonly DshReasoningEffortInfo[]; defaultEffort?: string; [key: string]: unknown }`
  - `DshResolvedModelInfo { provider: string; id: string; name: string; reasoning?: DshModelReasoningInfo; [key: string]: unknown }`
- Produces in `model-routing.ts`:
  - `export type DeepseekReasoningEffort = DeepseekDefaultReasoningEffort | "max"`
  - `export function isDeepseekV4ProRoute(config: Pick<DshLlmCallConfig, "provider" | "model">): boolean`
  - `export function desiredDeepseekEffort(settings: DsmmSettings, preset?: string): DeepseekReasoningEffort`
  - `export function selectAdvertisedEffort(desired: DeepseekReasoningEffort, reasoning: DshModelReasoningInfo | undefined): string | undefined`

- [ ] **Step 1: Write failing exact-route/desired/capability tables**

In `model-routing.test.ts`, assert exact-route behavior:

```ts
const exactRoutes = [
  [{ provider: "deepseek-official", model: "deepseek-v4-pro" }, true],
  [{ provider: "DEEPSEEK-OFFICIAL", model: "DEEPSEEK-V4-PRO" }, true],
  [{ provider: "deepseek", model: "deepseek-v4-pro" }, false],
  [{ provider: "openrouter", model: "deepseek-v4-pro" }, false],
  [{ provider: "deepseek-official", model: "deepseek-v4" }, false],
  [{ provider: "deepseek-official", model: "deepseek-v4-pro-preview" }, false],
  [{ provider: "deepseek-official-lookalike", model: "deepseek-v4-pro" }, false]
] as const;
```

Assert ordinary/no-preset desired effort equals the configured default; configured `dsmm-reviewer` and `dsmm-plan-critic` equal `max`; a DSMM preset removed from `deepseekV4ProMaxReasoningPresets` uses the default; arbitrary preset names use the default.

Use this capability matrix:

```ts
const reasoning = (ids: string[], defaultEffort?: string) => ({
  efforts: ids.map((id) => ({ id, name: id })),
  ...(defaultEffort === undefined ? {} : { defaultEffort })
});

assert.equal(selectAdvertisedEffort("max", reasoning(["off", "high", "max"], "off")), "max");
assert.equal(selectAdvertisedEffort("max", reasoning(["off", "high"], "off")), "high");
assert.equal(selectAdvertisedEffort("max", reasoning(["off"], "off")), "off");
assert.equal(selectAdvertisedEffort("max", reasoning(["off"], "high")), undefined);
assert.equal(selectAdvertisedEffort("high", reasoning(["off", "high"], "off")), "high");
assert.equal(selectAdvertisedEffort("high", reasoning(["off"], "off")), "off");
assert.equal(selectAdvertisedEffort("low", reasoning(["high"], "low")), undefined);
assert.equal(selectAdvertisedEffort("off", reasoning(["off", "high"], "high")), "off");
assert.equal(selectAdvertisedEffort("high", undefined), undefined);
```

- [ ] **Step 2: Run RED**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/model-routing.test.ts")
```

Expected: FAIL because the DSH LLM structural types and routing module are absent.

- [ ] **Step 3: Implement exact matching and deterministic fallback**

Implement case normalization only; do not trim/alias/remap the final route beyond lowercase equality. Implement capability selection as:

```ts
export function selectAdvertisedEffort(
  desired: DeepseekReasoningEffort,
  reasoning: DshModelReasoningInfo | undefined
): string | undefined {
  if (reasoning === undefined) return undefined;
  const advertised = new Set(reasoning.efforts.map((effort) => effort.id));
  const fallback = reasoning.defaultEffort !== undefined && advertised.has(reasoning.defaultEffort)
    ? reasoning.defaultEffort
    : undefined;
  if (desired === "max") {
    if (advertised.has("max")) return "max";
    if (advertised.has("high")) return "high";
    return fallback;
  }
  return advertised.has(desired) ? desired : fallback;
}
```

The function must never select `reasoning.efforts[0]` merely because it exists.

- [ ] **Step 4: Run GREEN and cross-check classifier isolation**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/model-routing.test.ts", "test/model-family.test.ts")
rg "classifyModelFamily" dsmm/src/model-routing.ts
git diff --name-only -- dsmm/lib
```

Expected: tests PASS; the search finds no match in `model-routing.ts`; no generated working-tree files change.

---

### Task 5: Post-waterfall request listener, root registration, and lifecycle

**Files:**
- Modify: `dsmm/src/dsh-types.ts`
- Modify: `dsmm/src/model-routing.ts`
- Modify: `dsmm/src/index.ts`
- Modify: `dsmm/test/model-routing.test.ts`
- Modify: `dsmm/test/settings.test.ts`
- Modify: `dsmm/test/package.test.ts`

**Interfaces:**
- Consumes: Tasks 2-4 helpers; `DeepworkModeController.active()`; current settings getter.
- Produces in `dsh-types.ts`:
  - `DshLlmRuntime.resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<DshResolvedModelInfo>`
  - `AgentRequestFrame { agent: DshAgent; turn: number; step: number; signal: AbortSignal }`
  - `DshInjectedServices.llm?: DshLlmRuntime`
  - `DshContext.llm?: DshLlmRuntime`
  - typed `on?(event: "agent/request", listener: (frame: AgentRequestFrame, next: () => Promise<DshLlmCallConfig>) => Promise<DshLlmCallConfig>, options?: boolean | { prepend?: boolean; global?: boolean }): unknown`
- Produces in `model-routing.ts`:
  - `export function registerModelRouting(ctx: DshContext, controller: DeepworkModeController, getSettings: () => DsmmSettings): void`
- Produces from package root:
  - classifier, shared preset resolver, pure routing helpers, registration helper, approved setting types, and structural routing types.

- [ ] **Step 1: Add failing listener behavior and preservation tests**

Build a context double that captures `ctx.inject(["llm"], installer)`, invokes the installer with a child containing `llm.resolveModelInfo`, captures the child `agent/request` listener, and calls it directly. Cover all of these exact cases:

1. `next()` is awaited before any policy check; a rejected sentinel error is returned unchanged and resolver calls remain zero.
2. `off` returns the exact downstream object reference.
3. `auto` with omitted effort on active exact route selects advertised `high` and returns a new object.
4. `auto` preserves explicit `low`, `off`, and `max` exactly and never calls the resolver for those requests.
5. `strict` replaces explicit `off` with advertised policy `high`.
6. Configured reviewer/plan-critic preset requests select `max`; without advertised `max`, select advertised `high`.
7. Off-only metadata uses `off` only when it is the desired effort or a valid advertised `defaultEffort`; otherwise no effort is emitted.
8. GPT, Claude, other DeepSeek providers/models, route lookalikes, and inactive exact-route sessions return the exact downstream object and do not resolve metadata.
9. A mutated request preserves provider/model values and preserves identity/value for `messages`, `tools`, `signalMetadata`, `stop`, and an unknown nested option while changing only `reasoningEffort`.
10. Resolver throw, absent reasoning metadata, empty efforts, and invalid/unadvertised default each log exactly one warning and return the exact downstream object.
11. Warning text contains `deepseek-official/deepseek-v4-pro` and the desired effort, and does not contain prompts, messages, credentials, or the thrown error text.
12. Simulated child disposal removes the old listener; installing a replacement child yields exactly one resolver call for one request, not duplicate old/new listener calls.

Use a downstream preservation object with explicit unknown fields:

```ts
const messages = [{ role: "user", content: "secret request text must not be logged" }];
const tools = [{ name: "read" }];
const signalMetadata = { aborted: false };
const unknownOption = { nested: true };
const downstream = {
  provider: "deepseek-official",
  model: "deepseek-v4-pro",
  temperature: 0.2,
  maxTokens: 321,
  stop: ["<END>"],
  messages,
  tools,
  signalMetadata,
  unknownOption
};
```

- [ ] **Step 2: Run RED**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/model-routing.test.ts", "test/settings.test.ts", "test/package.test.ts")
```

Expected: FAIL because `AgentRequestFrame`, `DshLlmRuntime`, `registerModelRouting`, root registration, and exports are absent.

- [ ] **Step 3: Implement the exact rc.2 post-waterfall flow**

The listener body must follow this order:

```ts
const downstream = await next();
const settings = getSettings();
if (settings.deepseekV4ProCalibration === "off") return downstream;
const preset = resolveSelectedAgentPreset(frame.agent?.session);
const inScope = controller.active(frame.agent, settings.defaultActive) || isDsmmRoleId(preset);
if (!inScope || !isDeepseekV4ProRoute(downstream)) return downstream;
if (settings.deepseekV4ProCalibration === "auto" && downstream.reasoningEffort !== undefined) return downstream;

const desired = desiredDeepseekEffort(settings, preset);
let selected: string | undefined;
try {
  const info = await readyCtx.llm?.resolveModelInfo(downstream.provider, downstream.model, frame.signal);
  selected = selectAdvertisedEffort(desired, info?.reasoning);
} catch {
  readyCtx.logger?.warn(`dsmm model routing could not resolve deepseek-official/deepseek-v4-pro capability for desired effort ${desired}; preserving downstream request`);
  return downstream;
}
if (selected === undefined) {
  readyCtx.logger?.warn(`dsmm model routing found no advertised deepseek-official/deepseek-v4-pro effort for desired effort ${desired}; preserving downstream request`);
  return downstream;
}
return { ...downstream, reasoningEffort: selected };
```

`registerModelRouting()` must call `ctx.inject(["llm"], installer)` when available; the installer registers exactly one child-owned listener with `{ prepend: true }`. If injection is unavailable, install directly only when the root has both `llm` and `on`. Do not cache settings, capabilities, sessions, or resolver failures.

In `index.apply()`, call `registerModelRouting(ctx, controller, getSettings)` exactly once at root after obtaining the live settings getter. Do not add `llm` to top-level `inject`; the child injection owns readiness/replacement/disposal.

- [ ] **Step 4: Export the approved surface and test root registration**

Add these root exports:

```ts
export { classifyModelFamily } from "./model-family.js";
export type { DsmmModelFamily } from "./model-family.js";
export { desiredDeepseekEffort, isDeepseekV4ProRoute, registerModelRouting, selectAdvertisedEffort } from "./model-routing.js";
export type { DeepseekReasoningEffort } from "./model-routing.js";
export { resolveSelectedAgentPreset } from "./session-scope.js";
export type { AgentRequestFrame, DshLlmCallConfig, DshModelReasoningInfo, DshReasoningEffortInfo, DshResolvedModelInfo } from "./dsh-types.js";
```

Extend the existing settings type export list with `DeepseekCalibration` and `DeepseekDefaultReasoningEffort`. In package tests, dynamically import `../lib/index.js` and assert every helper is a function. In the `apply()` integration test, capture injection dependency arrays and assert one `['settings', 'systemPrompt']` registration and one `['llm']` registration.

- [ ] **Step 5: Run GREEN and inspect registration count**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/model-routing.test.ts", "test/settings.test.ts", "test/package.test.ts", "test/session-scope.test.ts")
rg "registerModelRouting\(" dsmm/src
git diff --name-only -- dsmm/lib
```

Expected: all tests PASS; search shows one definition and one root call; no working-tree generation.

---

### Task 6: Exact prompt calibration, documentation, and package surface

**Files:**
- Modify: `dsmm/src/prompts.ts`
- Modify: `dsmm/src/mode.ts`
- Modify: `dsmm/prompts/deepseek-v4-pro.md`
- Modify: `dsmm/test/prompts.test.ts`
- Modify: `dsmm/test/mode.test.ts`
- Create: `dsmm/docs/model-routing.md`
- Modify: `dsmm/README.md`
- Modify: `dsmm/package.json`
- Modify: `dsmm/test/package.test.ts`

**Interfaces:**
- Consumes: `isDeepseekV4ProRoute()`, `desiredDeepseekEffort()`, `resolveSelectedAgentPreset()`, and Task 3 settings.
- Produces:
  - `DeepworkPromptOptions { route?: Pick<DshLlmCallConfig, "provider" | "model">; selectedPreset?: string; overrideSection?: string; skillPrompt?: string }`
  - `buildDeepworkPrompt(settings: DsmmSettings, options?: DeepworkPromptOptions): string`
  - shipped `docs/model-routing.md` and README link.

- [ ] **Step 1: Replace broad-model tests with failing exact-route/policy tests**

Remove tests for the broad `isDeepseekV4ProModel()` regex and add assertions that overlay text appears only for both exact provider and exact model, case-insensitively. Explicitly assert no overlay for:

```ts
[
  { provider: "deepseek", model: "deepseek-v4-pro" },
  { provider: "openrouter", model: "deepseek-v4-pro" },
  { provider: "deepseek-official", model: "deepseek-v4" },
  { provider: "deepseek-official", model: "deepseek-v4-pro-preview" },
  { provider: "openai", model: "gpt-5.6-deepseek-v4-pro" }
]
```

For exact route, assert `off` omits the overlay; `auto` and `strict` include it. Add a preset-only inactive-mode case: a selected `dsmm-reviewer` session receives the exact-route base prompt, overlay, and policy even when `controller.active(...)` is false, while an inactive non-DSMM preset remains empty. Assert the base prompt's opt-in boundary says DSMM applies while the configured mode is active **or** a DSMM-managed preset is selected, rather than claiming mode activation is the only scope. Assert the rendered policy includes:

```text
calibrationMode: auto
defaultReasoningEffort: high
maxReasoningPresets: dsmm-plan-critic, dsmm-reviewer
effectiveDesiredReasoningEffort: max
```

when selected preset is `dsmm-reviewer`, and `effectiveDesiredReasoningEffort: high` for ordinary active deepwork. Update mode tests so missing provider no longer activates the overlay, exact `{ provider: "deepseek-official", model: "deepseek-v4-pro" }` does, preset-only inactive DSMM scope emits the prompt, and inactive non-DSMM scope does not.

- [ ] **Step 2: Add failing documentation/package assertions**

In `package.test.ts`, add `docs/model-routing.md` to the exact shipped docs and README local-link list. Assert docs contain exact route, all three mode names, all three setting keys, preset-derived max, `max -> high -> valid defaultEffort -> unchanged`, fail-open warning behavior, and a statement that DSMM does not own provider reasoning-content/tool-call serialization.

- [ ] **Step 3: Run RED**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/prompts.test.ts", "test/mode.test.ts", "test/package.test.ts")
```

Expected: FAIL because prompt matching is broad, effective policy text/docs are absent, and package files omit `docs/model-routing.md`.

- [ ] **Step 4: Implement exact prompt composition**

Replace the broad regex helper with `isDeepseekV4ProRoute()`. Change `buildDeepworkPrompt()` to the options object interface above and update all call sites/tests. Update `BASE_DEEPWORK_PROMPT` and its asset copy so the opening scope text names both valid opt-in paths: active configured mode or selected DSMM-managed preset; outside both scopes, DSMM policy does not apply. `mode.ts` must construct a route only when both `agent.options.provider` and `agent.options.model` are strings, resolve the preset once, and register prompt scope when `controller.active(context.agent, settings.defaultActive) || isDsmmRoleId(preset)`. Pass the same resolved preset and route into prompt composition.

Append a dynamic block only with the exact-route overlay:

```text
<dsmm-deepseek-v4-pro-policy>
calibrationMode: auto
defaultReasoningEffort: high
maxReasoningPresets: dsmm-plan-critic, dsmm-reviewer
effectiveDesiredReasoningEffort: high
</dsmm-deepseek-v4-pro-policy>
```

Update `DEEPSEEK_V4_PRO_OVERLAY` and `prompts/deepseek-v4-pro.md` to state that runtime effort is enforced by `agent/request`, `auto` preserves explicit upstream effort, `strict` overrides it, only adapter-advertised efforts are emitted, and max comes only from configured presets. Do not mention prompt/request-text task classification as a trigger.

- [ ] **Step 5: Write and ship the public documentation**

Create `dsmm/docs/model-routing.md` with these sections and exact contracts:

1. **Scope** — active deepwork or selected DSMM preset plus exact case-normalized `deepseek-official/deepseek-v4-pro`.
2. **Settings** — all three flat keys and exact defaults.
3. **Modes** — off no-op; auto fill omitted/preserve explicit; strict override with computed policy.
4. **Preset max** — newest valid event then header; configured presets only; ordinary work uses default.
5. **Capabilities** — max waterfall and non-max exact/default waterfall; no arbitrary/unadvertised effort.
6. **Failure behavior** — one sanitized warning and unchanged downstream config.
7. **Boundaries** — no provider/model switching, text heuristics, retry/recovery, or provider serialization ownership.

Add `docs/model-routing.md` explicitly to `dsmm/package.json.files`. Add a README v0.6 section/link and configuration sketch containing the exact defaults, but do not mark roadmap v0.6 implemented in this task.

- [ ] **Step 6: Run GREEN and ensure no request-text heuristic**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/prompts.test.ts", "test/mode.test.ts", "test/package.test.ts", "test/model-routing.test.ts")
rg -i "prompt text|request text|keyword|heuristic" dsmm/src/model-routing.ts dsmm/docs/model-routing.md
git diff --name-only -- dsmm/lib
```

Expected: tests PASS; search may find documentation denying text heuristics but finds no implementation condition; no generated working-tree files change.

---

### Task 7: Pinned DSH rc.2 real waterfall with deterministic fake resolver

**Files:**
- Modify: `dsmm/scripts/docker-smoke.mjs`
- Modify: `dsmm/test/docker-smoke-assets.test.ts`

**Interfaces:**
- Consumes: packed DSMM root export; pinned `@deepseek-ai/dsh-agent.agentEvents`; pinned `@deepseek-ai/dsh-llm` default plugin, `LlmAdapter`, and `ReasoningEffortId`; existing `mountCoreServices()`.
- Produces: one real Cordis/DSH `agent/request` waterfall proof marker, `MODEL_ROUTING_WATERFALL_OK`, without entering adapter `stream()`.

- [ ] **Step 1: Add failing smoke-asset contract assertions**

Extend `docker-smoke-assets.test.ts` to require:

- imports of `@deepseek-ai/dsh-agent` and `@deepseek-ai/dsh-llm` through `importDshPackage()`;
- exported runtime symbols `agentEvents`, `LlmAdapter`, and `ReasoningEffortId`;
- `ctx.llm.registerAdapter(["deepseek-official"], fake)`;
- an `agentEvents(ctx, agent).waterfall("agent/request", ...)` call;
- resolver provider/model/signal identity assertions;
- downstream provider/model/temperature/maxTokens/stop preservation assertions;
- `streamCalls === 0`;
- child active, `restart()`, and terminal `dispose()` lifecycle assertions;
- exactly one `console.log("MODEL_ROUTING_WATERFALL_OK")` and inclusion of that marker in the final marker table.

- [ ] **Step 2: Run RED**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/docker-smoke-assets.test.ts")
```

Expected: FAIL because the runtime smoke lacks the model-routing proof.

- [ ] **Step 3: Extend runtime package loading with exact rc.2 exports**

In `loadRuntimePackages()`, obtain and validate:

```js
const agentEvents = requireFunction(agent.agentEvents, "@deepseek-ai/dsh-agent agentEvents export");
const LlmAdapter = requireFunction(llm.LlmAdapter, "@deepseek-ai/dsh-llm LlmAdapter export");
const ReasoningEffortId = requireFunction(llm.ReasoningEffortId, "@deepseek-ai/dsh-llm ReasoningEffortId export");
```

Return all three in the runtime object. Keep the existing exact global package version check for `0.1.1-rc.2`.

- [ ] **Step 4: Implement the fake-adapter waterfall smoke**

Add `smokeModelRouting(runtime, dsmm, installedPackageRoot)` and call it from `runInnerSmoke()` after `loadRuntimePackages()`. The function must:

1. Create `class FakeAdapter extends runtime.LlmAdapter`.
2. Record `resolveModel(provider, model, signal)` calls and return model metadata advertising branded `off`, `high`, and `max`, defaulting to `high`.
3. Make `stream()` increment `streamCalls` then throw, so any provider I/O attempt fails the smoke.
4. Mount core services with auto/high settings.
5. Register the fake only for `deepseek-official`.
6. Create an agent with `agentOptions: { provider: "deepseek-official", model: "deepseek-v4-pro" }`, activate `/deepwork`, and call:

```js
const dispatch = runtime.agentEvents(ctx, agent);
const signal = new AbortController().signal;
const downstream = {
  provider: "deepseek-official",
  model: "deepseek-v4-pro",
  temperature: 0.2,
  maxTokens: 321,
  stop: ["<END>"]
};
const result = await dispatch.waterfall(
  "agent/request",
  { turn: 1, step: 1, signal },
  async () => downstream
);
```

`agentEvents()` injects `agent` into the listener frame; the external payload is exactly `{ turn, step, signal }`. Assert `reasoningEffort === "high"`, every downstream field remains equal, resolver receives the exact route/signal once, and `streamCalls === 0`.

For real Cordis lifecycle evidence, create one `ctx.inject(["llm"], ...)` child with a counting `agent/request` pass-through listener. Assert one hit while active, call `child.restart()` while the child is still active and assert the next dispatch adds exactly one hit rather than duplicate old/new hits, then call terminal `child.dispose()` and assert a later dispatch adds no hit. Never call `restart()` after disposal. Across the DSMM policy dispatches, assert the fake resolver count increases by exactly one per eligible omitted-effort request, proving no duplicate DSMM listener. Dispose agent handle, adapter registration, any still-active child, and `ctx.fiber` in `finally`.

- [ ] **Step 5: Run static GREEN, then the real pinned runtime/package gate**

```powershell
Invoke-DsmmModelRoutingMirrorTests @("test/docker-smoke-assets.test.ts")
git diff --name-only -- dsmm/lib
pnpm --filter dsmm smoke:docker
```

Expected: static test PASS; no local generated files change; Docker output contains exactly one `MODEL_ROUTING_WATERFALL_OK` followed by `DSMM_PACKAGED_RUNTIME_SMOKE_OK`; no paid provider stream executes. This successful packaged runtime is the prerequisite for Task 8's roadmap status update.

---

### Task 8: Roadmap status, one-time generated lib, final gates, and identity-bound review

**Files:**
- Modify after Task 7 passes: `dsmm/docs/roadmap.md`
- Regenerate once: `dsmm/lib/**`
- Verify only: all Task 1-7 source/tests/docs/package/runtime files

**Interfaces:**
- Consumes: completed Tasks 1-7 and successful `MODEL_ROUTING_WATERFALL_OK`/`DSMM_PACKAGED_RUNTIME_SMOKE_OK` evidence.
- Produces: implemented v0.6 roadmap status, synchronized generated package output, exact pack inventory, DSMM/root verification evidence, and two approved receipts bound to one current working-tree identity.

- [ ] **Step 1: Mark v0.6 implemented only after runtime/package evidence exists**

Confirm the immediately preceding Task 7 smoke succeeded. Then add this status sentence under `## v0.6 — Model routing and DeepSeek V4 Pro calibration`:

```md
Status: implemented in v0.6 with provider-aware family classification, exact-route DeepSeek V4 Pro prompt/request calibration, preset-derived max reasoning, adapter capability negotiation, and pinned DSH `agent/request` waterfall coverage.
```

Do not change v0.7+ scope or claim DSMM owns tool-call reasoning serialization.

- [ ] **Step 2: Assert the preserved base and generate working-tree lib once for this source revision**

Run from repository root:

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "unexpected HEAD: $head" }
git status --short
git diff --name-only -- dsmm/lib
pnpm --filter dsmm build
if ($LASTEXITCODE -ne 0) { throw "one-time DSMM build failed" }
```

Before the build, `git diff --name-only -- dsmm/lib` must print nothing for the initial Task 8 revision. Do not run another command that invokes `dsmm/package.json`'s `build` script while source remains unchanged. If a later validated product finding changes source, the current Task 8 evidence and receipts become invalid: return to the owning task, then restart Task 8 from this generation step and generate once for the new source revision.

Inspect generated output:

```powershell
rg "classifyModelFamily|registerModelRouting|resolveSelectedAgentPreset|deepseekV4ProDefaultReasoningEffort" dsmm/lib
git diff --name-only -- dsmm/lib
```

Expected: generated `model-family`, `session-scope`, and `model-routing` JS/declaration/map files exist; changed index/settings/prompt/mode/guard declarations remain; existing `lsp.*`, `preset-skills.*`, safety, and preset outputs remain present.

- [ ] **Step 3: Run DSMM compiled test/type gates without rebuilding lib**

Run exactly:

```powershell
pnpm --dir dsmm exec tsc -p tsconfig.test.json --noEmit
if ($LASTEXITCODE -ne 0) { throw "DSMM test typecheck failed" }
pnpm --dir dsmm exec node --test --experimental-strip-types "test/*.test.ts"
if ($LASTEXITCODE -ne 0) { throw "DSMM tests failed" }
```

Expected: test typecheck exits `0`; every DSMM test passes. These are the underlying post-build checks from `typecheck:test` and `test` without triggering a second working-tree build.

- [ ] **Step 4: Verify exact npm pack dry-run inventory**

Run:

```powershell
$packJson = @(npm pack .\dsmm --dry-run --json)
if ($LASTEXITCODE -ne 0) { throw "DSMM npm pack dry-run failed" }
$pack = ($packJson -join "`n") | ConvertFrom-Json
$paths = @($pack[0].files | ForEach-Object { $_.path })
$required = @(
  "lib/index.js", "lib/index.d.ts",
  "lib/model-family.js", "lib/model-family.d.ts",
  "lib/session-scope.js", "lib/session-scope.d.ts",
  "lib/model-routing.js", "lib/model-routing.d.ts",
  "docs/model-routing.md", "README.md", "package.json"
)
foreach ($path in $required) {
  if ($paths -notcontains $path) { throw "packed dsmm artifact missing $path" }
}
```

Expected: exit `0`; every required path is present; dry-run creates no tarball.

- [ ] **Step 5: Run real surface and root gates once on the final files**

Run:

```powershell
pnpm --filter dsmm smoke:docker
if ($LASTEXITCODE -ne 0) { throw "DSMM pinned Docker runtime smoke failed" }
git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff whitespace check failed" }
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "root typecheck failed" }
pnpm test
$rootTestExit = $LASTEXITCODE
if ($rootTestExit -ne 0) { throw "root tests failed; preserve the exact output and report any known unrelated Windows Job parallel flake separately without retrying or changing thresholds" }
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "root build failed" }
```

Expected: Docker emits `MODEL_ROUTING_WATERFALL_OK` and the existing package/safety/LSP markers; diff check, root typecheck, root tests, and root build exit `0`. Do not rerun root `pnpm test` while source is unchanged. If a validated product blocker later changes source, Task 8 restarts and runs root `pnpm test` once for that new revision. If its only failure is the known Windows Job parallel flake, final acceptance remains blocked and the report must name the exact failing test/error as unrelated evidence rather than changing implementation/tests to conceal it.

- [ ] **Step 6: Capture one canonical working-tree identity and review packet**

Use the exact canonical PowerShell wrapper from `skills/v1/requesting-code-review/SKILL.md` rather than reproducing or modifying its hash algorithm:

```powershell
$skillPath = Join-Path (Get-Location) "skills/v1/requesting-code-review/SKILL.md"
$extractor = @'
const { readFileSync } = require("node:fs");
const text = readFileSync(process.argv[1], "utf8");
const marker = "<!-- ocmm-review-artifact-" + "identity-js -->";
const at = text.indexOf(marker);
if (at < 0 || text.indexOf(marker, at + marker.length) !== -1) throw new Error("canonical marker missing or duplicate");
const following = text.slice(at + marker.length);
const fence = /^\r?\n```js\r?\n([\s\S]*?)\r?\n```(?:\r?\n|$)/.exec(following);
if (!fence) throw new Error("canonical fence missing or not adjacent");
process.stdout.write(fence[1]);
'@
$scriptLines = @(node -e $extractor $skillPath)
if ($LASTEXITCODE -ne 0 -or $scriptLines.Count -eq 0) { throw "cannot extract canonical review identity module" }
$script = $scriptLines -join "`n"
$artifactIdentityLines = @(node --input-type=module -e $script)
if ($LASTEXITCODE -ne 0 -or $artifactIdentityLines.Count -eq 0) { throw "cannot calculate review artifact identity" }
$artifactIdentity = $artifactIdentityLines -join "`n"
if ($artifactIdentity -notmatch '^sha256:[0-9a-f]{64}$') { throw "canonical review artifact identity has an invalid format" }
$artifactIdentity
```

Construct one packet with:

```text
ARTIFACT_KIND: working-tree
ARTIFACT_IDENTITY: value printed by the canonical wrapper
DESCRIPTION: DSMM v0.6 exact-route DeepSeek V4 Pro model routing, settings, prompt/docs/package integration, generated lib, and pinned runtime proof
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-08-25-dsmm-model-routing.md and docs/superpowers/specs/2026-08-25-dsmm-model-routing-design.md
REVIEW_INPUT: current binary diff from HEAD plus bytewise-sorted non-ignored untracked manifest, as required by requesting-code-review
VERIFICATION_EVIDENCE: Task 8 DSMM typecheck/tests, pack inventory, Docker smoke, diff check, root typecheck/test/build results captured for this identity
GLOBAL_CONSTRAINTS: the complete Global Constraints section of this plan, verbatim
```

Send the same packet in parallel to the first currently available Oracle lane and the primary `reviewer` lane. This is complex cross-module/runtime work: choose configured `high` profiles when available, otherwise unsuffixed normal profiles. Do not use Reviewer/Oracle profiles for the plan itself.

- [ ] **Step 7: Accept only two matching current-identity receipts**

After each lane returns, immediately rerun the canonical identity wrapper. Reject a timeout, partial result, missing field, identity mismatch, stale evidence, or conditional verdict. Each accepted receipt must contain exactly:

```text
role/profile lane: selected Oracle or reviewer profile
task_id or session receipt: durable task/session reference
artifact identity: the common current sha256 identity
verdict: approved
report artifact/source: task-result or durable review report source
```

If either lane rejects, verify the finding first. For an evidence-only blocker that changes no source, add the missing proof and create a new packet as required. For a validated product blocker that changes source, invalidate all Task 8 generation/test/pack/runtime evidence, return to the owning implementation task, apply the correction, and restart Task 8 from Step 2 so `dsmm/lib/**` is generated exactly once for the new source revision before rerunning every dependent check. Never patch source after generation and reuse stale lib or receipts. Final acceptance requires Oracle and Reviewer receipts with `verdict: approved` and the same identity as a final parent recomputation.

- [ ] **Step 8: Final read-only status receipt and handoff**

```powershell
$head = (@(git rev-parse HEAD) -join "`n").Trim()
if ($head -ne "cedd30b1abd03cf00b9ce330fa3b1805d76cb401") { throw "HEAD changed during implementation" }
git status --short
git diff --stat
git diff --check
```

Expected: HEAD is unchanged; intended spec/plan/DSMM source/tests/docs/package/generated files are unstaged; no dependency-install artifacts or unrelated files appear; diff check passes. Report that no commit/push occurred and ask for separate authorization before any Git write.

---

## Self-review

**Spec coverage:** All 12 verification scenarios map to Tasks 4-7: auto ordinary/preservation, strict override, preset max, max fallback, off-only capability, exact non-DeepSeek isolation, inactive scope, full config preservation, resolver fail-open warning, child lifecycle, and packed public surface. Task 1 covers reusable classification; Task 2 unifies scope precedence; Task 3 preserves the approved flat settings API; Tasks 6-8 cover prompt/docs/package/generated output and final gates.

**Interface consistency:** `DeepseekDefaultReasoningEffort` is `off|low|high`; `DeepseekReasoningEffort` adds only `max`; `resolveSelectedAgentPreset()` is the sole preset resolver; `isDeepseekV4ProRoute()` is the sole mutation/overlay route authority; `registerModelRouting()` receives the live settings getter and controller; the listener's frame/config/resolver signatures match the pinned rc.2 contracts.

**Placeholder scan:** Passed. Every task names exact files, interfaces, RED/GREEN behavior, commands, and expected evidence; no deferred-work markers or unnamed implementation steps remain.

**Scope check:** The plan adds no provider/model switching, request-text inference, recovery/retry behavior, serialization changes, settings redesign, host dependency installation, or Git writes. The only generated-output point is Task 8.

**Verification check:** Targeted tasks use a temporary mirror, Task 7 proves the real pinned DSH/Cordis waterfall with a fake resolver and zero provider stream calls, Task 8 checks pack inventory plus DSMM/root gates, reports the known Windows Job flake without concealment, regenerates lib once per corrected source revision, and requires identity-bound Oracle and Reviewer approval.
