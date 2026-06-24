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

The `.github/workflows/release.yml` workflow is GitHub-only: it publishes GitHub Release assets and, on tag releases or explicit manual opt-in, a scoped GitHub Packages package. Do not add npmjs.org publishing unless the user asks for that registry specifically.

Release tags must match `package.json` as `vX.Y.Z`. The Release assets include the packed plugin/CLI tarball, standalone target-triple `ocmm-lsp-*` native binaries, and checksums. The GitHub Packages package is staged as `@<owner>/ocmm` because GitHub's npm registry requires scoped package names. Bundled Linux binaries are glibc/GNU targets; musl users need a local build or `OCMM_LSP_COMMAND`.

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

Verify isolation with `opencode debug paths` — all paths should point inside `$testDir`.

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

Create `$testDir\.opencode\ocmm.jsonc`. The built-in agents reference models like `claude-opus-4-7` and `gpt-5.5` which your provider may not serve, so you must override them. Set `workflow` to `"v1"` or `"omo"` (default) to choose the prompt set:

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
[ocmm] loaded prompts: workflow=v1 deepwork=6/6, agents=5/5, category=10/10
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

Should list the seven primary LSP tools: `status`, `diagnostics`, `goto_definition`, `find_references`, `symbols`, `prepare_rename`, and `rename`.

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
- `prompts/v1/deepwork/{gpt,gemini,glm,codex,planner}.md` should track upstream omo/ultrawork model-specialized prompts closely. Preserve model-specific information, constraints, and command style; adapt only local agent names, paths, and OpenCode/ocmm tool semantics.
- `prompts/v1/agents/*.md` and `prompts/v1/category/*.md` should stay strongly aligned with `prompts/omo/agents/*.md` and `prompts/omo/category/*.md`. Deepwork mechanics come from the deepwork layer and injected skills, not from shortened agent/category prompts.
- Changes under `prompts/v1/` MUST update `docs/v1-maintenance.md` in the same commit. Changes under `prompts/omo/` MUST update `docs/prompt-sync.md` in the same commit. Changes that affect both workflows update both docs.
- The repository ignores the root upstream checkout as `/omo/`; `prompts/omo/**` is tracked. If intended prompt files under `prompts/omo/**` ever appear ignored, tighten `.gitignore` rather than leaving them untracked.
## v1 Maintenance

All v1 skill file changes (in `skills/v1/`) and v1 prompt file changes (in `prompts/v1/`) MUST be synchronized with `docs/v1-maintenance.md` in the same commit, and vice versa. A file change without a doc update, or a doc update without a file change, is a failed review.

This applies to: content edits, new files, deletions, renames, and upstream skill syncs.

omo prompts (`prompts/omo/`) are not tracked in this doc.
