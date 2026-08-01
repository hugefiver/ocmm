# OpenCode Background Subagents Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit `ocmm --background-subagents` startup opt-in that scopes OpenCode's experimental native background-subagent flag to the spawned child, documents the host-owned lifecycle, and teaches only OpenCode orchestrators to use the capability exposed by their active Task schema.

**Architecture:** Extend the existing CLI shim's `parseArgs()` → `buildChildEnv()` → `spawn()` path, following the child-only `--fast` pattern while deliberately omitting config-schema persistence. Keep background execution entirely inside OpenCode; ocmm adds only startup adaptation, model guidance, and compatibility characterization tests, with Codex and existing runtime hooks isolated from the feature.

**Tech Stack:** TypeScript on Node.js 22 (`node:test`, `node:assert/strict`, `node:child_process`), Markdown prompt/documentation contracts, pnpm, PowerShell 7+, and the existing Codex plugin generator.

**Global Constraints:**
- Do not install packages or add dependencies.
- Run every shell command as PowerShell; do not use Bash environment-assignment syntax.
- `--background-subagents` is CLI-only, has no shorthand, and is consumed only before the exact `--` passthrough separator.
- `ShimArgs.backgroundSubagents` is a required `boolean`; enabled children receive the exact value `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS="true"`, while disabled children have any inherited value deleted.
- Never mutate `process.env` or the caller-provided parent environment object.
- Preserve all five shim isolation modes and all existing wrapper examples; direct `opencode`, direct plugin loading, and `ocmm-lsp` bypass the convenience flag.
- OpenCode exclusively owns child sessions, process-local jobs, extension, cancellation, completion/error injection, and lifecycle; ocmm must not add a background runtime.
- The currently callable host Task schema is the source of truth. Do not add a version probe or claim support merely because an environment variable is set.
- Do not add polling, cancellation tools, restart recovery, persistence, a job registry, or durable-job semantics.
- Do not add a config field, modify `src/config/schema.ts` or `schema.json`, or change Task permission, subagent depth, route, 429 fallback, interruption, or idle semantics without a genuine failing compatibility regression.
- Modify OpenCode guidance only in `prompts/v1/agents/orchestrator.md` and `prompts/omo/agents/orchestrator.md`; do not modify `prompts/codex/**` or inject OpenCode-specific semantics into Codex manifests or generated agent profiles.
- Preserve existing wrapper-specific fields such as `run_in_background`; guidance must require using the field actually exposed by the active schema and never mixing wrapper and OpenCode field names.
- Do not make model/provider requests, inspect real user sessions, or read real user session stores. The process-surface test must use a fake OpenCode child.
- Official Codex generation is verification-only. Do not modify generator production code or accept tracked/generated drift from this OpenCode-only feature.
- Do not run `git add`, `git commit`, `git push`, `git tag`, or any other Git write. Only the parent orchestrator may commit after separate explicit user permission; implementation subagents cannot commit.

---

## File Map

### Planned modifications

- `src/cli/shim.ts` — parse the opt-in, build the isolated child environment, and expose the flag in CLI help.
- `src/cli/shim.test.ts` — unit-test parsing/environment/help and exercise the real shim process against a fake OpenCode child.
- `README.md` — document startup syntax, exact environment value, host ownership, passthrough, bypass, restart, and non-durable/no-polling behavior.
- `prompts/v1/agents/orchestrator.md` — add capability-gated native OpenCode background guidance for the skill-driven workflow.
- `prompts/omo/agents/orchestrator.md` — add the semantically aligned native OpenCode guidance for the default workflow.
- `src/intent/prompt-loader.test.ts` — lock the seven model-guidance rules and both prompt-maintenance records.
- `docs/v1-maintenance.md` — record the local v1 orchestrator adaptation.
- `docs/prompt-sync.md` — record the local omo orchestrator adaptation.
- `src/codex/plugin-generator.test.ts` — prove OpenCode source guidance exists while Codex source, in-memory, temporary generated, and tracked generated orchestrators exclude its unique markers.
- `src/permissions/index.test.ts` — characterize preservation of OpenCode's non-empty running acknowledgement.
- `src/runtime-fallback/interruption-output-adapter.test.ts` — characterize normal running/completed/error Task envelopes as non-interruptions.
- `src/runtime-fallback/event-handler-idle-continuation.test.ts` — characterize child idle with no unfinished todos as prompt-free.

### Read-only implementation references

- `src/permissions/index.ts` — existing empty-output detector; no planned production change.
- `src/runtime-fallback/interruption-output-adapter.ts` — existing transport-interruption classifier; no planned production change.
- `src/runtime-fallback/event-handler-idle-continuation.ts` — existing unfinished-todo gate; no planned production change.
- `src/runtime-fallback/event-handler-test-fixtures.ts` — existing controlled client and session event fixtures.
- `src/codex/plugin-generator.ts` and `scripts/gen-codex-plugin.ts` — existing generator behavior and official entry point; verification only.
- `src/config/load.ts` — environment inputs that final generator verification must isolate and restore.
- `src/config/schema.ts`, `schema.json`, `prompts/codex/**`, `.agents/plugins/marketplace.json`, `.codex/agents/**`, and `plugins/deepwork/**` — protected surfaces that exact-path and drift checks must show unchanged.

## Scenario Contract

| Scenario | Binary pass criteria |
|---|---|
| Happy path: enabled child | Running the source shim with `--background-subagents` and a fake OpenCode executable exits `0`; the fake receives unchanged OpenCode arguments and exactly `"true"` for `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`; the caller's environment remains unchanged. |
| Edge: inherited value and `--` | Without the consumed flag, an inherited environment value is absent in the fake child. In `ocmm -- --background-subagents`, the child still has no enablement and receives the literal argument `--background-subagents`. |
| Adjacent: default/foreground CLI | Default parsing remains `backgroundSubagents === false`; `--fast`, profile/no-profile, passthrough, help, and every isolation mode retain their existing behavior. Prompt guidance keeps immediately required results in foreground mode. |
| Adjacent: hook compatibility | The non-empty running acknowledgement is byte-for-byte preserved; ordinary running/completed/error envelopes receive no interruption notice; a child idle event with no unfinished todos performs one messages read, emits zero continuation prompts, and clears idle state. |
| Adjacent: Codex isolation | Codex source and orchestrator generated profiles contain neither `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` nor the `Native OpenCode Background Subagents` section nor the OpenCode `background: true` field contract; generated inventories remain deterministic and Git-visible generated surfaces do not drift. |

