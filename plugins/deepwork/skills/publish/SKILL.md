---
name: publish
description: "Use only for an explicitly authorized ocmm release; incomplete until the fail-closed completion checker proves every required surface; never repair code or move an immutable tag during publishing."
---

# Publish ocmm

Use this skill only after the user explicitly authorizes an ocmm release action. Loading the skill does not authorize a version change, Git write, workflow trigger, package publish, or GitHub Release mutation.

## Completion contract

Workflow terminal success is not release completion. A release is complete only when `pnpm --silent run check:release-completion` returns exit `0` and its JSON receipt has `outcome: "COMPLETED"`.

The receipt must bind one lane, exact tag/version, peeled tag commit, fixed `release.yml` run and attempt, lane-correct job conclusions, exact non-empty Release assets, complete downloaded SHA-256 verification, npm visibility, and every lane-required additional surface. Main tag pushes require GitHub Packages proof. Main releases also require the pinned LSP Release to exist. LSP releases require all eight npm platform packages and skip main-only surfaces.

Never describe `FAILED`, `UNRESOLVED`, a nonterminal run, terminal workflow success without post-publication proof, or a partial surface set as complete.

## Ship-only behavior

- Do not start a code review, change code, repair a failed workflow, or open a fix loop while publishing.
- Do not use a workstation to overwrite registry packages or GitHub Release assets.
- Never move, delete, or recreate the immutable tag after publication starts.
- A repair is a separately authorized normal commit and new version/tag, or an explicitly authorized workflow rerun that preserves the same tag identity.
- Continue observing independent surfaces after one surface fails so the final report describes the full partial state.

## Required invocation

For a main tag push, run from the exact released checkout after the tag and matching run exist:

```powershell
pnpm --silent run check:release-completion -- --mode remote --repository hugefiver/ocmm --tag v0.6.6 --deadline-ms 5400000 --poll-ms 15000
```

Use the actual authorized tag for releases after `v0.6.6`. For a manually dispatched run, also pass its numeric `--run-id`; the run must itself be bound to the tag branch and peeled SHA.

No local `GITHUB_TOKEN` is needed to bump, tag, push, or trigger CI. It is optional authentication for GitHub Packages proof; the release workflow uses its own `${{ github.token }}`. If that proof cannot be obtained, the checker returns `UNRESOLVED` with exit `2`; this does not block the authorized tag or CI publication.

Do not echo the token. Do not paste registry bodies, Authorization headers, or signed asset URLs into chat or evidence.

## Outcome handling

### COMPLETED

Report the tag, peeled SHA, fixed run ID/attempt/URL, lane, exact asset names, package names/versions, and checksum status from the receipt. Only this outcome permits the phrase “release complete.”

### FAILED

Report every surface status and safe error code. State that the immutable tag remains fixed. Do not repair or republish inside the publish session.

### UNRESOLVED

Report every surface lacking proof, the retained tag/SHA/run-ID/run-attempt identity, and whether the cause is propagation, retryable HTTP/network state, deadline, missing token, or package-read permission. A later checker rerun may resume proof without changing the tag.

## Codex Compatibility

- When this skill mentions TodoWrite, use Codex `update_plan`.
- When this skill mentions OpenCode `task(...)`, preserve its task contract and use the current callable Codex dispatch route.
- When this skill mentions OpenCode-specific tool names, choose the nearest callable Codex tool with the same intent and preserve the workflow contract.

### Callable Dispatch Contract

The current callable dispatch-tool schema is the only authority. Examples are not feature proof; omit hidden fields.

Compatibility routing never relaxes role delegation permission, target allowlists, or workflow ownership. Only call `create_goal` when a user, system, or developer instruction explicitly requests runtime goal creation. Ordinary workflow, planning, delegation, or a `GOAL:` line does not qualify.

Use the first permitted route in this order:

1. **Exact profile** — use `agent_type`, `agent_path`, or `agent_nickname` only when the current callable schema explicitly guarantees it selects a generated `dw-*` profile.
2. **Direct composition** — use only when the current callable schema exposes every model field required by the role, the schema-exact `reasoning` or `reasoning_effort` field when the role requires reasoning, the role's full system/developer instructions, and all required skills. Report this route as composition, not exact-profile selection.
3. **V1/V2 generic or flat dispatch** — use the canonical envelope below. The child keeps its default or inherited runtime model unless the callable schema exposes and receives a valid explicit override.
4. **Local execution** — when delegation is permitted, use only when no callable native dispatch tool is available. When delegation is not permitted, preserve the role contract and its workflow owner rather than routing around that restriction.

For generic or flat dispatch, put this canonical envelope in the task message:

`GOAL:` State one imperative, bounded outcome, including the role, scope, constraints, and required work.
`STOP WHEN:` State the exact completion condition and non-goal boundary.
`EVIDENCE:` State the paths, commands, outputs, or observations that prove completion.

The generic envelope does not load a profile, select a model, attach a skill, or enable a missing feature.

When the planning logical-tier selector chooses the unsuffixed normal profile and the callable schema proves exact-profile selection is available, the V1 example is `multi_agent_v1.spawn_agent(agent_type="dw-plan-critic", message="Review the saved implementation plan and return one current-revision verdict.")`. V1 may send `model` only when the current callable schema exposes `model`. V1 may send exactly the schema-named `reasoning` or `reasoning_effort` field only when that exact field is exposed. If either field is hidden, omit it; never send both reasoning spellings. V1 may add `fork_context` only when the callable V1 schema exposes it and an explicit inheritance decision requires it.

V2-style flat dispatch uses `spawn_agent` to create, `wait_agent` to await, `followup_task` to continue, and `interrupt_agent` to stop. Use each flat tool only when it is present in the current callable schema and pass only parameters exposed by that tool's schema. No stable `multi_agent_v2` namespace is guaranteed. V2-style flat tools never receive `fork_context`. Never synthesize a namespace, copy parameters between tools, or add hidden parameters.

Only when the callable schema exposes `fork_turns` may the agent use `fork_turns: none` to request no context. If `fork_turns` is hidden, omit it. Other `fork_turns` values are only for explicit branch exploration.

`task_name` is an identity, not a profile selector. Do not pass `dw-*.toml` as a prompt, item, or skill attachment: generated TOML files are installation artifacts, not runtime skills.
