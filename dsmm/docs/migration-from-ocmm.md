# Migrating from ocmm to DSMM v1.0

DSMM is a DSH-native Cordis bundle, not an OpenCode compatibility layer; .opencode/ocmm.jsonc cannot be copied into DSH. This guide applies to the reviewed working tree before it is published. It records a deliberate migration boundary, not a parity claim or a promise that an OpenCode integration will appear in DSH.

## Hard boundary

An ocmm configuration combines OpenCode agents, hooks, commands, model routing, and package-release mechanics that DSH does not load. Start from a DSH profile and DSMM's documented settings instead of translating fields one by one. Headless configuration is file/profile-based; host commands execute separately where the DSH host exposes them.

The reviewed tree is not a published artifact: review its package contents and evidence before choosing a tarball, and do not treat a local checkout as a released surface. DSMM can coexist with ocmm because they use different hosts and configuration roots; coexistence does not make their sessions, hooks, or agent definitions interchangeable.

## Feature mapping

| ocmm area | DSMM v1.0 migration | State |
| --- | --- | --- |
| Deepwork gates | Preserve the design, approval, and verification discipline through DSH-native skill and mode boundaries rather than OpenCode runtime gates. | equivalent core intent |
| Seven workflow skills | Adapt the durable workflow intent into seven DSH-native skills without copying OpenCode-specific orchestration details. | equivalent core intent |
| Eight role presets | Use DSH agent configuration and optional preset materialization instead of inheriting ocmm role files. | redesigned for DSH |
| Model routing and DeepSeek calibration | Apply DSMM route-aware calibration through DSH's active provider and model capabilities. | redesigned for DSH |
| Safety guards | Enforce DSMM policy in the DSH tools pipeline, not through OpenCode hook names. | redesigned for DSH |
| LSP/MCP | Apply the opt-in DSH MCP patch and supply an `ocmm-lsp` executable only when the profile needs it. | optional/manual |
| Runtime fallback | Configure the process-local DSH request-error policy and explicit fallback routes when the host supports them. | redesigned for DSH |
| Idle continuation | Enable the separately capped DSH continuation policy only for the profile that needs it. | redesigned for DSH |
| Subagent interruption recovery | Investigate and deliberately resume known child sessions; DSMM has no automatic child or parent follow-up. | unavailable |
| Settings/status | Configure the `dsmm` namespace in DSH files and inspect the resolved state through DSMM status surfaces. | redesigned for DSH |
| Prompt/cache hooks | Do not migrate OpenCode prompt or cache hooks; DSMM supplies no equivalent hook surface. | unavailable |
| OpenCode commands/hooks | Do not copy OpenCode command or hook registrations into DSH. | unavailable |
| Model categories and Oracle tiers | Select available DSH agents and models deliberately rather than importing ocmm category or Oracle routing. | optional/manual |
| Codex marketplace | Install DSMM through its DSH package/profile path; no Codex marketplace equivalent is provided. | unavailable |
| Release surfaces | Use DSMM-local readiness checks and checklist evidence instead of the root ocmm release workflow. | redesigned for DSH |

The seven adapted skills are `brainstorming`, `writing-plans`, `subagent-driven-development`, `requesting-code-review`, `receiving-code-review`, `dispatching-parallel-agents`, and `remove-ai-slops`. They preserve workflow discipline, not OpenCode tool ownership or automatic agent orchestration.

For migration planning, the role set is `dsmm-orchestrator`, `dsmm-planner`, `dsmm-plan-critic`, `dsmm-reviewer`, `dsmm-code-search`, `dsmm-doc-search`, `dsmm-clarifier`, and `dsmm-media-reader`. Do not infer automatic availability from those names: only roles materialized by the installed DSMM package and exposed by the active DSH profile can be selected. At the reviewed source identity, `dsmm-oracle` is not a bundled DSMM preset; make it a separately reviewed DSH agent/model configuration if its function is required for cutover. Oracle/model-category behavior is configured through available DSH agents and models; it is not inherited from ocmm.

Subagent interruption recovery and OpenCode prompt/cache hooks are unavailable in DSMM v1.0. Release surfaces are local readiness/checklist evidence, not the root ocmm release lane.

## Migration sequence

1. Create an isolated `DSH_HOME` and a dedicated DSH profile so DSMM settings cannot affect an existing host profile.
2. Install the pinned headless DSH release with `dsmm@1.0.0`, or choose a reviewed tarball after checking its local release-readiness evidence.
3. Configure the provider and model through DSH, including any capability settings needed by the selected route.
4. Set `defaultActive: true` in the DSMM profile for automatic mode scope, or invoke the host command `/deepwork` where that host command is available.
5. Enable optional preset materialization, then add its managed directory as a DSH discovery root in the profile you control.
6. Apply the optional LSP MCP patch only when the profile requires LSP tools and has a usable `ocmm-lsp` command.
7. Inspect the resolved configuration with `/dsmm-status json` in a command-capable host or with `--dump-config` in headless DSH.
8. Retain ocmm until unavailable requirements have reviewed replacements and the DSH profile has independently passed its cutover evidence.

## Coexistence and cutover

Keep `.opencode/ocmm.jsonc` and its OpenCode runtime in place while the DSH profile is evaluated; it is neither input nor fallback configuration for DSMM. Validate model/provider setup, selected DSH agents, optional integrations, and unavailable requirements separately before changing a team's default workflow.

For headless use, make the profile configuration and `--dump-config` evidence authoritative. For a host with commands, execute `/deepwork` and `/dsmm-status` through that host adapter rather than placing command text in a headless task. Cut over only after the DSH-native flow satisfies the required behavior without relying on an unavailable ocmm surface.
