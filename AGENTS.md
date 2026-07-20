# AGENTS.md

Conventions and workflows for agents working on the ocmm codebase.

## Build and Verify

```bash
pnpm run typecheck   # tsc --noEmit, strict mode
pnpm test            # node --test + cargo test
pnpm run build       # tsc -> dist/ and cargo release -> dist/bin/
```

All three must pass before committing. TypeScript tests use `node --test --experimental-strip-types` (Node 22+), no test framework dependency. The Rust `ocmm-lsp` MCP server lives under `crates/ocmm-lsp/` and requires Cargo. `pnpm run build` writes both the local fallback binary name and the target-triple release name to `dist/bin/`.

## Release Workflow

The `.github/workflows/release.yml` workflow has two independent lanes:

- **`ocmm-lsp-vA.B.C`** — publishes 8 native `ocmm-lsp` npm platform packages to npmjs.org and GitHub Release assets.
- **`vX.Y.Z`** — publishes the main `ocmm` package to npmjs.org, GitHub Packages (`@<owner>/ocmm`), and self-contained GitHub Release tarballs (`ocmm-opencode-plugin-<version>.tgz`, `ocmm-codex-plugin-<version>.tgz`) plus checksums.

### ocmm-lsp lane

Tags matching `ocmm-lsp-v*` trigger the LSP-only lane:
1. Verifies the tag matches `crates/ocmm-lsp/Cargo.toml` version.
2. Builds 8 native binaries (Linux glibc x64/arm64, Linux musl x64/arm64, macOS x64/arm64, Windows x64/arm64).
3. Stages platform packages under `packages/ocmm-lsp-*`, generates `package.json` manifests.
4. Publishes 8 platform packages to npmjs.org through npm Trusted Publishing (GitHub Actions OIDC).
5. Publishes standalone native binaries, platform package tarballs (`ocmm-lsp-<platform-package>-<version>.tgz`), and `SHA256SUMS.txt` to the GitHub Release.

### ocmm lane

Tags matching `v*` (but NOT `ocmm-lsp-v*`) trigger the main package lane:
1. Verifies the tag matches `package.json` version as `vX.Y.Z`.
2. Runs typecheck and tests.
3. Builds TypeScript.
4. Downloads pinned `ocmm-lsp-v<lspVersion>` release assets from the `package.json.ocmm.lspVersion` release.
5. Generates the Codex plugin bundle and smoke-tests LSP wrappers.
6. Normalizes the package (strips native binaries from npmjs package, keeps them in GitHub Release staging).
7. Publishes to npmjs.org as `ocmm` through npm Trusted Publishing (GitHub Actions OIDC).
8. On tag pushes (or manual opt-in), publishes `@<owner>/ocmm` to GitHub Packages.
9. Publishes self-contained OpenCode and Codex plugin tarballs plus `SHA256SUMS.txt` to the GitHub Release.

The npm tarball excludes native LSP binaries (platform-agnostic, relies on optional dependency resolution). GitHub Release tarballs (`ocmm-opencode-plugin-<version>.tgz`, `deepwork-codex-plugin-<version>.tgz`) bundle all 8 native binaries under `dist/bin/` and `plugins/deepwork/dist/bin/`.

The GitHub Packages package is staged as `@<owner>/ocmm` because GitHub's npm registry requires scoped package names. The workflow uses GitHub-hosted x64 and arm64 runners; ARM runner labels are public preview on GitHub-hosted runners, so investigate runner availability before changing the matrix.

Before npmjs.org publishing works without tokens, configure npm Trusted Publishing for `ocmm` and every `ocmm-lsp-*` platform package. Use provider GitHub Actions, repository `hugefiver/ocmm`, workflow filename `release.yml` (the file at `.github/workflows/release.yml`), and allow publish. The release workflow grants `id-token: write`, uses Node/npm versions that support Trusted Publishing, and intentionally does not require `NPM_TOKEN` for npmjs.org. GitHub Packages publishing still uses the GitHub-provided token.

### npm optional platform packages

The main `ocmm` package declares eight optional `ocmm-lsp-*` platform packages:

- `ocmm-lsp-linux-x64-gnu`
- `ocmm-lsp-linux-arm64-gnu`
- `ocmm-lsp-linux-x64-musl`
- `ocmm-lsp-linux-arm64-musl`
- `ocmm-lsp-darwin-x64`
- `ocmm-lsp-darwin-arm64`
- `ocmm-lsp-windows-x64`
- `ocmm-lsp-windows-arm64`

npm installs the matching optional package automatically for your OS/CPU/libc unless optional dependencies are omitted (e.g. `--omit=optional`, `npm_config_optional=false`, or the package manager skips optionals). GitHub Release tarballs already include the matching native binary, so the optional package is not needed there.