### Task 1: CLI opt-in, child environment, help, process surface, and README

**Files:**
- Modify: `src/cli/shim.ts:37-51,205-315,335-403`
- Modify: `src/cli/shim.test.ts:1-16,22-210` and append the fake-process surface test near the shim environment tests
- Modify: `README.md:904-947`

**Interfaces:**
- Consumes: existing `parseArgs(argv: string[]): ShimArgs`, `buildChildEnv(parent: NodeJS.ProcessEnv, args: ShimArgs): NodeJS.ProcessEnv`, the `--` separator contract, and `main()`'s existing spawn path.
- Produces: `ShimArgs.backgroundSubagents: boolean`; child environment key `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` with exact enabled value `"true"` or complete absence; CLI help/README contract; unchanged `args.passthrough` for OpenCode.

- [ ] **Step 1: Add failing parser and child-environment tests**

  Extend the existing parse and environment suites with these exact cases. Keep the assertions in the shown order so the first RED identifies the missing `ShimArgs` field rather than an unrelated fixture problem:

  ```ts
  it("consumes --background-subagents only before the passthrough separator", () => {
    const enabled = parseArgs([
      "--profile", "work",
      "--no-profile",
      "--fast",
      "--background-subagents",
      "run", "hello",
    ])
    assert.equal(enabled.backgroundSubagents, true)
    assert.equal(enabled.profile, "work")
    assert.equal(enabled.noProfile, true)
    assert.equal(enabled.fast, true)
    assert.deepEqual(enabled.passthrough, ["run", "hello"])

    const passthrough = parseArgs(["--", "--background-subagents", "run", "hello"])
    assert.equal(passthrough.backgroundSubagents, false)
    assert.deepEqual(passthrough.passthrough, ["--background-subagents", "run", "hello"])
  })

  it("keeps background enablement orthogonal to every isolation mode", () => {
    for (const mode of ["none", "inline", "config-file", "config-dir", "xdg"] as const) {
      const args = parseArgs(["--background-subagents", "--mode", mode, "run", "hello"])
      assert.equal(args.backgroundSubagents, true, mode)
      assert.equal(args.mode, mode)
      assert.deepEqual(args.passthrough, ["run", "hello"])
    }
  })

  it("scopes native background enablement to a copied child environment", async () => {
    const mod = await import("./shim.ts")
    const parent = {
      PATH: "parent-path",
      OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS: "ambient-parent-value",
    }
    const originalParent = { ...parent }

    const enabled = mod.buildChildEnv(parent, parseArgs(["--background-subagents"]))
    assert.notEqual(enabled, parent)
    assert.deepEqual(parent, originalParent)
    assert.equal(enabled.OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS, "true")

    const disabled = mod.buildChildEnv(parent, parseArgs([]))
    assert.deepEqual(parent, originalParent)
    assert.equal(disabled.OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS, undefined)
    assert.equal("OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS" in disabled, false)
  })
  ```

- [ ] **Step 2: Run the focused unit tests and confirm feature-specific RED**

  Run:

  ```powershell
  node --test --experimental-strip-types --test-name-pattern="background-subagents|background enablement" src/cli/shim.test.ts
  ```

  Expected: non-zero exit. The parser assertion reports `undefined !== true`, and the environment assertion reports that the child did not receive `"true"`. There must be no module-resolution, missing-`dist`, or syntax failure; tests import `src/cli/shim.ts` directly.

- [ ] **Step 3: Add a failing help and fake-OpenCode process-surface test**

  Replace the imports at the top of `src/cli/shim.test.ts` with imports that include `spawnSync`, then add the helper and test below:

  ```ts
  import { spawnSync } from "node:child_process"
  import { describe, it, before, after } from "node:test"
  import assert from "node:assert/strict"
  import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs"
  import { tmpdir } from "node:os"
  import { join } from "node:path"
  ```

  ```ts
  function runSourceShim(args: string[], env: NodeJS.ProcessEnv = process.env) {
    return spawnSync(
      process.execPath,
      ["--experimental-strip-types", join(process.cwd(), "src", "cli", "shim.ts"), ...args],
      { cwd: process.cwd(), env: { ...env }, encoding: "utf8" },
    )
  }

  it("documents the background flag and scopes it on the real shim spawn surface", () => {
    const help = runSourceShim(["--help"])
    assert.equal(help.status, 0, help.stderr)
    assert.match(help.stdout, /--background-subagents/)

    const root = mkdtempSync(join(tmpdir(), "ocmm-shim-background-"))
    const fakeOpenCode = join(root, "fake-opencode.mjs")
    const enabledCapture = join(root, "enabled.json")
    const disabledCapture = join(root, "disabled.json")
    const passthroughCapture = join(root, "passthrough.json")
    writeFileSync(fakeOpenCode, `
      import { writeFileSync } from "node:fs"
      const [capturePath, ...args] = process.argv.slice(2)
       writeFileSync(capturePath, JSON.stringify({
         args,
         backgroundSubagents: process.env.OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS ?? null,
         credentialSentinel: process.env.OCMM_BACKGROUND_TEST_SECRET ?? null,
       }))
     `)

    const originalProcessValue = process.env.OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS
    const credentialShapedName = /API_KEY|TOKEN|SECRET|PASSWORD|AUTH|CREDENTIAL/i
    const sanitizedParentEnv = Object.fromEntries(
      Object.entries({
        ...process.env,
        OCMM_BACKGROUND_TEST_SECRET: "must-not-leak",
      }).filter(([key, value]) => value !== undefined && !credentialShapedName.test(key)),
    )
    const ambientEnv = {
      ...sanitizedParentEnv,
      XDG_CONFIG_HOME: root,
      OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS: "ambient-parent-value",
    }
    try {
      const enabled = runSourceShim([
        "--mode", "none",
        "--opencode", process.execPath,
        "--background-subagents",
        "--", fakeOpenCode, enabledCapture, "run", "hello",
      ], ambientEnv)
      assert.equal(enabled.status, 0, enabled.stderr)
      assert.deepEqual(JSON.parse(readFileSync(enabledCapture, "utf8")), {
        args: ["run", "hello"],
        backgroundSubagents: "true",
        credentialSentinel: null,
      })

      const disabled = runSourceShim([
        "--mode", "none",
        "--opencode", process.execPath,
        "--", fakeOpenCode, disabledCapture, "run", "hello",
      ], ambientEnv)
      assert.equal(disabled.status, 0, disabled.stderr)
      assert.deepEqual(JSON.parse(readFileSync(disabledCapture, "utf8")), {
        args: ["run", "hello"],
        backgroundSubagents: null,
        credentialSentinel: null,
      })

      const passthrough = runSourceShim([
        "--mode", "none",
        "--opencode", process.execPath,
        "--", fakeOpenCode, passthroughCapture, "--background-subagents",
      ], ambientEnv)
      assert.equal(passthrough.status, 0, passthrough.stderr)
      assert.deepEqual(JSON.parse(readFileSync(passthroughCapture, "utf8")), {
        args: ["--background-subagents"],
        backgroundSubagents: null,
        credentialSentinel: null,
      })
      assert.equal(process.env.OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS, originalProcessValue)
    } finally {
      rmSync(root, { recursive: true, force: true })
      assert.equal(existsSync(root), false, "fake OpenCode artifacts must be removed")
    }
  })
  ```

  The fixture captures only passthrough arguments, the single relevant child environment value, and a synthetic credential sentinel that must remain absent. Its child environment removes every credential-shaped key before spawning, executes Node as fake OpenCode, and performs no OpenCode or model request.

