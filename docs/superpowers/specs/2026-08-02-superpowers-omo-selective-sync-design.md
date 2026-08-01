# Superpowers and OMO Selective Sync Design

**Date:** 2026-08-02
**Status:** Approved through explicit user delegation and self-review

## Goal

Selectively adapt the current Superpowers v6.2.0 and OMO updates that improve
ocmm without weakening its lightweight workflow, explicit authorization,
host-native boundaries, PowerShell safety, or identity-bound final review.

## Scope

1. Sync low-risk Superpowers v6.2.0 prose reductions into five v1 skills while
   preserving every local workflow adjustment.
2. Clarify subagent correction continuity, scoped rechecks, and bounded
   no-progress handling without restoring routine per-task reviewer loops.
3. Add falsifiable behavioral-test guidance to the implementer contract.
4. Expand runtime-fallback default retry patterns with bounded provider,
   textual status, and Chinese transient-failure cases.
5. Add lightweight bounded-excursion guidance to the research category in omo,
   v1, and Codex.
6. Record the plan-gate compatibility decision: do not add a strict runtime
   gate that requires an explicit user plan request or a touched plan artifact.
7. Remove the local `GITHUB_TOKEN` preflight from the release workflow guidance
   so an authorized version bump, tag push, and CI publication do not depend on
   a workstation credential.

## Non-goals

- No SDD workspace, progress ledger, workspace cleanup script, automatic
  worktree, or subagent Git write.
- No routine spec-reviewer or code-quality-reviewer pass after each subtask.
- No fixed model-escalation ladder copied from upstream.
- No runtime plan-state tracker or Senpi-specific plan artifact semantics.
- No OMO status-event retry feature; the existing `session.error` path remains
  authoritative.
- No data-scientist skill, Luna/DeepSeek model-chain change, Senpi task manager,
  task status UI, cost/TPS metrics, team lifecycle, or synthetic completion
  notification.
- No mandatory research journal, ledger, team, PDF, DOCX, chart, or new tool.
- No weakening of immutable-tag, no-in-place-repair, or truthful completion
  reporting. A main tag push without GitHub Packages proof remains
  `UNRESOLVED`, not complete.

## Chosen Architecture

### Superpowers v6.2.0 prose sync

The source files under `skills/v1/` remain local forks rather than byte-for-byte
upstream copies.

- `brainstorming`: move the unique YAGNI instruction into approach exploration
  and remove the repeated final principles recap.
- `writing-plans`: remove the repeated `Remember` recap.
- `dispatching-parallel-agents`: remove sales-oriented benefit, impact, and
  time-saved sections while retaining integration and final-review rules.
- `receiving-code-review`: remove the repeated final summary.
- `requesting-code-review`: update provenance and keep the concise focused-input
  rationale without replacing the local canonical identity and receipt system.

`docs/v1-maintenance.md` records v6.2.0 as the upstream baseline and explicitly
lists retained local adaptations. Generated Codex skill copies are refreshed
only through the official generator.

### SDD correction continuity

The same implementer `task_id` is continued while correcting the same task,
goal, and implementation artifact. A new implementation session is used when
the task or goal changes, prior context is unavailable or stale, or the
controller intentionally needs an independent approach.

Completion checks and exceptional early implementation reviews recheck only
the affected blocker, touched files, and changed evidence. Final acceptance
continues selected reviewer task IDs within the same review stage but always
uses a newly calculated artifact identity after changed input.

Correction loops are progress-bounded rather than tied to a mechanical model
ladder. If two correction rounds produce the same blocker or no
decision-relevant progress, the orchestrator must adjudicate the cause before
another dispatch. Five correction rounds for one task or review stage is a hard
ceiling; reaching it stops automatic retries and requires an explicit
controller decision. This ceiling never authorizes acceptance with open
blockers.

### Falsifiable tests

The implementer self-review and SDD TDD guidance require tests to identify an
observable input, action, and output, and to state which plausible production
change would make the test fail. Expected values must not be derived from the
implementation under test. For high-risk or subtle behavior, the implementer
performs a lightweight mutation check by temporarily making the named behavior
wrong and proving the test fails, then restoring the implementation.

String, marker, inventory, and generated-file assertions remain valid structural
contract tests. They cannot be the only evidence for runtime or workflow
behavior when an observable behavioral surface exists.

### Runtime-fallback patterns

`retryOnPatterns` remains the public configuration mechanism and retains
replacement semantics for explicit user arrays. Only the default array changes.
The default list gains bounded patterns for:

- request pressure and usage limits;
- capacity exhaustion and credential cooling;
- unsupported or transiently unavailable models/providers;
- standalone textual HTTP `429`, `503`, and `529` signals;
- common Chinese rate-limit and temporary-unavailability messages.

