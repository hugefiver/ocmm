# Config Merge Prototype-Pollution Hardening Design

**Date:** 2026-07-28
**Status:** Approved
**Upstream reference:** `./omo@79a15710a4a637d7958ba8f54d8070cf8e8a883d`

## Goal

Harden ocmm's existing configuration merge boundary against prototype-pollution keys without changing configuration discovery, schema, profile precedence, array policies, or any user-visible routing behavior.

## Scope

This subproject modifies only the merge implementation and its direct tests:

- `src/config/merge.ts`
- `src/config/load.test.ts`

An additional profile integration test may be added only if the direct merge tests cannot prove that profile overlay semantics remain unchanged. No configuration path, migration, schema, generated schema, prompt, skill, or Codex artifact changes are in scope.

## Threat Model

JSON and JSONC can represent own properties named `__proto__`, `constructor`, and `prototype`. The current merge implementation copies object entries into an ordinary object and recursively merges them. A dangerous key from either a lower-precedence base layer or a higher-precedence override layer can therefore survive the merge or interact with legacy prototype setters.

The hardening boundary treats these three exact, case-sensitive keys as forbidden at every object depth, including objects nested inside arrays. Safe sibling keys and values must remain intact.

## Architecture

### Unsafe-key policy

`src/config/merge.ts` will define one private unsafe-key predicate for:

- `__proto__`
- `constructor`
- `prototype`

The policy applies recursively to both `base` and `override`. Filtering only the override is insufficient because a dangerous key may already exist in the first loaded layer and later be returned through an `override === undefined` branch.

### Recursive sanitization

A private recursive sanitizer will:

1. map arrays and sanitize each element;
2. rebuild plain objects from safe own entries only;
3. return primitives unchanged.

The sanitizer will use ordinary data-property creation and will never assign an unsafe key. It will not log rejected values because configuration values may contain sensitive provider options.

### Merge behavior

`deepMerge()` retains its established policies:

- `undefined` override preserves the sanitized base value;
- plain objects deep-merge recursively;
- ordinary arrays are replaced by the sanitized override array;
- `ACCUMULATING_ARRAY_KEYS` still union string representations in insertion order;
- `{ profileOverlay: true }` still forces all arrays to replace;
- scalars and `null` replace the base value.

Both merge inputs are sanitized before they can be returned or copied. The implementation must not mutate either input or retain an unsafe nested object through an array replacement.

### Plain-object boundary

The existing exported `isPlainObject` implementation and contract remain unchanged. Configuration values originate from JSON/JSONC parsing, so this security patch does not need to redefine object classification for its wider loader and profile-alias call sites.

## Data Flow

```text
user/project/profile parsed value
        |
        v
sanitize base + override recursively
        |
        v
apply existing object/array/scalar merge policy
        |
        v
safe merged value -> existing schema/profile loader
```

No new configuration fields or diagnostics are introduced.

## Error Handling

Dangerous keys are dropped rather than causing configuration loading to fail. This matches the upstream safety behavior and avoids turning a security boundary into a new startup compatibility failure. Safe siblings continue through normal schema validation.

The sanitizer must not catch or suppress unrelated parsing or schema errors; those remain owned by the existing loader.

## Testing

Tests will construct malicious own properties with `JSON.parse()` rather than object-literal `__proto__` syntax.

Required scenarios:

1. A dangerous key in the base layer is removed when the override omits that branch.
2. A dangerous key in the override layer is removed.
3. All three forbidden keys are removed at multiple nested object depths.
4. Dangerous keys inside objects nested in replacement arrays are removed.
5. Safe siblings, arrays, scalars, and `null` retain their existing values.
6. Existing ordinary-array replacement remains unchanged.
7. Existing accumulating-array de-duplicating union remains unchanged.
8. Existing profile-overlay array replacement remains unchanged.
9. `Object.prototype` remains unpolluted after every malicious merge.
10. Inputs are not mutated.

Verification commands run with `OCMM_PROFILE`, `OCMM_NO_PROFILE`, and `OCMM_FAST` cleared:

- targeted Node test for `src/config/load.test.ts`;
- `pnpm run typecheck`;
- `pnpm test`;
- `git diff --check`.

Because this is configuration runtime behavior, the real-surface check will parse and merge a temporary JSONC configuration through the existing loader and assert the safe resulting shape. Temporary files must be isolated and removed.

## Non-Goals

- nearest-parent or ancestor configuration discovery;
- unified `omo.jsonc` configuration;
- configuration migration, writer, lock, journal, backup, or recovery;
- schema strictness changes or `schema.json` regeneration;
- new warnings, telemetry, or rejected-key logging;
- changes to fast-option merge helpers;
- prompt, skill, model-routing, idle-continuation, or Codex behavior;
- dependency installation.

## Acceptance Criteria

- The three forbidden keys cannot survive `deepMerge()` at any object depth or inside arrays.
- Existing merge and profile results remain deeply equal for safe input values.
- Direct and real-loader regressions pass without modifying unrelated files.
- The working diff contains only the approved design/plan artifacts, `src/config/merge.ts`, and direct tests for this subproject.