- [ ] **Step 4: Run the process-surface test and confirm help/spawn RED**

  Run:

  ```powershell
  node --test --experimental-strip-types --test-name-pattern="real shim spawn surface" src/cli/shim.test.ts
  ```

  Expected: non-zero exit with the first failure stating that help does not match `/--background-subagents/`. If the assertion order changes, the enabled capture may instead report `backgroundSubagents: null`; either is a valid feature-specific RED. The `finally` assertion must prove the temporary directory was removed even on failure.

- [ ] **Step 5: Implement the minimal shim contract**

  Make only these structural changes in `src/cli/shim.ts`:

  ```ts
  interface ShimArgs {
    profile?: string
    noProfile: boolean
    fast: boolean
    backgroundSubagents: boolean
    mode?: IsolationMode
    noProviders: boolean
    noPlugins: boolean
    configDir?: string
    configFile?: string
    opencodeBin?: string
    keepOmo: boolean
    reset: boolean
    help: boolean
    passthrough: string[]
  }
  ```

  ```ts
  const args: ShimArgs = {
    noProviders: false,
    noPlugins: false,
    noProfile: false,
    fast: false,
    backgroundSubagents: false,
    keepOmo: false,
    reset: false,
    help: false,
    passthrough: [],
  }
  ```

  Insert this switch arm before the generic passthrough branch:

  ```ts
  case "--background-subagents":
    args.backgroundSubagents = true
    break
  ```

  Add the child-only environment handling immediately after `OCMM_FAST` handling:

  ```ts
  if (args.backgroundSubagents) {
    env.OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS = "true"
  } else {
    delete env.OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS
  }
  ```

  Update the help usage and flag list with the exact token and make the config-default sentence explicitly exclude it:

  ```text
  USAGE:
    ocmm [-p <name>] [-n] [--fast] [--background-subagents] [--mode <m>]
          [--no-providers] [--no-plugins] [--ocmm-only]
          [--config-dir <path>] [--opencode <path-or-name>]
          [--keep-omo] [--reset] [-- <opencode args...>]

        --background-subagents
                           Enable OpenCode's experimental native background subagents
                           in the spawned process only
  ```

  Replace the final help sentence with:

  ```text
  All flags except -p/--profile, --fast, --background-subagents, --reset, and --help can also be set in the `shim`
  section of ocmm.json[c]. CLI flags override config values.
  ```

  Do not modify `main()`'s isolation switch or spawn options: `buildChildEnv(process.env, args)` already runs before all five mode-specific variables are added.

- [ ] **Step 6: Run all shim tests and confirm GREEN**

  Run:

  ```powershell
  node --test --experimental-strip-types src/cli/shim.test.ts
  ```

  Expected: exit `0`; every shim test passes, including enabled/disabled/`--` process captures, every isolation mode, help, fast mode, profile, and unchanged passthrough behavior. No `dist/` build is required.

- [ ] **Step 7: Document the CLI and host-owned lifecycle in README**

  Preserve all existing examples and add this example after the `--fast` example:

  ```text
  ocmm --background-subagents run "Research independently" # opt into OpenCode native background tasks
  ```

  Add this row to the flag block:

  ```text
      --background-subagents Enable OpenCode's experimental native background subagents
  ```

  Replace the paragraph immediately after the flag block with wording that retains the `--fast` explanation and adds the exact boundary:

  ```markdown
  All non-ocmm args (including `-c`, `--continue`, `--model`, `run`, etc.) pass through to opencode. Before the explicit `--` separator, `--fast` and `--background-subagents` are ocmm shim flags; after it, tokens pass through verbatim, so `ocmm -- --background-subagents` does not enable the feature and sends that token to OpenCode.

  `--background-subagents` is an experimental, OpenCode-only startup opt-in. The shim sets `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS="true"` only in the spawned OpenCode child; without the consumed flag it removes any inherited value, preventing ambient parent state from enabling the feature. The shim does not mutate the caller environment. Direct `opencode`, direct plugin loading, and `ocmm-lsp` bypass this convenience flag, and an already-running OpenCode process must be restarted through `ocmm --background-subagents` for the startup setting to take effect.

  OpenCode owns the background child-session lifecycle and automatically notifies the parent when work completes or errors. ocmm provides no polling/status/cancel tool, job persistence, or restart recovery; background jobs are process-local and not durable across process restart.
  ```

- [ ] **Step 8: Review Task 1 without committing**

  Run:

  ```powershell
  git diff -- src/cli/shim.ts src/cli/shim.test.ts README.md
  ```

  Expected: only the opt-in parser/env/help logic, tests, and scoped README additions appear. Do not stage or commit; return the diff and test evidence to the parent orchestrator.

