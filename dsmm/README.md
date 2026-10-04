# dsmm

DSMM adapts ocmm's deepwork workflow to DeepSeek Harness. It is a DSH-native Cordis bundle, not an OpenCode compatibility layer.

This package targets `@deepseek-ai/dsh@0.2.0-rc.2`, the npm `latest` resolved on 2026-10-03. The first release is version 0.1.0; local readiness checks alone do not represent a published release.

## Current functionality

- Opt-in deepwork mode and `/deepwork [off|message]`, plus the inspection-only `/dsmm-status [json]`.
- Seven scoped core workflow skills synchronized with current ocmm: risk-based discovery, complex-work planning and criticism, bounded implementation, evidence-led review, parallel execution, and behavior-preserving cleanup.
- Twelve native roles, including Builder, Creative, Reviewer, Oracle, and second-priority Oracle. Read-only role constraints are enforced through native tool composition. Models remain user-selected; Oracle names alone do not guarantee model heterogeneity.
- Exact-route V41 Flash calibration for `deepseek-official/deepseek-flash` and `deepseek-account/deepseek-flash`, preserving V4 Pro settings. Runtime selects only adapter-advertised reasoning efforts.
- Scoped shell/Git/plan/question/todo guards, optional host-first fallback and bounded continuation.
- Optional external `ocmm-lsp mcp` integration with nine tools including atomic `format`. Debugging/DAP is an on-demand skill, not additional LSP tools or automatic prompt injection.

The native host owns child-session controls, depth limits, permission checks, cancellation, and model authentication. DSMM does not replace those with an OpenCode retry dispatcher.

## Install and configure

Install the exact registry version after publication with `dsh plugin --profile <profile> add dsmm@0.1.0`. For isolated local verification, use a built and packed artifact:

```powershell
pnpm --filter dsmm build
pnpm --dir dsmm pack --pack-destination <temporary-artifact-directory>
$env:DSH_HOME = "<disposable-test-home>"
dsh --profile <profile> --from-default-profile headless --dump-config
dsh plugin --profile <profile> add <absolute-path-to-dsmm-0.1.0.tgz>
dsh --profile <profile> --dump-config
```

The template command initializes a fresh isolated headless profile. For an existing Web profile, keep its original template and configuration. See the package-manager boundary in [compatibility](docs/compatibility.md) before interpreting a stalled uninstall as success.

On DSH 0.2, restart-scoped settings belong to the profile's `cordis.patch.yml`:

```yaml
- id: dsmm
  config:
    defaultActive: true
    workflow:
      policy: risk-based
    deepseekFlashCalibration: auto
    deepseekFlashDefaultReasoningEffort: high
```

Do not copy the old `settings.yaml` namespace or preset-discovery roots into the new host. See [migration](docs/migration-from-ocmm.md), [settings/status](docs/settings-status.md), and [agent roles](docs/agent-presets.md).

Without active mode or a selected DSMM preset, DSMM workflow prompts and default-scoped guards do not apply. Headless task text is not a slash-command adapter.

## Verification

```powershell
pnpm --filter dsmm typecheck:test
pnpm --filter dsmm test
pnpm --filter dsmm check:release
pnpm --filter dsmm smoke:docker
```

A credentialed, packed real-model test is also available from this checkout:

```powershell
node dsmm/scripts/live-dsh-smoke.mjs --runtime <npm-prefix-with-pinned-dsh> --package <packed-dsmm.tgz> --provider deepseek-account --credentials <existing-dsh-credentials-file> --receipt <sanitized-receipt.json>
```

Add `--delegate` to verify the actual `dsmm_reviewer` child persona, inherited Flash route and strict read-only tool inventory. Use `--probe-only` first to inspect the role schema without credentials or a model call. `--effort low` can keep this bounded smoke inexpensive; the runner checks the final persisted request header against that explicit choice.

The test copies only native account records into a temporary home, verifies a real read/write/model round-trip, checks the exact route and DSMM prompt, and removes temporary credentials and sessions. It does not print reasoning or credentials, log into a browser, modify the original credential file, or silently use a different model. API-key testing uses `--provider deepseek-official` and an existing `DEEPSEEK_API_KEY` environment variable.

See [compatibility](docs/compatibility.md) for evidence boundaries and [release policy](docs/releasing.md) for separately authorized publication.
