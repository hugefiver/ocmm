# Migrating from ocmm to DSMM v1.0

DSMM is a DSH-native Cordis bundle, not an OpenCode compatibility layer; .opencode/ocmm.jsonc cannot be copied into DSH. This guide describes the updated, unpublished working tree targeting DSH 0.2.0-rc.2, not a full host-feature parity claim.

## Hard boundary

Model selection, authentication, permissions, session ownership, and package loading remain DSH-native. Existing ocmm/OpenCode configuration and sessions can coexist, but do not become DSMM configuration or fallback sessions.

## Feature mapping

| ocmm area | DSMM migration | State |
| --- | --- | --- |
| Deepwork gates | Risk-scaled discovery; authorized bounded implementation proceeds; complex behavior uses planner → critic → implementation; completion requires relevant evidence. | equivalent core intent |
| Seven workflow skills | Current workflow intent adapted to native DSH tools, scopes, authorization, and review ownership. | equivalent core intent |
| Twelve role presets | Native definitions plus role-specific delegation composition, including builder, creative, reviewer, oracle, and oracle-2nd. | redesigned for DSH |
| Model routing and DeepSeek calibration | Exact native V41 Flash routes and preserved V4 Pro configuration, adapter-advertised effort only. | redesigned for DSH |
| Safety guards | Native pre/post tool policies; host approval/cancellation remain authoritative. | redesigned for DSH |
| LSP/MCP | Optional external ocmm-lsp with nine tools including atomic format; debugging/DAP is a separate on-demand skill. | optional/manual |
| Runtime fallback | Host-first, opt-in, explicitly configured routes with cancellation, duplicate, and step fences. | redesigned for DSH |
| Idle continuation | Separately enabled, bounded steering from durable unfinished work. | redesigned for DSH |
| Subagent interruption recovery | Native durable child/session control and explicit continuation; no guessed task IDs, synthesized parent messages, or independent automatic retry dispatcher. | redesigned for DSH |
| Settings/status | Restart-scoped Loader plugin config and normalized read-only status; old settings namespaces need explicit migration. | redesigned for DSH |
| Prompt/cache hooks | No OpenCode history mutation or cache-hook compatibility layer. | unavailable |
| OpenCode commands/hooks | Native equivalents only; OpenCode registrations cannot be copied. | unavailable |
| Model categories and Oracle tiers | User-controlled native agent/model composition; normal roles have no suffix and tier routes require explicit configuration. | optional/manual |
| Codex marketplace | DSH plugin/profile loading, not Codex marketplace installation. | unavailable |
| Release surfaces | Local packed-readiness checks; no root ocmm release authority. | redesigned for DSH |

The seven core skills are `brainstorming`, `writing-plans`, `subagent-driven-development`, `requesting-code-review`, `receiving-code-review`, `dispatching-parallel-agents`, and `remove-ai-slops`. Debugging is available on demand, without injecting its full references into every prompt.

The role set includes `dsmm-orchestrator`, `dsmm-planner`, `dsmm-plan-critic`, `dsmm-reviewer`, `dsmm-code-search`, `dsmm-doc-search`, `dsmm-clarifier`, `dsmm-media-reader`, `dsmm-builder`, `dsmm-oracle`, `dsmm-oracle-2nd`, and `dsmm-creative`. File existence is not callable evidence. Check the active native preset and tool inventories. Reviewer is primary-lane self-review; Oracle is an external-model cross-check only when the actual user-selected route differs. Running all roles with Flash does not prove model heterogeneity.

## Migration sequence

1. Use an isolated `DSH_HOME` and a dedicated profile built from the pinned DSH 0.2.0-rc.2 headless template.
2. Install a locally packed reviewed DSMM artifact; registry publication remains separately authorized.
3. Configure the actual native provider/model and credentials; V41 Flash is `deepseek-flash`, not a guessed `deepseek-v4.1-flash` alias.
4. Move DSMM settings into the `id: dsmm` profile patch's `config` object and restart; do not copy old settings.yaml into the new home.
5. Use `workflow.policy: risk-based` for the current workflow. Explicit legacy controls remain supported; inspect normalized status instead of assuming omitted and explicit defaults are equivalent.
6. Inspect native roles and role-specific tools; do not configure removed `roots/includeUserRoot` or count exported template directories as discovery.
7. Enable optional LSP/MCP only with a usable external ocmm-lsp executable; recovery stays disabled unless explicitly configured.
8. Validate the packed profile and the real specified model's read/write/tool-result round-trip before changing your default workflow.

## Coexistence and cutover

Keep the existing OpenCode configuration until the DSH profile has independently passed its required evidence. Headless configuration uses profile files and `--dump-config`; command-capable hosts execute `/deepwork` and `/dsmm-status` through the command adapter, not by sending those strings as model tasks.

DSH owns subagent depth and permission ceilings. DSMM does not raise the native default depth or use workflow instructions to bypass plan mode, user approval, read-only roles, or provider authentication.