The package also carries the Codex adapter marketplace at `.agents/plugins/marketplace.json` and the generated plugin bundle at `plugins/deepwork/`. When testing release/package install paths, verify both `codex plugin marketplace add <package-root>` and `codex plugin add deepwork@deepwork-local`; the Codex `.mcp.json` must keep the default `lsp` MCP plugin-local as `./dist/cli/ocmm-lsp.js` rather than baking local source, Cargo, `target/`, or marketplace-root-relative `../../dist` paths. The Codex bundle should expose the workflow skill as `deepwork` and generated agent profiles with the `dw-*` prefix, including `dw-oracle`, `dw-oracle-2nd`, and `dw-creative`; configured review `variants` may additionally emit logical tier profiles such as `dw-oracle-high`. `dw-oracle` (self-supervision) defaults to slot-1 logical normal; `dw-oracle-2nd` is the default second-priority Oracle slot when configured/available; `dw-reviewer` (external review) defaults to the primary reasoning lane chosen from explicit configuration and the available catalog.

### Publishing a new release

```bash
# --- ocmm-lsp release ---
# 1. Bump crates/ocmm-lsp/Cargo.toml version (can be independent of ocmm version)
#    crates/ocmm-lsp/Cargo.toml: version = "A.B.C" -> "A.B.W"

# 2. Tag and push
git tag ocmm-lsp-vA.B.W
git push origin master
git push origin ocmm-lsp-vA.B.W

# 3. Monitor the release workflow — builds 8 native binaries,
#     publishes 8 npm platform packages and GitHub Release assets.

# --- ocmm release ---
# 1. Bump package.json: "version": "X.Y.Z" -> "X.Y.W"
#    Set package.json.ocmm.lspVersion to the ocmm-lsp version this release
#    should bundle (must match an already-published ocmm-lsp-vA.B.C release).

# 2. Regenerate the Codex plugin bundle — the bundle embeds the version number
#    in plugins/deepwork/.codex-plugin/plugin.json and plugins/deepwork/package.json.
#    If you skip this, the release workflow will fail at the
#    "Check generated Codex plugin bundle" step.
pnpm run build:ts
pnpm run gen:codex-plugin
git add .agents/plugins/marketplace.json .codex/agents plugins/deepwork
git commit -m "chore: bump version to X.Y.W"

# 3. Tag and push
git tag vX.Y.W
git push origin master
git push origin vX.Y.W

# 4. Monitor the release workflow
#    https://github.com/<owner>/ocmm/actions/workflows/release.yml
#    The "Verify" job runs typecheck, test, and the Codex bundle check.
#    Eight "Native ocmm-lsp" jobs build platform binaries in parallel (LSP lane only).
#    On success, "GitHub Release" publishes assets automatically.
```

Critical: step 2 (regenerate Codex bundle) must run **after** the version bump and be included in the **same commit** as the version bump. The release workflow's generated-bundle check fails if `.agents/plugins/marketplace.json`, `.codex/agents`, or `plugins/deepwork` do not match what `gen:codex-plugin` produces from the current `package.json` version.

`package.json.ocmm.lspVersion` pins the default LSP version for the main package release. This must match an already-published `ocmm-lsp-vA.B.C` release — the `stage-pinned-lsp` job downloads the pinned release assets by constructing `ocmm-lsp-v${lspVersion}`. The `ocmm` and `ocmm-lsp` versions are independent and do not need to be equal.

## Hook defaults

`disabledHooks` in config controls which hooks are active. Default: `["directory-readme-injector"]` — only the directory README injector is disabled out of the box; all other hooks are enabled. The full list:

| Hook name | Default | Purpose |
| --- | --- | --- |
| `directory-readme-injector` | **Disabled** | Read tool output appends the nearest `README.md` once per directory/session; disabled by default. |
| `directory-agents-injector` | Enabled | Read tool output appends `AGENTS.md` directory context found upward from the read file, within project root, once per directory/session. |
| `rules-injector` | Enabled | Appends configured rule blocks to matching Read/Write/Edit tool output when rules are enabled. |
| `write-existing-file-guard` | Enabled | Tracks Read permissions; blocks `write` overwriting existing files and `edit`/`multiedit`/patch-style edits without prior read where applicable. |
| `notepad-write-guard` | Enabled | Blocks `write`/`edit`/`multiedit` under `.omo/notepads/` and `.sisyphus/notepads/`. |
| `bash-file-read-guard` | Enabled | Warns when a Bash command appears to be a simple file read (`cat`, `head`, `tail`); does not block. |
| `bash-file-write-guard` | Enabled | Blocks Bash commands that write to existing project files through redirects, `tee`/`dd`/`install`/`truncate`, in-place editors, copy/move overwrites, or nested shell scripts. |
| `question-label-truncator` | Enabled | Truncates ask-user-question option labels over 30 chars. |
| `tasks-todowrite-disabler` | Enabled | Blocks `todoread` while the task system is active, making `todowrite` the source of truth. |
| `webfetch-redirect-guard` | Enabled | Resolves HTTP redirects and rewrites the WebFetch URL to the final URL. |
| `empty-task-response-detector` | Enabled | Replaces empty Task tool output with a warning/notice. |
| `comment-checker` | Enabled | Warns on AI-attribution comments in `write`/`edit`/`multiedit` content unless a bypass marker is present. |
| `plan-format-validator` | Enabled | Warns on malformed checklist lines in `.omo/plans/*.md` writes/edits. |
| `read-image-resizer` | Enabled | Appends a dependency-free build notice for image Read outputs; does not resize. |
| `json-error-recovery` | Enabled | Appends recovery instructions when tool output contains JSON parse errors. |
| `fsync-skip-warning` | Enabled | Appends drained fsync skip warnings from the fsync tracker. |
| `tool-output-truncator` | Enabled | Truncates very large selected tool outputs. |
| `todo-description-override` | Enabled | Overrides the `todowrite` tool description with ocmm’s structured todo format. |
| `commit-guard-injector` | Enabled | Injects the no-autonomous-git-write constraint into the system prompt. |
| `subagent-git-guard` | Enabled | Blocks git write commands in subagent sessions except allowed temp-repo cases. |
| `subagent-interruption-recovery` | Enabled | Correlates child `session.error` and parent `message.part.updated` task-part evidence and lets the task-output adapter append at most one manual continuation notice; retry dispatch remains owned by the existing fallback controller. |
| `subagent-depth-guard` | Enabled | Blocks `task` dispatches that would exceed local `subagent.maxDepth` (default `3`); when host `subagent_depth` is observable, the effective limit is the lower active value and `OCMM_DEBUG` logs compatibility once per combination. Never treats `execute` as `task`. |

## Live Integration Test

The unit tests cover hooks in isolation but do not exercise the real OpenCode runtime. To verify the plugin against a live OpenCode instance:

### 1. Build the plugin

```bash
pnpm run build
```

`dist/index.js` is the plugin entry point.

### 2. Create an isolated test directory with XDG separation

All OpenCode tests MUST use separate config and state directories to avoid polluting the current OpenCode session. Set XDG environment variables to redirect config, data, state, and cache into the test directory:

```powershell
$testDir = "$env:LOCALAPPDATA\Temp\opencode\ocmm-test"
mkdir.exe -p "$testDir/.opencode"
mkdir.exe -p "$testDir/xdg-config"
mkdir.exe -p "$testDir/xdg-data"
mkdir.exe -p "$testDir/xdg-state"
mkdir.exe -p "$testDir/xdg-cache"

# Set these before every opencode command in this test session:
$env:XDG_CONFIG_HOME = "$testDir/xdg-config"
$env:XDG_DATA_HOME   = "$testDir/xdg-data"
$env:XDG_STATE_HOME   = "$testDir/xdg-state"
$env:XDG_CACHE_HOME   = "$testDir/xdg-cache"
```

Verify isolation with `opencode debug paths` — the generated OpenCode `data`, `bin`, `log`, `repos`, `cache`, `config`, and `state` paths should point inside `$testDir`. The fixed `home` and `tmp` rows may still point to the OS user home/temp roots.

Capture an explicit probe artifact under the isolated directory so verification evidence is colocated with the test run:

```powershell
mkdir.exe -p "$testDir/evidence"
opencode debug paths 2>&1 | tee "$testDir/evidence/opencode-debug-paths.txt"
```

Treat all raw logs and credentials in `$testDir` as temporary test material only (for example `opencode.json` API keys and debug logs). Do not copy them into project files or long-lived config locations.

### 3. Write a minimal opencode.json

