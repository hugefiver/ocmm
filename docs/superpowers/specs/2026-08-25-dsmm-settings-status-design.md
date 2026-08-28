# DSMM Settings and Status Design

**Status:** Approved by full-session user delegation (`你自主决定`)

**Roadmap target:** DSMM v0.8 — UI/settings polish

**Baseline:** `cedd30b1abd03cf00b9ce330fa3b1805d76cb401` plus the reviewed, uncommitted v0.6 model-routing and v0.7 runtime-recovery working tree

## Goal

Expose DSMM's applied settings and current mode/model policy as a stable,
human-readable host command that is usable from DSH's Web command surface while
preserving file-based headless configuration and avoiding unstable custom client
APIs.

The feature must:

- let a Web user inspect normalized DSMM settings without editing YAML;
- show current deepwork scope, selected DSMM preset, route, calibration policy,
  and runtime-recovery policy;
- provide deterministic JSON for tooling and future TUI adapters;
- keep headless configuration in `$DSH_HOME/settings.yaml`;
- add no browser bundle, React dependency, custom panel, or provider call.

## Evidence and Constraints

The design targets `@deepseek-ai/dsh@0.1.1-rc.2` at commit
`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`.

Relevant public contracts:

- `ctx.settings.register()` returns an owner-scoped settings scope. `scope.get()`
  returns the current resolved value and `scope.watch()` observes committed
  changes. DSMM already registers namespace `dsmm` with `applies: "restart"` and
  normalizes every `scope.get()` through `resolveConfig()`.
- The Web loopback settings API exposes `settings.describe`, schema, resolved
  value, base, user override, revision, and redacted secret metadata. It does not
  automatically render an unknown namespace as a complete form.
- Browser settings cards use client slots such as `settings.plugin.item`, but the
  rc.2 release and repository describe the client platform as Developer Preview
  with compatibility-breaking changes still possible.
- Host commands registered through `ctx.commands.register()` are available to
  the Web command UI and return a `CommandResult` directly to the UI rather than
  adding it to model history.
- The fixed headless bundle has settings/file services but no Web or command
  interaction adapter. It remains configured through `$DSH_HOME/settings.yaml`
  or equivalent profile files.
- The fixed commit does not ship an official TUI bundle. A future TUI may consume
  host commands or the exported pure snapshot API.

Repository evidence:

- `dsmm/src/settings.ts` already owns the complete normalized `DsmmSettings`
  contract and a live getter captured by the settings-ready child context.
- `dsmm/src/commands.ts` currently registers only the configurable deepwork mode
  command.
- `DeepworkModeController.active()`, `resolveSelectedAgentPreset()`,
  `classifyModelFamily()`, and `isDeepseekV4ProRoute()` provide the pure inputs
  needed for status computation.
- `agent.session.requestHeader()?.config` is the most accurate current effective
  provider/model/reasoning source; `agent.options` is a fallback when no request
  header exists.
- There is no frontend project, browser entry, or uppercase `DESIGN.md` in DSMM.

## Alternatives

### A. Host status snapshot and command — selected

Add a pure status snapshot/formatter and a fixed `/dsmm-status [json]` command.
The command computes its result on every invocation from the current agent,
session, controller, and normalized settings getter.

Benefits:

- uses documented Host APIs that already work with the Web command surface;
- introduces no client build or framework dependency;
- works as a stable machine-readable seam for future TUI/client adapters;
- keeps status logic testable without a running browser or provider;
- remains useful when the browser settings-card API changes.

### B. Custom rc.2 browser settings card

Deferred. A hand-written card could bind the `dsmm` namespace through
`ctx.settingsScope` and register under `settings.plugin.item`, but this would pin
DSMM to Developer Preview browser contracts, require a client bundle and design
system, and duplicate fields already represented by the host schema.

The option may be revisited after DSH publishes a stable client-plugin contract.

### C. Documentation and `settings.describe` only

Rejected. The settings wire API exposes normalized values, but an unknown
namespace has no automatic human-readable card. It also does not express active
mode, selected preset, current route, or calibration applicability.

## Architecture

### 1. Pure status snapshot

Create `dsmm/src/status.ts`.

```ts
export const DSMM_STATUS_VERSION = 1 as const

export interface DsmmStatusSnapshot {
  version: typeof DSMM_STATUS_VERSION
  mode: {
    name: string
    active: boolean
    selectedPreset?: string
    dsmmPreset: boolean
    inScope: boolean
  }
  route: {
    provider?: string
    model?: string
    family: DsmmModelFamily
    deepseekV4Pro: boolean
    currentReasoningEffort?: string
  }
  calibration: {
    mode: DeepseekCalibration
    applies: boolean
    policyEffort?: "off" | "low" | "high" | "max"
    action:
      | "disabled"
      | "out-of-scope"
      | "non-target-route"
      | "preserve-explicit"
      | "fill-missing"
      | "enforce"
  }
  runtimeRecovery: {
    enabled: boolean
    applies: boolean
    fallbackRouteCount: number
    maxFallbackAttempts: number
    idleContinuation: {
      enabled: boolean
      maxContinuations: number
    }
  }
  effectiveSettings: DsmmSettings
}

export function createDsmmStatusSnapshot(input: {
  agent: DshAgent
  settings: DsmmSettings
  modeActive: boolean
}): DsmmStatusSnapshot

export function formatDsmmStatus(snapshot: DsmmStatusSnapshot): string
```

