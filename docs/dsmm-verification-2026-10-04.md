# DSMM migration verification — 2026-10-04

This report covers the unpublished working-tree migration from ocmm 0.6.24 to DSMM 1.0.0. No commit, push, tag, registry publication or default-profile cutover was performed.

## Target and migrated surfaces

The compatibility target is `@deepseek-ai/dsh@0.2.0-rc.2`, the official npm latest/next version rechecked on 2026-10-04. `0.2.1-alpha.1` is not the selected release channel. Cordis is `4.0.4`; Schemastery is `3.18.4`.

The migration includes risk-based workflow defaults with explicit legacy-setting provenance, seven updated core workflow skills, twelve native roles, independent native V41 Flash calibration, restart-scoped Loader configuration, latest Session/request/tool contracts, guarded optional recovery, and the ninth LSP tool `format`. Debugging/DAP references are available on demand rather than injected into every turn. OpenCode-specific hooks and Codex marketplace behavior are not falsely presented as DSH features; see the feature mapping in `dsmm/docs/migration-from-ocmm.md`.

DSH headless does not compose agent presets. DSMM therefore installs native per-role tools on the root Agent's actual tool plane. Role children inherit the parent route; read-only children are restricted to the allowed native tools. Standing preset tools keep `modelSelectionSettings` disabled because the host otherwise re-registers delegation tools in the child's own scope, outside its inherited-tool restriction.

## Real DeepSeek 4.1 Flash evidence

The real provider was DSH's native `deepseek-account`, model ID `deepseek-flash`, catalog label `DeepSeek-V41-Flash`. Existing account authorization was used only in an isolated temporary `DSH_HOME`. This is not evidence for the separate API-key provider path or for Oracle model heterogeneity.

The packed-package smoke reads an isolated fixture, calls `dsmm_reviewer`, obtains the read-only child's real answer, writes `result.json` with the original nonce and sum `42`, and returns `DSMM_FLASH_OK`. It verifies actual request routes, final persisted reasoning-effort headers, prompt sections, successful tool results, nonzero token usage and the child's tool inventory. Retries and fallback are disabled; the subprocess tree has a bounded timeout.

Before the scoped role-tool correction, the same delegate smoke observed `roleTools=[]`, `agentCount=1`, and failed delegation. After correction it returned `COMPLETED`, `agentCount=2`, with `read`, child `read`, `dsmm_reviewer`, and `write` accepted. The no-credential `--probe-only` path also returned `COMPLETED` with eleven callable role tools and stopped before a model call. Ordinary Flash read/write round-trips independently passed.

## Verification status

| Check | Result |
| --- | --- |
| DSMM source and test typecheck/build | passed |
| Full DSMM suite | `tests 277 / pass 277 / fail 0` |
| Focused native security, selection and registry cases | `tests 7 / pass 7 / fail 0` |
| Static role/prompt mirrors | regenerated; exact renderer tests passed |
| Package readiness | `outcome: ready`, 125 required files, zero forbidden surfaces |
| Packed real Flash delegate smoke | `outcome: COMPLETED`, all 14 checks true |
| Linux Docker packed lifecycle | passed on Node 22.23.3, pnpm 12.8.1 and pinned DSH 0.2.0-rc.2 |

Final sanitized live receipt:

```json
{
  "outcome": "COMPLETED",
  "dshVersion": "0.2.0-rc.2",
  "provider": "deepseek-account",
  "model": "deepseek-flash",
  "catalogName": "DeepSeek-V41-Flash",
  "packedSha256": "fa7bb406697a1069ae22be766cbea8c01261dcac087a4707d11be61c0913194e",
  "agentCount": 2,
  "modelRequestCount": 6,
  "finalHeaderEffort": "low",
  "childTools": ["glob", "grep", "read"],
  "acceptedTools": ["read", "read", "dsmm_reviewer", "write"],
  "inputTokens": 8346,
  "outputTokens": 297,
  "fixtureSum": 42,
  "originalNoncePreserved": true,
  "finalAnswer": "DSMM_FLASH_OK",
  "originalCredentialsUnchanged": true,
  "temporaryHomeRemoved": true
}
```