Point at the built plugin and any provider you want to test with. Only include the models you want to exercise. Replace `<provider>`, `<npm-package>`, `<baseURL>`, `<apiKey>`, and model IDs with your actual provider details. Set output limits slightly below the provider's actual max to avoid overflow from internal token accounting:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["C:\\path\\to\\ocmm\\dist\\index.js"],
  "disabled_providers": ["opencode", "openrouter", "github-copilot", "openai"],
  "provider": {
    "<provider>": {
      "npm": "<npm-package>",
      "options": {
        "apiKey": "<apiKey>",
        "baseURL": "<baseURL>"
      },
      "models": {
        "<model-a>": { "name": "Model A", "limit": { "context": 1000000, "output": 127000 } },
        "<model-b>": { "name": "Model B", "limit": { "context": 256000, "output": 127000 } }
      }
    }
  },
  "agent": {
    "compaction": { "model": "<provider>/<model-a>" },
    "title": { "model": "<provider>/<model-b>" }
  }
}
```

Write this to `$testDir\opencode.json`.

### 4. Write an ocmm config mapping agents to your provider's models

Create `$testDir\.opencode\ocmm.jsonc`. Built-in defaults are examples and may reference models your provider does not serve, so map agents to models from your configured provider/catalog. Set `workflow` to `"v1"` or `"omo"` (default) to choose the prompt set:

```jsonc
{
  "workflow": "v1",
  "agents": {
    "orchestrator": { "model": "<provider>/<model-a>", "variant": "max", "fallbackModels": ["<provider>/<model-b>"] },
    "builder": { "model": "<provider>/<model-b>", "variant": "high" },
    "reviewer": { "model": "<provider>/<model-b>", "variant": "high" },
    "planner": { "model": "<provider>/<model-a>", "variant": "max" }
  },
  "debug": true
}
```

### 5. Run verification commands

All commands run from `$testDir` (use `workdir` or `Set-Location`). Ensure the XDG env vars from step 2 are set.

**Check plugin loads and agents register:**

All `[ocmm]` info lines are gated by `OCMM_DEBUG` (same as debug lines); set it to `1` to make them visible.

```powershell
$env:OCMM_DEBUG='1'
opencode debug config --print-logs --log-level DEBUG 2>&1 | rg "ocmm"
```

Expected lines:
```
[ocmm] config loaded: project=...ocmm.jsonc, user=<none>
[ocmm] loaded prompts: workflow=v1 deepwork=7/7, agents=5/5, category=10/10
[ocmm] v1 skills loaded: N chars            (v1 only; omo omits this line)
[ocmm] config: registered N agents (built-in + categories + user), N skills, N commands, N MCPs
```

**Inspect a specific agent's resolved model:**

```bash
opencode debug agent orchestrator --print-logs --log-level DEBUG 2>&1 | rg '"model"' -A2
```

Should show the `providerID` and `modelID` you configured. (This command does not require `OCMM_DEBUG`; it reads opencode's own debug output.)

**Smoke-test the native LSP MCP wrapper after a build:**

```powershell
'{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist\cli\ocmm-lsp.js mcp
```

Should list the eight primary LSP tools: `status`, `diagnostics`, `goto_definition`, `find_references`, `find_symbol_related`, `symbols`, `prepare_rename`, and `rename`.

**Run a real chat round-trip:**

```bash
opencode run --model <provider>/<model-a> --agent orchestrator "Say hello in exactly 3 words."
```

Should produce a model response with no errors. The header line shows `> orchestrator · <model-a>`.

**Verify chat.params routing and v1 skill injection with debug logs:**

```powershell
$env:OCMM_DEBUG='1'
opencode run --print-logs --log-level DEBUG --model <provider>/<model-a> --agent orchestrator "Say hi" 2>&1 | rg "ocmm"
```

Expected (v1 workflow):
```
[ocmm] v1 skills queued: N chars (sessionID=ses_...)
[ocmm] system.transform: prepended N chars (sessionID=ses_...)
[ocmm] routed agent=orchestrator model=<provider>/<model-a> variant=max source=user-config
```

Expected (omo workflow): no `v1 skills queued` line — omo attaches prompts declaratively at config time, no runtime injection.

`OCMM_DEBUG=1` enables all `[ocmm]` info and debug lines — startup diagnostics (`config loaded`, `loaded prompts`, `registered N agents..., N MCPs`) and runtime routing (`v1 skills queued`, `system.transform`, `routed ...`). The `debug: true` config field alone does not enable them; both are needed for full verbosity.

### 6. Clean up

```powershell
# Unset XDG env vars first
$env:XDG_CONFIG_HOME = $null
$env:XDG_DATA_HOME   = $null
$env:XDG_STATE_HOME   = $null
$env:XDG_CACHE_HOME   = $null

