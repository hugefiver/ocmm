# Selective upstream synchronization and shared GPT guidance

## Required behavior

Project configuration must not expand, replace or clear the user-only `mcp.envAllowlist` through root config, inline profiles or supported directory profiles. Filter by trusted source before merge loses provenance. Preserve user-owned profile capability, winner/shadowing rules, supported Host differences, diagnostics and unrelated MCP fields. This is not an expansion of environment-variable access or Host support.

OpenCode and Codex share one concise generic GPT behavior layer, subordinate to the canonical role and permission contract. Runtime model-family recognition, native `max`, exact reasoning/variant translation, explicit overrides and review/critic floors remain independent. Shared behavior must not pretend that every GPT model has the same capabilities.

Ordinary GPT, recognized aliases and future recognized GPT models receive the same applicable behavior once. Codex carry-ahead is explicitly guarded for GPT runtime use; non-GPT overrides ignore it. Planner retains its role and planning layer before the shared calibration. Categories retain their own task shape and permissions, without generation-specific behavior. Claude orchestrator-only guidance, Gemini/GLM/default and Kimi/SWE additions retain their own boundaries. Future prompt-extension seams don't require speculative APIs or registries.

Guidance preserves complete user outcomes, operation-specific authorization, orchestrator-owned planning/criticism for complex product behavior, bounded routine exceptions, worker stopping boundaries and risk-scaled real-surface verification. Communicate at substantive phase transitions/blockers, not every tool call. Reuse passing evidence when changes don't affect its claim; missing, failed or stale evidence isn't a pass. Don't import fixed review counts, state tables, DAG/ledger machinery or ceremonial approval loops.

Source prompt assembly and generated Codex profiles must agree, respect explicit configuration and avoid duplicate calibration. Generated bundles are refreshed only through the owning generator in an isolated configuration environment. Runtime capability/model-selection tests protect their existing semantics; prose edits alone don't justify string/snapshot or environment locks.

## Model-default constraints

Default migration uses actual available GPT 6/6.1 routes, with 6.1 Sol at the corresponding supported effort and the highest configured tier on an existing Astra route. Preserve configured older 5.5/5.4 compatibility fallbacks and non-GPT entries ahead of GPT entries. Don't drop provider/entry identity, reorder unrelated fallbacks, downgrade existing Astra or rewrite explicit user overrides.

Future Astra selection requires a newer model actually present in the same provider/lane catalog, not a synthesized ID. Offline Codex generation isn't a release monitor or background config updater. Model changes require their own valid configuration and regeneration.

## Unresolved Host compatibility

Frozen tool-argument replacement remains blocked for the inspected OpenCode `1.18.34` contract, official commit `aec0b9a6d8898f68f923aaf08b7306d931fd9d76`: `packages/opencode/src/session/tools.ts` passes `{ args }` to the before hook but then executes the original `args`, without rereading replacement. Cloning a frozen object may prevent a hook exception without changing executed arguments, so it isn't a proven fix.

Any compatibility change must preserve mutable object identity when possible, frozen input immutability and nested label handling, while proving that redirected agent, URL and label values actually reach execution. Don't weaken guards or silently ignore failed writes. The reported mismatch between `rawInput.args` consumption and the actual before-hook argument entry also remains unresolved; no fix is claimed here.

Resume only with a supported Host execution contract or exact bounded implementation scope. Preserve existing permission/refusal behavior. Host protocol/API changes or expanded authority require explicit approval.

## Verification and configuration boundaries

Use real config-loader → handler → MCP construction checks with synthetic keys and no external requests to prove source trust. Verify actual prompt assembly and Codex generation, including planner/category order, single injection, explicit overrides and non-GPT guards. Frozen-argument acceptance additionally needs real Host execution evidence, not an output-object assertion.

Use existing tools with isolated `CODEX_HOME` and OpenCode XDG config/data/state/cache. No real installation or config mutation is authorized by this plan. A separately authorized Codex main-instruction update must take the complete generated orchestrator instructions, preserve unrelated TOML structure/settings and use a private non-overwriting recoverable backup. Config rollback and plugin-cache rollback are separate guarantees; preserving one doesn't prove the other.

Repository generation, installed cache refresh and a new Host process loading the instructions are separate evidence. Neither a successful plugin listing nor a version label proves refresh. Existing sessions aren't promised hot reload; child-profile callable availability needs its own current-schema evidence.

No Git write, release, software installation, user-profile change or cleanup of unowned resources is authorized by this document. Retain material unverified limits in the handoff, not machine paths, private installation state or development test logs.
