# Oracle High Supplemental Review Design

## Goal

Add `oracle-high` as a supplemental high-effort review agent that can participate in final review for sufficiently complex work only when the user explicitly configures it, the current model catalog can resolve it, and it is not disabled.

## Context

`oracle` and `reviewer` already split review responsibilities:

- `oracle` is the default self-supervision reviewer and prefers cross-generation or otherwise non-identical review to avoid same-model confirmation bias.
- `reviewer` is the external review lane and uses the primary reasoning lane chosen from explicit configuration and the available catalog.

The new `oracle-high` agent is not a replacement for either. It is an optional third reviewer for complex or high-risk final gates. The repository must keep active guidance provider-neutral: concrete model names may remain as built-in defaults or reference examples, but workflow rules must rely on explicit user configuration and the current available model catalog.

## Requirements

1. Register `oracle-high` as a built-in review-only agent.
2. Reuse the existing reviewer prompt; do not create a separate prompt file.
3. Use high-effort defaults for `oracle-high`: default local `variant: "max"`, with generated Codex profiles gating GPT-like outputs without native max support to `model_reasoning_effort = "xhigh"` and preserving native `max` only for max-capable configured profiles.
4. Keep `oracle-high` on the primary/high-effort review lane for catalog upgrades, while `oracle` remains the configured cross-check lane.
5. Grant `oracle-high` review-only default permissions, including `task: "deny"`.
6. Add `oracle-high` to the config schema agent-name enum and regenerate `schema.json`.
7. Regenerate Codex artifacts so `dw-oracle-high` exists and generated guidance describes the optional third-review path.
8. Update active review guidance:
   - Simple work continues to use `oracle`.
   - Complex/large work defaults to `oracle + reviewer` in parallel.
   - Add `oracle-high` only for complex/high-risk final gates when explicitly configured by the user/profile, available in the current catalog/dispatch surface, and not disabled.
   - If `oracle-high` is absent, unresolved, or disabled, do not run it and do not fail the review gate.
9. Do not hardcode or require provider/channel names in active guidance.
10. Update tests to cover built-in registration, default permissions, schema generation, primary review-lane selection, resolver behavior, Codex generation, and review guidance text.

## Architecture

### Agent catalog

Add `oracle-high` near `oracle` in `src/data/agents.ts`:

- `name: "oracle-high"`
- `promptSource: "reviewer"`
- no `defaultAlias`, so description-only config does not silently inherit `reviewer` and does not blur the explicit-configuration gate
- description: supplemental high-effort reviewer for configured multi-review final gates
- requirement: `variant: "max"` and a primary review fallback chain with max-capable entries where available, plus heterogeneous fallback entries consistent with the existing reviewer lane

### Routing and config

`oracle-high` becomes a valid agent name in `AGENT_NAMES` and receives read-only default permissions. Model upgrade routing maps it to the primary review lane so catalog upgrades align it with high-effort review rather than the `oracle` cross-check lane.

### Codex generation

Codex generation already iterates registered agents, so adding the built-in should produce `dw-oracle-high` automatically. The generator must additionally:

- preserve `max` reasoning for `oracle-high`;
- include `oracle-high` in reviewer/oracle effort-floor logic;
- list it in generated workflow guidance as an optional supplemental high-effort review lane;
- keep triple-review wording gated by explicit configuration, availability, and disabled state.

### Review skills

`skills/v1/requesting-code-review/SKILL.md` and `skills/v1/subagent-driven-development/SKILL.md` should describe `oracle-high` as optional. They should not instruct agents to run `oracle-high` merely because the built-in exists. The intended default remains two-reviewer complex gates unless user config/profile explicitly enables `oracle-high`.

## Data flow

1. Config loading registers built-in `oracle-high` unless `disabledAgents` disables it.
2. User/profile config may override `agents.oracle-high` to select a model/variant or disable it.
3. Routing resolves `oracle-high` through its built-in requirement or explicit override.
4. Codex generation emits `dw-oracle-high` from the registered agent list.
5. Review guidance uses `oracle-high` only when an explicit user/profile configuration exists, the current dispatch/catalog can resolve it, and it is not disabled.

## Error handling and fallbacks

- If `oracle-high` is disabled, omit it from optional multi-review.
- If `oracle-high` cannot be resolved in the current catalog/dispatch surface, omit it and continue with `oracle + reviewer`.
- If only one capable review model is available, keep the xhigh/max policy for the selected reviewer and do not force triple review.
- Do not fail ordinary review workflows because `oracle-high` is unavailable.

## Testing

Targeted tests must cover:

- config registration and default permissions for `oracle-high`;
- `disabledAgents` skipping `oracle-high`;
- catalog upgrade lane: `oracle-high` selects the configured primary review lane while `oracle` remains cross-check;
- resolver default behavior: `oracle-high` keeps the local max semantic on configured defaults and synthesized successors;
- Codex generation emits `dw-oracle-high`; GPT-like profiles without native max gate local max to `model_reasoning_effort = "xhigh"`, while max-capable configured profiles preserve native `max`;
- generated workflow and v1 skill guidance mention explicit configuration, availability, and not-disabled gating;
- schema regeneration includes `oracle-high`.

Run targeted tests first, then `pnpm run gen-schema`, `pnpm run gen:codex-plugin`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` with `OCMM_PROFILE` cleared in-process.

## Out of scope

- No automatic runtime dispatcher is added to inspect config and spawn three reviewers. This feature updates built-in capabilities and model-facing workflow guidance.
- No provider/channel-specific workflow requirement is introduced.
- No git commit is performed without explicit user authorization.

## Self-review

- Placeholder scan: no placeholders remain.
- Internal consistency: `oracle-high` is consistently supplemental, high-effort, review-only, and explicitly gated for triple-review.
- Scope check: this is one bounded feature spanning catalog, schema, generation, guidance, and tests.
- Ambiguity check: “configured” is explicitly defined as user/profile configuration plus availability and not disabled; built-in existence alone does not trigger triple-review.
