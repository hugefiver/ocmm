# Subagent Compression and Review-Session Efficiency Design

**Date:** 2026-07-19
**Status:** Revised and approved by delegated authority for planning; implementation not started

## Problem

When DCP exposes compression to subagents, a short-lived or fresh subagent can discard useful context and invalidate a warm prompt cache merely because the conversation is long. Compression can still be worthwhile when it removes enough closed context and the same session will continue for enough model turns, or when it is required to avoid exhausting the context window.

Review workflows have a related cost. Starting a fresh reviewer or plan-critic session for every correction inside one review stage repeatedly pays the cold-start cost for the same role prompt, tool schema, plan, diff, and evidence. Reusing a session across different stages has the opposite risk: stale goals and evidence leak into a new phase. ocmm can improve both behaviors through model-facing policy: constrain when managed subagents use `compress`, tell the orchestrator to continue the same review session only inside one stage, start fresh at stage boundaries, and prevent redundant review fan-out.

ocmm has no reliable runtime signal for “DCP is installed and subagent compression is enabled.” It also does not own OpenCode/provider cache keys, explicit cache breakpoints, cache billing, or runtime session storage. The model can observe whether the current subagent session exposes a `compress` tool, can react to trustworthy context-capacity signals, and can reuse a returned `task_id` through the existing task interface.

## Evidence and Economic Guardrails

The seven-day local GPT-5.6 snapshot used to revise this design contained 116 completed compression transitions; 109 reduced the following prompt size. Under the GPT-5.6 official pricing ratios—cached input at 0.1 times uncached input, cache writes at 1.25 times uncached input, and output at 6 times uncached input—the model is:

`first-call delta = 1.15 × reprocessed surviving input + 6 × incremental summary output - 0.1 × removed context`

Each later call in the same compressed session saves approximately `0.1 × removed context` input-equivalent tokens while that removed range would otherwise remain part of the cached prefix.

Observed results are decision evidence, not product guarantees:

- Across all shrinking transitions, about 70% recovered their estimated compression cost before the next compression or session end.
- For transitions beginning at or above 130k tokens, the median estimated break-even was about three later calls and the 75th percentile was about eleven calls.
- For transitions beginning at or above 130k tokens and removing at least 50k tokens, about 85% recovered their estimated cost; median break-even was about two later calls, the 75th percentile was about ten calls, and the observed median continuation was 26 calls.
- A stage-ending compression with no later call cannot recover its summary and cache-repopulation cost.

The local APai usage data reports zero `cache_write_tokens`, so the monetary values cannot be treated as an invoice. The ratios above deliberately use the stricter official GPT-5.6 write rate. The policy therefore uses 130k current context, 50k removable closed context, and ten expected later model turns only as conservative proactive-compression guardrails when trustworthy estimates exist. It does not fabricate measurements when the runtime exposes none.

## Goals

- Guide ocmm-managed subagents to avoid unnecessary compression and cache invalidation.
- Permit minimal emergency compression when the next bounded task demonstrably cannot fit.
- Recommend compressing a fully completed exploration batch when it introduced more than 100k tokens of source material into context, its findings are materialized, and the same subagent will continue into a subsequent work phase within the same assignment.
- Permit an additional proactive path for other closed reviewer/Oracle material only in explicitly continued same-stage sessions and only when conservative economic guardrails are met.
- Tell the orchestrator to reuse the same reviewer or plan-critic `task_id` for corrections inside one review stage, start a fresh session across stages, and avoid redundant review fan-out.
- Require continuation payloads to identify the current authoritative artifact and the files or plan sections changed since the previous pass so the reviewer can focus without repeating broad exploration.
- Apply the policies to v1, omo, and generated Codex agents across model families through one deterministic prompt-assembly source.
- Preserve existing user prompt overrides, delegation authority, generated-output safety, and unrelated working-tree changes.

## Non-Goals

- Detecting DCP or introducing DCP-specific configuration.
- Adding a compression permission hook or blocking tool calls at runtime.
- Changing OpenCode/provider `prompt_cache_key`, explicit cache breakpoints, cache retention, billing, or cache telemetry.
- Reordering global prompt prefixes or changing tool schemas to improve provider-side cache matching.
- Building a session pool, retry controller, or runtime mechanism that forces `task_id` reuse.
- Guaranteeing a cache-hit rate, monetary saving, latency improvement, or model compliance with prompt guidance.
- Changing primary-agent compression behavior, arbitrary user-defined agents, or review selection rules already owned by requesting-code-review.