### Task 2: Capability-gated OpenCode guidance, maintenance records, and Codex isolation

**Files:**
- Modify: `prompts/v1/agents/orchestrator.md:144-155`
- Modify: `prompts/omo/agents/orchestrator.md:104-108`
- Modify: `src/intent/prompt-loader.test.ts:685-709`
- Modify: `docs/v1-maintenance.md:61-75` (the `agents/orchestrator.md` mapping row)
- Modify: `docs/prompt-sync.md:18-28` (the `orchestrator` mapping row)
- Modify: `src/codex/plugin-generator.test.ts:1-23,506-592` or append adjacent to the Codex agent-generation tests
- Read only: `prompts/codex/agents/orchestrator.md`, `.codex/agents/dw-orchestrator.toml`, and `plugins/deepwork/agents/dw-orchestrator.toml`

**Interfaces:**
- Consumes: the active callable `task` schema (`background?: boolean`, when exposed), native OpenCode automatic parent notification, existing `task_id` child-session continuation semantics, and existing Codex `generateCodexPlugin()` test helpers.
- Produces: one semantically identical `## Native OpenCode Background Subagents` contract in each OpenCode orchestrator prompt; dated maintenance records; tests that bind seven guidance rules and exclude unique OpenCode markers from Codex orchestrator surfaces.

- [ ] **Step 1: Add the failing OpenCode prompt contract test**

  Add this test near the existing orchestrator prompt contract tests in `src/intent/prompt-loader.test.ts`:

  ```ts
  test("OpenCode orchestrators load capability-gated native background guidance", () => {
    const heading = "## Native OpenCode Background Subagents"
    for (const workflow of ["v1", "omo"] as const) {
      const prompt = readFileSync(
        join(process.cwd(), "prompts", workflow, "agents", "orchestrator.md"),
        "utf8",
      )
      assert.equal(countOccurrences(prompt, heading), 1, `${workflow}: heading count`)
      assert.match(prompt, /currently callable `task` schema exposes `background`/i, `${workflow}: capability gate`)
      assert.match(prompt, /use `background: true` only/i, `${workflow}: native field`)
      assert.match(prompt, /useful independent work/i, `${workflow}: independent work`)
      assert.match(prompt, /foreground mode.*requires? the result immediately/is, `${workflow}: foreground dependency`)
      assert.match(prompt, /automatically injects? completion or error.*do not (?:sleep, )?poll/is, `${workflow}: notification`)
      assert.match(prompt, /`task_id` continues? the child session.*not a polling job ID/is, `${workflow}: continuation semantics`)
      assert.match(prompt, /do not invent `task_status`, `background_output`, or `background_cancel`/i, `${workflow}: no invented tools`)
      assert.match(prompt, /`run_in_background`.*schema.*do not mix/is, `${workflow}: wrapper schema`)
      assert.match(prompt, /process-local.*not restart-durable/is, `${workflow}: lifecycle`)
    }

    const v1Maintenance = readFileSync(join(process.cwd(), "docs", "v1-maintenance.md"), "utf8")
    const omoMaintenance = readFileSync(join(process.cwd(), "docs", "prompt-sync.md"), "utf8")
    assert.match(v1Maintenance, /2026-08-01 OpenCode background-subagent adaptation/i)
    assert.match(omoMaintenance, /2026-08-01 OpenCode background-subagent adaptation/i)
  })
  ```

- [ ] **Step 2: Add the failing Codex-isolation generator test**

  Add this test in `src/codex/plugin-generator.test.ts`. Its first assertions require the new OpenCode contract, making the pre-implementation RED attributable to the requested feature; the later assertions protect Codex without assuming that unrelated Codex prompts lack existing wrapper-specific `background_output` examples.

  ```ts
  test("OpenCode native background guidance stays out of Codex orchestrators", async () => {
    const heading = "## Native OpenCode Background Subagents"
    const envKey = "OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS"
    for (const workflow of ["v1", "omo"] as const) {
      const source = readFileSync(
        join(process.cwd(), "prompts", workflow, "agents", "orchestrator.md"),
        "utf8",
      )
      assert.match(source, /currently callable `task` schema exposes `background`/i, workflow)
      assert.equal(countOccurrences(source, heading), 1, workflow)
    }

    const assertCodexIsolated = (text: string, label: string): void => {
      assert.doesNotMatch(text, new RegExp(envKey), `${label}: environment key`)
      assert.equal(text.includes(heading), false, `${label}: OpenCode heading`)
      assert.doesNotMatch(text, /use `background: true` only when the currently callable `task` schema/i, `${label}: native field contract`)
    }

    const codexSource = readFileSync(
      join(process.cwd(), "prompts", "codex", "agents", "orchestrator.md"),
      "utf8",
    )
    assertCodexIsolated(codexSource, "Codex source orchestrator")

    const agents = await buildCodexAgents({
      config: { ...defaultConfig(), workflow: "codex" },
      cwd: process.cwd(),
      skillsRoot: join(process.cwd(), "skills"),
    })
    const inMemory = agents.find((agent) => agent.sourceName === "orchestrator")
    assert.ok(inMemory)
    assertCodexIsolated(inMemory.developerInstructions, "in-memory Codex orchestrator")

    const root = mkdtempSync(join(tmpdir(), "ocmm-codex-background-isolation-"))
    try {
      const result = await generateCodexPlugin({
        projectRoot: process.cwd(),
        pluginRoot: join(root, "plugins", "deepwork"),
        marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
        projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
        config: { ...defaultConfig(), workflow: "codex" },
        packageVersion: "9.9.9",
      })
      for (const [label, file] of [
        ["temporary plugin", join(result.pluginRoot, "agents", "dw-orchestrator.toml")],
        ["temporary project", join(root, CODEX_PROJECT_AGENTS_DIR, "dw-orchestrator.toml")],
        ["tracked plugin", join(process.cwd(), CODEX_PLUGIN_DIR, "agents", "dw-orchestrator.toml")],
        ["tracked project", join(process.cwd(), CODEX_PROJECT_AGENTS_DIR, "dw-orchestrator.toml")],
      ] as const) {
        const instructions = parseGeneratedDeveloperInstructions(readFileSync(file, "utf8"), label)
        assertCodexIsolated(instructions, label)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
      assert.equal(existsSync(root), false, "temporary Codex generation must be removed")
    }
  })
  ```

