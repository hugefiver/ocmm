# DSMM Safety Remediation Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close CR-1, CR-2, IM-1 through IM-6, MI-1 through MI-4, and the packaged-runtime evidence gap without losing the concurrent DSMM v0.5 MCP/LSP working-tree changes.

**Architecture:** Extract bounded shell/Git parsing and resulting-plan validation into focused modules, then integrate session scope, monotonic middleware, ownership, settings readiness, mode durability, and scoped skill visibility through the existing DSMM entry points. Merge shared-file changes only after the isolated safety tasks are green, emit `dsmm/lib/**` only after all source integration is complete, and finish with an exact DSH `0.1.1-rc.2` packed-tarball Docker smoke through real Cordis session, command, prompt, skill, and tool services while retaining the v0.5 LSP diagnostic path.

**Tech Stack:** TypeScript ESM, Node.js 22 `node:test`, Node filesystem/path APIs, Schemastery, Cordis `^4.0.1`, DeepSeek Harness `0.1.1-rc.2`, pnpm workspace/lockfile, Docker, and the existing Rust `ocmm-lsp` MCP binary.

**Spec:** `docs/superpowers/specs/2026-08-24-dsmm-safety-remediation-design.md`

**Global Constraints:**
- Unrelated refactoring and new DSMM features are out of scope.
- Git classification protects known write operations. Credible but unknown Git aliases or subcommands are not automatically treated as writes.
- Generic `/deepwork` sessions receive enabled skill bodies through the active prompt. DSMM role presets receive model-invocable skills through their preset scope.
- A pinned, network- and Docker-dependent packaged DSH smoke is a mandatory completion gate, separate from offline unit tests.
- No Git commit is authorized by this design approval; implementation remains in the working tree unless separately authorized.
- The first decision intentionally replaces the review report's stricter recommendation to fail closed for every unclassifiable Git invocation. Tests and final review must evaluate the implementation against this approved known-write contract rather than claim universal Git classification.
- Align all declared DSH component peer/dev dependencies to the `0.1.1-rc.2` release generation and keep Cordis on the compatible `^4.0.1` line. Pin Docker and package scripts to `@deepseek-ai/dsh@0.1.1-rc.2`; never use `latest` in acceptance evidence.
- Preserve the v0.5 package `files` additions that include README-linked documentation. Add the `preset-skills` export and generated output to the packed artifact.
- Complete tests and source changes in non-overlapping safety files.
- Re-read every shared file immediately before editing and merge only the required hunks.
- Never stash, reset, checkout, or overwrite the concurrent work.
- Build generated `dsmm/lib/**` only after source integration is complete.
- Compare generated diffs to ensure v0.5 LSP exports and settings output remain present.
- Completion is blocked if the mandatory Docker packaged-runtime smoke cannot run or fails. No test helper result substitutes for the live pipeline evidence.

---

## Requirement and evidence map

| Requirement | Implemented by | Primary RED/GREEN evidence | Final evidence |
|---|---|---|---|
| CR-1 known Git writes through paths, `.exe`, `env`, options, multiline input, and continuations | Task 1 | `test/shell-command.test.ts`, `test/guards.test.ts` | DSMM full tests and Docker downstream-policy tool call |
| CR-2 `session.header.agentPreset` scope | Tasks 2 and 4 | header/event precedence table in `test/guards.test.ts` | real preset agent tool execution in Docker |
| IM-1 ownership, links, containment, legacy migration, atomic publication | Task 3 | adversarial filesystem table in `test/preset-materializer.test.ts` | full DSMM tests |
| IM-2 local `ask` composes with downstream policy | Task 4 | deny/ask/allow waterfall table | real `ctx.tools.execute()` downstream deny in Docker |
| IM-3 deferred settings readiness and child-context registrations | Task 5 | deferred `promptOrder: 77` integration test | full DSMM tests/typecheck |
| IM-4 append failure is logged and retryable | Task 4 | two-boundary append failure/success test | full DSMM tests |
| IM-5 no host-global model skills; generic prompt bodies; preset-scoped plugin | Task 6 | `skills`, `mode`, `prompts`, `roles`, and preset plugin tests | ordinary/deepwork/preset live Docker assertions |
| IM-6 DSH generation alignment | Task 7 | manifest/Docker pin tests and lockfile assertions | packed Docker runtime at `0.1.1-rc.2` |
| MI-1 equivalent/case paths and reconstructed final plan | Task 2 | write/edit/path matrix | full DSMM tests |
| MI-2 quoting, casing, whitespace, wrappers, continuations | Task 1 | shell dialect matrix | full DSMM tests |
| MI-3 packaged README links remain valid | Tasks 7 and 9 | package manifest tests; preserve current `files` hunks | `npm pack --dry-run --json` inventory |
| MI-4 unused outer temporary home | Task 8 | smoke source assertions | Docker run plus cleanup receipt |
| Packaged live evidence | Tasks 8 and 9 | asset tests | mandatory final `pnpm --filter dsmm smoke:docker` |

Historical evidence remains in `dsmm/docs/review-2026-08-24-safety-guards.md`; do not rewrite that rejected review. Update `dsmm/docs/safety-guards.md`, `dsmm/docs/agent-presets.md`, or `dsmm/README.md` only where Tasks 6-8 change current product behavior or acceptance instructions.

