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

## LSP boundary for this version

DSMM-managed external LSP isn't enabled in this version and has no scheduled delivery here. The implementation, interfaces, original configuration and historical manual patch are retained, but `lsp.enabled:true` doesn't activate automatic MCP mounting and LSP controls are hidden in DSMM's settings UI. DSH's own LSP and independently configured MCP remain unaffected. Existing release checks still independently validate the retained LSP interface; they don't make automatic integration a delivered feature. See [LSP boundary](lsp.md).

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

## Planned directions: Adaptive invocation, Profiles, and child lifecycle

Status: **draft directions awaiting detailed planning.** Some underlying capabilities already exist; confirm each gap against the implementation and published package before defining work. These themes aren't the next npm version or a single release batch. The published package version `0.2.0` is separate from the older roadmap stage numbers, which remain unchanged.

### Goal and boundaries

Let a caller select suitable resources for one role invocation, make Profiles easier to understand, and support task-appropriate delegation and child interaction. This section records candidate goals, not approval to change behavior, public APIs or safety policy.

All directions preserve role identity, read-only, tool-filter, depth and permission boundaries, the root native model, immutable revisions and session admission authority. No role enumeration, schema fields or state machine is defined here. Future settings, tools, visible status, prompt guidance and documentation must agree on the eventual contract.

### Directions

#### Role invocation and routing

- Configure multiple resource levels for each eligible role and choose a level for one invocation without duplicating the role. Omission keeps the existing effective route. Whether that default is named `normal`, whether a level declares a complete route or a local effort override, and the override precedence remain to be defined.
- Show the level actually used in human-readable invocation status. Under either delegation layout, an explicitly authorized provider/model/`reasoningEffort` override applies only to that invocation: it doesn't persist, rewrite the role preset or change the root native model.
- Plan to remove `deepseekV4ProMaxReasoningPresets` and `deepseekFlashMaxReasoningPresets`, including their consuming paths. Old configurations need a clear diagnostic or an explicit migration; the choice is pending, and silent ignoring isn't acceptable.
- Keep resource level, adapter `reasoningEffort` and workflow process distinct. Retain the goal of reducing pointless process for small tasks, but a low resource level doesn't automatically cancel verification. Whether process needs a separate setting remains open.

#### Delegation-tool topology

Retain two candidate layouts: per-workflow-role tools plus one merged category-parameter tool, or two parameterized tools separating workflow roles from categories. This changes entry points, not the identity or permissions of the selected targets. Tool names, role/category classification and the default layout remain open.

Both layouts need clear invocation guidance matching the actual callable inventory and parameters, not guidance only for the split layout.

#### Locale

A global/profile language preference should apply consistently to visible planning and conversation from applicable DSMM roles. Define its inheritance path, supported values and precedence against the user's current language request; report unsupported values clearly. This preference isn't the host UI locale and doesn't change role identity, permissions or routing.

Prompt guidance may express an intended thinking language, but can't promise an unobservable internal reasoning language. Preserve code, identifiers, paths, commands, protocol names and quotations in their original form.

#### Profiles experience and policy

Distinguish the native deployment profile, a named Deepwork runtime profile and an agent role preset. These are conceptual labels, not new configuration fields. Here, "global default" means the named-profile default in the current runtime/deployment-entry scope, not deployment-wide `config.json` or a default shared by every native profile.

**Presentation.** User feedback describes controls and explanations as crowded, with existing status cues insufficient or scattered, not wholly absent. Make browsing, an unsaved draft and its saved revision, the global-default pin for future sessions, and the current session's admitted pin and epoch easy to distinguish. With no session, show current-session information as unavailable rather than guessing.

Saving isn't selecting the global default or explicitly applying to the current session. Explain these actions, including baseline/reset actions, and show why an action is disabled. Keep long explanations available on demand without hiding blocking reasons or the existence of warnings. Primary actions should remain reachable in a narrow panel. Preserve the native model catalog and Advanced JSONC capabilities without fixing a particular layout. Presentation changes alone don't change document format, storage, revisions, CAS or admission semantics.

**Agent availability.** Consider allowing a named runtime profile to disable optional agents and their DSMM-owned functionality, tools and delegation choices. Define the DW-required set before deciding which agents can't be disabled; report disallowed attempts explicitly. This policy can narrow, never exceed, deployment availability. It doesn't rewrite native deployment switches, affect other profiles or promise physical unloading of all inherited Host services. Make disabled-agent reasons visible.

Saving or changing the future-session default doesn't automatically change already-admitted sessions. Preserve explicit Apply as a capability governed by existing session authority; define its interaction with this policy rather than removing it or treating it as an implicit save effect.