The function is deterministic and side-effect free.

It resolves:

1. the latest valid selected preset through `resolveSelectedAgentPreset()`;
2. DSMM scope as `modeActive || isDsmmRoleId(selectedPreset)`;
3. route data from `session.requestHeader()?.config`, falling back to string
   `agent.options.provider/model` values;
4. model family through `classifyModelFamily()`;
5. exact DeepSeek V4 Pro authority through `isDeepseekV4ProRoute()`;
6. calibration policy from scope, exact route, configured mode, max-preset list,
   and the current explicit reasoning effort;
7. runtime-recovery applicability as `enabled && inScope`.

`policyEffort` is the desired DSMM policy, not a claim that the adapter advertises
or has already applied that effort. Actual adapter-capability negotiation remains
owned by `model-routing.ts` during `agent/request`.

`effectiveSettings` is a defensive plain-object copy. Arrays and nested objects
must not alias the settings getter's value. It includes the configured idle
continuation prompt because command output is explicitly requested by the local
user and the settings schema contains no secret fields.

### 2. Calibration status semantics

The snapshot uses the following precedence:

1. calibration `off` → `disabled`;
2. outside active deepwork/DSMM preset scope → `out-of-scope`;
3. non-target provider/model → `non-target-route`;
4. `auto` with an explicit current reasoning effort → `preserve-explicit`;
5. `auto` without an explicit effort → `fill-missing`;
6. `strict` → `enforce`.

When the selected preset is included in
`deepseekV4ProMaxReasoningPresets`, `policyEffort` is `max`; otherwise it is
`deepseekV4ProDefaultReasoningEffort`.

No status computation calls `ctx.llm.resolveModelInfo()`, changes request state,
or performs a provider/network operation.

### 3. Human-readable formatter

`formatDsmmStatus()` emits a bounded, deterministic text summary:

```text
DSMM status
Mode: active (deepwork)
Scope: dsmm-reviewer preset
Route: deepseek-official/deepseek-v4-pro [deepseek]
Reasoning: auto; policy=max; current=high; action=preserve-explicit
Runtime recovery: enabled; applies=yes; fallbacks=2; max attempts=2
Idle continuation: disabled; max=3
Effective settings: use /dsmm-status json for the normalized snapshot
```

Absent route values render as `unavailable`; absent reasoning renders as
`provider default`. Formatting never includes model prompts or provider errors.

### 4. Status command

Extend `dsmm/src/commands.ts`:

```ts
export const DSMM_STATUS_COMMAND = "dsmm-status"

export function registerDsmmStatusCommand(
  readyCtx: DshContext,
  controller: DeepworkModeController,
  getSettings: () => DsmmSettings,
): void
```

The fixed command name avoids changing with `modeName` and remains discoverable
across profiles.

Input contract:

- empty input → human-readable text;
- `json` → `JSON.stringify(snapshot, null, 2)`;
- any other input → `{ kind: "error", text: "Usage: /dsmm-status [json]" }`.

The handler reads settings and mode state at invocation time. The command is
registered inside the same settings-ready child as the existing deepwork command,
so its lifecycle follows the settings/systemPrompt services and does not create a
root-global duplicate.

`apply()` registers the status command immediately after the deepwork command.
No settings update command is added; writes remain owned by the DSH settings
surface and settings file.

### 5. Web, headless, and TUI behavior

#### Web loopback

The existing Web command UI discovers `/dsmm-status`. Human output provides
current indicators; JSON output exposes the complete normalized snapshot without
requiring YAML edits. The existing settings API may still describe/update the
`dsmm` namespace independently.

No custom settings card is shipped in v0.8.

#### Headless

Headless users configure DSMM through `$DSH_HOME/settings.yaml` or profile files.
Documentation includes the exact namespace shape, `dsh --dump-config` inspection,
and the fact that the fixed headless bundle has no interactive command adapter.

#### TUI

The fixed DSH release has no official TUI bundle. Documentation states that a
future adapter may execute the host command or consume the exported snapshot API.
DSMM does not invent a private event bridge.

### 6. Public package surface

Export from `dsmm/src/index.ts`:

- `DSMM_STATUS_COMMAND`
- `DSMM_STATUS_VERSION`
- `createDsmmStatusSnapshot`
- `formatDsmmStatus`
- `registerDsmmStatusCommand`
- `DsmmStatusSnapshot`

Add `dsmm/docs/settings-status.md` and ship it in `package.json`.

Update:

- `dsmm/README.md` with command examples and profile-specific behavior;
- `dsmm/docs/roadmap.md` with an exact v0.8 implemented status only after the
  packaged runtime proof passes;