- [ ] **Step 3: Run both focused tests and confirm guidance-specific RED**

  Run:

  ```powershell
  node --test --experimental-strip-types --test-name-pattern="capability-gated native background|native background guidance stays out" src/intent/prompt-loader.test.ts src/codex/plugin-generator.test.ts
  ```

  Expected: non-zero exit. Both tests fail because `prompts/v1/agents/orchestrator.md` and `prompts/omo/agents/orchestrator.md` lack the capability-gate marker/heading. There must be no missing generated bundle or build-output failure: the generator test creates its own temporary output and reads only already tracked orchestrator profiles for the isolation comparison.

- [ ] **Step 4: Add the exact guidance to both OpenCode orchestrator prompts**

  Insert this section immediately after `## Delegation Prompt Contract` and before the next existing dispatch/verification heading in both prompt files:

  ```markdown
  ## Native OpenCode Background Subagents

  OpenCode's native background-subagent mode is capability-gated. Use `background: true` only when the currently callable `task` schema exposes `background`; never infer support from this prompt or from an environment setting.

  - Use background mode only when the parent has useful independent work. Keep a task in foreground mode when the parent requires the result immediately.
  - OpenCode automatically injects completion or error into the parent session. Do not sleep, poll, or repeatedly ask for status.
  - `task_id` continues the child session; it is not a polling job ID.
  - Do not invent `task_status`, `background_output`, or `background_cancel` unless the active schema independently exposes those tools.
  - If a wrapper exposes a different field such as `run_in_background`, follow that schema exactly and do not mix it with `background`.
  - Background work is process-local and not restart-durable.
  ```

  Do not edit any file under `prompts/codex/`.

- [ ] **Step 5: Synchronize the v1 and omo maintenance records**

  Append this sentence to the `agents/orchestrator.md` row's “Adapted for v1” cell in `docs/v1-maintenance.md`:

  ```markdown
  **2026-08-01 OpenCode background-subagent adaptation:** capability-gated native `task.background`, foreground dependency rule, automatic host notification without polling, child-session `task_id` semantics, schema-bound wrapper fields, and process-local/non-durable lifecycle; Codex remains excluded.
  ```

  Append this sentence to the `orchestrator` row's “Local adaptation” cell in `docs/prompt-sync.md`:

  ```markdown
  **2026-08-01 OpenCode background-subagent adaptation:** omo and v1 orchestrators use native `background: true` only when the active Task schema exposes it, keep immediate dependencies foreground, rely on automatic host completion/error injection without polling, preserve child-session `task_id` semantics, and keep the OpenCode-only contract out of Codex.
  ```

- [ ] **Step 6: Run prompt and generator tests and confirm GREEN**

  Run:

  ```powershell
  node --test --experimental-strip-types src/intent/prompt-loader.test.ts src/codex/plugin-generator.test.ts
  ```

  Expected: exit `0`; all prompt-loader and generator tests pass. The temporary Codex directory is removed, and no tracked generator file is written by the test.

- [ ] **Step 7: Inspect protected prompt/generated surfaces without committing**

  Run:

  ```powershell
  git diff -- prompts/v1/agents/orchestrator.md prompts/omo/agents/orchestrator.md docs/v1-maintenance.md docs/prompt-sync.md src/intent/prompt-loader.test.ts src/codex/plugin-generator.test.ts
  git status --short -- prompts/codex .agents/plugins/marketplace.json .codex/agents plugins/deepwork
  ```

  Expected: the first command shows only the two OpenCode prompts, matching maintenance records, and tests. The second command prints nothing. Do not stage or commit.

### Task 3: Existing Hook compatibility characterization

**Files:**
- Modify tests only: `src/permissions/index.test.ts:356-397`
- Modify tests only: `src/runtime-fallback/interruption-output-adapter.test.ts:37-121`
- Modify tests only: `src/runtime-fallback/event-handler-idle-continuation.test.ts:48-139`
- Read only unless a genuine regression fails: `src/permissions/index.ts:1084-1091`
- Read only unless a genuine regression fails: `src/runtime-fallback/interruption-output-adapter.ts:7-101`
- Read only unless a genuine regression fails: `src/runtime-fallback/event-handler-idle-continuation.ts:20-73`

**Interfaces:**
- Consumes: OpenCode's verified non-empty `<task state="running">` acknowledgement, ordinary `<task state="completed">`/`<task state="error">` envelopes, `createPermissionGuards()`, `createSubagentInterruptionOutputAdapter()`, `makeControlledClient()`, `makeCreatedEvent()`, and `makeIdleEvent()`.
- Produces: regression locks proving normal host-owned lifecycle text is transparent to the empty-output and interruption adapters and a child with no unfinished todos receives no idle-continuation prompt.

> **Characterization-test rule:** The approved design states that these behaviors already exist and production Hook changes are unplanned. Therefore these tests must be written against the real current implementation and are expected to pass on their first honest run. Manufacturing RED with a temporary source mutation, forced assertion, invented host envelope, or missing fixture would violate the no-preemptive-Hook-change and no-fake-failure constraints. If any test genuinely fails, stop this task, preserve the exact failing output, and return it to the parent orchestrator before proposing a production Hook change.

- [ ] **Step 1: Lock non-empty running acknowledgement preservation**

  Add this independent test in `src/permissions/index.test.ts` rather than broadening the existing multi-guard test:

  ```ts
  test("empty task response detector preserves OpenCode background running acknowledgement", async () => {
    const guards = createPermissionGuards({
      getConfig: configWithReadme,
      projectRoot: process.cwd(),
    })
    const acknowledgement = `<task id="child-session" state="running">
  <summary>Background task started</summary>
  <task_result>
  The task is working in the background. You will be notified automatically when it finishes.
  DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.
  Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.
  </task_result>
  </task>`
    const output = { output: acknowledgement }

    await guards.after({ tool: "task" }, output)

    assert.equal(output.output, acknowledgement)
    assert.doesNotMatch(output.output, /Task Empty Response Warning/)
  })
  ```