The final same-artifact no-credential schema probe also returned `COMPLETED`, with eleven role tools, `stoppedBeforeModel: true` and no tool execution. The request probe's inner-middleware snapshot can precede calibration; final persisted `request/header` events are the effort authority, and both parent/child headers were `low`.

Independent review found two preset permission defects during implementation. The correction keeps role registrations outside the read-only child's local scope and reconciles/disposes restrictions on blank-session preset selection, tool changes and Agent disposal. The security regression uses real scoped ToolRuntime services, including coexisting Host and preset realms; the selected realm is restricted while the Host is not accidentally modified. A separate prompt-selection regression was captured failing with only the native default persona, then passed with `SELECTED_NATIVE_PROMPT` after the official selection listener correction. Focused re-review found no remaining Important/Critical issue in those corrections.

Root `pnpm run typecheck` and `pnpm test` passed. The test command required a task-local Python interpreter for existing DAP tests; no product change was needed. Root Cargo release compilation passed. The original root build's binary-staging step could not overwrite a native LSP executable used by pre-existing processes. Those processes were not terminated. The same `pnpm run build` passed in a task-owned isolated copy with the unchanged root inputs.

Direct native LSP MCP diagnostics and atomic formatting passed. The actual DSH MCP client bridge also passed diagnostics and read-back verification of formatted content. Source DAP fixtures passed all 16 tests.

The Linux lifecycle investigation isolated a package-manager version issue, not a DSMM runtime failure: standalone packed-DSMM add/remove on Node 22 and pnpm 11.9.0 passes with the isolated linker, but removal times out after `Done` under the native hoisted layout. pnpm 12.8.1 passes the same hoisted graph (confirmed `configuredLinker: hoisted`, non-symlink package); removal returned in 26 ms. The Docker pin was updated only inside its owned image, retaining native layout, headless template, actual CLI lifecycle and all sentinel checks. Stdin-ignore alone did not fix the old case. The later README/compatibility notes are documentation-only changes after the live artifact above; runtime, role and skill code remain the verified implementation.

Final `pnpm --filter dsmm smoke:docker` exited `0`. It reported `DSMM_V1_PROFILE_REMOVE_OK`, repeated `PACKAGED_DSMM_RESOLVED` after reinstall, `DSMM_V1_GLOBAL_CONFIG_UNCHANGED`, and `DSMM_PACKAGED_RUNTIME_SMOKE_OK`. All native contract domains, preset security, direct/DSH-client diagnostics and formatting, and readiness passed before that lifecycle completion. Its owned image/container and isolated profile/test directories were removed automatically. This is Linux package/runtime evidence, not a Linux credentialed model call or a publication receipt.

## Evidence boundaries and privacy

Native contract tests use real Cordis, Session, AgentRegistry, scoped SystemPrompt and ToolRuntime services; driverless preset mounting/selection seams are identified in their tests. They do not constitute browser/Web UI interaction tests. Web UI, TUI, macOS, hot-module reload, future DSH releases, API-key authentication and distinct-model Oracle routing were not verified.

The runner records only necessary metadata, not credentials, full conversations, private reasoning, request bodies or provider error bodies. Temporary credentials and session homes are removed after each run; the original credential file is compared by hash and remains unchanged. No `.credentials.yaml` remains in the task-owned test installation directory. Shell cleanup of `output_test/dsmm-dsh-20261003` was rejected by the execution policy, so its runtime installation, local packs, Python, sanitized receipts and scratch build remain. Its `isolated-root-build/node_modules` junction points at the workspace dependencies: remove only that junction, not its target, before deleting the task directory. The debug journal and the task-created base Docker image tag were removed; the public image can be pulled again. Final scans found no task-owned DSH/LSP process or credential file, and existing workspace dependencies and pre-existing LSP processes remain intact. No user configuration or pre-existing LSP process is deleted.
