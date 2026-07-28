# Fast Default Rules Design

**Status:** Approved

## Context

`fastModels.rules` lets users inject provider options when `--fast` cannot use an explicit mapping or a catalog `-fast` model. Users currently have to repeat the common OpenAI Priority Processing rules themselves.

This change adds an opt-in set of built-in rules. The rules use the runtime model's `model.api.npm` value because provider names are user-defined and do not identify the request adapter reliably.

## Goals

- Add `fastModels.defaultRules`, defaulting to `false`.
- Support the official OpenAI AI SDK and the OpenAI-compatible AI SDK.
- Enable Priority Processing only for standard numeric GPT model families that are likely to support it.
- Preserve automatic matching for future numeric GPT generations and snapshots.
- Keep mappings, existing `-fast` models, user rules, profile overlays, route snapshots, and reasoning floors compatible.

## Non-goals

- Query OpenAI or another remote service for model capabilities.
- Guarantee that every future GPT model supports Priority Processing.
- Support non-GPT models, non-OpenAI SDKs, embeddings, fine-tuned models, or specialized realtime/media/search/Codex models.
- Extend the public rule matcher with negative patterns.
- Change the Codex adapter or the existing model-promotion allowlist.

## Configuration

The root configuration accepts:

```jsonc
{
  "fastModels": {
    "defaultRules": true,
    "rules": []
  }
}
```

`FastModelsConfigSchema` defines `defaultRules` as a strict boolean with a default of `false`. `ProfileFastModelsConfigSchema` defines it as an optional boolean without a child default.

Profile behavior follows the existing scalar overlay contract:

- an omitted profile value inherits the root value;
- `true` enables the built-ins for that profile;
- `false` disables them even when the root enables them;
- the existing `rules` array replacement behavior is unchanged.

The generated root `schema.json` must be regenerated in the same change.

## Route Snapshot

The `options` member of `FastPath` becomes conceptually:

```ts
Readonly<{
  kind: "options"
  defaultRules: boolean
  rules: readonly FastOptionRule[]
}>
```

`selectFastPath` copies the parsed boolean into this path. The route registry clones and freezes it with the user rules. `chat.params` therefore uses one atomically published configuration snapshot and never reads live configuration.

The existing path priority remains authoritative:

1. fast mode disabled or invalid model identity: `off`;
2. allowlisted explicit mapping, including an authoritative self-mapping: `model` or `off`;
3. a model already ending in `-fast`: `off`;
4. an allowlisted catalog `${model}-fast` candidate: `model`;
5. otherwise: `options` with the snapshotted default-rule switch and user rules.

Built-in options are never applied to the first four outcomes.

## Built-in Resolver

A pure resolver near `src/routing/fast-option-rules.ts` accepts the existing runtime match context:

```ts
type FastOptionMatchContext = {
  provider: string
  model: string
  sdk?: string
}
```

It returns a new options object when both the SDK and model policy match, and returns no options otherwise. It does not mutate its input and does not access configuration, network, environment, or global state.

### SDK policy

SDK values are exact, case-sensitive npm package names:

| `model.api.npm` | Built-in option |
| --- | --- |
| `@ai-sdk/openai` | `{ serviceTier: "priority" }` |
| `@ai-sdk/openai-compatible` | `{ service_tier: "priority" }` |

The official provider uses the AI SDK camel-case option. The compatible provider passes custom request fields through to an OpenAI-compatible API, so it uses the OpenAI wire name. Every other SDK is a no-op.

### GPT model policy

The resolver uses a conservative family heuristic rather than a static model list:

1. The model ID must start with lowercase `gpt-` followed immediately by a decimal major version.
2. The parsed major version must be at least `4`.
3. Splitting the full model ID on `.`, `_`, and `-` must not produce any excluded token.

Excluded tokens are:

```text
nano, pro, realtime, audio, transcribe, image, search, tts, vision, codex
```

