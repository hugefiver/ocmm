# Settings and status

## Command

`/dsmm-status` is a fixed command name, independent of `modeName`, and is available wherever the host exposes registered commands. Empty input returns the bounded human summary. Lowercase `json` returns versioned JSON, so the machine-readable invocation is:

```text
/dsmm-status json
```

Every other input returns the exact error `Usage: /dsmm-status [json]`.

The human summary names the mode, scope (including a selected DSMM preset when applicable), route and route family, calibration policy/current/action, runtime recovery, and idle continuation. It deliberately omits settings prompts and provider errors; use JSON only when the full normalized settings snapshot is required.

## Snapshot contract

`createDsmmStatusSnapshot()` returns a deterministic, side-effect-free JSON-ready value with `version: 1` and five top-level status sections: `mode`, `route`, `calibration`, `runtimeRecovery`, and `effectiveSettings`.

`mode` reports the configured name, activity, selected preset, DSMM-preset classification, and effective scope. `route` reports the current provider/model when available, model family, exact V4 Pro match, and current reasoning effort. `calibration` reports the configured mode, applicability, `policyEffort`, and current action. `runtimeRecovery` reports configured enablement and applicability, fallback count/cap, and idle-continuation enablement/cap. `effectiveSettings` is a defensive copy: its arrays and nested objects do not alias the live settings value.

`policyEffort` is the desired DSMM policy, not an adapter claim that the effort is available, advertised, or already applied. Adapter capability negotiation remains in model routing.

## Web loopback

The existing host command UI discovers `/dsmm-status`; no Web-specific registration is required. The host `settings.describe` surface and settings API remain independent ways to inspect the `dsmm` namespace. v0.8 ships no custom settings card, panel, or client bundle.

## Headless settings

Headless configuration stays in `$DSH_HOME/settings.yaml` or equivalent profile files. Inspect the resolved configuration with `dsh --profile <profile> --dump-config`. The pinned headless bundle has no interactive command adapter, so it remains file-configured even though Web hosts can expose the command.

The complete normalized defaults under the `dsmm:` namespace are restart-scoped:

```yaml
dsmm:
  modeName: deepwork
  defaultActive: false
  promptOrder: 50
  deepseekV4ProCalibration: auto
  deepseekV4ProDefaultReasoningEffort: high
  deepseekV4ProMaxReasoningPresets:
    - dsmm-plan-critic
    - dsmm-reviewer
  skills:
    brainstorming: true
    writing-plans: true
    requesting-code-review: true
    receiving-code-review: true
    subagent-driven-development: true
    dispatching-parallel-agents: true
    remove-ai-slops: true
  roles:
    dsmm-orchestrator: true
    dsmm-planner: true
    dsmm-plan-critic: true
    dsmm-reviewer: true
    dsmm-code-search: true
    dsmm-doc-search: true
    dsmm-clarifier: true
    dsmm-media-reader: true
  presets:
    materialize: false
  workflow:
    strictGates: true
    reviewCap: 5
    finalReviewPolicy: simple-oracle-complex-reviewer
  guards:
    scope: deepwork-or-dsmm-agent
    shellCommandSafety: true
    gitWriteGuard: ask
    toolOutputTruncation:
      enabled: true
      maxInlineBytes: 12000
    planFormatValidation: true
    questionLabelHelper:
      enabled: true
      maxLabelChars: 30
    todoDisciplineHelper: true
  runtimeRecovery:
    enabled: false
    retryOnStatusCodes: [429, 500, 502, 503, 504]
    retryOnCodes: []
    fallbackRoutes: []
    maxFallbackAttempts: 2
    idleContinuation:
      enabled: false
      maxContinuations: 3
      prompt: "Continue the current task from the durable goal or unfinished todo list. Do not repeat completed work."
  lsp:
    enabled: false
    serverName: dsmm_lsp
    command: ocmm-lsp
    args: [mcp]
    cwd: ""
    env: {}
    toolCallTimeoutMs: 60000
    failOnStartupError: true
```

`presets.root` is optional and omitted when unset. All settings in this namespace are restart-scoped; settings writes remain file- and DSH-owned.

## Future TUI

The rc.2 release has no official TUI bundle and DSMM creates no private bridge. A future TUI may execute the host command or consume the exported pure snapshot API.

## Boundaries

Status computation performs no provider, capability, or network lookup. There is no process-local runtime-recovery pending-state or count exposure. Settings writes remain file- and DSH-owned; `/dsmm-status` is inspection only.
