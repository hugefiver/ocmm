# Deepwork Agent Prompt Simplification Design

## Goal

Make Deepwork functional-agent prompts shorter and role-centered, and allow subagents to accept concise, unambiguous assignments without requiring fixed prompt sections such as `TASK`, `MUST DO`, `MUST NOT DO`, and `EXPECTED OUTPUT`.

## Scope

- Keep `prompts/v1`, `prompts/omo`, and `prompts/codex` behavior aligned.
- Simplify the five functional-agent role prompts: orchestrator, planner, reviewer, clarifier, and plan-critic.
- Remove fixed delegation-envelope requirements from the model and category prompts that currently enforce them.
- Update prompt contract tests, prompt provenance documentation, and generated Codex artifacts.

No runtime permission, routing, agent registration, schema, or release behavior changes are included.

## Architecture

Prompt responsibilities remain layered:

1. Functional-agent prompts define only role purpose, role-specific decision rules, allowed work, required output, and handoff boundaries.
2. Deepwork/model prompts provide execution calibration that applies across roles.
3. The terminal policies assembled in `src/hooks/config.ts` remain authoritative for shell safety, compression, review-session lifecycle, and delegation permissions.
4. Category prompts describe their work shape and deliverable without prescribing a universal caller serialization format.

This uses the existing composition architecture rather than adding a shared-fragment loader.

## Functional-Agent Simplification

Across all three prompt workflows:

- Remove the repeated `<deepwork-agent-layer>` explanation.
- Remove generic tool-selection, shell, parallel-dispatch, verification, and scope boilerplate when an existing model or terminal layer already supplies it.
- Preserve role-specific invariants:
  - orchestrator owns routing, workflow-agent composition, profile/tier choice, and final integration;
  - planner produces executable plans and never implements by proxy;
  - reviewer validates an existing implementation diff and returns an unconditional verdict;
  - clarifier identifies intent, material ambiguity, risks, and planner directives;
  - plan-critic reads the current plan revision and owns its three-state receipt.
- Keep each role's permitted leaf lookup and prohibited nested workflow delegation concise and explicit.

## Flexible Delegation Input

A simple, unambiguous assignment may be a single imperative sentence. Labels and a fixed section order are never required.

Additional context is conditional:

- Add target files or scope when they are not obvious.
- Add constraints or non-goals when accidental scope expansion is plausible.
- Add completion conditions or requested evidence when the result cannot be checked directly from the assignment.
- Add tools only when a specific tool is required rather than merely available.

Complex or coordinated delegations must still be self-contained enough to execute safely. The parent continues to verify returned evidence and a child's completion condition continues to bound only that child assignment.

## Files and Synchronization

Primary sources:

- `prompts/{v1,omo,codex}/agents/*.md`
- `prompts/{v1,omo,codex}/deepwork/codex.md`
- `prompts/{v1,omo,codex}/deepwork/gpt-5.6.md`
- affected caller-contract files under `prompts/{v1,omo,codex}/category/`
- `src/intent/prompt-loader.test.ts`
- `docs/v1-maintenance.md`
- `docs/prompt-sync.md`

Generated Codex outputs are refreshed with the repository generator and are not edited by hand.

## Verification

Contract tests will assert that:

- functional-agent prompts retain their role-specific boundaries;
- fixed delegation labels are not required;
- prompts explicitly accept concise, unambiguous assignments;
- complex assignments still request only the context needed for safe execution;
- evidence verification and child-versus-parent stop boundaries remain intact;
- all workflow variants stay synchronized.

Run the targeted prompt-loader tests, regenerate Codex artifacts, then run `pnpm run typecheck`, `pnpm test`, and `pnpm run build`.

## Non-Goals

- No new prompt composition mechanism.
- No permission or agent-routing changes.
- No broad rewrite of model-family calibration unrelated to delegation input.
- No hand edits to generated plugin files.
- No Git commit without explicit user authorization.
