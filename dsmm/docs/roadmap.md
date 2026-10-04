# dsmm Roadmap

Date: 2026-08-21

## Version principles

- Each version must produce a working dsh-native increment.
- Deepwork remains opt-in through a dsmm-provided dsh custom mode unless the user explicitly enables auto-entry in settings.
- Configuration comes before breadth: every major feature must have an enable/disable or tuning surface.
- ocmm parity is phased after the MVP proves dsh package, mode, and settings mechanics.

## v0.1 — MVP custom mode bundle

### Goal

Create the smallest useful dsmm dsh bundle: installable, mode-scoped, configurable, and calibrated for DeepSeek V4 Pro when enabled.

### Deliverables

- `package.json` with `dsh.bundle.patch`.
- `cordis.patch.yml` that inserts dsmm rows without replacing dsh base behavior.
- Host plugin entry that registers dsmm settings and prompt/mode contributions.
- `deepwork` custom mode implementation, modelled on dsh plan-mode semantics because current public dsh docs expose `@deepseek-ai/dsh-plan-mode` rather than a generic arbitrary-mode package.
- `/deepwork [off|message]` command if the current dsh command service supports it; otherwise documented profile-level activation fallback.
- Minimal deepwork prompt text adapted from ocmm.
- Minimal skill set:
  - brainstorming
  - writing-plans
  - requesting-code-review
  - receiving-code-review
- Documented settings namespace.
- Docker smoke test instructions for installing into a disposable dsh profile.

### Acceptance

- `dsh plugin add ./dsmm` or packed equivalent activates the dsmm bundle in a disposable profile.
- A dsh session outside `deepwork` mode does not receive dsmm workflow instructions.
- A dsh session inside `deepwork` mode receives the dsmm workflow section.
- Switching the mode off restores ordinary dsh prompt behavior.
- Settings can disable DeepSeek V4 Pro calibration without removing the bundle.

## v0.2 — Role and agent preset parity

### Goal

Port ocmm's role model into dsh-native agent presets.

### Deliverables

- Orchestrator, planner, plan-critic, reviewer, doc-search, code-search, clarifier, and media-reader role prompts.
- Initial oracle/oracle-2nd mapping if the current dsh agent model supports external-model review lanes.
- Role-specific prompt scoping so dsmm mode does not leak into unrelated agents.
- Settings to enable or disable individual role presets.

### Acceptance

- A dsmm orchestrator session can route to planner/reviewer/search roles through dsh-native mechanisms.
- Disabled role presets are absent from model-facing choices.

## v0.3 — Workflow skill completeness

Status: completed in the v0.3 implementation. dsmm now bundles the full seven-skill workflow set and exposes mode-scoped workflow policy settings for strict gates, review caps, and final review routing.

### Goal

Bring the deepwork workflow to practical parity for planning and review flows.

### Deliverables

- Add remaining workflow skills:
  - subagent-driven-development
  - dispatching-parallel-agents
  - remove-ai-slops
- Skill provider layout compatible with dsh skill discovery.
- Skill settings for enabling strict gates, review caps, and final review policy.
- Prompt sync notes for maintaining ocmm/dsmm workflow text.

### Acceptance

- The mode can guide a user from brainstorm to plan to review using dsmm skills.
- A user can disable any non-core skill through settings.

## v0.4 — Safety and guard layer

Status: implemented in the v0.4 implementation. The guard layer is covered by settings defaults/overrides, guard decision tests, prompt asset tests, Docker smoke asset checks, and the Docker smoke script.

### Goal

Port the highest-value ocmm safety policies into dsh tool events.

### Deliverables

- Shell command safety for PowerShell and POSIX-like shells.
- Git write guard with explicit permission requirements.
- Tool-output truncation policy.
- Basic plan-format validation.
- Question-label and todo-discipline helpers if dsh exposes compatible surfaces.

### Acceptance

- Implemented guard behavior is scoped to dsmm mode or dsmm-managed agents by default, with `always` and `off` settings coverage.
- Every implemented guard has a settings toggle and documented `[dsmm safety]` failure message in `docs/safety-guards.md`.

