# AGENTS.md

Conventions and workflows for agents working on the ocmm codebase.

## Build and Verify

```bash
pnpm run typecheck   # tsc --noEmit, strict mode
pnpm test            # node --test, 142 tests, no external deps
pnpm run build       # tsc -> dist/
```

All three must pass before committing. Tests use `node --test --experimental-strip-types` (Node 22+), no test framework dependency.

## Live Integration Test

The unit tests cover hooks in isolation but do not exercise the real OpenCode runtime. To verify the plugin against a live OpenCode instance:

### 1. Build the plugin

```bash
pnpm run build
```

`dist/index.js` is the plugin entry point.

### 2. Create a temp test directory

```powershell
$testDir = "$env:LOCALAPPDATA\Temp\opencode\ocmm-test"
mkdir.exe -p "$testDir/.opencode"
```

### 3. Write a minimal opencode.json

Point at the built plugin and any provider you want to test with. Only include the models you want to exercise. Replace `<provider>`, `<npm-package>`, `<baseURL>`, `<apiKey>`, and model IDs with your actual provider details:

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
        "<model-a>": { "name": "Model A", "limit": { "context": 1000000, "output": 128000 } },
        "<model-b>": { "name": "Model B", "limit": { "context": 256000, "output": 128000 } }
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

Create `$testDir\.opencode\ocmm.jsonc`. The built-in agents reference models like `claude-opus-4-7` and `gpt-5.5` which your provider may not serve, so you must override them:

```jsonc
{
  "agents": {
    "orchestrator": { "model": "<provider>/<model-a>", "variant": "max", "fallbackModels": ["<provider>/<model-b>"] },
    "worker": { "model": "<provider>/<model-b>", "variant": "high" },
    "reviewer": { "model": "<provider>/<model-b>", "variant": "high" },
    "planner": { "model": "<provider>/<model-a>", "variant": "max" }
  },
  "debug": true
}
```

### 5. Run verification commands

All commands run from `$testDir` (use `workdir` or `Set-Location`).

**Check plugin loads and agents register:**

```bash
opencode debug config --print-logs --log-level DEBUG 2>&1 | rg "ocmm"
```

Expected lines:
```
[ocmm] config loaded: project=...ocmm.jsonc, user=<none>
[ocmm] loaded prompts: deepwork=4/4, mode=2/2, category=8/8
[ocmm] config: registered N agents (built-in + categories + user)
```

**Inspect a specific agent's resolved model:**

```bash
opencode debug agent orchestrator --print-logs --log-level DEBUG 2>&1 | rg '"model"' -A2
```

Should show the `providerID` and `modelID` you configured.

**Run a real chat round-trip:**

```bash
opencode run --model <provider>/<model-a> --agent orchestrator "Say hello in exactly 3 words."
```

Should produce a model response with no errors. The header line shows `> orchestrator · <model-a>`.

**Verify chat.params routing with debug logs:**

```powershell
$env:OCMM_DEBUG='1'
opencode run --print-logs --log-level DEBUG --model <provider>/<model-a> --agent orchestrator "Say hi" 2>&1 | rg "ocmm"
```

Expected:
```
[ocmm] chat.message: agent=orchestrator model=<provider>/<model-a> parts=1 textLen=N
[ocmm] routed agent=orchestrator model=<provider>/<model-a> variant=max source=user-config
```

`OCMM_DEBUG=1` enables the `[ocmm] routed ...` debug line (the `debug: true` config field alone does not enable it; both are needed for full verbosity).

**Test intent keyword detection (deepwork):**

```bash
opencode run --print-logs --log-level DEBUG --model <provider>/<model-a> --agent orchestrator "dw say hi" 2>&1 | rg "ocmm"
```

Expected:
```
[ocmm] intent=deepwork agent=orchestrator -> queued N chars for system injection
[ocmm] system.transform: prepended N chars (sessionID=ses_...)
```

### 6. Clean up

```powershell
rm.exe -rf "$env:LOCALAPPDATA\Temp\opencode\ocmm-test"
```

### What each hook verifies

| Hook | What to look for in logs | What it proves |
|---|---|---|
| `config` | `registered N agents` | Plugin loaded, agents/categories registered with your provider's models |
| `chat.params` | `routed agent=... variant=... source=...` | Variant resolved via 4-tier priority, translated to model params |
| `chat.message` | `intent=deepwork ... queued N chars` | Keyword detection + prompt queueing |
| `experimental.chat.system.transform` | `prepended N chars` | Queued prompt injected into system message |
| `event` | (no output on success) | Session lifecycle hooks fire without errors |

### Notes

- ocmm's `classifyModelFamily` classifies by model ID pattern. Check `src/intent/model-family.ts` to see how your provider's model IDs map to families (gpt, claude, gemini, kimi, glm, etc.) — this affects variant translation.
- The temp directory is outside the repo so it does not pollute git status.
- `opencode debug config` reads from both `$testDir\opencode.json` and `$testDir\.opencode\*` — both must exist.
- If `opencode run` shows no `[ocmm]` lines, the plugin failed to load. Check `--print-logs --log-level DEBUG` for import errors.