- [ ] **Step 2: Lock ordinary running/completed/error envelopes as non-interruptions**

  Add this test in `src/runtime-fallback/interruption-output-adapter.test.ts`:

  ```ts
  test("native background lifecycle envelopes do not trigger interruption recovery", async () => {
    const adapter = createSubagentInterruptionOutputAdapter({
      getConfig: () => defaultConfig(),
      controller: controller(),
    })
    const envelopes = [
      `<task id="child" state="running">
  <summary>Background task started</summary>
  <task_result>The task is working in the background. You will be notified automatically when it finishes.</task_result>
  </task>`,
      `<task id="child" state="completed">
  <summary>Background task completed: inspect files</summary>
  <task_result>Inspection complete.</task_result>
  </task>`,
      `<task id="child" state="error">
  <summary>Background task failed: inspect files</summary>
  <task_error>Child returned exit code 1.</task_error>
  </task>`,
    ]

    for (const envelope of envelopes) {
      const output = { output: envelope, metadata: { sessionId: "child" } }
      await adapter(
        { tool: "task", sessionID: "parent", callID: "background-result" },
        output,
      )
      assert.equal(output.output, envelope)
      assert.equal(output.output.includes(SUBAGENT_CONTINUATION_NOTICE_PREFIX), false)
    }
  })
  ```

  These fixtures use the host's real envelope vocabulary and avoid embedding transport-interruption phrases inside application error text. They test normal lifecycle classification, not transport failure recovery.

- [ ] **Step 3: Lock child idle without unfinished todos as prompt-free**

  Add this test in `src/runtime-fallback/event-handler-idle-continuation.test.ts`:

  ```ts
  test("idle continuation: completed background child without unfinished todos emits no prompt", async () => {
    const childSessionID = "ses_background_child"
    const parentSessionID = "ses_background_parent"
    const completedChildMessages = {
      data: [{
        role: "assistant",
        parts: [{
          type: "text",
          text: "Inspection complete.",
        }],
      }],
    }
    const mock = makeControlledClient([], {
      messagesResults: [Promise.resolve(completedChildMessages)],
    })
    const idleState = createIdleContinuationState()
    idleState.globalEnabled = true
    const handler = createRuntimeFallbackEventHandler({
      getConfig: () => makeConfig({ enabled: true }),
      client: mock.client,
      idleState,
    })

    await handler(makeCreatedEvent(childSessionID, { parentID: parentSessionID }))
    await handler(makeIdleEvent(childSessionID))

    assert.equal(mock.messages, 1)
    assert.equal(continuationCalls(mock.calls).length, 0)
    assert.equal(idleState.sessionData.has(childSessionID), false)
    assert.equal(idleState.activeLeases.has(childSessionID), false)
  })
  ```

- [ ] **Step 4: Run the three focused characterization tests**

  Run:

  ```powershell
  node --test --experimental-strip-types --test-name-pattern="background running acknowledgement|background lifecycle envelopes|completed background child" src/permissions/index.test.ts src/runtime-fallback/interruption-output-adapter.test.ts src/runtime-fallback/event-handler-idle-continuation.test.ts
  ```

  Expected: exit `0`; three tests pass. If the command exits non-zero, do not edit production Hook files. Report the exact failing test, actual output, input envelope, and relevant source branch to the parent orchestrator so the proven conflict can be assessed against the approved design.

- [ ] **Step 5: Run the complete affected Hook test files**

  Run:

  ```powershell
  node --test --experimental-strip-types src/permissions/index.test.ts src/runtime-fallback/interruption-output-adapter.test.ts src/runtime-fallback/event-handler-idle-continuation.test.ts
  ```

  Expected: exit `0`; all existing permission, interruption, and idle-continuation tests remain green. `git status --short -- src/permissions/index.ts src/runtime-fallback/interruption-output-adapter.ts src/runtime-fallback/event-handler-idle-continuation.ts` prints nothing.

- [ ] **Step 6: Review the test-only boundary without committing**

  Run:

  ```powershell
  git diff -- src/permissions/index.test.ts src/runtime-fallback/interruption-output-adapter.test.ts src/runtime-fallback/event-handler-idle-continuation.test.ts
  git status --short -- src/permissions/index.ts src/runtime-fallback/interruption-output-adapter.ts src/runtime-fallback/event-handler-idle-continuation.ts
  ```

  Expected: the first command shows only the three compatibility tests; the second prints nothing. Do not stage or commit.

### Task 4: Integration, diagnostics, determinism, scenario evidence, and cleanup

**Files:**
- Verify all planned modified files from the File Map
- Verify protected paths: `src/config/schema.ts`, `schema.json`, `src/permissions/index.ts`, `src/runtime-fallback/interruption-output-adapter.ts`, `src/runtime-fallback/event-handler-idle-continuation.ts`, `src/codex/plugin-generator.ts`, `scripts/gen-codex-plugin.ts`, `prompts/codex/**`, `.agents/plugins/marketplace.json`, `.codex/agents/**`, and Git-visible files under `plugins/deepwork/**`
- No new files outside the approved spec and this plan

**Interfaces:**
- Consumes: completed Tasks 1-3, package scripts `typecheck`, `test`, `build`, and `gen:codex-plugin`, LSP diagnostics, Git read-only inspection, and the fake-process test.
- Produces: one final evidence packet containing focused GREEN results, compiler/LSP cleanliness, full repository gates, fake-process scenario proof, exact changed-path proof, environment restoration, deterministic Codex manifests, no protected-surface drift, and no untracked test artifacts.

- [ ] **Step 1: Run all focused feature and compatibility tests from source**

  Run:

  ```powershell
  node --test --experimental-strip-types --test-name-pattern="background-subagents|background enablement|real shim spawn surface" src/cli/shim.test.ts
  node --test --experimental-strip-types --test-name-pattern="capability-gated native background|native background guidance stays out" src/intent/prompt-loader.test.ts src/codex/plugin-generator.test.ts
  node --test --experimental-strip-types --test-name-pattern="background running acknowledgement|background lifecycle envelopes|completed background child" src/permissions/index.test.ts src/runtime-fallback/interruption-output-adapter.test.ts src/runtime-fallback/event-handler-idle-continuation.test.ts
  ```

  Expected: every command exits `0`; no command reads `dist/`, starts real OpenCode, accesses a real user session, or makes a model/provider request. The fake-process test's final assertion proves its temporary capture directory was deleted.