This accepts standard models and snapshots such as `gpt-4o`, `gpt-4.1-mini`, `gpt-5.6-sol`, and future numeric GPT generations. It rejects examples such as `gpt-3.5-turbo`, `gpt-5-nano`, `gpt-5.4-pro`, `gpt-4o-realtime-preview`, `gpt-4o-mini-transcribe`, and `gpt-5-codex`. Fine-tuned IDs such as `ft:gpt-5:...` fail the required prefix.

This policy is explicitly best-effort. OpenAI publishes model support as a changing list and does not guarantee that every future GPT model supports Priority Processing. The backend remains the final authority.

## Runtime Data Flow and Precedence

For a managed route whose snapshotted path is `options`, `chat.params` uses the actual runtime provider, model, and `model.api.npm`. This is important when runtime fallback changes the selected model or SDK.

Options merge in this order:

1. options already produced by ordinary route controls and earlier hook behavior;
2. built-in options when `defaultRules` is enabled and the resolver matches;
3. matching user `fastModels.rules`, in their existing declaration order;
4. reviewer and plan-critic reasoning floors.

Consequences:

- enabling the switch activates Priority Processing by default;
- a later user rule can override or neutralize a built-in field;
- the two SDK-specific field names never appear together unless a user rule explicitly adds the other one;
- protective reasoning floors remain final and cannot be weakened by either built-in or user fast rules.

## Failure Handling

- Missing SDK metadata, an unknown SDK, a non-matching model, or an excluded model leaves options unchanged.
- The resolver performs no capability probe and introduces no new runtime failure mode.
- An OpenAI-compatible backend can still reject `service_tier`; opting into `defaultRules` delegates final compatibility to that backend and the existing request/fallback error handling.
- No option values are added to logs.

## Tests

### Schema and profiles

- root default and parsed default are `false`;
- explicit root `true` and `false` parse correctly;
- non-boolean values are rejected;
- a profile can enable or disable the root value;
- an omitted profile value inherits the root value;
- existing profile rule-array replacement remains unchanged;
- regenerating `schema.json` is stable.

### Resolver

- both supported npm packages produce their correct field names;
- unsupported or missing SDK metadata is a no-op;
- GPT 4, GPT 5, snapshots, mini models, and a representative future GPT major match;
- GPT 3.5, non-GPT models, fine-tuned IDs, and every excluded token do not match;
- matching is case-sensitive and returns fresh data.

### Route and hook integration

- `FastPath.options` carries and freezes the boolean;
- fast-off, explicit/self mappings, already-fast models, catalog suffix promotion, and unmanaged routes do not apply defaults;
- runtime fallback re-evaluates the actual model and SDK;
- user rules override built-in fields and retain deep-merge behavior;
- reviewer and plan-critic floors remain final;
- config reload and profile republish replace the snapshotted switch atomically.

### Verification

Run targeted tests first, then:

```powershell
pnpm run gen-schema
pnpm run typecheck
pnpm test
pnpm run build
git diff --check
```

No software may be installed to satisfy a missing local tool. A Windows build artifact locked by a live `oc.exe` process must be reported or verified in an isolated copy rather than terminating the user's active session.

## Documentation

Update:

- `README.md` with the default-off switch, supported SDKs, model heuristic, precedence, and best-effort warning;
- `docs/architecture.md` with the snapshotted switch and runtime resolver flow;
- `examples/ocmm.example.jsonc` with an opt-in example and profile override note.

This change does not touch `prompts/v1/` or `skills/v1/`, so it does not require a `docs/v1-maintenance.md` update.

## References

- OpenAI Priority Processing: <https://developers.openai.com/api/docs/guides/priority-processing>
- OpenAI pricing and supported Priority models: <https://developers.openai.com/api/docs/pricing>
- AI SDK OpenAI provider options: <https://ai-sdk.dev/providers/ai-sdk-providers/openai>
- AI SDK OpenAI-compatible providers: <https://ai-sdk.dev/providers/openai-compatible-providers>
