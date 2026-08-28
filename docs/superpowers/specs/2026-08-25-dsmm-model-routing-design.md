# DSMM v0.6 Model Routing and DeepSeek V4 Pro Calibration Design

Date: 2026-08-25
Status: approved by user delegation

## Context

DSMM v0.5 provides a dsh-native deepwork mode, role presets, workflow skills, safety guards, and MCP/LSP integration. The existing DeepSeek V4 Pro support is prompt-only: `deepseekV4ProCalibration` controls an overlay, but `auto` and `strict` do not affect the actual LLM request.

DSH `0.1.1-rc.2` exposes the required public seam through the `agent/request` waterfall. A listener must call `await next()` to obtain the effective `LlmCallConfig`, then return a copied config. `ctx.llm.resolveModelInfo(provider, model, signal)` exposes adapter-authoritative reasoning effort IDs. This design uses those APIs without switching provider or model.

## Goals

- Add a reusable model-family classifier adapted from ocmm.
- Apply deterministic DeepSeek V4 Pro reasoning policy through dsh `agent/request`.
- Give `off`, `auto`, and `strict` distinct, documented runtime semantics.
- Default ordinary calibrated requests to `high` reasoning.
- Reserve `max` for configured DSMM role presets.
- Select only reasoning efforts advertised by the active adapter.
- Preserve non-DeepSeek requests and every request field unrelated to `reasoningEffort`.

## Non-goals

- Do not switch provider or model.
- Do not infer task class from prompt text.
- Do not alter provider message encoding or reasoning-content/tool-call continuity.
- Do not add fallback routing, retry behavior, or runtime recovery; those belong to roadmap v0.7.
- Do not apply a DeepSeek overlay or reasoning policy to non-DeepSeek models.

## Chosen Approach

Use a pure post-waterfall request policy:

1. Await downstream `agent/request` resolution.
2. Verify DSMM scope and the exact official route.
3. Preserve explicit effort in `auto`; compute policy effort in `strict`.
4. Resolve adapter model metadata.
5. Select only an advertised effort.
6. Return `{ ...config, reasoningEffort }` without changing any other field.

Prompt-only calibration is insufficient because it cannot prove the runtime effort. Provider/model rewriting is rejected because it can replay messages across adapter boundaries and exceeds the roadmap acceptance criteria.

## Public Settings

Retain the existing flat compatibility key and add adjacent settings:

```ts
type DeepseekCalibration = "off" | "auto" | "strict";
type DeepseekDefaultReasoningEffort = "off" | "low" | "high";

interface DsmmPluginConfig {
  deepseekV4ProCalibration?: DeepseekCalibration;
  deepseekV4ProDefaultReasoningEffort?: DeepseekDefaultReasoningEffort;
  deepseekV4ProMaxReasoningPresets?: DsmmRoleId[];
}
```

Defaults:

```ts
deepseekV4ProCalibration: "auto"
deepseekV4ProDefaultReasoningEffort: "high"
deepseekV4ProMaxReasoningPresets: ["dsmm-plan-critic", "dsmm-reviewer"]
```

`defaultReasoningEffort` intentionally excludes `max`. Users obtain `max` only through configured preset triggers. Invalid or duplicate preset IDs are removed while preserving canonical `DSMM_ROLE_IDS` order.

Settings remain restart-scoped, matching the existing DSMM settings lifecycle.

## Calibration Semantics

| Mode | Prompt overlay | Runtime request behavior |
|---|---|---|
| `off` | Never | Return downstream config unchanged. |
| `auto` | Exact DeepSeek V4 Pro model only | Preserve an explicit upstream effort; fill only an omitted effort. |
| `strict` | Exact DeepSeek V4 Pro model only | Override upstream effort with the DSMM-computed effort. |

Policy applies only when both conditions hold:

- the request belongs to active deepwork mode or a selected DSMM-managed preset; and
- the final route is exactly `deepseek-official/deepseek-v4-pro` after case normalization.

The generic model-family classifier may classify aliases and other DeepSeek routes as `deepseek`, but family classification alone never authorizes request mutation.

## Preset-derived Max Reasoning

The selected preset is resolved using the established DSH rule:

1. newest valid `agent-preset/selected` event;
2. `session.header.agentPreset` fallback.

If the selected preset appears in `deepseekV4ProMaxReasoningPresets`, the desired effort is `max`; otherwise it is `deepseekV4ProDefaultReasoningEffort`.

No request-text heuristic is added. An ordinary deepwork session without a matching preset therefore receives the configured default, normally `high`.

## Adapter Capability Negotiation

Reasoning effort IDs are adapter-owned branded strings. DSMM must not assume every deployment exposes `high` or `max`.

For a desired effort, resolve model info and build a set from `reasoning.efforts[].id`:

- desired `max`: choose `max`, otherwise `high`, otherwise a valid advertised `defaultEffort`, otherwise leave the request unchanged;
- desired `high`, `low`, or `off`: choose the exact desired effort, otherwise a valid advertised `defaultEffort`, otherwise leave the request unchanged.

DSMM never selects an arbitrary first effort and never returns an unadvertised effort.