## Chosen Approach

Add two dedicated tagged policy blocks in the shared agent prompt assembly path in `src/hooks/config.ts`:

1. `<ocmm-subagent-compression-policy>` goes to every ocmm-managed profile that can execute as a subagent, including planner, expanded review profiles, categories, and supported compatibility aliases. Primary-only `orchestrator` and `builder` remain excluded.
2. `<ocmm-review-session-efficiency-policy>` goes only to the orchestrator, which owns reviewer, Oracle, and plan-critic workflow composition. It tells the caller to continue the same `task_id` only while correcting and rechecking one stage's artifact, pass a changed-file/section manifest on continuation, and create a fresh session whenever the workflow crosses a stage boundary.

Both blocks are static and deterministic. They contain no timestamp, session ID, current token count, or other request-specific content. They sit before the existing authoritative delegation contract where one exists.

### Alternatives Rejected

1. **Copy rules into workflow/model prompts and skills.** This duplicates policy across v1, omo, and Codex, can miss categories, and requires several maintenance-document sync surfaces.
2. **Add DCP configuration or runtime plugin detection.** No reliable detection contract exists, and this would turn a model-facing policy into external-plugin integration.
3. **Implement provider cache keys, breakpoints, or telemetry.** These are not controlled by the requested ocmm behavior layer and are explicitly excluded.
4. **Create an ocmm session manager.** Existing `task_id` continuation is sufficient for guidance; runtime enforcement is a separate subsystem.
5. **Place the rules only in GPT-5.6 calibration.** The behavior applies to every managed subagent and model family.

## Architecture

### Prompt assembly

`createConfigHandler()` already classifies built-in agents as `primary`, `all`, or `subagent`, expands reviewer/Oracle profiles, registers categories and compatibility aliases, and appends an authoritative delegation contract. The implementation will extend this boundary with:

- tagged-block cleanup that removes only ocmm-owned terminal policies before re-appending current versions;
- a compression formatter with common emergency rules plus a review-only proactive exception selected through `isReviewAgentName(name)`;
- an orchestrator-only review-session formatter;
- one terminal-suffix composer that preserves delegation-contract terminality;
- deterministic ordering: compression policy, review-session efficiency policy, then delegation contract.

`planner` can run as `mode: "all"`; its compression block self-gates to subagent execution and is inert when planner is primary. Custom agents remain untouched because ocmm does not know their lifecycle or reentrancy contract. `builder` receives neither block because formal review composition is orchestrator-owned.

### Generated Codex profiles

`src/codex/plugin-generator.ts` builds profiles through `createConfigHandler()`. Generated `.codex/agents/dw-*.toml` and `plugins/deepwork/agents/dw-*.toml` files therefore inherit the same policies without a Codex-specific copy:

- 20 subagent-capable profiles receive one compression block;
- `dw-orchestrator.toml` receives one review-session efficiency block and no compression block;
- `dw-builder.toml` receives neither block.

Generated files remain outputs, not independent policy sources. Regeneration must occur only after source tests pass and after a temp-root candidate proves that all deltas are expected.

## Policy Semantics

### Common rule for every managed subagent

- Apply the policy only when the current execution is a subagent session and `compress` is available.
- If `compress` is unavailable, do not propose, simulate, or attempt compression.
- A long conversation, high message count, single large result, or stage boundary alone is not enough.
- When no trustworthy capacity signal or size estimate exists, do not compress proactively.
- Emergency compression is allowed when an explicit capacity warning, context-budget signal, or concrete evidence shows that the next bounded task cannot fit. It must remove only the smallest closed range needed to continue safely.
- Preserve the task goal, constraints, current state, pending work, decisions, paths, interfaces, and necessary evidence.
- Never compress the active phase, unresolved errors, or source material still needed for exact quotation or verification.

Emergency continuation does not need to satisfy an economic threshold: avoiding context exhaustion is the higher-order requirement.

### Completed large-exploration recommendation

Any managed subagent may proactively compress one completed exploration/read/search batch when all conditions hold:

1. `compress` is available.
2. The exploration is completely finished; no file, search branch, or evidence question from that batch remains open.
3. A trustworthy estimate shows that the completed exploration introduced more than 100k tokens of source material into the current context.
4. Required findings, paths, decisions, constraints, and exact evidence that must survive have been materialized in the response or a durable note.
5. The selected raw exploration range is closed and no longer needed verbatim.
6. The same subagent will continue into a subsequent synthesis, planning, implementation, or review phase within the same assignment. If exploration completes the assignment and the subagent will return immediately, do not compress.

This is a recommendation, not a mandatory tool call. If the token estimate is unavailable, do not invent it. Never compress during an active exploration, even if cumulative reads appear large.

### Additional continued reviewer and Oracle proactive exception

Reviewer and Oracle identities retain both common paths above: emergency compression and the completed >100k exploration recommendation. Those common paths apply even to a fresh review session when their own conditions are met. The rule below is an additional path for other closed review material; it applies only to identities recognized by `isReviewAgentName()`, including reviewer tiers and ordered Oracle slots/tier variants. It does not apply to planner, plan-critic, clarifier, code-search, implementation agents, or categories merely because their sessions are technically resumable.

A review agent may proactively compress other closed review material before imminent exhaustion only when every condition holds:

1. The caller explicitly continued the same review session inside the current review stage rather than starting a fresh consultation or crossing a stage boundary.
2. A substantial phase has closed, such as a large read/search batch whose findings are recorded or a review pass with stable conclusions.
3. Those conclusions have been materialized in a response or durable note.
4. The selected range is closed and no longer needed verbatim by the active review.
5. The same session is expected to continue; a stage-ending compression with no expected follow-up is forbidden.
6. Trustworthy estimates indicate approximately 130k or more current context, at least 50k removable closed context, and either a real capacity signal or about ten additional model turns expected.

If any estimate is unavailable, the agent must not invent it; only this additional reviewer/Oracle path is unavailable. The common emergency and completed >100k exploration paths remain independently available. A single completed tool call is not a phase boundary.

### Orchestrator review-session efficiency

- A **review stage** is one role, one authoritative artifact or decision target, and one review objective from initial dispatch through corrections until that stage receives approval/receipt, is abandoned, or hands off to another workflow phase.
- Continue the same reviewer or plan-critic `task_id` for corrections and rechecks inside that stage. A plan-critic rejection followed by a corrected version of the same plan remains the same stage; reviewer findings followed by fixes to the same implementation review also remain the same stage.
- Start a fresh session at every stage boundary. Examples include design review to plan review, plan-critic approval to implementation, implementation to final acceptance, or any change of role, artifact, or review objective.
- Also start fresh when prior context is unavailable or invalid for the current target, continuation fails, or intentionally independent evidence is required.
- Do not fan out additional reviewers merely because profiles or tiers are configured. Existing reviewer-selection rules remain authoritative.
- On continuation, supply the current authoritative artifact path/revision, the files changed since the previous pass, changed plan sections when applicable, and new or updated evidence. This focus manifest avoids repeated broad exploration but never excuses the reviewer or plan-critic from reading the current authoritative artifact required for its verdict.
- Do not paste the whole accumulated conversation when the current artifact plus change manifest and evidence are sufficient.

This is prompt guidance, not runtime enforcement. A timeout, partial response, stale-revision receipt, or failed continuation remains non-approval.

## Data Flow

1. `loadAllPrompts()` loads the selected workflow’s role and model prompts.
2. `createConfigHandler()` composes role prompts, model calibration, and deterministic terminal policy blocks.
3. The agent identity selects no policy, compression-only, or orchestrator review-session guidance.
4. OpenCode receives the composed prompt directly.
5. `buildCodexAgents()` consumes the same composed prompt and emits Codex profiles.
6. At execution time, a managed subagent applies compression guidance only when `compress` exists; the orchestrator applies review continuation guidance through existing `task(task_id=...)` support.

## Error Handling and Edge Cases