Patterns deliberately avoid generic terms such as bare `quota`, `unavailable`,
`credit`, `balance`, `timeout`, or `connection error` because those would create
unacceptable false positives. Usage-limit matching requires explicit exhaustion,
exceeded, or reached wording. Retry instructions match bounded transient phrases
such as `try again later`, `try again shortly`, or a numeric retry interval rather
than bare `try again`. Runtime classification continues through the existing
`classifyError()` function; no second classifier is introduced.

### Bounded research

The three research category prompts gain one aligned conditional section.
For complex research only, the worker states the branch question, chooses a
small evidence or time budget, defines an exit condition, and folds useful
findings back into the caller's main question. Repeated excursions that add no
decision-relevant evidence stop. The final answer may include concise source,
check, or unresolved-gap counts when useful.

The existing global Answer-When-Answerable rule remains authoritative. Ordinary
answerable questions do not acquire research ceremony or persistence.

### Optional local GitHub token for release proof

Publishing a new version is driven by an explicitly authorized Git commit/tag
push and the release workflow. npmjs.org uses Trusted Publishing, while GitHub
Packages uses the workflow-provided `github.token`; neither requires a local
`GITHUB_TOKEN`.

The publish skill, README, and repository release instructions therefore invoke
`check:release-completion` directly without throwing when the environment token
is absent. The checker already performs public GitHub, Release asset, checksum,
npm, and pinned-LSP checks without authentication. If a local token is present,
it remains an optional authenticated proof input and keeps its existing origin
scoping and redaction guarantees.

For a main tag push without a token, GitHub Packages remains unproven and the
checker returns `UNRESOLVED` with exit `2`; this does not block the tag or CI
publication and must not be described as release completion. LSP releases and
manually dispatched main runs retain their existing non-applicable/skip
semantics and may complete without a local token when every applicable surface
passes.

## Plan-Gate Compatibility Decision

A strict OMO-style runtime gate is rejected because ocmm intentionally supports:

- planner selection after discovery based on complexity rather than explicit
  plan wording;
- inline and lightweight plans without a file artifact;
- clarifier use before planning;
- brainstorming self-review and delegated approval;
- plan-critic review of inline or existing plans;
- explicit no-plan and direct-implementation paths.

Requiring both an explicit user plan request and a newly touched artifact would
falsely block these workflows. Existing prompt-level stage selection,
plan-critic current-revision receipts, Task permissions, and depth guards remain
independent and unchanged.

## Error Handling and Safety

- Invalid user regexes retain the existing skip behavior.
- User-provided retry arrays continue replacing defaults rather than being
  silently merged.
- Missing `GITHUB_TOKEN` is not a publishing precondition. It remains a safe,
  optional checker input and is never echoed or serialized.
- Research budgets are qualitative prompt guidance, not a runtime timer.
- No ad hoc destructive cleanup command is added. The official Codex generator
  is the only recursive-reset exception: before it runs, its exact generated
  roots are inspected; its existing `resetGeneratedDir()` containment check
  rejects targets outside the expected project/plugin roots. No deletion target
  is supplied through a shell variable.
- No command may use `$home` or a case variant as a custom PowerShell variable.

## Test Strategy

1. Prompt/skill contract tests verify preserved local gates plus the new SDD and
   falsifiable-test guidance.
2. Runtime-fallback tests cover each positive semantic class, Chinese messages,
   bounded textual status matching, false-positive negatives, and user override
   behavior.
3. Config tests lock the canonical default retry-pattern array.
4. Research prompt tests load omo, v1, and Codex and verify aligned bounded
   research semantics.
5. The official Codex generator refreshes tracked skill and research-agent
   copies; generator tests verify source/generated parity.
6. Release CLI tests prove no-token remote checking still runs, while existing
   registry tests preserve `UNRESOLVED` for unproven GitHub Packages and token
   scoping/redaction when a token is available.
7. Repository gates are focused tests, `pnpm run gen-schema` determinism,
   `pnpm run gen:codex-plugin`, `pnpm run typecheck`, `pnpm test`,
   `pnpm run build`, and `git diff --check`.

## Acceptance Criteria

1. The five v1 skills reflect the selected v6.2.0 reductions without losing any
   ocmm-specific approval, planning, review, Git, or integration contract.
2. SDD corrections continue the same task only within the same stage and stop
   automatic retries after repeated no-progress or the hard ceiling.
3. Test guidance distinguishes behavioral falsifiability from legitimate
   structural contract assertions.
4. Default runtime fallback recognizes the approved transient-provider cases
   without matching the specified negative cases; explicit user patterns keep
   replacement semantics.
5. Research prompts across all three workflows share the bounded-excursion
   behavior and retain Answer-When-Answerable.
6. No strict runtime plan gate or excluded OMO subsystem is introduced.
7. Authorized version/tag publication no longer requires a local
   `GITHUB_TOKEN`; missing authenticated GitHub Packages proof remains an
   explicit `UNRESOLVED` completion result.
8. Maintenance docs, generated Codex artifacts, focused tests, typecheck, full
   tests, build, and final identity-bound review all pass.