**Diagnostics and tolerance.** Some load/save/apply diagnostics already exist. Improve their precision and availability at configuration surfaces: identify the specific field and reason, with sanitized output that doesn't expose secrets. Retain the user's goal of loading profiles with inconsequential problems as a candidate warning policy, with warnings continuously visible in profile state. Which problems qualify remains open; unknown fields and legacy fields aren't tolerated by default. Don't weaken permission, routing, version, revision or integrity rejection, silently ignore defects, or automatically rewrite the original file.

#### Background and child lifecycle

Retain four goals: model-chosen background delegation, user-requested foreground-to-background transition, reuse of an existing child, and messages to a running child. Some `run_in_background`, jobs, continuable-child and `send_message` foundations exist. Check what the published package actually exposes and where gaps remain instead of treating all four as missing.

Autonomous background choice must respect configuration limits and native ownership, capacity, depth and cancellation boundaries. Define continuable follow-up separately from revival of a terminated one-shot child or recovery across a cold restart; message delivery timing also needs confirmation. An existing child doesn't gain new permissions when its parent changes profile. These goals don't introduce an independent retry scheduler.

### Candidate acceptance

These are future acceptance targets, not claims of current delivery. Items with pending semantics become assessable only after those decisions are defined.

- **Levels, overrides and legacy fields:** configured levels select the effective model/effort for one invocation; omission preserves the existing route, and visible status names the actual level. Authorized overrides don't persist or alter the root native model. The two max-reasoning preset fields have no consuming paths after removal, and old configurations receive the agreed diagnostic or explicit migration. Resource selection alone doesn't waive verification.
- **Topology:** both candidate layouts can be selected, with invocation guidance matching their callable inventory and parameters. Entry-point changes preserve target role identity and permissions; exact names, classification and default require definition first.
- **Locale:** supported preferences follow the defined global/profile and current-request precedence consistently across applicable visible role output. Unsupported values are diagnosed; preserved literals aren't translated, and no internal-reasoning or host-UI-language guarantee is implied.
- **Profile UI states:** browsing, draft/saved revision, future-session default pin and current admitted pin/epoch are distinguishable. No-session state is explicit; save, default selection, Apply and baseline actions have clear effects and visible disabled reasons. Narrow panels retain usable controls, catalog and Advanced JSONC access, with blocking reasons and warning presence visible and existing storage/CAS/admission semantics intact.
- **Agent disabling:** once the required set and policy are defined, optional-agent disabling narrows admitted availability within deployment limits, with attributable disabled reasons. Required-agent rejection remains explicit. Saves/default changes don't mutate admitted sessions; explicit Apply follows existing authority and doesn't grant old children new permissions.
- **Diagnostics and tolerance:** field-specific, sanitized diagnostics are available where profiles are configured. Any approved inconsequential defect remains a visible warning while the profile is usable; undefined classes, including unknown or legacy fields, gain no implicit tolerance. Protected rejection and original files remain intact.
- **Child lifecycle:** verify all four goals through the published invocation surface: autonomous background choice, user foreground-to-background transition, existing-child reuse and running-child messaging. Defined continuation and delivery semantics respect ownership, capacity, depth, cancellation and permissions, without an independent retry scheduler.

### Pending decisions

- **Invocation contract:** eligible roles and level composition/default naming; full-route versus effort-only precedence; a separate process preference, if needed; diagnostic versus explicit migration for legacy fields; topology names, classification and default.
- **Language and Profiles policy:** locale values, inheritance and current-request precedence; the DW-required agent set and optional-agent disabling under explicit Apply authority; which inconsequential defects can receive persistent warnings without weakening protected rejection.
- **Child interaction:** published-package exposure and remaining gaps; autonomous background ownership/capacity/cancellation policy; foreground transition semantics; continuable reuse versus terminated or cold-restart recovery; message timing.

## v1.0 — Stable dsmm release

### Planned: abstract capabilities and Plugins management

**Planned, not implemented.** Introduce default, reusable capability policies and a Plugins management surface with global/profile/role-scoped enablement and tuning, rather than hard-coding another role-specific switch framework. The current role-sized native standard defaults are a bounded composition increment, not that management API or UI.

The design must bind each source baseline to an actually inspected version and frozen revision, distinguish Host services from role-owned rows and inherited native child composition, and retain fail-closed read-only/tool/delegation policy when new tools appear. DSH rc.2 is not claimed to provide preset `extends` or automatic standard inheritance. Saves should affect newly admitted roots, without remounting existing roots or rewriting their captured runtime services; any future profile policy must preserve the existing native model, caller-filter, immutable admission and module-off boundaries. No new schema, configuration controls or UI source implement these switches in this increment.

Status: the initial scoped package is `@dsmm/dsmm@0.1.0`; `0.1.1` adds native per-role model/effort policies and ordered role fallbacks. The v1.0 stable milestone remains future work and does not imply all OpenCode hooks or client surfaces are compatible.

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