- **No DCP or no compression capability:** the capability gate makes compression guidance inert.
- **Unknown tool provider:** policy refers only to observable `compress` availability and never claims DCP detection.
- **No trustworthy token estimate:** numeric proactive guardrails are not evaluated; emergency-only behavior remains.
- **Completed exploration above 100k source tokens:** compress only the closed raw batch after findings are materialized and only if the same subagent continues into another work phase within the same assignment.
- **Exploration is still active or the subagent will return immediately:** do not use the large-exploration recommendation.
- **Planner used as primary:** the subagent-session gate prevents compression guidance from altering primary behavior.
- **Fresh reviewer consultation:** the common emergency and completed >100k exploration paths apply; the additional continued-review path does not.
- **Reviewer phase ends with no planned continuation:** do not perform proactive/economic compression. Minimal emergency compression remains allowed only when it is required to finish the final bounded task before returning.
- **Same-stage target corrected:** orchestrator resumes the existing `task_id` and supplies the current revision plus changed-file/section manifest.
- **Stage boundary, changed role/artifact/objective, or independent evidence request:** start a fresh session.
- **Repeated config assembly:** owned-block cleanup and re-append leave exactly one current copy of each applicable block.
- **Existing host prompt:** preserve host content and remove only ocmm-owned tagged blocks.
- **Compatibility aliases:** derive compression behavior from effective managed identity without granting the review exception to unrelated aliases.
- **Dirty generated tree:** compare candidate and repository outputs before writing; stop on unexpected differences.

## Testing Strategy

### Config prompt tests

Extend `src/hooks/config.test.ts` to verify:

- `orchestrator`, `builder`, and custom agents have no compression block.
- only `orchestrator` has one review-session efficiency block; builder and subagents do not.
- ordinary subagents receive the common emergency semantics and no reviewer/Oracle-only exception.
- ordinary subagents receive the completed-exploration recommendation with a strict greater-than-100k, fully-finished, materialized, continuing-session gate.
- reviewer and Oracle profiles retain the common >100k exploration path and also receive the six-condition additional proactive exception, including no-follow-up prohibition and conservative guardrails.
- planner receives compression guidance with an explicit subagent-session gate.
- orchestrator guidance requires same-`task_id` continuation inside a stage, fresh sessions across stages, a changed-file/section manifest, and restricted fan-out.
- existing host prompts are preserved and repeated handler execution is idempotent.
- policy text is deterministic and contains no session-specific values.

Extend `src/hooks/config.category.test.ts` to prove every built-in category receives one common compression block and no review-session or reviewer exception block.

### Codex generation tests

Extend `src/codex/plugin-generator.test.ts` to verify both in-memory and emitted profiles:

- ordinary subagents contain one common compression block;
- reviewer/Oracle profiles contain the proactive exception;
- orchestrator contains one review-session efficiency block and no compression block;
- builder contains neither block;
- existing delegation-contract assertions remain valid.

### Verification commands

- Run targeted Node tests for config assembly and Codex generation.
- Run `pnpm run typecheck`.
- Run `pnpm test`.
- Run `pnpm run build`.
- Generate a complete Codex candidate outside the repository, prove it differs only by expected tagged blocks, then regenerate the real outputs.
- Inspect representative OpenCode and generated Codex prompts as the real configuration surface.

## Acceptance Criteria

1. A fresh ordinary subagent with long context but no exhaustion signal or completed >100k exploration is told not to compress.
2. Any managed subagent with real capacity evidence may perform only minimal emergency compression.
3. Any managed subagent is advised to compress a closed exploration batch only after reliable source volume exceeds 100k tokens, exploration is fully complete, findings are materialized, and another phase will follow in the same session.
4. The additional reviewer/Oracle path for other closed review material requires same-stage continuation, a closed and materialized phase, planned follow-up, and trustworthy conservative size/turn estimates; it does not remove either common path.
5. A review stage with no expected later call is explicitly forbidden from compressing for economic reasons.
6. The orchestrator is told to reuse the same reviewer or plan-critic `task_id` for corrections inside one review stage and to include the current artifact plus changed-file/section manifest.
7. Crossing a stage boundary always starts a fresh session; unavailable/failed continuation and intentional independent evidence also permit a fresh session.
8. No prompt claims to detect DCP, fabricates unavailable measurements, or guarantees cache savings.
9. v1, omo, and Codex obtain both policies from one shared deterministic assembly source across model families.
10. Prompt assembly is idempotent, generated profiles stay synchronized, and unrelated working-tree changes remain intact.
11. No provider cache, explicit breakpoint, telemetry, schema, tool-schema, or runtime session-controller work is introduced.

## Repository Safety

The working tree contains extensive unrelated modifications, including config assembly, generated Codex profiles, routing, schema, and tests. Implementation must use targeted patches against the current files, must not reset or checkout user work, and must inspect the exact pre-existing diff before regenerating outputs. This design revision authorizes only requirement and plan updates; product implementation and Git writes remain unstarted and require a later explicit instruction.