- [ ] **Step 2: Run TypeScript diagnostics on every changed TypeScript file**

  Invoke `lsp_diagnostics` with `severity: "error"` for each of these exact files:

  ```text
  src/cli/shim.ts
  src/cli/shim.test.ts
  src/intent/prompt-loader.test.ts
  src/codex/plugin-generator.test.ts
  src/permissions/index.test.ts
  src/runtime-fallback/interruption-output-adapter.test.ts
  src/runtime-fallback/event-handler-idle-continuation.test.ts
  ```

  Expected: every result has zero error diagnostics. If the TypeScript language server is unavailable, run the repository Compiler API equivalent instead:

  ```powershell
  pnpm exec tsc --noEmit --pretty false
  ```

  Expected fallback: exit `0` with no diagnostics.

- [ ] **Step 3: Run the complete repository gates once**

  Run in this order:

  ```powershell
  pnpm run typecheck
  pnpm test
  pnpm run build
  ```

  Expected: all three commands exit `0`. `typecheck` emits no TypeScript errors; `pnpm test` reports both Node and Cargo test suites passing; `build` produces the TypeScript distribution and release/native binary outputs without error. Do not install missing software—report an unavailable pre-existing toolchain as unverified evidence instead.

- [ ] **Step 4: Verify the official Codex generator twice with a stable full manifest and restored environment**

  Run this PowerShell transaction from the repository root. The first official run may legitimately refresh ignored `plugins/deepwork/dist/**` after `pnpm run build`; determinism is therefore proven by comparing the complete path/SHA-256 manifest immediately before and after the second run, while Git-visible status/diff must equal the baseline across both runs.

  ```powershell
  $repo = (Get-Location).Path
  $generatedScopes = @(
    ".agents/plugins/marketplace.json",
    ".codex/agents",
    "plugins/deepwork"
  )
  $environmentNames = @(
    "CODEX_HOME",
    "XDG_CONFIG_HOME",
    "OCMM_NO_PROFILE",
    "OCMM_PROFILE",
    "OCMM_FAST",
    "OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS"
  )
  $savedEnvironment = @{}
  foreach ($name in $environmentNames) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
  }
  $isolatedHome = Join-Path ([IO.Path]::GetTempPath()) ("ocmm-codex-generator-" + [guid]::NewGuid().ToString("N"))
  [IO.Directory]::CreateDirectory($isolatedHome) | Out-Null
  $generatorFailure = $null

  function Get-GeneratedManifest {
    param([string]$RepositoryRoot)
    $roots = @(
      (Join-Path $RepositoryRoot ".agents/plugins/marketplace.json"),
      (Join-Path $RepositoryRoot ".codex/agents"),
      (Join-Path $RepositoryRoot "plugins/deepwork")
    )
    $files = foreach ($root in $roots) {
      if ([IO.File]::Exists($root)) {
        $root
      } elseif ([IO.Directory]::Exists($root)) {
        [IO.Directory]::EnumerateFiles($root, "*", [IO.SearchOption]::AllDirectories)
      }
    }
    @($files | Sort-Object | ForEach-Object {
      $relativePath = [IO.Path]::GetRelativePath($RepositoryRoot, $_).Replace("\", "/")
      $hash = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()
      "$hash  $relativePath"
    })
  }

  try {
    [Environment]::SetEnvironmentVariable("CODEX_HOME", $isolatedHome, "Process")
    [Environment]::SetEnvironmentVariable("XDG_CONFIG_HOME", $isolatedHome, "Process")
    foreach ($name in @("OCMM_NO_PROFILE", "OCMM_PROFILE", "OCMM_FAST", "OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS")) {
      [Environment]::SetEnvironmentVariable($name, $null, "Process")
    }

    $baselineStatus = @(git status --porcelain=v1 --untracked-files=all -- $generatedScopes)
    if ($LASTEXITCODE -ne 0) { throw "baseline generated-scope status failed" }
    $baselineDiff = (git diff --binary --no-ext-diff -- $generatedScopes | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "baseline generated-scope diff failed" }

    pnpm run gen:codex-plugin
    if ($LASTEXITCODE -ne 0) { throw "first official Codex generation failed" }
    $manifestBeforeSecondRun = @(Get-GeneratedManifest -RepositoryRoot $repo)
    $statusBeforeSecondRun = @(git status --porcelain=v1 --untracked-files=all -- $generatedScopes)
    if ($LASTEXITCODE -ne 0) { throw "first generated-scope status failed" }
    $diffBeforeSecondRun = (git diff --binary --no-ext-diff -- $generatedScopes | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "first generated-scope diff failed" }

    pnpm run gen:codex-plugin
    if ($LASTEXITCODE -ne 0) { throw "second official Codex generation failed" }
    $manifestAfterSecondRun = @(Get-GeneratedManifest -RepositoryRoot $repo)
    $statusAfterSecondRun = @(git status --porcelain=v1 --untracked-files=all -- $generatedScopes)
    if ($LASTEXITCODE -ne 0) { throw "second generated-scope status failed" }
    $diffAfterSecondRun = (git diff --binary --no-ext-diff -- $generatedScopes | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "second generated-scope diff failed" }

    if (Compare-Object $manifestBeforeSecondRun $manifestAfterSecondRun) {
      throw "Codex generation is not deterministic by path/SHA-256 manifest"
    }
    if (Compare-Object $baselineStatus $statusBeforeSecondRun) {
      throw "first Codex generation changed Git-visible generated status"
    }
    if (Compare-Object $baselineStatus $statusAfterSecondRun) {
      throw "second Codex generation changed Git-visible generated status"
    }
    if ($baselineDiff -cne $diffBeforeSecondRun -or $baselineDiff -cne $diffAfterSecondRun) {
      throw "Codex generation changed the Git-visible generated diff"
    }

    $codexOrchestrators = @(
      "prompts/codex/agents/orchestrator.md",
      ".codex/agents/dw-orchestrator.toml",
      "plugins/deepwork/agents/dw-orchestrator.toml"
    )
    foreach ($file in $codexOrchestrators) {
      $text = [IO.File]::ReadAllText((Join-Path $repo $file))
      if ($text.Contains("OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS") -or
          $text.Contains("## Native OpenCode Background Subagents") -or
          $text.Contains('Use `background: true` only when the currently callable `task` schema')) {
        throw "OpenCode background semantics leaked into $file"
      }
    }

    $manifestDigest = [Convert]::ToHexString(
      [Security.Cryptography.SHA256]::HashData(
        [Text.Encoding]::UTF8.GetBytes(($manifestAfterSecondRun -join "`n"))
      )
    ).ToLowerInvariant()
    "Codex generator manifest: $($manifestAfterSecondRun.Count) files, sha256=$manifestDigest"
  } catch {
    $generatorFailure = $_
  } finally {
    foreach ($name in $environmentNames) {
      [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], "Process")
    }
    if ([IO.Directory]::Exists($isolatedHome)) {
      [IO.Directory]::Delete($isolatedHome, $true)
    }
  }

  foreach ($name in $environmentNames) {
    $restored = [Environment]::GetEnvironmentVariable($name, "Process")
    if ($restored -cne $savedEnvironment[$name]) {
      throw "process environment was not restored for $name"
    }
  }
  if ([IO.Directory]::Exists($isolatedHome)) {
    throw "isolated generator home was not removed"
  }
  if ($null -ne $generatorFailure) { throw $generatorFailure }
  ```

  Expected: two generator runs exit `0`; the printed full-manifest count/digest is stable; before/after-second-run manifests are identical; Git-visible generated status/diff equal the baseline; all six process environment values are restored exactly; the isolated generator home is removed; and the three Codex orchestrator surfaces contain no unique OpenCode marker. Do not scan copied runtime files for the environment string because the packaged generic CLI shim is runtime payload, not Codex model guidance.

- [ ] **Step 5: Check whitespace and the exact changed-path allowlist**

  Run:

  ```powershell
  git diff --check
  if ($LASTEXITCODE -ne 0) { throw "git diff --check failed" }

  $expectedPaths = @(
    "README.md",
    "docs/prompt-sync.md",
    "docs/superpowers/plans/2026-08-01-background-subagents.md",
    "docs/superpowers/specs/2026-08-01-background-subagents-design.md",
    "docs/v1-maintenance.md",
    "prompts/omo/agents/orchestrator.md",
    "prompts/v1/agents/orchestrator.md",
    "src/cli/shim.test.ts",
    "src/cli/shim.ts",
    "src/codex/plugin-generator.test.ts",
    "src/intent/prompt-loader.test.ts",
    "src/permissions/index.test.ts",
    "src/runtime-fallback/event-handler-idle-continuation.test.ts",
    "src/runtime-fallback/interruption-output-adapter.test.ts"
  ) | Sort-Object
  $actualPaths = @(git status --short | ForEach-Object {
    $_.Substring(3).Trim('"').Replace("\", "/")
  } | Sort-Object)
  $pathDifference = @(Compare-Object $expectedPaths $actualPaths)
  if ($pathDifference.Count -ne 0) {
    $pathDifference | Format-Table | Out-String | Write-Error
    throw "working-tree paths differ from the approved allowlist"
  }
  "Exact changed-path allowlist matched: $($actualPaths.Count) paths"
  ```

  Expected: `git diff --check` exits `0`; the allowlist prints `14` matched paths; no config/schema, production Hook, Codex prompt, generator production, generated profile, build-output, capture, or temporary file appears in Git status.

- [ ] **Step 6: Re-evaluate the binary scenario contract against evidence**

  Record `PASS` only when every assertion below is backed by the named evidence:

  ```text
  PASS enabled child: fake process capture has args ["run","hello"] and env value "true".
  PASS inherited/-- edge: disabled capture has null env; passthrough capture has ["--background-subagents"] and null env.
  PASS default/foreground: parse/isolation suites pass; both prompts require foreground for immediate dependencies.
  PASS hooks: all three focused characterizations and complete Hook test files pass; production Hook sources are absent from Git status.
  PASS Codex: isolation tests pass; two official generations share one full manifest; generated Git status/diff match baseline.
  PASS cleanup: fake-process and temporary generator directories are absent; exact-path allowlist has no test artifact.
  ```

  Any failed assertion leaves the feature unverified; do not downgrade the criterion or describe partial evidence as completion.

- [ ] **Step 7: Produce the review packet and stop before any Git write**

  Run these read-only commands:

  ```powershell
  git status --short
  git diff --stat
  git diff -- README.md docs/prompt-sync.md docs/v1-maintenance.md prompts/omo/agents/orchestrator.md prompts/v1/agents/orchestrator.md src/cli/shim.ts src/cli/shim.test.ts src/codex/plugin-generator.test.ts src/intent/prompt-loader.test.ts src/permissions/index.test.ts src/runtime-fallback/event-handler-idle-continuation.test.ts src/runtime-fallback/interruption-output-adapter.test.ts
  ```

  Expected: the packet contains the 12 implementation/test/documentation modifications plus the untracked approved spec and plan, all scenario evidence, diagnostics, focused/full test results, build result, deterministic generator digest, and exact-path result. Stop here. Only the parent orchestrator may request review and, after separate explicit user permission, perform a commit; no implementation subagent may stage or commit.

## Self-Review Receipt

- Spec coverage: Tasks 1-4 map every CLI, child-env, prompt, maintenance, compatibility, README, Codex-isolation, scenario, and repository-gate requirement from the approved design.
- Type/interface consistency: the plan uses only `ShimArgs.backgroundSubagents`, `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`, native `background: true`, and existing `task_id` continuation semantics; no job-status API is introduced.
- TDD integrity: all new behavior tests in Tasks 1-2 have feature-specific RED states that run from source and cannot be caused by stale generated bundles or missing build output. Task 3 is explicitly an approved-design characterization boundary and forbids artificial RED or preemptive production Hook edits.
- Scope: the exact-path allowlist excludes schema, production Hook, Codex prompt, generator production, and generated-profile modifications while including both already untracked planning artifacts.
- Verification: commands are PowerShell-safe, credential-sanitized, model-free, session-free, deterministic, cleanup-checked, and contain exact expected outcomes.
- Git boundary: the plan contains no staging, commit, push, tag, or other Git-write step.

**Plan-critic receipt:** `[OKAY-UNAMBIGUOUS]` — task/session `ses_043e943c0ffeyixtk78Fozzndb`; current saved revision is executable with no unresolved ambiguity.