rm.exe -rf "$env:LOCALAPPDATA\Temp\opencode\ocmm-test"
```

### What each hook verifies

| Hook | What to look for in logs | What it proves |
|---|---|---|
| `config` | `registered N agents..., N MCPs` | Plugin loaded, agents/categories, skills, commands, and MCPs registered with your provider's models |
| `chat.params` | `routed agent=... variant=... source=...` | Variant resolved via 4-tier priority, translated to model params |
| `chat.message` | `v1 skills queued: N chars` (v1 only; omo is no-op) | v1 skill content queued on first message per session |
| `experimental.chat.system.transform` | `prepended N chars` | Queued content injected into system message |
| `event` | (no output on success) | Session lifecycle hooks fire without errors |

Interruption-recovery event coverage (same `event` + output-adapter surface):

- `session.created`: records one durable child-session correlation record in the existing fallback controller for child sessions.
- `session.error`: records provider-error evidence for correlation and lets the existing controller decide dedicated 429 vs generic fallback ownership.
- `session.idle`: advances existing gate/dispatch state; does not create independent retry state.
- `session.deleted`: invalidates lifecycle/timer/dispatch generations and clears session-scoped controller state.
- `message.part.updated`: ingests and deduplicates parent task-part evidence keyed to correlated child session.
- task output adapter responsibility: may append at most one manual continuation notice when explicit task-id evidence exists; it never dispatches retries, never synthesizes parent prompts, and never substitutes `childSessionID` for `task_id`.

### Notes

- ocmm's `classifyModelFamily` classifies by model ID pattern. Check `src/intent/model-family.ts` to see how your provider's model IDs map to families (gpt, claude, gemini, kimi, glm, etc.) — this affects variant translation.
- The temp directory is outside the repo so it does not pollute git status.
- `opencode debug config` reads from both `$testDir\opencode.json` and `$testDir\.opencode\*` — both must exist.
- If `opencode run` shows no `[ocmm]` lines even with `OCMM_DEBUG=1` set, the plugin failed to load. Check `--print-logs --log-level DEBUG` for import errors.
- To test v1 workflow: add `"workflow": "v1"` to your `ocmm.jsonc`. v1 injects 5 superpowers skills into the system message; omo (default) attaches prompts to agents declaratively with no runtime injection.
- If you see `max_tokens` errors (`integer above maximum value`), lower the model's `output` limit in `opencode.json` — OpenCode adds internal overhead to the configured limit.

## Prompt Synchronization

Prompt files are model-facing behavior and must stay synchronized with upstream intent and local workflow semantics.

- `v1` exists only as the version label for the deepwork workflow: `workflow: "v1"`, `prompts/v1/`, `skills/v1/`, and `docs/v1-maintenance.md` are config/path/version labels, not model-facing names. Model-facing prompt text under `prompts/v1/**` must use `deepwork` or omit the workflow name entirely; never describe the workflow to the model as `v1`.
- `prompts/v1/deepwork/default.md` is intentionally concise and local to this project. Do not blindly replace it with the upstream long default prompt.
- `prompts/v1/deepwork/{gpt,gpt-5.6,gemini,glm,codex,planner}.md` should track upstream omo/ultrawork model-specialized prompts closely. Preserve model-specific information, constraints, and command style; adapt only local agent names, paths, and OpenCode/ocmm tool semantics.
- `prompts/v1/agents/*.md` and `prompts/v1/category/*.md` should stay strongly aligned with `prompts/omo/agents/*.md` and `prompts/omo/category/*.md`. Deepwork mechanics come from the deepwork layer and injected skills, not from shortened agent/category prompts.
- Changes under `prompts/v1/` MUST update `docs/v1-maintenance.md` in the same commit. Changes under `prompts/omo/` MUST update `docs/prompt-sync.md` in the same commit. Changes that affect both workflows update both docs.
- The repository ignores the root upstream checkout as `/omo/`; `prompts/omo/**` is tracked. If intended prompt files under `prompts/omo/**` ever appear ignored, tighten `.gitignore` rather than leaving them untracked.
## v1 Maintenance

All v1 skill file changes (in `skills/v1/`) and v1 prompt file changes (in `prompts/v1/`) MUST be synchronized with `docs/v1-maintenance.md` in the same commit, and vice versa. A file change without a doc update, or a doc update without a file change, is a failed review.

This applies to: content edits, new files, deletions, renames, and upstream skill syncs.

omo prompts (`prompts/omo/`) are not tracked in this doc.

## Config Schema Sync

`schema.json` (repo root) is generated from `OcmmConfigSchema` in `src/config/schema.ts` via `pnpm run gen-schema` (`scripts/gen-schema.ts`). Any task that modifies the config schema — adding/removing fields, changing types, adding hook names, agent names, command names, or any other `HOOK_NAMES`/`AGENT_NAMES`/`COMMAND_NAMES` entries — MUST regenerate `schema.json` and include it in the same commit as the schema change. A schema code change without a `schema.json` update, or vice versa, is a failed review.