## v0.5 — MCP and LSP integration

Status: implemented in v0.5 with disabled-by-default LSP settings, an opt-in `@deepseek-ai/dsh-mcp-client` patch for `ocmm-lsp mcp`, user documentation, direct MCP `tools/list`/diagnostics smoke coverage, and Docker dsh MCP bridge diagnostics smoke coverage.

### Goal

Expose ocmm's LSP value through dsh MCP mechanisms.

### Deliverables

- dsh MCP client configuration for `ocmm-lsp` or a renamed `dsmm-lsp` wrapper.
- LSP tool documentation for diagnostics, symbols, definitions, references, and rename.
- Docker smoke test that verifies the MCP server lists tools.

### Acceptance

- A disposable dsh profile can call at least one LSP diagnostic tool through MCP.
- Users can keep MCP/LSP disabled while using only dsmm mode prompts.

## v0.6 — Model routing and DeepSeek V4 Pro calibration

Status: implemented in v0.6 with provider-aware family classification, exact-route DeepSeek V4 Pro prompt/request calibration, preset-derived max reasoning, adapter capability negotiation, and pinned DSH `agent/request` waterfall coverage.

### Goal

Port ocmm's model-family routing and add dsh-native DeepSeek V4 Pro tuning.

### Deliverables

- Model-family classifier adapted from ocmm.
- Variant-to-reasoning policy for dsh `ctx.llm` or `agent/request` seams.
- DeepSeek V4 Pro settings:
  - calibration off/auto/strict
  - default reasoning effort
  - max reasoning trigger categories
  - tool-call reasoning retention checks where the dsh adapter exposes them
- Tests for routing decisions.

### Acceptance

- DeepSeek V4 Pro deepwork sessions default to high reasoning for complex work.
- Max reasoning is reserved for configured high-rigor task classes.
- Non-DeepSeek models do not receive DeepSeek-specific prompt overlays.

## v0.7 — Runtime recovery

Status: implemented in v0.7 with host-first request-error policy, bounded configured route fallback reconstructed from durable request headers, opt-in todo/goal continuation, documented subagent recovery boundaries, and pinned DSH rc.2 packaged-runtime coverage.

### Goal

Rebuild ocmm's runtime recovery features using dsh-native sessions and events.

### Deliverables

- Session error classification.
- Retry/fallback policy.
- Idle continuation policy for dsmm-managed tasks.
- Interrupted subagent recovery notes or implementation, depending on dsh event support.

### Acceptance

- Recovery events are durable or reconstructable from dsh session logs.
- Users can disable runtime recovery while keeping prompts and skills active.

## v0.8 — UI/settings polish

Status: implemented in v0.8 with a fixed `/dsmm-status [json]` host command, deterministic defensive status snapshots, normalized file-based settings documentation for Web/headless/future TUI use, and pinned DSH rc.2 packaged-command coverage.

### Goal

Expose dsmm settings ergonomically in dsh web-compatible surfaces while keeping headless support.

### Deliverables

- Optional client/settings panel if dsh client plugin APIs are stable.
- Human-readable mode status and active calibration indicators.
- Documentation for web/headless/TUI profiles.

### Acceptance

- Headless users can configure dsmm through files.
- Web users can inspect effective dsmm settings without editing YAML manually.

## v1.0 — Stable dsmm release

Status: initial package release selected as dsmm 0.1.0; the v1.0 stable milestone remains future work.

### Goal

Publish dsmm as a stable dsh plugin with documented compatibility and migration paths.

### Deliverables

- npm-ready package.
- dsh compatibility matrix.
- Docker integration checks.
- Migration guide from ocmm.
- Release checklist and rollback notes.

### Acceptance

- Fresh users can install dsmm into a new dsh profile and run deepwork mode from the documented steps.
- Existing ocmm users can understand which features are equivalent, redesigned, or unavailable.
- The release process does not require global dsh configuration mutation.