- package inventory tests for source, generated declarations, and documentation.

## Data and Error Flow

1. DSH executes `/dsmm-status` with the current agent.
2. The handler obtains the current normalized settings through `getSettings()`.
3. It asks the controller for effective mode activity using `defaultActive`.
4. The pure snapshot reads only current session/header/options data.
5. The formatter returns human text or deterministic JSON to the command UI.
6. The result does not enter model history. The snapshot/handler appends no
   DSMM-specific session event; DSH's command runtime still records its required
   durable `command/run` and `command/done` lifecycle pair.

Trusted DSH/session structures are not wrapped in speculative broad catches. An
invalid command input returns the fixed usage error. No fallback status is
fabricated when provider/model information is unavailable.

## Frontend Decision

This implementation writes no browser component, styling, asset, or client
bundle. Therefore it does not create a `DESIGN.md`, add React tooling, or run
visual/Lighthouse/browser QA. Those gates become mandatory if a later version
adds the deferred custom settings card.

## Testing

### Pure status scenarios

- inactive ordinary session with unknown route;
- active generic deepwork on a non-DeepSeek route;
- DSMM preset-only scope on exact V4 Pro;
- `auto` preserves an explicit current effort;
- `auto` fills a missing effort;
- `strict` reports enforcement;
- configured max preset reports `policyEffort=max`;
- runtime recovery reports enabled but not applicable outside scope;
- malformed/non-string agent option routes remain unavailable;
- returned nested settings and arrays do not alias the source settings.

### Command scenarios

- commands service absent is a no-op;
- service resolved through `ctx.get()` without direct property access;
- fixed command name and `[json]` hint;
- human output contains bounded indicators;
- JSON output parses and equals the pure snapshot;
- invalid input returns the exact usage error;
- each invocation reads current settings rather than a registration-time copy.

### Integration scenarios

- root `apply()` installs one deepwork command and one status command in the
  settings-ready child;
- pinned rc.2 packaged Docker smoke executes the registered status command in a
  DSMM preset session and validates both human and JSON output;
- each command call appends exactly one host-owned `command/run` and one
  host-owned `command/done`; two calls therefore add exactly four lifecycle
  events, with no additional DSMM/model-visible/request events;
- command execution causes no provider stream/network call;
- existing model-routing, runtime-recovery, safety, LSP, and prompt markers remain
  green.

### Final gates

- DSMM test-config typecheck and all DSMM tests;
- authoritative `dsmm/lib/**` generation once for each final-review source
  revision;
- npm pack dry-run with status JS/declarations/doc inventory;
- pinned rc.2 packaged Docker smoke with a new `DSMM_STATUS_COMMAND_OK` marker;
- `git diff --check`;
- root typecheck, one root test invocation, and root build;
- common current working-tree identity approved by Oracle and primary Reviewer.

An unrelated root flaky test is reported exactly. A same-revision root test is
not retried unless the user explicitly approves a documented evidence exception.

The first implementation cycle freezes the reviewed pre-v0.8 generated-library
identity through Tasks 1–5 and proves that status modules are absent before the
first authoritative generation. If final review later requires a source, test,
documentation, package, or smoke correction, the already-generated prior v0.8
tree becomes that correction cycle's stale baseline. The owning task must preserve
that exact stale identity while applying its OS-temp RED/GREEN correction. When
compiled source changed, the final task must also prove a targeted stale-output
RED before overwriting the stale generated tree exactly once. The owning task
must name the exact stale generated-runtime test files and the expected failing
assertion; the final task must execute that list and observe that assertion rather
than relying on a fixed status/command test pair. A test-,
documentation-, package-, or smoke-only correction instead carries its owning
task's specific RED/GREEN evidence and does not fabricate a generated-output
failure. The final task still performs its one authoritative generation for the
corrected complete revision. No correction cycle requires or permits
reconstructing the original pre-v0.8 generated bytes.

## Non-Goals

- no custom Web settings card or standalone panel;
- no React, CSS, browser bundle, or visual design system;
- no settings mutation command;
- no generic Schemastery-to-React form renderer;
- no client-internal controller/mirror dependency;
- no TUI implementation or private event bridge;
- no provider capability or network lookup during status calculation;
- no exposure of process-local runtime-recovery pending state or counters;
- no Git commit, push, version bump, or release.

## File Scope

Create:

- `dsmm/src/status.ts`
- `dsmm/test/status.test.ts`
- `dsmm/docs/settings-status.md`

Modify:

- `dsmm/src/commands.ts`
- `dsmm/src/index.ts`
- `dsmm/test/commands.test.ts`
- `dsmm/test/package.test.ts`
- `dsmm/package.json`
- `dsmm/README.md`
- `dsmm/scripts/docker-smoke.mjs`
- `dsmm/test/docker-smoke-assets.test.ts`
- `dsmm/docs/roadmap.md` after packaged proof
- generated `dsmm/lib/**` only in the final integration task

Preserve every reviewed v0.6/v0.7 source, test, documentation, generated output,
and verification contract not listed above.