If `resolveModelInfo` throws, returns no reasoning metadata, or cannot represent the policy, log one warning and return the downstream config unchanged. Calibration must not make an otherwise valid request fail before provider I/O.

## Components

### `dsmm/src/model-family.ts`

Pure, provider-aware classifier adapted from `src/intent/model-family.ts`:

```ts
type DsmmModelFamily =
  | "gpt"
  | "codex"
  | "claude"
  | "gemini"
  | "glm"
  | "kimi"
  | "deepseek"
  | "unknown";

classifyModelFamily(input: { providerID?: string; modelID?: string }): DsmmModelFamily
```

It has no DSH runtime dependency and performs no routing mutation.

### `dsmm/src/session-scope.ts`

Centralizes selected-preset resolution currently duplicated in `mode.ts` and `guards.ts`. Existing consumers migrate to this helper so prompt, safety, and model policy use the same precedence.

### `dsmm/src/model-routing.ts`

Owns exact-route matching, pure effort computation, capability selection, and registration:

```ts
isDeepseekV4ProRoute(config: DshLlmCallConfig): boolean
desiredDeepseekEffort(settings: DsmmSettings, preset?: string): DeepseekReasoningEffort
selectAdvertisedEffort(desired, reasoningInfo): string | undefined
registerModelRouting(ctx, controller, getSettings): void
```

`registerModelRouting` uses a child `ctx.inject(["llm"], ...)` when available. The listener is disposed with that child context and uses the current settings getter.

### `dsmm/src/dsh-types.ts`

Adds minimal structural contracts for:

- `DshLlmCallConfig`;
- `DshResolvedModelInfo` and reasoning metadata;
- `DshLlmRuntime.resolveModelInfo()`;
- `AgentRequestFrame`;
- typed `agent/request` listener overload.

These interfaces mirror only fields DSMM consumes and preserve arbitrary request fields through index signatures.

### Existing prompt and entry files

- `prompts.ts` uses the shared exact model helper and renders effective default/max preset policy in the calibration overlay.
- `index.ts` registers model routing once at the root and exports classifier/policy helpers and types.
- `settings.ts` adds schema, defaults, normalization, and public types.
- `mode.ts` and `guards.ts` consume shared preset resolution.

## Request Data Flow

```text
agent/request event
  -> await next()
  -> downstream LlmCallConfig
  -> calibration mode/scope/exact-route checks
  -> preserve explicit effort when auto
  -> selected preset -> desired high/max/off/low
  -> ctx.llm.resolveModelInfo(provider, model, signal)
  -> advertised capability selection
  -> copied config with reasoningEffort only
```

The listener never mutates the downstream object in place.

## Error Handling

- Downstream `next()` errors propagate unchanged.
- Model-info resolution errors are warned and fail open to the unchanged config.
- Missing agent/session, inactive scope, `off`, nonmatching routes, and explicit `auto` effort are no-op paths.
- Unsupported desired effort follows the documented capability fallback; it does not throw.
- Warning messages identify the route and desired effort but do not include prompts, credentials, or message bodies.

## Documentation

Add `dsmm/docs/model-routing.md` covering:

- exact route scope;
- settings and defaults;
- `auto` versus `strict` precedence;
- preset-derived `max` behavior;
- adapter capability fallback;
- the fact that DSMM does not own tool-call reasoning-content serialization.

Update `dsmm/README.md` and mark roadmap v0.6 implemented only after runtime and package verification pass.

## Verification Scenarios

1. **Auto ordinary deepwork:** omitted effort on exact route becomes advertised `high`.
2. **Auto explicit preservation:** explicit `low`, `off`, or `max` is unchanged.
3. **Strict enforcement:** explicit `off` becomes policy `high` for ordinary deepwork.
4. **Preset max:** configured reviewer/plan-critic preset selects advertised `max`.
5. **Max fallback:** adapter without `max` selects advertised `high`.
6. **Off-only deployment:** advertised `off` is selected only when valid fallback/default semantics allow it; no unsupported effort is emitted.
7. **Non-DeepSeek isolation:** GPT, Claude, other DeepSeek routes, and lookalike model names are unchanged.
8. **Inactive scope:** exact route outside deepwork/DSMM presets is unchanged.
9. **Config preservation:** provider, model, messages, tools, signal-related fields, and unknown options retain identity/value.
10. **Resolver failure:** warning emitted once per request and unchanged config returned.
11. **Lifecycle:** `llm` child replacement/disposal does not duplicate listeners.
12. **Package surface:** classifier and routing helpers/types are available from the packed artifact.

## Acceptance Criteria

- DSMM unit and type tests cover every scenario above.
- Root typecheck, tests, and build pass, with any unrelated known flaky test reported separately rather than hidden.
- Generated `dsmm/lib/**` matches source.
- `npm pack --dry-run` includes model routing implementation and documentation.
- A runtime-level test exercises a real DSH/Cordis `agent/request` waterfall with a deterministic fake model-info resolver; no paid provider request is made.
- Final Oracle and Reviewer receipts approve one current working-tree identity.
- No Git commit or push occurs without separate explicit authorization.