The Task 8 API names are pinned to DeepSeek Harness commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` (`0.1.1-rc.2`): core plugin order comes from `packages/test-support/agent-loop-testkit/src/index.ts`; commands from `packages/interaction/commands/src/index.ts`, `src/types.ts`, and `tests/commands.spec.ts`; the concrete in-memory settings provider shape from `packages/settings/settings/tests/settings.spec.ts`; preset mounting and `assembleContextFor()` from `packages/preset/agent-presets/tests/mount.spec.ts` and `invariant.spec.ts`; model skill filtering from `packages/skill/skill/tests/skill.spec.ts`; and `defineTool()`/`ctx.tools.execute()` from `packages/core/tools/tests/tools.spec.ts`. If the pinned package contradicts these exact surfaces at execution time, fail the smoke instead of substituting an unverified API.

## File map

### New focused modules and tests

- Create: `dsmm/src/shell-command.ts` — bounded POSIX/PowerShell tokenization, executable/wrapper normalization, known Git mutation classification, and shell-dialect violation classification.
- Create: `dsmm/test/shell-command.test.ts` — parser, Git, quoting, wrapper, separator, and continuation matrices.
- Create: `dsmm/src/plan-validation.ts` — session-cwd containment, final write/edit reconstruction, and checklist validation.
- Create: `dsmm/test/plan-validation.test.ts` — normalized path and resulting-document mutation matrices.
- Create: `dsmm/src/preset-skills.ts` — public `dsmm/preset-skills` Cordis plugin entry for role-scope model-invocable skills.
- Create: `dsmm/test/preset-skills.test.ts` — plugin config and scoped registration coverage.

### Existing source and tests

- Modify: `dsmm/src/guards.ts`, `dsmm/test/guards.test.ts` — consume the two focused safety modules, resolve header/event preset scope, and compose pre-execute decisions monotonically.
- Modify: `dsmm/src/dsh-types.ts` — add `DshSessionHeader.cwd`, `DshSessionHeader.agentPreset`, child-context injection shape, and the structural APIs consumed by readiness/runtime tests.
- Modify: `dsmm/src/preset-materializer.ts`, `dsmm/test/preset-materializer.test.ts` — exact role-bound markers, link/containment checks, safe migration/removal, and atomic new-directory publication.
- Modify: `dsmm/src/state.ts`, `dsmm/test/state.test.ts` — warn, preserve pending intent, and retry after append failure.
- Modify: `dsmm/src/settings.ts`, `dsmm/src/index.ts`, `dsmm/src/mode.ts`, `dsmm/src/commands.ts`, `dsmm/test/settings.test.ts`, `dsmm/test/mode.test.ts`, `dsmm/test/commands.test.ts` — readiness installer and child-context registration.
- Modify: `dsmm/src/skills.ts`, `dsmm/src/prompts.ts`, `dsmm/src/roles.ts`, `dsmm/test/skills.test.ts`, `dsmm/test/prompts.test.ts`, `dsmm/test/roles.test.ts`, `dsmm/test/agent-presets.test.ts` — enabled-body prompt rendering and preset-scope plugin wiring.
- Modify: `dsmm/agent-presets/*/agent.cordis.yml` — load `dsmm/preset-skills` beside the persona in each checked-in role scope.

### Package, dependency, docs, generated output, and smoke

- Modify: `dsmm/package.json`, `pnpm-lock.yaml`, `dsmm/test/package.test.ts` — `preset-skills` export, DSH generation, exact smoke pin, and preserved v0.5 package inventory.
- Modify: `dsmm/docker/Dockerfile.smoke`, `dsmm/scripts/docker-smoke.mjs`, `dsmm/test/docker-smoke-assets.test.ts` — packed artifact installation, real rc.2 runtime, cleanup, and retained LSP diagnostics.
- Modify: `dsmm/docs/safety-guards.md`, `dsmm/docs/agent-presets.md`, `dsmm/README.md` — only the directly changed contracts.
- Regenerate once after integration: `dsmm/lib/**` — include new `shell-command`, `plan-validation`, and `preset-skills` outputs while preserving v0.5 `lsp.*`, LSP exports, and LSP settings declarations.

## Ordering, ownership, and parallel constraints

1. Tasks 1, 2, and 3 are the first wave because their product files do not overlap the concurrent v0.5 source work. Tasks 1 and 3 may run in parallel. Task 2 may run in parallel with Task 3, but it must not edit `guards.ts` until Task 1's `guards.ts` hunk is integrated.
2. Task 4 starts after Tasks 1 and 2 because all three touch `guards.ts` or `guards.test.ts`; Task 4 may otherwise proceed independently of Task 3.
3. Tasks 5 and 6 are serial. They share `index.ts`, `mode.ts`, settings-dependent registration, role rendering, and materialization output.
4. Tasks 5-8 touch files already changed by v0.5. Immediately before each edit, re-run `git status --short`, read every exact path in that task's **Files** block, and run `git diff --` with those exact paths; merge only the named hunk. Never restore a file from `HEAD` or from this plan's snippets.
5. Task 7 follows Task 6 because it publishes `preset-skills`; Task 8 follows Task 7 because the packed runtime depends on the final manifest and lockfile.
6. Task 9 is the sole generated-output integration point. No earlier task runs a command whose output directory is `dsmm/lib`.
7. No task stages, commits, stashes, resets, checks out, rebases, cleans, tags, or pushes. All Git commands below are read-only inspection commands.

## Targeted TDD without touching `dsmm/lib`

Define this PowerShell helper once per implementation session. It copies the current DSMM source/test/assets to one exact OS-temporary mirror, junctions only the existing `dsmm/node_modules`, builds the mirror's `lib`, runs the requested test files there, and removes only that verified mirror. This gives every task a real RED/GREEN loop while preserving the rule that the working tree's `dsmm/lib/**` is generated only after integration.

```powershell
function Invoke-DsmmMirrorTests {
  param([Parameter(Mandatory = $true)][string[]]$Tests)

  $workspaceRoot = (Resolve-Path -LiteralPath ".").Path
  $dsmmRoot = Join-Path $workspaceRoot "dsmm"
  $tempParent = [IO.Path]::GetTempPath().TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $tempParent -PathType Container)) { throw "OS temp parent is unavailable: $tempParent" }
  $mirror = Join-Path $tempParent ("dsmm-safety-test-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $mirror | Out-Null

  try {
    foreach ($directory in @("src", "test", "skills", "prompts", "agent-presets", "docs", "patches", "scripts", "docker")) {
      $sourceDirectory = Join-Path $dsmmRoot $directory
      if (Test-Path -LiteralPath $sourceDirectory) { Copy-Item -LiteralPath $sourceDirectory -Destination (Join-Path $mirror $directory) -Recurse }
    }
    foreach ($file in @("package.json", "tsconfig.json", "tsconfig.test.json", "cordis.patch.yml", "README.md")) {
      Copy-Item -LiteralPath (Join-Path $dsmmRoot $file) -Destination (Join-Path $mirror $file)
    }

    $existingModules = Join-Path $dsmmRoot "node_modules"
    if (-not (Test-Path -LiteralPath $existingModules -PathType Container)) { throw "dsmm/node_modules must already exist; do not install from this helper" }
    New-Item -ItemType Junction -Path (Join-Path $mirror "node_modules") -Target $existingModules | Out-Null

    pnpm --dir $dsmmRoot exec tsc -p (Join-Path $mirror "tsconfig.json")
    if ($LASTEXITCODE -ne 0) { throw "temporary DSMM source build failed" }

    $resolvedTests = @($Tests | ForEach-Object { Join-Path $mirror $_ })
    node --test --experimental-strip-types $resolvedTests
    if ($LASTEXITCODE -ne 0) { throw "temporary DSMM targeted test failed" }
  } finally {
    $resolvedMirror = [IO.Path]::GetFullPath($mirror)
    $expectedPrefix = [IO.Path]::GetFullPath($tempParent + [IO.Path]::DirectorySeparatorChar)
    if (-not $resolvedMirror.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -or $resolvedMirror -eq $expectedPrefix.TrimEnd([IO.Path]::DirectorySeparatorChar)) {
      throw "refusing to remove unexpected mirror path: $resolvedMirror"
    }
    Remove-Item -LiteralPath $resolvedMirror -Recurse -Force
  }
}
```

For an expected RED, invoke the helper in `try/catch`, require the named assertion/module failure, and reject unrelated build or environment failures. For GREEN, invoke it normally and require exit `0` with every requested test passing.

---

### Task 1: Bounded shell parsing and known Git-write classification (CR-1, MI-2)

**Files:**
- Create: `dsmm/src/shell-command.ts`
- Create: `dsmm/test/shell-command.test.ts`
- Modify: `dsmm/src/guards.ts`
- Modify: `dsmm/test/guards.test.ts`

**Interfaces:**
- Consumes: `DshToolExecution`, `DshPreToolDecision`, `DsmmSettings.guards.shellCommandSafety`, and `DsmmSettings.guards.gitWriteGuard`.
- Produces:
  - `export type ShellDialect = "posix" | "powershell"`
  - `export type ShellToken = { kind: "word"; value: string; quoted: boolean } | { kind: "operator"; value: string }`
  - `export interface ParsedShellSegment { tokens: readonly ShellToken[]; words: readonly string[] }`
  - `export function parseShellCommand(input: string, dialect: ShellDialect): readonly ParsedShellSegment[]`
  - `export function classifyKnownGitWrite(input: string, dialect: ShellDialect): string | undefined`
  - `export type ShellDialectViolation = "powershell-export" | "powershell-source" | "powershell-dev-null" | "posix-powershell-env"`
  - `export function classifyShellDialectViolation(input: string, dialect: ShellDialect): ShellDialectViolation | undefined`
  - Existing `decidePreToolExecution(exec, settings, controller)` keeps its public signature and delegates shell/Git interpretation to this module.

- [ ] **Step 1: Add the failing parser and Git matrix**

Create `dsmm/test/shell-command.test.ts` with table-driven assertions for these exact cases:

| Dialect | Input | Expected |
|---|---|---|
| posix | `git commit -m x` | write `commit` |
| posix | `git.exe push origin main` | write `push` |
| posix | `"/usr/bin/git" rebase main` | write `rebase` |
| posix | `env -i CI=true git tag v1` | write `tag` |
| posix | `CI=true git -C repo reset --hard HEAD` | write `reset --hard` |
| posix | `git \\` + newline + ` clean -fd` | write `clean` |
| posix | `git status` / `log` / `diff` / `show` / `rev-parse HEAD` | `undefined` |
| posix | `git config --get user.name` and `git config user.name` | `undefined` |
| posix | `git config user.name Alice` and `git config --global --unset user.name` | write `config` |
| posix | `git notes add -m x` / `git replace old new` / `git update-ref refs/heads/x HEAD` | writes `notes add`, `replace`, `update-ref` |
| posix | `git symbolic-ref HEAD` | `undefined` |
| posix | `git symbolic-ref HEAD refs/heads/main` and `git symbolic-ref --delete HEAD` | write `symbolic-ref` |
| posix | `git publish` | `undefined` (unknown alias/subcommand decision) |
| posix | `printf '%s' 'git commit -m x'` | `undefined` |
| powershell | `& "C:\\Program Files\\Git\\cmd\\git.exe" push origin main` | write `push` |
| powershell | `GIT.EXE -C repo tag v1` | write `tag` |
| powershell | ``git ` `` + newline + `commit -m x` | write `commit` |
| powershell | `Write-Output ok` + newline + `git update-ref refs/heads/x HEAD` | write `update-ref` |

Also assert the dialect matrix:

```ts
const violations = [
  ["powershell", "  ExPoRt CI=true; pnpm test", "powershell-export"],
  ["powershell", "Write-Output ok\nSoUrCe ./env.ps1", "powershell-source"],
  ["powershell", "pnpm test > /dev/null", "powershell-dev-null"],
  ["posix", "$env:CI = 'true'; pnpm test", "posix-powershell-env"]
] as const;

const quotedProse = [
  ["powershell", "Write-Output 'export CI=true source ./env > /dev/null'"],
  ["posix", "printf '%s' '$env:CI = true'"]
] as const;
```

Expected RED: `Invoke-DsmmMirrorTests @("test/shell-command.test.ts", "test/guards.test.ts")` fails because `lib/shell-command.js` does not exist and the existing guard misses `.exe`, paths, `env`, and continuations.

- [ ] **Step 2: Implement the bounded state machine**

Implement these exact parser rules in `shell-command.ts`:

1. Scan once with states `unquoted`, `single-quoted`, and `double-quoted`; emit word/operator tokens without executing, expanding, or interpolating input.
2. In POSIX mode, backslash escapes the following character outside single quotes, and backslash plus CRLF/LF is removed as a continuation. In PowerShell mode, backtick provides the corresponding escape/continuation behavior and command names compare case-insensitively.
3. Outside quotes, split commands on CRLF/LF, `;`, `&&`, `||`, and pipelines. Treat PowerShell's leading call operator `&` as an invocation prefix, not as an empty preceding command; treat a later `&` as a boundary.
4. Preserve a word's dequoted `value` and whether any quoted characters contributed. This lets a quoted executable path be recognized while shell-safety checks ignore quoted prose arguments.
5. Before executable classification, skip POSIX `NAME=value` assignments, PowerShell assignment statements that end before a separator, and the PowerShell call operator. Unwrap `env`/`env.exe`, its `-i`/`--ignore-environment`, `-u NAME`/`--unset NAME`/`--unset=NAME`, `-C DIR`/`--chdir DIR`/`--chdir=DIR`, `--argv0 NAME`/`--argv0=NAME`, and following `NAME=value` operands.
6. Normalize the executable with `basename()` after converting both slash styles. Accept basename `git` or `git.exe`; use case-insensitive comparison only for PowerShell.
7. Skip Git global flags, including value-taking `-C`, `-c`, `--config-env`, `--exec-path`, `--git-dir`, `--namespace`, `--super-prefix`, and `--work-tree`, their attached/`=` forms, `--`, and valueless global flags.
8. Maintain the existing known mutation set and add argument-sensitive `config`, `notes`, `replace`, `update-ref`, and `symbolic-ref`. `config` is a write for value-setting positional forms and `--add`, `--replace-all`, `--unset`, `--unset-all`, `--rename-section`, `--remove-section`, or `--edit`; one-key and `--get`/`--get-all`/`--get-regexp`/`--list` query forms remain unclassified. `notes` write actions are `add`, `append`, `copy`, `edit`, `merge`, `prune`, and `remove`. `replace` writes when given replacement operands or `-d`/`--delete`, `--edit`, or `--graft`; no-argument/`--list` is unclassified. Every `update-ref` is a known write. `symbolic-ref` writes with `--delete` or two ref operands and is a query with one ref operand.
9. Return `undefined` for unknown subcommands/aliases. Do not add a universal fail-closed branch.
10. Derive shell-safety decisions from parsed command positions and redirection operands: `export`/`source` only at an unquoted PowerShell command position, `/dev/null` only as an unquoted PowerShell redirection target, and `$env:` only in unquoted POSIX executable/assignment syntax.

Modify `guards.ts` to map `bash`/`sh`/`zsh` to `posix`, `pwsh`/`powershell` to `powershell`, use one parsed interpretation for shell and Git decisions, and preserve all existing `[dsmm safety]` reason text except where the reported operation becomes more specific.

- [ ] **Step 3: Run the targeted GREEN check**

Run:

```powershell
Invoke-DsmmMirrorTests @("test/shell-command.test.ts", "test/guards.test.ts")
pnpm --filter dsmm typecheck
```

Expected: the mirror reports every shell/Git case passing, `typecheck` exits `0`, and `git diff --name-only` contains no `dsmm/lib/**` change from this task.

---

### Task 2: Resulting-plan validation and session path context (MI-1, CR-2 prerequisite)

**Files:**
- Create: `dsmm/src/plan-validation.ts`
- Create: `dsmm/test/plan-validation.test.ts`
- Modify: `dsmm/src/dsh-types.ts`
- Modify after Task 1 integration: `dsmm/src/guards.ts`
- Modify after Task 1 integration: `dsmm/test/guards.test.ts`

**Interfaces:**
- Consumes: `DshToolExecution.name`, `DshToolExecution.arguments`, `DshToolExecution.agent?.session.header?.cwd`, and `DshPreToolDecision`.
- Produces:
  - `export interface DshSessionHeader { cwd?: string; agentPreset?: string }`
  - `DshSession.header?: DshSessionHeader`
  - `export function validatePlanMutation(exec: DshToolExecution): DshPreToolDecision | undefined`
  - `decidePreToolExecution()` calls `validatePlanMutation()` only when `guards.planFormatValidation` is enabled.

- [ ] **Step 1: Add failing path/write/edit tests**

Create temporary files under `mkdtempSync()` and cover this exact table in `test/plan-validation.test.ts`:

| Tool and path | Payload/current file | Expected |
|---|---|---|
| `write`, `docs/superpowers/plans/good.MD` | `- [ ] valid` | allow (`undefined`) |
| `write`, `docs/superpowers/notes/good.md` | `- [] ignored` | not a plan (`undefined`) |
| `write`, `.omo/plans/../plans/bad.md` | `- [] bad` | deny malformed final checklist |
| `write`, absolute in-cwd `DOCS/SUPERPOWERS/PLANS/bad.md` | `- [todo] bad` | deny case-insensitive target |
| `write`, `../outside/docs/superpowers/plans/bad.md` | any content | deny outside session cwd |
| `write`, recognized plan with missing/non-string `content` | invalid shape | deny cannot validate complete content |
| `edit`, one `- [ ]` match, `old_string: "[ ]"`, `new_string: "[]"` | valid current file | deny reconstructed malformed final document |
| `edit`, one unique match, valid replacement | valid current file | allow |
| `edit`, duplicate match and omitted/false `replace_all` | two matches | deny ambiguous edit |
| `edit`, duplicate match and `replace_all: true` | all replacements preserve valid checklist | allow |
| `edit`, zero matches | valid current file | deny non-reconstructable edit |
| `edit`, unreadable/missing recognized plan | — | deny with path/actionable reason |
| `edit`, empty `old_string`, non-string `new_string`, or non-boolean `replace_all` | — | deny invalid edit contract |

Use `session.header.cwd = fixtureRoot` in every containment case. Expected RED: the mirror run fails because current validation is case-sensitive, validates only the edit fragment, and never reads/reconstructs the final file.

- [ ] **Step 2: Implement containment and exact reconstruction**

Implement `validatePlanMutation()` with this algorithm:

1. Recognize only `write` and `edit` tool names (case-insensitive) with a string `file_path` or `path`.
2. Set `cwd = resolve(exec.agent?.session.header?.cwd ?? process.cwd())`; set `target = resolve(cwd, suppliedPath)`; calculate `relative(cwd, target)`. A relative value that is absolute, equals `..`, or starts with `..` plus a separator is outside.
3. Normalize separators to `/` and compare against `^(?:docs/superpowers/plans|\.omo/plans)/[^/]+\.md$` case-insensitively after dot-segment resolution. If the raw normalized suffix identifies a plan target but resolution escapes `cwd`, return `deny`; do not broaden this into a guard for unrelated outside-cwd files.
4. For `write`, require a string `content` and validate that complete string.
5. For `edit`, require non-empty string `old_string`, string `new_string`, and absent/boolean `replace_all`. Read the current file with `readFileSync(target, "utf8")`. Count non-overlapping exact matches. Omitted/false `replace_all` requires exactly one match; true requires at least one and replaces every match.
6. Validate only the exact reconstructed final document. Reject checklist bullets beginning `-` or `*` whose bracket token is not `[ ]`, `[x]`, or `[X]`.
7. Convert failures into exact actionable prefixes: `[dsmm safety] cannot validate plan write: content must be a string`; `[dsmm safety] cannot validate plan edit for ${suppliedPath}: old_string must be non-empty`; `[dsmm safety] cannot validate plan edit for ${suppliedPath}: new_string must be a string`; `[dsmm safety] cannot validate plan edit for ${suppliedPath}: replace_all must be boolean`; `[dsmm safety] cannot read plan edit target ${suppliedPath}: ${causeMessage}`; `[dsmm safety] cannot reconstruct plan edit for ${suppliedPath}: expected exactly one old_string match, found ${matchCount}`; or, for replace-all with zero matches, `[dsmm safety] cannot reconstruct plan edit for ${suppliedPath}: old_string was not found`. Never guess the result.

Remove `writePath()`, `writeContent()`, `isPlanPath()`, and fragment-only `planFormatDecision()` from `guards.ts` after wiring the new module.

- [ ] **Step 3: Run the targeted GREEN check**

Run:

```powershell
Invoke-DsmmMirrorTests @("test/plan-validation.test.ts", "test/guards.test.ts")
pnpm --filter dsmm typecheck
```

Expected: all path and mutation cases pass; `DshSessionHeader` typechecks; no working-tree `dsmm/lib/**` file changes.

---

### Task 3: Role-bound ownership and atomic preset publication (IM-1)

**Files:**
- Modify: `dsmm/src/preset-materializer.ts`
- Modify: `dsmm/test/preset-materializer.test.ts`

**Interfaces:**
- Consumes: `DSMM_ROLES`, `DsmmRoleId`, `renderAgentCordis(role)`, `renderPresetMetadata(role)`, and `isRoleEnabled(settings, role)`.
- Produces:
  - `export const DSMM_MANAGED_PRESET_MARKER = ".dsmm-managed-preset"` (unchanged path)
  - `export const DSMM_MANAGED_PRESET_MARKER_VERSION = 1`
  - `export function renderManagedPresetMarker(role: DsmmRoleId): string`, exactly `` `dsmm-managed-preset/v1\nrole=${role}\n` ``
  - Existing `materializeRolePresets()`, `reconcileRolePresets()`, and `resolveManagedPresetRoot()` signatures remain unchanged.

- [ ] **Step 1: Replace unsafe ownership expectations with failing adversarial cases**

Change the existing tests that accept empty/legacy markers as owned. Add exact cases proving:

1. A pre-existing unmarked `dsmm-reviewer/user.txt` causes a descriptive throw before any file in that directory changes.
2. A current marker for the wrong role, malformed marker, marker symlink, role-directory symlink/junction, linked `agent.cordis.yml`, or linked `preset.yml` throws and leaves the target and link destination untouched.
3. A canonical role path outside the canonical root is rejected.
4. An existing current-marker directory updates only when marker role/version and all managed path types are exact.
5. A legacy directory migrates only when its entries are exactly `.dsmm-managed-preset`, `agent.cordis.yml`, and `preset.yml`, each a regular unlinked file, and the legacy marker bytes are exactly `managed by dsmm\n`.
6. A legacy directory with any extra entry remains foreign and is neither updated nor removed.
7. A disabled current or safe-legacy role is removed; unknown directories and unknown role names are untouched.
8. A new role appears only after all three files are written in a private sibling temporary directory; force `writeFileSync` or `renameSync` failure through a narrow injected filesystem adapter or `mock.method()` and assert the final path is absent and the temp sibling is cleaned.

Expected RED: `Invoke-DsmmMirrorTests @("test/preset-materializer.test.ts")` demonstrates that the current marker-existence logic claims/removes foreign content.

- [ ] **Step 2: Implement validation before mutation**

Use `lstatSync`, `realpathSync`, `readdirSync`, `readFileSync`, `renameSync`, and exact entry/type checks:

1. For an existing root, reject links and non-directories. When materialization is enabled and the root is absent, create it once, then `lstat`/`realpath` it before role work. When materialization is disabled and the root is absent, return without creating it.
2. For every known role path, inspect with `lstat`; reject symbolic links/junction-like links and non-directories. Resolve its canonical path and require `relative(canonicalRoot, canonicalRole)` to remain beneath the root.
3. Before update/removal, `lstat` marker and both generated files. Require regular non-linked files and exact current marker bytes. A missing marker makes an existing role directory foreign.
4. Permit legacy migration/removal only for the exact three-entry/three-regular-file shape and exact legacy marker bytes above.
5. Iterate `DSMM_ROLES` for removal; never scan an arbitrary marker and delete an unknown directory.
6. For a new role, create the exact template path `` join(root, `.${role.id}.dsmm-${randomUUID()}`) `` with non-recursive `mkdirSync`, verify its canonical containment, write `agent.cordis.yml`, `preset.yml`, then the current marker, and `renameSync(temp, final)` only while the final path is absent. Remove only that exact temp path in `finally` after a failure.
7. For an existing owned role, revalidate immediately before writing each managed file; do not recursively replace the directory or touch extra files. Current-marker directories with extra user files are an error rather than an update/removal candidate.

- [ ] **Step 3: Run the targeted GREEN check**

Run:

```powershell
Invoke-DsmmMirrorTests @("test/preset-materializer.test.ts")
pnpm --filter dsmm typecheck
```

Expected: every foreign/link/legacy/atomic case passes and all fixtures are removed by their existing `finally` cleanup.

---

### Task 4: Preset precedence, monotonic middleware, and retryable mode durability (CR-2, IM-2, IM-4)

**Files:**
- Modify: `dsmm/src/guards.ts`
- Modify: `dsmm/test/guards.test.ts`
- Modify: `dsmm/src/state.ts`
- Modify: `dsmm/test/state.test.ts`

**Interfaces:**
- Consumes: `DshSession.header?.agentPreset` from Task 2, `DSMM_ROLE_IDS`, `DshPreToolDecision`, and `ctx.logger?.warn(message, ...args)`.
- Produces:
  - Internal `resolveActiveAgentPreset(session: DshSession): string | undefined` scans events newest-to-oldest and falls back to the header only when no structurally valid selected event exists.
  - Existing `isSafetyScopeActive()` gains header/event precedence without a signature change.
  - Existing `registerSafetyGuards()` composes local/downstream decisions monotonically without a signature change.
  - Existing `DeepworkModeController` returns an accepted downstream pre-step unchanged after append failure and retains its pending intent.

- [ ] **Step 1: Add failing preset and middleware tables**

Extend `guards.test.ts` with these scope cases:

| Header | Events in chronological order | Expected DSMM preset scope |
|---|---|---|
| `dsmm-reviewer` | none | active |
| `standard` | selected `dsmm-reviewer` | active |
| `dsmm-reviewer` | selected `standard` | inactive |
| `standard` | selected `dsmm-reviewer`, then selected `standard` | inactive |
| `standard` | selected `dsmm-reviewer`, then malformed `{ agentPreset: 3 }` | active (newest valid wins) |
| `dsmm-reviewer` | only malformed selections | active header fallback |

Add middleware cases for local decision/downstream result:

| Local | Downstream | Called? | Returned |
|---|---|---|---|
| `deny` | any | no | local `deny` |
| none | `allow` | yes | downstream `allow` |
| `ask` | `deny` | yes | downstream `deny` |
| `ask` | `ask` | yes | downstream `ask` |
| `ask` | `allow` | yes | local `ask` |

Replace the existing test that expects `ask` to skip delegation.

- [ ] **Step 2: Add the failing two-boundary durability test**

In `state.test.ts`, capture the `agent/pre-step` listener. Make the first `session.append()` reject with `Error("append failed")`, return `{ kind: "accept", messages: [] }` from `next()`, and assert:

```ts
assert.deepEqual(await listener(frame, next), acceptedDecision);
assert.match(warnings[0] ?? "", /deepwork mode event/i);
assert.equal(controller.active(agent, false), true, "pending intent remains retryable");
```

Then let the second boundary append succeed, push the event into `session.events`, assert one successful append, no rejection, and `controller.active(agent, false) === true` after pending deletion. Expected RED: current pre-step rejects on the first boundary and loses the accepted step.

- [ ] **Step 3: Implement precedence, composition, and catch/log/retry**

1. Resolve selected preset by scanning `session.events` from the end, accepting only `type === "agent-preset/selected"` with a record containing string `agentPreset`; if none is valid, return `session.header?.agentPreset` only when it is a string.
2. In the pre-execute listener, return local `deny` immediately. Delegate directly for no local decision. For local `ask`, await downstream and return downstream `deny`/`ask`; return the local `ask` only when downstream allows.
3. In `DeepworkModeController`'s boundary listener, wrap only `commit()` in `try/catch`. Log `ctx.logger?.warn("dsmm failed to append deepwork mode event; pending intent will retry", cause)`, return the original downstream decision, and leave the WeakMap entry in place. Keep deletion after successful `session.append()` only.

- [ ] **Step 4: Run the targeted GREEN check**

Run:

```powershell
Invoke-DsmmMirrorTests @("test/guards.test.ts", "test/state.test.ts")
pnpm --filter dsmm typecheck
```

Expected: all precedence/waterfall/retry cases pass with no working-tree `lib` generation.

---

### Task 5: Settings-ready child-context installation (IM-3)

**Files:**
- Re-read, then modify: `dsmm/src/dsh-types.ts`
- Re-read, then modify: `dsmm/src/settings.ts`
- Re-read, then modify: `dsmm/src/index.ts`
- Modify: `dsmm/src/mode.ts`
- Modify: `dsmm/src/commands.ts`
- Re-read, then modify: `dsmm/test/settings.test.ts`
- Modify: `dsmm/test/mode.test.ts`
- Modify: `dsmm/test/commands.test.ts`
- Modify only through the ready installer call site: `dsmm/src/preset-materializer.ts`

**Interfaces:**
- Consumes: current v0.5 `DsmmSettings.lsp`, `LSP_SCHEMA`, `resolveLspSettings()`, and all existing `registerSettings()` behavior; `DeepworkModeController`; prompt/command/materializer registration functions.
- Produces:
  - `RegisterSettingsOptions.install?: (readyCtx: DshContext, getSettings: () => DsmmSettings) => void`
  - `DshContext.inject?(dependencies: string[], installer: (readyCtx: DshContext) => unknown): unknown`
  - `registerSettings(ctx, config, options): () => DsmmSettings` updates its getter before calling `options.install` exactly once.
  - `apply()` installs prompt, command, and materialization through the supplied ready child context; safety hooks stay on the root and call the live getter at execution time. Task 6 removes host-level skill registration entirely.

- [ ] **Step 1: Snapshot concurrent hunks and add the failing deferred-readiness test**

Run and inspect before editing:

```powershell
git status --short
git diff -- dsmm/src/settings.ts dsmm/src/index.ts dsmm/test/settings.test.ts
```

The diff must still contain v0.5 LSP imports/schema/defaults/exports/tests. Add an `apply()` integration test that captures a deferred `inject(["settings"], installer)`, supplies effective settings with `promptOrder: 77`, and exposes prompt/command registries only on the injected child context. Assert before attachment that neither root nor child has a prompt/command registration; after attachment assert the child prompt section order is `77`, the effective command name is used, and materialization receives the attached root rather than the base root.

Also add a service-absent test calling `registerSettings({}, base, { install })` and asserting the installer runs once with the root context and base getter. Expected RED: current `apply()` snapshots prompt order `50` before the deferred settings child attaches.

- [ ] **Step 2: Implement the readiness installer without losing LSP state**

Keep `registerSettings()`'s public return type and `onChange` option. Add `install` and implement one internal `ready(readyCtx, registry?)` path:

```ts
export interface RegisterSettingsOptions {
  onChange?: (settings: DsmmSettings) => void;
  install?: (readyCtx: DshContext, getSettings: () => DsmmSettings) => void;
}
```

The internal order is mandatory: resolve/register the restart scope; replace `getSettings`; call `onChange(getSettings())`; then call `install(readyCtx, () => getSettings())`. When `ctx.inject` exists, run that sequence inside its `settings` child. When injection is unavailable, use an own direct settings service if present; otherwise call once on the root with base settings. Guard against duplicate installer execution.

In `apply()`:

1. Construct `DeepworkModeController`.
2. Call `registerSettings()` with an installer that registers the prompt and command on `readyCtx` and reconciles the effective managed root/settings.
3. Register safety guards once on root `ctx` with the returned live getter.
4. Preserve every current v0.5 LSP import, setting, schema field, resolve call, and index export exactly.

Do not add settings watching: the schema remains `applies: "restart"`.

- [ ] **Step 3: Run the targeted GREEN check and re-inspect shared diffs**

Run:

```powershell
Invoke-DsmmMirrorTests @("test/settings.test.ts", "test/mode.test.ts", "test/commands.test.ts", "test/preset-materializer.test.ts")
pnpm --filter dsmm typecheck
git diff -- dsmm/src/settings.ts dsmm/src/index.ts dsmm/test/settings.test.ts
```

Expected: effective order `77` passes, fallback installs once, and the displayed diff still contains the v0.5 `lsp` fields and exports.

---

### Task 6: Generic prompt bodies and preset-scoped skill plugin (IM-5)

**Files:**
- Create: `dsmm/src/preset-skills.ts`
- Create: `dsmm/test/preset-skills.test.ts`
- Modify: `dsmm/src/skills.ts`
- Modify: `dsmm/src/settings.ts`
- Modify: `dsmm/src/prompts.ts`
- Modify: `dsmm/src/mode.ts`
- Modify: `dsmm/src/roles.ts`
- Modify: `dsmm/src/index.ts`
- Modify: `dsmm/src/preset-materializer.ts`
- Modify: `dsmm/test/skills.test.ts`
- Modify: `dsmm/test/prompts.test.ts`
- Modify: `dsmm/test/mode.test.ts`
- Modify: `dsmm/test/roles.test.ts`
- Modify: `dsmm/test/agent-presets.test.ts`
- Modify: `dsmm/agent-presets/dsmm-orchestrator/agent.cordis.yml`
- Modify: `dsmm/agent-presets/dsmm-planner/agent.cordis.yml`
- Modify: `dsmm/agent-presets/dsmm-plan-critic/agent.cordis.yml`
- Modify: `dsmm/agent-presets/dsmm-reviewer/agent.cordis.yml`
- Modify: `dsmm/agent-presets/dsmm-code-search/agent.cordis.yml`
- Modify: `dsmm/agent-presets/dsmm-doc-search/agent.cordis.yml`
- Modify: `dsmm/agent-presets/dsmm-clarifier/agent.cordis.yml`
- Modify: `dsmm/agent-presets/dsmm-media-reader/agent.cordis.yml`

**Interfaces:**
- Consumes: Task 5 ready installer; `DshSkillRegistry.register()`, `DshSkillRegistration`, `DsmmSettings.skills`, `DshSession.header/events`, role rendering/materialization, and bundled `` join(packageRoot, "skills", name, "SKILL.md") `` assets.
- Produces:
  - Move canonical `DSMM_SKILL_NAMES` and `DsmmSkillName` ownership to `skills.ts`; `settings.ts` imports and re-exports them so existing package imports remain compatible.
  - `export function enabledSkillNames(settings: DsmmSettings): readonly DsmmSkillName[]`
  - `export function loadBundledSkill(name: DsmmSkillName): DshSkillRegistration`
  - `export function registerBundledSkills(skills: DshSkillRegistry | undefined, names: readonly DsmmSkillName[]): void`
  - `export function renderBundledSkillPrompt(names: readonly DsmmSkillName[]): string`
  - `renderBundledSkillPrompt()` emits each enabled body once as `<dsmm-skill name="NAME">\nBODY\n</dsmm-skill>` in `DSMM_SKILL_NAMES` order.
  - `renderAgentCordis(role: DsmmRoleDefinition, skills?: readonly DsmmSkillName[]): string` defaults to all skills and adds one `dsmm/preset-skills` row.
  - `dsmm/src/preset-skills.ts` exports `name`, `inject = ["skills"]`, Schemastery `Config`, `apply(ctx, config)`, and default `apply`; config is `{ skills?: DsmmSkillName[] }` and defaults to all canonical names.

- [ ] **Step 1: Add failing isolation and body-count tests**

Add tests proving:

1. Calling root `apply()` with a root/global `skills.register` spy registers zero model-invocable DSMM skills.
2. An inactive ordinary session renders `""` and contains no opening substring `<dsmm-skill name="`.
3. A generic active `/deepwork` session renders exactly one opening/closing tag for each enabled skill, includes an exact sentinel line from each loaded body, and omits a disabled skill entirely.
4. An active deepwork session whose newest valid preset is `dsmm-reviewer` renders the base DSMM prompt but zero skill-body tags.
5. `preset-skills.apply()` registers exactly the configured names with `modelInvocable: true` and `userInvocable: true`; it rejects unknown config names through `Config`.
6. `renderAgentCordis()` and every checked-in `agent.cordis.yml` contain exactly one persona row and one row:

```yaml
- id: dsmm-preset-skills
  name: 'dsmm/preset-skills'
  config:
    skills:
      - brainstorming
      - writing-plans
      - requesting-code-review
      - receiving-code-review
      - subagent-driven-development
      - dispatching-parallel-agents
      - remove-ai-slops
```

7. Materialized roles pass only currently enabled skill names to `renderAgentCordis()`.

Expected RED: current root application registers seven global model skills, the generic prompt lacks bodies, and role presets contain only persona rows.

- [ ] **Step 2: Refactor skill loading and prompt composition**

1. Keep `parseSkillMarkdown()` behavior. Export `loadBundledSkill()` and construct registrations from package assets exactly as today.
2. Replace context-level `registerBundledSkills(ctx, getSettings)` with registry-plus-name registration used only by `preset-skills.apply()`; remove the root host registration from `index.apply()`.
3. Render prompt bodies from enabled names with deterministic tags/order and no frontmatter. Extend `buildDeepworkPrompt()` with an optional final `skillPrompt = ""` argument and append it after the base/calibration/workflow policy only when non-empty.
4. In `registerDeepworkPrompt().text(context)`, return empty when mode is inactive. When active, resolve the newest valid preset as in Task 4; append enabled bodies only when that preset is not a DSMM role.
5. Add the preset plugin's Schemastery config as an explicit union of the seven names; do not accept arbitrary strings.
6. Update role rendering and both checked-in/materialized preset files to load the plugin inside standing preset scope. Preserve persona text byte-for-byte.

- [ ] **Step 3: Run targeted GREEN and verify no global registration remains**

Run:

```powershell
Invoke-DsmmMirrorTests @("test/skills.test.ts", "test/preset-skills.test.ts", "test/prompts.test.ts", "test/mode.test.ts", "test/roles.test.ts", "test/agent-presets.test.ts", "test/preset-materializer.test.ts", "test/package.test.ts")
pnpm --filter dsmm typecheck
rg "registerBundledSkills" dsmm/src
```

Expected: all isolation/body/preset tests pass. The `rg` output shows registration only in `skills.ts` and `preset-skills.ts`, never in root `index.ts`.

---

### Task 7: DSH generation, package surface, MI-3 preservation, and behavior docs (IM-6, MI-3)

**Files:**
- Re-read, then modify: `dsmm/package.json`
- Modify: `pnpm-lock.yaml`
- Re-read, then modify: `dsmm/docker/Dockerfile.smoke`
- Modify: `dsmm/test/package.test.ts`
- Re-read, then modify: `dsmm/test/docker-smoke-assets.test.ts`
- Modify only for changed behavior: `dsmm/docs/safety-guards.md`
- Modify only for changed behavior: `dsmm/docs/agent-presets.md`
- Re-read, then modify only for changed behavior/mandatory gate wording: `dsmm/README.md`

**Interfaces:**
- Consumes: Task 6 `lib/preset-skills` future output; current v0.5 `files` additions, `lsp` docs/patch/scripts, Rust Docker builder stage, and LSP tests.
- Produces:
  - `exports["./preset-skills"] = { types: "./lib/preset-skills.d.ts", default: "./lib/preset-skills.js" }`
  - All five existing `@deepseek-ai/dsh-{attachment,brand,invariants,llm,timeout}` peer/dev specifiers become `^0.1.1-rc.2`; Cordis remains `^4.0.1`.
  - Docker ARG and both package smoke commands use exact `@deepseek-ai/dsh@0.1.1-rc.2`; no DSMM acceptance path contains `@deepseek-ai/dsh@latest`.
  - Updated lockfile importer/resolutions for the declared rc.2 graph.

- [ ] **Step 1: Re-read and lock the v0.5 shared hunks**

Run:

```powershell
git status --short
git diff -- dsmm/package.json dsmm/docker/Dockerfile.smoke dsmm/test/package.test.ts dsmm/test/docker-smoke-assets.test.ts dsmm/README.md
```

Confirm the working copy still contains all current v0.5 documentation `files` entries, `docs/lsp.md`, the Rust `lsp-builder`, `ocmm-lsp` copy, and LSP smoke assertions. Do not replace these files with plan snippets.

- [ ] **Step 2: Add failing manifest/pin/package-link assertions**

In `package.test.ts`, assert the exact `./preset-skills` export, exact DSH component ranges, Cordis range, exact package-script pin, and continued presence of every current `files` entry. Parse README's local links `docs/agent-presets.md`, `docs/safety-guards.md`, and `docs/lsp.md`; require each exact path to be included by `pkg.files` and exist on disk.

In `docker-smoke-assets.test.ts`, replace `latest` expectations with exact `0.1.1-rc.2`, retain every v0.5 LSP assertion, and assert the script describes a packed tarball/profile import rather than local `lib/index.js` import.

Expected RED: current DSH components are rc.1, package/Docker use `latest`, and `./preset-skills` is absent.

- [ ] **Step 3: Update manifest and lockfile once**

Edit the current manifest in place, preserving the v0.5 `files` list. Then run only the lockfile-producing command needed for this task:

```powershell
pnpm install --lockfile-only
```

Expected: exit `0`; `pnpm-lock.yaml`'s `dsmm` importer uses `^0.1.1-rc.2` for all five DSH components and resolves the same generation with Cordis `4.0.1`. Do not run a general software installation or alter unrelated dependency versions.

- [ ] **Step 4: Update only directly affected docs**

Update `safety-guards.md` to document executable/wrapper/continuation coverage, exact known-write behavior, unknown alias non-classification, header/event preset precedence, downstream `ask` composition, and resulting-document plan validation. Update `agent-presets.md` for the role-bound v1 marker, foreign-directory refusal, safe legacy migration, and preset-scoped `dsmm/preset-skills` row. Update README's skill visibility statement and change the Docker smoke from optional to mandatory for this safety-remediation acceptance; preserve its v0.5 LSP section and links.

Do not edit `dsmm/docs/review-2026-08-24-safety-guards.md`, roadmap status, design docs, or implementation-plan copies in this task.

- [ ] **Step 5: Run targeted GREEN and static pin checks**

Run:

```powershell
Invoke-DsmmMirrorTests @("test/package.test.ts", "test/docker-smoke-assets.test.ts", "test/skills.test.ts", "test/agent-presets.test.ts")
pnpm --filter dsmm typecheck
rg "@deepseek-ai/dsh@latest|\^0\.0\.1-rc\.1" dsmm/package.json dsmm/docker/Dockerfile.smoke dsmm/scripts/docker-smoke.mjs pnpm-lock.yaml
```

Expected: tests pass. `rg` returns no match in the DSMM manifest/Docker/smoke surfaces or the DSMM lockfile graph; any unrelated historical text is not edited merely to silence search.

---

### Task 8: Mandatory packed rc.2 live runtime and cleanup (evidence gap, MI-4)

**Files:**
- Re-read, then modify: `dsmm/scripts/docker-smoke.mjs`
- Re-read, then modify: `dsmm/docker/Dockerfile.smoke`
- Re-read, then modify: `dsmm/test/docker-smoke-assets.test.ts`
- Preserve unchanged: `dsmm/scripts/lsp-smoke-fixture.mjs`, `dsmm/scripts/lsp-mcp-smoke.mjs`, `dsmm/src/lsp.ts`, `dsmm/test/lsp.test.ts`

**Interfaces:**
- Consumes: packed `dsmm` and `dsmm/preset-skills`; DSH rc.2 `Context`, named `SettingsProvider`, `SessionStore`, `SessionId`, `SystemPrompt`, `renderPrompt`, `SkillRegistry`, `isModelInvocable`, `ToolRuntime`, `defineTool`, `CommandRuntime`, `ctx.commands.execute(agent, line, [], signal)`, `AgentRegistry`, `AgentLoop`, `AgentPresets`, `assembleContextFor`, `CallId`, and `ctx.tools.execute(input)`; existing v0.5 MCP diagnostic smoke.
- Produces: one fail-fast Docker smoke that installs the generated tarball into an isolated profile, resolves both public DSMM entries from that profile, proves ordinary/deepwork/preset isolation and guard behavior through real services, retains LSP diagnostics, and cleans all owned temporary resources.

- [ ] **Step 1: Add failing smoke-asset contract tests**

Extend `docker-smoke-assets.test.ts` to require these literal runtime proof markers in `docker-smoke.mjs`:

```text
PACKAGED_DSMM_RESOLVED
ORDINARY_ISOLATED
DEEPWORK_BODIES_ONCE
PRESET_SCOPED_SKILLS
HEADER_GUARD_ACTIVE
DOWNSTREAM_DENY_WINS
POST_EXECUTE_TRUNCATED
LSP_DIAGNOSTIC_OK
DSMM_PACKAGED_RUNTIME_SMOKE_OK
```

Also assert: exact rc.2 pin; `pnpm pack`; profile-anchored `createRequire`; `resolve("dsmm/preset-skills")`; imports of `@deepseek-ai/dsh-settings`, `@deepseek-ai/dsh-commands`, `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-system-prompt`, `@deepseek-ai/dsh-skill`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-agent-presets`; `/deepwork`; `ctx.tools.execute`; `finally`; `fiber.dispose`; fixture cleanup; and no top-level `mkdtempSync()` before the `DSMM_DOCKER_INNER` branch.

Expected RED: the current script imports local `lib`, calls guard helpers directly, and creates `home` before the outer/inner branch.

- [ ] **Step 2: Pack and install only inside the inner branch**

Keep the existing Docker Rust builder and LSP binary. In the inner branch of `docker-smoke.mjs`:

1. Create one owned temporary workspace and one owned temporary DSH home only after `DSMM_DOCKER_INNER === "1"`.
2. Run `spawnSync("pnpm", ["--dir", root, "pack", "--pack-destination", workspace])` and require exactly one filename matching `/^dsmm-.+\.tgz$/u` in `workspace`.
3. Run `spawnSync("dsh", ["plugin", "--profile", "dsmm-smoke", "add", tarball])` with the owned `DSH_HOME`.
4. Anchor `createRequire()` at `join(home, "profiles", "dsmm-smoke", "package.json")`, resolve/import `dsmm`, resolve/import `dsmm/preset-skills`, and derive the installed package root from the resolved entry whose final two path components are `lib/index.js`. Print `PACKAGED_DSMM_RESOLVED` only after both imports succeed.
5. Never import the local source tree's `lib/index.js` or `lib/skills.js` for acceptance assertions.

The outer branch creates no home. Give its Docker image a per-run unique tag and remove that exact image in `finally`; never remove a pre-existing fixed tag.

- [ ] **Step 3: Exercise the verified rc.2 runtime APIs**

Use `importDshPackage()` with fail-fast symbol checks. The root export of `@deepseek-ai/dsh-settings` is the abstract `SettingsProvider`, not a ready-made runtime: define the exact in-memory smoke subclass used by upstream tests, with `doc = {}`, `get writable() { return true; }`, `protected load()` returning a cloned document, and `protected persist(namespace, section)` cloning the section into `doc`. Assemble the runtime in this order: Cordis `Context`; that concrete settings provider; LLM; session; system prompt with `{ persona: "" }`; skill; tools; commands; agent registry; agent loop. Mount installed DSMM only after those services are ready so its injected settings child actually installs prompt/command/materialization resources.

Run these exact live assertions:

1. **Ordinary isolation:** create a real session/agent, assemble/render the system prompt, and list skills with `{ scope: agent, cwd: agent.session.header.cwd }` filtered by `isModelInvocable`. Require no DSMM prompt marker, no `<dsmm-skill>` tag, and none of the seven DSMM skill names; print `ORDINARY_ISOLATED`.
2. **Generic `/deepwork`:** call `ctx.commands.execute(agent, "/deepwork inspect repo", [], signal)`. Require success text `Entering deepwork mode.`, then assemble/render again. For every name in `DSMM_SKILL_NAMES`, require the exact opening string `` `<dsmm-skill name="${name}">` `` once and still no globally model-invocable DSMM skill; print `DEEPWORK_BODIES_ONCE`.
3. **Downstream precedence:** register a harmless `defineTool()` named `bash` whose implementation never executes the command string. Add a downstream `tools/pre-execute` listener after DSMM that returns `{ kind: "deny", reason: "downstream smoke policy" }` for `{ command: "git commit -m smoke" }`. Invoke through `ctx.tools.execute()` with `CallId`, agent, arguments, and signal. Require the downstream listener ran and the returned error/feedback names its reason; print `DOWNSTREAM_DENY_WINS`.
4. **Post-execute truncation:** let the same harmless tool return `"x".repeat(20_000)` for a read-only command. Invoke with `ctx.tools.execute()` and require a successful text result containing `[dsmm safety] truncated` within the configured byte cap; print `POST_EXECUTE_TRUNCATED`.
5. **Preset scope:** mount Loader/Include and `AgentPresets` with the installed `agent-presets` root, create a real agent with `meta: { agentPreset: "dsmm-reviewer" }`, and mount that preset in its setup callback. Require `agent.session.header.agentPreset === "dsmm-reviewer"`; list model-invocable scoped skills and require all configured DSMM names; assemble prompt and require no duplicated body tags; print `PRESET_SCOPED_SKILLS`.
6. **Header guard through tools:** in a separately disposed Context configured with `gitWriteGuard: "deny"`, execute the harmless `bash` tool for the header-only preset agent without appending a selection event. Require a tool error containing the DSMM Git denial reason; print `HEADER_GUARD_ACTIVE`.
7. **v0.5 LSP:** run the existing direct `lsp-mcp-smoke.mjs`, then retain `smokeDshMcpClient()` and its `mcp__dsmm_lsp__diagnostics` call through `ctx.tools.execute()`. Require `dsmm smoke diagnostic`; print `LSP_DIAGNOSTIC_OK`.

Do not invent alternate APIs if an rc.2 export differs. Throw a message naming the missing package/export/method and fail the mandatory gate.

- [ ] **Step 4: Make cleanup nested and unconditional**

Every created Context uses `try/finally` and awaits `ctx.fiber.dispose()`. Every diagnostic fixture calls `fixture.cleanup()` in an inner `finally`. The inner top-level `finally` removes only the exact owned profile home, tarball/workspace, generated patch files, managed preset root, and other smoke fixtures. The outer top-level `finally` removes only its unique Docker image. Print `DSMM_PACKAGED_RUNTIME_SMOKE_OK` only after all runtime assertions succeed; cleanup errors fail the smoke rather than being hidden.

- [ ] **Step 5: Run offline asset GREEN only**

Run:

```powershell
Invoke-DsmmMirrorTests @("test/docker-smoke-assets.test.ts", "test/package.test.ts", "test/lsp.test.ts")
pnpm --filter dsmm typecheck
```

Expected: static smoke contracts pass. Do not run Docker yet; the mandatory packaged runtime is the final gate in Task 9 after the one working-tree build.

---

### Task 9: One generated integration point, complete gates, and identity-bound acceptance

**Files:**
- Regenerate after all source tasks: `dsmm/lib/**`
- Verify, do not manually edit: all files named in Tasks 1-8
- Do not modify: `dsmm/docs/review-2026-08-24-safety-guards.md`

**Interfaces:**
- Consumes: all task outputs; approved spec; current v0.5 LSP files/settings/exports/docs/tests; canonical working-tree identity procedure in `skills/v1/requesting-code-review/SKILL.md`.
- Produces: one integrated generated diff, complete offline/packaged/live evidence, and matching high-rigor Oracle/Reviewer receipts for one unchanged working-tree identity. Produces no Git stage, commit, tag, push, stash, reset, checkout, or clean operation.

- [ ] **Step 1: Re-read shared files and inspect the complete pre-build diff**

Run:

```powershell
git status --short
git diff --stat
git diff -- dsmm/src/index.ts dsmm/src/settings.ts dsmm/package.json dsmm/docker/Dockerfile.smoke dsmm/scripts/docker-smoke.mjs dsmm/test/settings.test.ts dsmm/test/package.test.ts dsmm/test/docker-smoke-assets.test.ts dsmm/README.md
git diff --check
```

Expected: no v0.5 hunk is missing, no unrelated file is changed, and whitespace check exits `0`. If concurrent edits appeared, stop, re-read, and merge; do not overwrite them.

- [ ] **Step 2: Generate the working-tree `dsmm/lib/**` integration once**

Run after every source/config/package edit is complete:

```powershell
pnpm --filter dsmm build
```

Expected: exit `0`; new `lib/shell-command.*`, `lib/plan-validation.*`, and `lib/preset-skills.*` exist; `lib/lsp.*` remains; `lib/index.*` still exports all v0.5 LSP symbols and the root does not register global skills. This is the only command that writes the working tree's `dsmm/lib/**`; no later source edit is allowed without discarding the evidence and returning to this step.

Verify generated preservation:

```powershell
rg "DSMM_LSP_SERVER_NAME|renderLspMcpPatch|resolveLspSettings|DsmmLspSettings" dsmm/lib/index.js dsmm/lib/index.d.ts dsmm/lib/settings.js dsmm/lib/settings.d.ts dsmm/lib/lsp.js dsmm/lib/lsp.d.ts
rg "preset-skills|validatePlanMutation|classifyKnownGitWrite" dsmm/lib
git diff -- dsmm/lib
```

Expected: both v0.5 LSP and remediation exports are present; generated diffs correspond to current source and do not delete LSP output.

- [ ] **Step 3: Run exact DSMM gates in a disposable mirror, then full root gates**

The required DSMM package scripts each invoke `build`; run them against an exact OS-temporary workspace mirror so the working tree's generated output remains the single Task 9 Step 2 emission. Execute this complete block from the workspace root:

```powershell
$workspaceRoot = (Resolve-Path -LiteralPath ".").Path
$sourceDsmm = Join-Path $workspaceRoot "dsmm"
$gateTempParent = [IO.Path]::GetTempPath().TrimEnd([IO.Path]::DirectorySeparatorChar)
if (-not (Test-Path -LiteralPath $gateTempParent -PathType Container)) { throw "OS temp parent is unavailable: $gateTempParent" }
$gateMirror = Join-Path $gateTempParent ("dsmm-safety-gates-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $gateMirror | Out-Null
New-Item -ItemType Directory -Path (Join-Path $gateMirror "dsmm") | Out-Null

try {
  foreach ($rootFile in @("package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml")) {
    Copy-Item -LiteralPath (Join-Path $workspaceRoot $rootFile) -Destination (Join-Path $gateMirror $rootFile)
  }
  foreach ($directory in @("src", "test", "skills", "prompts", "agent-presets", "docs", "patches", "scripts", "docker")) {
    Copy-Item -LiteralPath (Join-Path $sourceDsmm $directory) -Destination (Join-Path (Join-Path $gateMirror "dsmm") $directory) -Recurse
  }
  foreach ($file in @("package.json", "tsconfig.json", "tsconfig.test.json", "cordis.patch.yml", "README.md")) {
    Copy-Item -LiteralPath (Join-Path $sourceDsmm $file) -Destination (Join-Path (Join-Path $gateMirror "dsmm") $file)
  }
  $existingModules = Join-Path $sourceDsmm "node_modules"
  if (-not (Test-Path -LiteralPath $existingModules -PathType Container)) { throw "dsmm/node_modules must already exist; do not install from this gate" }
  New-Item -ItemType Junction -Path (Join-Path (Join-Path $gateMirror "dsmm") "node_modules") -Target $existingModules | Out-Null

  Push-Location -LiteralPath $gateMirror
  try {
    pnpm --filter dsmm test
    if ($LASTEXITCODE -ne 0) { throw "mirrored pnpm --filter dsmm test failed" }
    pnpm --filter dsmm typecheck:test
    if ($LASTEXITCODE -ne 0) { throw "mirrored pnpm --filter dsmm typecheck:test failed" }
    pnpm --filter dsmm build
    if ($LASTEXITCODE -ne 0) { throw "mirrored pnpm --filter dsmm build failed" }
  } finally {
    Pop-Location
  }
} finally {
  $resolvedGateMirror = [IO.Path]::GetFullPath($gateMirror)
  $expectedGatePrefix = [IO.Path]::GetFullPath($gateTempParent + [IO.Path]::DirectorySeparatorChar)
  if (-not $resolvedGateMirror.StartsWith($expectedGatePrefix, [StringComparison]::OrdinalIgnoreCase) -or $resolvedGateMirror -eq $expectedGatePrefix.TrimEnd([IO.Path]::DirectorySeparatorChar)) {
    throw "refusing to remove unexpected gate mirror: $resolvedGateMirror"
  }
  Remove-Item -LiteralPath $resolvedGateMirror -Recurse -Force
}
```

This block never installs dependencies in the mirror. After all three commands exit `0`, run in the actual workspace:

```powershell
pnpm run typecheck
pnpm test
pnpm run build
git diff --check
```

Expected: the mirrored DSMM package reports all tests passing; root TypeScript, Node, Cargo, and build gates pass; `git diff -- dsmm/lib` is byte-for-byte unchanged from Step 2. Any source change invalidates the mirror evidence and requires returning to Step 2.

- [ ] **Step 4: Verify the packed file inventory including MI-3 and `preset-skills`**

Run the non-writing dry run and inspect its JSON:

```powershell
$packJson = pnpm --dir dsmm exec npm pack --dry-run --json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $packJson.Count -ne 1) { throw "dsmm pack dry-run failed" }
$packedPaths = @($packJson[0].files | ForEach-Object { $_.path })
foreach ($required in @(
  "README.md",
  "docs/agent-presets.md",
  "docs/safety-guards.md",
  "docs/lsp.md",
  "lib/index.js",
  "lib/lsp.js",
  "lib/preset-skills.js",
  "lib/preset-skills.d.ts",
  "agent-presets/dsmm-reviewer/agent.cordis.yml"
)) {
  if ($packedPaths -notcontains $required) { throw "packed dsmm missing $required" }
}
```

Expected: all listed surfaces exist in the dry-run inventory and no `.tgz` is written.

- [ ] **Step 5: Run the mandatory packaged Docker runtime last**

Run:

```powershell
pnpm --filter dsmm smoke:docker
```

Expected: Docker/network are available; the image uses `@deepseek-ai/dsh@0.1.1-rc.2`; output contains all nine proof markers ending in `DSMM_PACKAGED_RUNTIME_SMOKE_OK`; the tarball is installed from the isolated profile; ordinary/deepwork/preset/tool/LSP assertions pass; cleanup succeeds. A skipped, unavailable, timed-out, or failed Docker run blocks completion.

- [ ] **Step 6: Reconfirm artifact stability and requirement coverage**

Run:

```powershell
git status --short
git diff --stat
git diff --check
git diff -- docs/superpowers/specs/2026-08-24-dsmm-safety-remediation-design.md dsmm pnpm-lock.yaml
git log --oneline -10
```

Walk the requirement table at the top of this plan and point each CR/IM/MI/evidence row to a passing test or smoke marker. Confirm no automatic Git-write command was run and the historical review file is unchanged.

- [ ] **Step 7: Obtain matching high-rigor acceptance receipts**

Use the canonical PowerShell working-tree identity wrapper embedded in `skills/v1/requesting-code-review/SKILL.md` to compute `sha256:<64-lowercase-hex>` over `HEAD`, the combined binary tracked diff, and sorted non-ignored untracked bytes. Construct one packet with:

```text
ARTIFACT_KIND: working-tree
ARTIFACT_IDENTITY: $artifactIdentity
DESCRIPTION: DSMM safety remediation for CR-1/CR-2, IM-1..IM-6, MI-1..MI-4, and packaged rc.2 evidence
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-08-24-dsmm-safety-remediation.md and docs/superpowers/specs/2026-08-24-dsmm-safety-remediation-design.md
REVIEW_INPUT: current binary working diff plus sorted untracked manifest
VERIFICATION_EVIDENCE: exact commands/results from Steps 3-5, stamped with this identity
GLOBAL_CONSTRAINTS: the verbatim Global Constraints block in this plan
```

The orchestrator, not an implementation worker, dispatches both configured `oracle` and `reviewer` high-rigor lanes. Each must return the five-field receipt from `requesting-code-review`, echo the same identity, and approve. Recompute identity immediately after each receipt; drift invalidates all prior evidence/receipts. Any fix returns to affected tests, the one current generated integration, the complete final gates, Docker, a new identity, and fresh receipts.

Stop with the plan and working-tree evidence. Do not stage or commit unless the user separately authorizes a Git write in a later conversation turn.

---

## Self-review

- **Spec coverage:** Tasks 1-8 map every CR-1/CR-2, IM-1..IM-6, MI-1..MI-4, user decision, concurrency rule, and packaged-runtime scenario to exact files and evidence; Task 9 executes every required gate and final identity-bound review.
- **Placeholder scan:** The plan contains no implementation placeholders, deferred decisions, or generic “add tests/error handling” steps; every behavior-changing task names RED cases, algorithms, GREEN commands, and expected results.
- **Type/interface consistency:** `ShellDialect`, `ParsedShellSegment`, `validatePlanMutation()`, `DshSessionHeader`, `RegisterSettingsOptions.install`, `enabledSkillNames()`, `renderBundledSkillPrompt()`, `renderManagedPresetMarker()`, and `dsmm/preset-skills` are defined once and consumed under the same names.
- **Working-tree safety:** Shared v0.5 files are re-read before edits; current MI-3 `files` hunks and all LSP source/test/generated/smoke surfaces are explicitly preserved; only Task 9 generates working-tree `lib`; no Git-write command appears in any task.
- **Residual execution prerequisites:** Docker and network access are mandatory by approved design. Their absence is an explicit blocked completion state, not a reason to substitute unit/helper evidence.
