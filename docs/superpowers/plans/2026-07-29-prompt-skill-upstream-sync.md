# Prompt and Skill Upstream Sync Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize the approved GPT run contract, deterministic flaky-test triage, and composable frontend interaction mechanics into the three local workflows and deterministically regenerate and verify the packaged Codex bundle.

**Architecture:** Keep the three workflow-specific GPT prompt sources semantically aligned while preserving their native tracking vocabulary, and add the two new behaviors as source-owned shared-skill references routed by the existing skill entry points. Extend contract tests at stable behavioral and file-copy boundaries, then use the existing generator as the only writer of Codex artifacts and verify source, fresh temporary output, tracked output, and real isolated plugin surfaces.

**Tech Stack:** Markdown model prompts and skills, TypeScript, Node 22 `node:test`, pnpm, the existing Codex plugin generator, PowerShell 7, OpenCode CLI, and Codex CLI.

**Global Constraints:**
- Source baseline is `12bd1e24bdfba3e364981481127eba382b9c3a43`; latest release tag is `v0.6.4`; the ignored upstream checkout is `./omo` at `79a15710a4a637d7958ba8f54d8070cf8e8a883d`.
- The approved project-4 spec at `docs/superpowers/specs/2026-07-29-prompt-skill-upstream-sync-design.md` is pre-existing untracked work; preserve it exactly and do not overwrite it.
- Preserve existing implementation gates, planning thresholds, TDD/QA rules, role ownership, shell adaptation, local escalation rules, and Git authorization boundaries.
- Do not add automatic commits, history-mimicking commit cadence, unconditional `create_goal`, a runtime goal controller, or a new tracking tool.
- Do not add retry wrappers, arbitrary sleeps, quarantine, test deletion, assertion weakening, user-process termination, or software installation as flaky-test remedies.
- Do not add a frontend package, vendored catalog, branding, designpowers layer, `/visual-qa`, beui network dependency, or assumptions that Tailwind or Motion is installed.
- Keep the frontend taste/style inventory at exactly 12 and the brand inventory at exactly 70; add one composable interaction-mechanics reference and change the total design-reference count from 83 to 84.
- Update `docs/prompt-sync.md`, `docs/v1-maintenance.md`, and `skills/frontend/ATTRIBUTION.md` in the same project-4 change as their governed prompt/skill sources.
- Generated files are outputs only: run `pnpm run build:ts` before `pnpm run gen:codex-plugin`, never hand-edit `plugins/deepwork/**` or `.codex/agents/**`, and run generation twice to prove identical inventory and bytes.
- Use PowerShell 7 syntax on Windows. Do not use Bash command chaining, environment assignment, redirection, or shell-switching in repository commands. The flaky-triage reference itself may include paired Bash and PowerShell examples.
- Do not stage, commit, push, tag, install software, change `package.json` version, change `package.json.ocmm.lspVersion`, change config schema/generated `schema.json`, touch release workflow files, or perform project-5 work.
- Project-4 final implementation acceptance is orchestrator-owned and requires the first available Oracle plus the primary-lane Reviewer over the complete current working-tree diff and evidence. The planner and implementation workers do not dispatch or claim these receipts.

---

## Baseline and file map

Run all repository commands from `C:\Users\hugefiver\source\ocmm`. Before Task 1, verify:

```powershell
git rev-parse HEAD
git describe --tags --abbrev=0
git -C "omo" rev-parse HEAD
git status --short
```

Expected evidence:

- `git rev-parse HEAD` prints `12bd1e24bdfba3e364981481127eba382b9c3a43`.
- `git describe --tags --abbrev=0` prints `v0.6.4`.
- `git -C "omo" rev-parse HEAD` prints `79a15710a4a637d7958ba8f54d8070cf8e8a883d`.
- Before this plan is created, status contains only `?? docs/superpowers/specs/2026-07-29-prompt-skill-upstream-sync-design.md`; during execution it may additionally contain this plan and the explicitly listed project-4 paths below.

### Source and test files

| Path | Responsibility |
|---|---|
| `prompts/omo/deepwork/gpt.md` | OMO GPT run-scoped tracking, conditional goal, parent/child stop, and Git-authorization contract using todo/notepad vocabulary. |
| `prompts/v1/deepwork/gpt.md` | Skill-driven GPT form of the same contract using local todo/notepad vocabulary. |
| `prompts/codex/deepwork/gpt.md` | Codex form of the same contract, naming `update_plan` where tool-specific wording is useful. |
| `src/intent/prompt-loader.test.ts` | Stable behavioral assertions for all three GPT prompt sources; no full-prose snapshots. |
| `skills/debugging/SKILL.md` | Trigger and routing entry for flaky/intermittent/order-dependent/CI-only failures. |
| `skills/debugging/references/methodology/03-flaky-triage.md` | New deterministic, cause-oriented flaky-test triage reference with shell-neutral and paired examples. |
| `skills/frontend/SKILL.md` | Frontend top-level route, 84-file inventory statement, and interaction-mechanics quick route. |
| `skills/frontend/.gitignore` | Exact project-original exception keeping `interaction-skill.md` trackable without force-add. |
| `skills/frontend/references/design/interaction-skill.md` | New project-original composable interaction mechanics contract. |
| `skills/frontend/references/design/README.md` | Design routing and stacking rules; interaction mechanics stack without consuming the one-style slot. |
| `skills/frontend/references/design/_INDEX.md` | Exact 84-file inventory with a separate one-file interaction-mechanics section. |
| `skills/frontend/ATTRIBUTION.md` | Project-original provenance for `interaction-skill.md`. |
| `src/codex/plugin-generator.test.ts` | Complete debugging/frontend source, fresh-generated, and tracked-generated inventory/byte contracts. |
| `src/codex/plugin-generator.ts` | Existing generator implementation; inspect and preserve, but do not modify for this project. |
| `docs/prompt-sync.md` | OMO/Codex upstream source commits, adaptations, and explicit rejections. |
| `docs/v1-maintenance.md` | Skill-driven prompt and shared-skill synchronization record, exact counts, commits, and omissions. |

### Generator-owned outputs

The generator, not a worker edit, may update these tracked outputs:

- `.codex/agents/` and `plugins/deepwork/agents/`, each with the exact mirrored inventory `dw-builder.toml`, `dw-clarifier.toml`, `dw-code-search.toml`, `dw-coding.toml`, `dw-complex.toml`, `dw-creative.toml`, `dw-deep.toml`, `dw-doc-search.toml`, `dw-documenting.toml`, `dw-explore.toml`, `dw-frontend.toml`, `dw-hard-reasoning.toml`, `dw-media-reader.toml`, `dw-normal-task.toml`, `dw-oracle-2nd.toml`, `dw-oracle.toml`, `dw-orchestrator.toml`, `dw-plan-critic.toml`, `dw-planner.toml`, `dw-quick.toml`, `dw-research.toml`, and `dw-reviewer.toml`.
- `plugins/deepwork/skills/debugging/SKILL.md` and `plugins/deepwork/skills/debugging/references/methodology/03-flaky-triage.md`.
- `plugins/deepwork/skills/frontend/SKILL.md`, `plugins/deepwork/skills/frontend/ATTRIBUTION.md`, `plugins/deepwork/skills/frontend/references/design/README.md`, `plugins/deepwork/skills/frontend/references/design/_INDEX.md`, and `plugins/deepwork/skills/frontend/references/design/interaction-skill.md`.
- Other generator-managed paths may be rewritten to identical bytes during generation, but they must not appear as changed in the final status unless an approved project-4 source input actually changes their rendered content.

### Dependency order and review boundaries

1. Task 1 establishes the run-contract vocabulary and tests consumed by prompt loading and later generated agents.
2. Task 2 adds the debugging source reference and router path consumed by Task 4.
3. Task 3 adds the frontend source reference, routing/count/provenance contract, and paths consumed by Task 4.
4. Task 4 adds generator-copy tests, regenerates from all completed sources, runs integrated/real-surface QA, and hands the complete diff to orchestrator-owned acceptance review.

Each task ends with a working-tree review boundary, not a commit. No task stages or commits files.

---

### Task 1: GPT run contract, prompt tests, and prompt synchronization records

**Files:**
- Modify: `src/intent/prompt-loader.test.ts`
- Modify: `prompts/omo/deepwork/gpt.md`
- Modify: `prompts/v1/deepwork/gpt.md`
- Modify: `prompts/codex/deepwork/gpt.md`
- Modify: `docs/prompt-sync.md`
- Modify: `docs/v1-maintenance.md`

**Interfaces:**
- Consumes: `GPT56_WORKFLOWS` and direct `readFileSync` prompt inspection already defined in `src/intent/prompt-loader.test.ts`; the approved invariants in design §1.
- Produces: a stable `## Run-scoped tracking and stop contract` section in all three GPT prompt sources and the test `GPT run contract defines bounded tracking and parent stop ownership`, which Task 4 exercises through built OpenCode/Codex surfaces.

- [ ] **Step 1: Reconfirm the source baseline and protect the approved spec**

Run:

```powershell
git rev-parse HEAD
git status --short
git diff -- "docs/superpowers/specs/2026-07-29-prompt-skill-upstream-sync-design.md"
```

Expected: HEAD is `12bd1e24bdfba3e364981481127eba382b9c3a43`; the spec remains untracked; the diff command prints nothing because no tracked version exists. Read the spec, but do not write it.

- [ ] **Step 2: Add the failing behavioral prompt test**

Add this test near the existing direct GPT prompt contract tests in `src/intent/prompt-loader.test.ts`:

```ts
test("GPT run contract defines bounded tracking and parent stop ownership", () => {
  for (const workflow of GPT56_WORKFLOWS) {
    const text = readFileSync(join(process.cwd(), "prompts", workflow, "deepwork", "gpt.md"), "utf8")

    assert.match(text, /## Run-scoped tracking and stop contract/i, `${workflow}: missing run contract heading`)
    assert.match(text, /multi-step work.*available .*tracking surface/is, `${workflow}: tracking surface`)
    assert.match(text, /atomic items.*exactly one active item.*immediate status transitions/is, `${workflow}: live item discipline`)
    assert.match(text, /insert newly discovered required work/i, `${workflow}: discovered work`)
    assert.match(text, /do not batch-complete/i, `${workflow}: batch completion`)
    assert.match(
      text,
      /create_goal.*available.*user, system, or developer.*explicitly requests or authorizes/is,
      `${workflow}: conditional create_goal`,
    )
    assert.match(
      text,
      /parent run.*complete requested behavior.*required evidence.*cleanup.*triggered final review/is,
      `${workflow}: parent stop condition`,
    )
    assert.match(
      text,
      /child delegation.*STOP WHEN.*ends only the child.*never replaces the parent/is,
      `${workflow}: child stop boundary`,
    )
    assert.match(text, /stop immediately.*parent run condition.*satisfied/is, `${workflow}: immediate stop`)
    assert.match(
      text,
      /do not repeat validation.*relevant inputs have not changed/is,
      `${workflow}: unchanged-input validation`,
    )
    assert.match(
      text,
      /tracking completion never authorizes a Git write.*commit authorization boundary/is,
      `${workflow}: Git authorization boundary`,
    )
    assert.doesNotMatch(
      text,
      /(?:always|automatically)\s+(?:create\s+an?\s+)?commit|commit after (?:every|each) increment|history-mimicking commits/i,
      `${workflow}: automatic commit instruction`,
    )
    assert.doesNotMatch(
      text,
      /(?:always|immediately|unconditionally)\s+(?:call|use)\s+`?create_goal`?/i,
      `${workflow}: unconditional goal instruction`,
    )

    if (workflow === "codex") {
      assert.match(text, /available `update_plan` or notepad tracking surface/i, workflow)
    } else {
      assert.match(text, /available todo or notepad tracking surface/i, workflow)
    }
  }
})
```

This test deliberately checks stable semantics and harness vocabulary rather than exact paragraph snapshots.

- [ ] **Step 3: Run the targeted test to verify RED**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="GPT run contract" src/intent/prompt-loader.test.ts
```

Expected: FAIL in `GPT run contract defines bounded tracking and parent stop ownership` with `omo: missing run contract heading`. Existing unrelated tests selected by the pattern do not fail.

- [ ] **Step 4: Insert the minimal OMO and skill-driven prompt contract**

In both `prompts/omo/deepwork/gpt.md` and `prompts/v1/deepwork/gpt.md`, insert the following block immediately after `## DURABLE NOTEPAD` and before the scenario-contract section. Do not rewrite nearby planning, TDD, QA, shell, review, or completion sections.

```markdown
## Run-scoped tracking and stop contract

- For multi-step work, use the available todo or notepad tracking surface. Keep atomic items, exactly one active item, and immediate status transitions; insert newly discovered required work when found. Do not batch-complete items at the end.
- Call `create_goal` only when it is available and a user, system, or developer instruction explicitly requests or authorizes that persistent mechanism. Otherwise keep the run goal in the existing todo, plan, or notepad surface.
- Define the parent run condition from the complete requested behavior plus required evidence, cleanup, and any triggered final review.
- A child delegation's `STOP WHEN` ends only the child task and never replaces the parent run condition.
- Stop immediately when the parent run condition is satisfied. Do not repeat validation when relevant inputs have not changed since the last green result.
- Tracking completion never authorizes a Git write; follow the existing commit authorization boundary.
```

- [ ] **Step 5: Insert the minimal Codex prompt contract**

In `prompts/codex/deepwork/gpt.md`, insert the following block immediately after `## DURABLE NOTEPAD` and before the scenario-contract section:

```markdown
## Run-scoped tracking and stop contract

- For multi-step work, use the available `update_plan` or notepad tracking surface. Keep atomic items, exactly one active item, and immediate status transitions; insert newly discovered required work when found. Do not batch-complete items at the end.
- Call `create_goal` only when it is available and a user, system, or developer instruction explicitly requests or authorizes that persistent mechanism. Otherwise keep the run goal in `update_plan`, the current plan, or the notepad surface.
- Define the parent run condition from the complete requested behavior plus required evidence, cleanup, and any triggered final review.
- A child delegation's `STOP WHEN` ends only the child task and never replaces the parent run condition.
- Stop immediately when the parent run condition is satisfied. Do not repeat validation when relevant inputs have not changed since the last green result.
- Tracking completion never authorizes a Git write; follow the existing commit authorization boundary.
```

The wording intentionally adapts, rather than copies, upstream goal/commit behavior. Do not add upstream unconditional goal registration or per-increment commit instructions elsewhere in these files.

- [ ] **Step 6: Record the GPT synchronization in both maintenance documents**

Add a dated `2026-07-29 — project 4 prompt and shared-skill sync` subsection to `docs/prompt-sync.md` that records:

- upstream baseline `./omo@79a15710a4a637d7958ba8f54d8070cf8e8a883d`;
- source `packages/prompts-core/prompts/ultrawork/gpt.md`;
- commits `ba3b01c0689770e90bfd606a87d15edd1ef3b125`, `5c3ffbb15a055f5c1a26f1bc75d81d6c5ca2d6aa`, `3d33d1d41a8ac304d13733a42614d1e44f0960b4`, `6a99b908208406be5eff7f3adba9dadd45593122`, and `73a85a9b219cf22d5b7fc9c9e97a7ba4e090ea7a`;
- local adoption of atomic live tracking, exactly one active item, immediate transitions, discovered-work insertion, conditional goal registration, parent/child stop ownership, and unchanged-input validation restraint;
- explicit rejection of automatic/history-mimicking commits, unconditional goal calls, and upstream tool-name/shell assumptions.

Add the corresponding GPT row/paragraph to `docs/v1-maintenance.md`, naming `prompts/v1/deepwork/gpt.md` and `prompts/codex/deepwork/gpt.md`, the same commits, local todo/notepad versus Codex `update_plan`, and the same authorization-preserving omissions. Keep the model-facing workflow name as `deepwork`; use `v1` only as the path/version label in this maintenance document.

- [ ] **Step 7: Run the targeted test to verify GREEN**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="GPT run contract" src/intent/prompt-loader.test.ts
```

Expected: PASS for `GPT run contract defines bounded tracking and parent stop ownership`; zero failures.

- [ ] **Step 8: Close the Task 1 review boundary without Git writes**

Run:

```powershell
git diff --check -- "src/intent/prompt-loader.test.ts" "prompts/omo/deepwork/gpt.md" "prompts/v1/deepwork/gpt.md" "prompts/codex/deepwork/gpt.md" "docs/prompt-sync.md" "docs/v1-maintenance.md"
git diff --stat -- "src/intent/prompt-loader.test.ts" "prompts/omo/deepwork/gpt.md" "prompts/v1/deepwork/gpt.md" "prompts/codex/deepwork/gpt.md" "docs/prompt-sync.md" "docs/v1-maintenance.md"
```

Expected: `git diff --check` exits 0; the stat lists only the six Task 1 files. Do not stage or commit.

---

### Task 2: Deterministic flaky-test triage source and debugging router

**Files:**
- Create: `skills/debugging/references/methodology/03-flaky-triage.md`
- Modify: `skills/debugging/SKILL.md`
- Modify: `docs/prompt-sync.md`
- Modify: `docs/v1-maintenance.md`

**Interfaces:**
- Consumes: the existing debugging phase loop, runtime references, journal/cleanup rules, and the two-round genuinely-difficult `hard-reasoning` escalation boundary.
- Produces: router path `references/methodology/03-flaky-triage.md` and a deterministic three-run classification contract copied into the Codex bundle and byte-verified in Task 4.

- [ ] **Step 1: Verify the missing-route RED precondition**

Run:

```powershell
$reference = "skills/debugging/references/methodology/03-flaky-triage.md"
if (Test-Path -LiteralPath $reference) { throw "$reference already exists before RED" }
rg -n "flaky|intermittent|passes in isolation|order-dependent|CI-only" "skills/debugging/SKILL.md"
if ($LASTEXITCODE -ne 1) { throw "debugging router unexpectedly already exposes flaky triage" }
```

Expected: the file does not exist and `rg` returns exit code 1 because the router has no flaky-triage route.

- [ ] **Step 2: Add the complete flaky-triage reference**

Create `skills/debugging/references/methodology/03-flaky-triage.md` with this structure and contract:

```markdown
# Flaky-test triage

Use this reference when the reported failure is intermittent, changes which test fails, passes in isolation, depends on order, or appears only in CI. Do not start by changing the test. Establish a reproducible signature and classify the shared state first.

## Safety boundary

- Keep the original failing command and inputs unchanged for the first rerun.
- Do not install a utility, terminate another user's process, overwrite user configuration, or reuse a shared temporary root.
- Do not treat retry wrappers, arbitrary sleeps, quarantine, deletion, or assertion weakening as fixes.
- Journal every temporary root, port, process, database, cache, lock, trace, and seed created during triage; remove only artifacts created by this run.

## Three-run signature

Capture command, exit code, failing test name, duration, seed, worker count, temporary root, relevant environment differences, and the first causal error for each run.

1. **Unchanged rerun:** execute the exact failing command again with the same inputs and worker settings.
2. **Isolated case:** use the test runner's native exact-name or exact-file filter to run only the failing case.
3. **Quiet affected scope:** run the full affected package/module/suite in a worker-created isolated root after closing only background jobs started by this run. Do not stop unrelated or user-owned watchers/processes.
4. **Seeded shuffle only when order is plausible:** use the runner's native deterministic shuffle and print the seed. Re-run the same seed before trying another seed.

Interpret the signature:

| Signature | Primary classification | Next evidence |
|---|---|---|
| Same case changes outcome under unchanged input | Product race or async timing | Awaited work, clocks, events, cancellation, worker scheduling, and data visibility. |
| Isolated case passes but quiet scope fails | Order or fixture leakage | Process globals, environment mutation, module caches, singleton state, fixture teardown, and shared files. |
| Different cases fail around one port/root/service | Environment contention | Port ownership, temporary-root namespace, database/schema namespace, cache keys, container/project names, and locks. |
| Only CI or high parallelism fails with resource evidence | Resource-limit pressure | CPU/memory/file descriptors, worker count, service readiness, time budget, and captured system metrics. |

If evidence spans classifications, keep more than one hypothesis until a controlled toggle changes the outcome. If the failure cannot be reproduced, report the runs and classification confidence as an unresolved finding; do not call it fixed.

## Paired isolation examples

Create a unique run root rather than sharing a fixed directory.

**Bash:**

```bash
run_root="$(mktemp -d "${TMPDIR:-/tmp}/flaky-run.XXXXXX")"
printf '%s\n' "$run_root"
```

**PowerShell:**

```powershell
$approvedTemp = Join-Path $env:LOCALAPPDATA "Temp\opencode"
$runRoot = Join-Path $approvedTemp ("flaky-run-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
$runRoot
```

Inspect a suspected fixed port without killing its owner.

**Bash (only when the command already exists):**

```bash
ss -ltnp
```

**PowerShell:**

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, State, OwningProcess
```

If the port belongs to another user process, record the evidence and configure this run to use a unique port. Do not install `ss` or another inspector merely to match an example; use an already available platform-native inspection surface.

## Cause-oriented repair

- Namespace temporary roots, ports, database schemas, container/project names, cache keys, and lock files by test run or worker.
- Restore process-global environment/config and fake clocks in teardown that runs even after failure.
- Await spawned work and close only processes, sockets, handles, servers, and containers created by the test.
- Replace shared mutable fixtures with per-test construction or explicit reset boundaries.
- Preserve a failing-first regression that reproduces the confirmed cause without depending on random luck.

After two failed evidence rounds, the existing debugging policy permits one `hard-reasoning` escalation only when the root-cause problem is genuinely difficult. Reviewer and Oracle profiles are not debugging agents. If the cause remains outside scope, report the classification, commands, seeds, observations, and residual risk as an unresolved finding.
```

The paired snippets are examples for their native shells; the reference must not tell a Windows worker to launch Bash or a POSIX worker to launch PowerShell.

- [ ] **Step 3: Route flaky failures from `skills/debugging/SKILL.md`**

Make these bounded edits only:

1. Extend the frontmatter description and trigger list with `flaky test`, `intermittent failure`, `passes in isolation`, `different test fails`, `order-dependent`, and `CI-only failure`; preserve the existing two-round genuinely-difficult escalation wording.
2. Add this first row under `### Cross-cutting methodology references`, before the partial-runtime-evidence row:

```markdown
| A test is flaky/intermittent, a different test fails, it passes in isolation, it is order-dependent, or it fails only in CI | 📖 **[references/methodology/03-flaky-triage.md](references/methodology/03-flaky-triage.md)** — establish the three-run signature and classify shared state before Phase 2. |
```

3. Add an instruction in `## What to Do Right Now` after identifying the runtime: if the report matches this route, open `03-flaky-triage.md` before forming hypotheses.

Do not change the phase numbering, tool ownership, safety invariants, Git rule, or Reviewer/Oracle role policy.

- [ ] **Step 4: Record debugging provenance and bounded adaptation**

Extend the dated project-4 sections in both `docs/prompt-sync.md` and `docs/v1-maintenance.md` with:

- source `packages/shared-skills/skills/debugging/references/methodology/03-flaky-triage.md`;
- upstream commits `000542bda52fa12b1e1ef79719bfdd3f6f79722a` and description alignment `2e2b9b748107e657453da5cbb3528410ed49902b`;
- adopted unchanged/isolated/quiet-scope/optional-seeded signature, four classifications, shared-root/port/env/database/cache/lock checks, and cause-oriented isolation repair;
- local paired-shell/no-install/no-user-process-kill behavior and explicit rejection of retries, sleeps, quarantine, deletion, assertion weakening, Bash-only assumptions, and Oracle-as-debugger behavior;
- preservation of the local two-failed-round, genuinely-difficult `hard-reasoning` escalation boundary.

- [ ] **Step 5: Verify the source/router contract GREEN without brittle prose snapshots**

Run:

```powershell
rg -n "flaky|intermittent|passes in isolation|order-dependent|CI-only" "skills/debugging/SKILL.md"
rg -n "Unchanged rerun|Isolated case|Quiet affected scope|Seeded shuffle" "skills/debugging/references/methodology/03-flaky-triage.md"
rg -n "Product race or async timing|Environment contention|Order or fixture leakage|Resource-limit pressure" "skills/debugging/references/methodology/03-flaky-triage.md"
rg -n "retry wrappers|arbitrary sleeps|quarantine|deletion|assertion weakening|terminate another user's process" "skills/debugging/references/methodology/03-flaky-triage.md"
rg -n "mktemp|Get-NetTCPConnection|Do not install|genuinely difficult|Reviewer and Oracle profiles are not debugging agents" "skills/debugging/references/methodology/03-flaky-triage.md"
```

Expected: every command exits 0 and prints the corresponding route, signature, classification, forbidden-remedy, paired-shell, escalation, and role-boundary lines. Do not add a full-prose snapshot test for this reference.

- [ ] **Step 6: Close the Task 2 review boundary without Git writes**

Run:

```powershell
git diff --check -- "skills/debugging/SKILL.md" "skills/debugging/references/methodology/03-flaky-triage.md" "docs/prompt-sync.md" "docs/v1-maintenance.md"
git diff --stat -- "skills/debugging/SKILL.md" "skills/debugging/references/methodology/03-flaky-triage.md" "docs/prompt-sync.md" "docs/v1-maintenance.md"
```

Expected: whitespace check exits 0; only the router and maintenance docs appear in the tracked diff stat (the new untracked reference is visible in `git status --short`). Do not stage or commit.

---

### Task 3: Composable frontend interaction source, routing, counts, and provenance

**Files:**
- Create: `skills/frontend/references/design/interaction-skill.md`
- Modify: `skills/frontend/SKILL.md`
- Modify: `skills/frontend/.gitignore`
- Modify: `skills/frontend/references/design/README.md`
- Modify: `skills/frontend/references/design/_INDEX.md`
- Modify: `skills/frontend/ATTRIBUTION.md`
- Modify: `docs/prompt-sync.md`
- Modify: `docs/v1-maintenance.md`

**Interfaces:**
- Consumes: the existing `DESIGN.md` gate, one-style-at-a-time Layer-A selection, Layer-B token source, package inspection, browser QA, and dependency authorization policy.
- Produces: source path `references/design/interaction-skill.md`, a separate one-file composable-mechanics inventory class, exact counts `84 total / 12 taste / 70 brand`, and project-original provenance consumed and byte-verified in Task 4.

- [ ] **Step 1: Verify the inventory and missing-reference RED precondition**

Run:

```powershell
$reference = "skills/frontend/references/design/interaction-skill.md"
if (Test-Path -LiteralPath $reference) { throw "$reference already exists before RED" }
rg -n "83 reference files|all 83 files" "skills/frontend/SKILL.md" "skills/frontend/references/design/README.md"
if ($LASTEXITCODE -ne 0) { throw "expected the current 83-reference baseline" }
rg -n "Composable interaction mechanics" "skills/frontend/references/design/_INDEX.md"
if ($LASTEXITCODE -ne 1) { throw "interaction mechanics unexpectedly already indexed" }
```

Expected: the reference is absent, the two current 83-count statements are found, and no composable-interaction section exists.

- [ ] **Step 2: Add the standalone interaction mechanics reference**

Create `skills/frontend/references/design/interaction-skill.md` with this complete local contract:

```markdown
# Interaction mechanics

This is a composable mechanics reference, not a visual style choice. Load it when the work includes meaningful hover/focus/press behavior, disclosure or modal transitions, drag/spatial continuity, loading/success/error transitions, or motion-system decisions. It stacks with one selected Layer A style skill and an optional Layer B design system; it never consumes the one-style slot.

## Read the project before choosing motion

1. Read the complete project `DESIGN.md` and use its tokens and motion rules.
2. Read the component conventions and the existing implementation of the affected primitive.
3. Inspect `package.json`, the lockfile, and imports to identify the existing animation/motion stack. Do not assume Tailwind, Motion, a spring library, or any other package is installed.
4. Prefer existing CSS and project utilities. Before proposing a new dependency, record its bundle/runtime cost and why the current stack cannot express the required behavior. A new dependency still requires the task's normal design and authorization process.

External interaction catalogs may be used as optional inspiration when already available, but the implementation and verification contract below is complete without network access or vendor components.

## Interaction-state matrix

Before implementation, write the relevant rows for each affected component. Omit states that truly do not apply; never omit a state merely because it is harder to verify.

| State | Trigger/input | Visual response | Motion and duration | Focus/announcement | Reduced-motion behavior |
|---|---|---|---|---|---|
| Default | Initial/settled | Token-defined baseline | None unless state continuity needs it | Correct semantic role/name | Same information |
| Hover | Pointer hover | Clear affordance without layout shift | Short transform/opacity/color transition | No focus substitution | Instant or reduced transition |
| Focus | Keyboard/programmatic focus | Visible token-defined focus indicator | No delayed focus feedback | Focus order and target verified | Indicator remains visible |
| Press/active | Pointer or keyboard activation | Immediate pressed response | No input-latency animation | Activation works with keyboard | Immediate response |
| Open/close | Disclosure, menu, dialog, popover | State and spatial origin remain legible | Interruptible transition | Focus move/return and semantics verified | Instant or minimal continuity |
| Loading | Async work starts | Stable layout and progress state | Motion never blocks input or status | Busy/status semantics as applicable | Non-animated status remains |
| Success | Operation succeeds | Confirm result without surprise movement | Brief state transition | Status conveyed non-visually | Same information without motion |
| Error | Operation fails | Error is adjacent and actionable | No decorative shake requirement | Error relationship/announcement verified | Same information without motion |
| Disabled | Action unavailable | Distinct but readable state | No hover/press affordance | Native semantics when possible | Identical behavior |

## Mechanics rules

- Motion communicates state change or spatial continuity; it is not decoration added to every element.
- Input acknowledgement is immediate. Never delay click, key, focus, drag, or close handling until an animation completes.
- Prefer compositor-friendly `transform` and `opacity`; do not animate layout properties when an equivalent composited transition exists.
- Spatial interactions may use interruptible spring motion only when the existing stack supports it. Reversal or repeated input must retarget from the current visual state rather than queue stale animations.
- Preserve layout stability, readable focus indicators, semantic state, and input modality parity.
- `prefers-reduced-motion` removes non-essential motion and shortens essential continuity while preserving every state and outcome.

## Real-browser QA

Drive the actual browser surface rather than inferring behavior from code.

1. Exercise every applicable matrix row with pointer input.
2. Repeat activation, open/close, and focus flow using only the keyboard; verify visible focus and focus return.
3. Repeat under reduced motion and verify information/state parity.
4. Interrupt and reverse spatial transitions to prove they do not queue, jump, trap focus, or ignore input.
5. Check representative mobile, tablet, and desktop breakpoints required by the parent frontend rules.
6. Capture the available trace and screenshots for normal and reduced-motion states. If the harness cannot capture one evidence type, report exactly which evidence is absent rather than claiming it exists.

Completion requires the relevant matrix rows, package/stack evidence, real-browser normal and reduced-motion results, keyboard and pointer coverage, and captured trace/screenshot paths. No network catalog, vendor package, or unavailable command is required.
```

- [ ] **Step 3: Add the route while preserving the one-style rule**

Make these exact semantic edits to `skills/frontend/SKILL.md`:

1. Preserve `12 taste skills` and `70 brand DESIGN.md refs` in the frontmatter description; add interaction/mechanics/state/reduced-motion triggers without describing interaction as a thirteenth style.
2. Change the Ruleset 1 inventory sentence to: one architecture file, 12 taste skills, one composable interaction-mechanics reference, and 70 brand systems; `_INDEX.md` catalogs all 84 files.
3. Add this section between Layer A and Layer B:

```markdown
### Composable interaction mechanics (stacks; not a style choice)

| File | Read when |
|---|---|
| `interaction-skill.md` | The work includes meaningful interaction states, open/close transitions, spatial continuity, loading/success/error transitions, keyboard focus behavior, or reduced-motion behavior. Stack it with the selected style/brand references; it does not consume the one-style slot. |
```

4. Add this quick route:

```markdown
| "Polish these interactions" / "add motion and states" | `design/README.md` + `design/interaction-skill.md` + the selected style/brand reference + `perfection/README.md` |
```

Do not alter the 12 Layer-A rows or classify `interaction-skill.md` under Layer A.

- [ ] **Step 4: Update design routing and exact inventory counts**

In `skills/frontend/references/design/README.md`:

- describe three conceptual sets: Layer A (12), composable interaction mechanics (1), Layer B (70), plus the existing architecture reference;
- change `83` to `84` for the combined design-reference inventory;
- add a routing step that loads `interaction-skill.md` for interaction state/motion mechanics after selecting style/brand inputs;
- add stacking rule: `interaction-skill.md` stacks with the selected style and brand references and does not consume the at-most-one-style slot;
- add a quick lookup row for interaction/motion/state requests;
- preserve the existing at-most-one Layer-A style rule and normal design/dependency authorization gates.

In `skills/frontend/references/design/_INDEX.md`:

- change the opening model from three layers to the existing three layers plus a separate composable-mechanics set;
- retain `Layer 0 — 1`, `Layer A — 12`, and `Layer B — 70` exactly;
- add this section between Layer A stacking rules and Layer B:

```markdown
## Composable Interaction Mechanics (1)

This is stacking behavior, not a Layer A style choice. Load it in addition to the selected style/brand references when the interaction surface requires it.

| File | Purpose | Load when |
|---|---|---|
| `interaction-skill.md` | State matrices, spatial continuity, input-responsive motion, reduced-motion behavior, and real-browser interaction QA. | The work includes meaningful hover/focus/press/open-close/loading/success/error behavior or motion mechanics. |
```

- state the arithmetic explicitly as `1 architecture + 12 taste/style + 1 interaction mechanics + 70 brand = 84 total design references`;
- do not renumber or modify the 12 taste/style and 70 brand inventories.

- [ ] **Step 5: Record project-original provenance and maintenance synchronization**

In `skills/frontend/ATTRIBUTION.md` §4, add `frontend/references/design/interaction-skill.md` to the project-original list and add this lineage statement:

```markdown
`frontend/references/design/interaction-skill.md` is a project-original local adaptation and synthesis of general interaction-state and motion-mechanics practices. It contains no vendored component catalog or third-party implementation, requires no network source at runtime, and grants no license to copy vendor components or branded assets.
```

In `skills/frontend/.gitignore`, add this exact exception beside the other project-original design-doc exceptions:

```gitignore
!references/design/interaction-skill.md
```

Verify `git check-ignore "skills/frontend/references/design/interaction-skill.md"` exits 1. Do not use `git add -f`; the project-original source must be normally trackable.

Extend the dated project-4 sections in `docs/prompt-sync.md` and `docs/v1-maintenance.md` with:

- upstream source `packages/shared-skills/skills/frontend/references/design/interaction-skill.md`;
- upstream commits `5506324bbfdc9bb417967164fe2fd0b5afd48993` and `6b57dc1169174aee5dcf5da667fedfb4ce8e5268`;
- local project-original synthesis of state matrix, spatial continuity, dependency inspection/cost, reduced motion, keyboard/pointer QA, and trace/screenshot evidence;
- exact count transition `83 -> 84 total`, while `12 style/taste` and `70 brand` remain unchanged;
- explicit classification as composable mechanics rather than a style choice;
- explicit rejection of branding, designpowers, `/visual-qa`, beui/vendor network dependency, Tailwind/Motion assumptions, and new package installation without normal design and authorization.

- [ ] **Step 6: Verify the source/count/provenance contract GREEN**

Run:

```powershell
rg -n "84|12 taste|70 brand|interaction-skill" "skills/frontend/SKILL.md" "skills/frontend/references/design/README.md" "skills/frontend/references/design/_INDEX.md"
rg -n "Composable Interaction Mechanics \(1\)|not a Layer A style choice|1 architecture \+ 12 taste/style \+ 1 interaction mechanics \+ 70 brand = 84" "skills/frontend/references/design/_INDEX.md"
rg -n "hover|focus|press|open/close|loading|success|error|disabled|reduced-motion" "skills/frontend/references/design/interaction-skill.md"
rg -n "transform|opacity|input|interruptible spring|package.json|bundle/runtime cost|keyboard|pointer|trace|screenshots" "skills/frontend/references/design/interaction-skill.md"
rg -n "project-original local adaptation and synthesis|no vendored component catalog|requires no network" "skills/frontend/ATTRIBUTION.md"
```

Expected: every command exits 0. Manual source review confirms exactly 12 Layer-A rows, 70 Layer-B files, and one separate interaction row; no brittle full-prose test is added.

- [ ] **Step 7: Close the Task 3 review boundary without Git writes**

Run:

```powershell
git diff --check -- "skills/frontend/SKILL.md" "skills/frontend/.gitignore" "skills/frontend/references/design/README.md" "skills/frontend/references/design/_INDEX.md" "skills/frontend/ATTRIBUTION.md" "docs/prompt-sync.md" "docs/v1-maintenance.md"
git check-ignore "skills/frontend/references/design/interaction-skill.md"
if ($LASTEXITCODE -ne 1) { throw "interaction reference remains ignored" }
git diff --stat -- "skills/frontend/SKILL.md" "skills/frontend/.gitignore" "skills/frontend/references/design/README.md" "skills/frontend/references/design/_INDEX.md" "skills/frontend/ATTRIBUTION.md" "docs/prompt-sync.md" "docs/v1-maintenance.md"
git status --short -- "skills/frontend/references/design/interaction-skill.md"
```

Expected: whitespace check exits 0; the tracked stat lists only the seven modified Task 3 files; `git check-ignore` exits 1; status reports the new interaction reference as an ordinary untracked file. Do not stage or commit.

---

### Task 4: Generator copy contracts, deterministic regeneration, integrated QA, and acceptance handoff

**Files:**
- Modify: `src/codex/plugin-generator.test.ts`
- Inspect only: `src/codex/plugin-generator.ts`
- Regenerate only: `.codex/agents/**`
- Regenerate only: `plugins/deepwork/agents/**`
- Regenerate only: `plugins/deepwork/skills/debugging/**`
- Regenerate only: `plugins/deepwork/skills/frontend/**`
- Verify only: `.agents/plugins/marketplace.json`, `plugins/deepwork/.codex-plugin/plugin.json`, `plugins/deepwork/package.json`, and the remaining generated inventory

**Interfaces:**
- Consumes: source skill roots from Tasks 2–3; `generateCodexPlugin(options)`; generator behavior `copySkillDirectory(source, target)` followed by `normalizeSkillForCodex(target)`; existing `extractCallableDispatchContract` and `assertCanonicalCodexDispatchContract` test helpers.
- Produces: `listRelativeFiles(root: string): string[]`, `assertGeneratedSharedSkillTree(label, sourceRoot, temporaryRoot, trackedRoot, requiredFile): string`, and the test `Codex generated debugging and frontend skill trees mirror source inventory and bytes`; fresh tracked generated output; complete QA evidence for orchestrator-owned final review.

- [ ] **Step 1: Add complete skill-tree inventory and byte-copy helpers**

Update the `node:path` import in `src/codex/plugin-generator.test.ts`:

```ts
import { isAbsolute, join, relative } from "node:path"
```

Add these helpers near the other file/contract helpers:

```ts
function listRelativeFiles(root: string): string[] {
  function visit(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = join(directory, entry.name)
      return entry.isDirectory()
        ? visit(absolute)
        : [relative(root, absolute).replaceAll("\\", "/")]
    })
  }

  return visit(root).sort()
}

function assertGeneratedSharedSkillTree(
  label: string,
  sourceRoot: string,
  temporaryRoot: string,
  trackedRoot: string,
  requiredFile: string,
): string {
  const sourceFiles = listRelativeFiles(sourceRoot)
  const temporaryFiles = listRelativeFiles(temporaryRoot)
  const trackedFiles = listRelativeFiles(trackedRoot)

  assert.ok(sourceFiles.includes(requiredFile), `${label} source is missing ${requiredFile}`)
  assert.deepEqual(temporaryFiles, sourceFiles, `temporary ${label} skill inventory differs from source`)
  assert.deepEqual(trackedFiles, sourceFiles, `tracked ${label} skill inventory is stale`)

  let routerSuffix = ""
  for (const file of sourceFiles) {
    const source = readFileSync(join(sourceRoot, file))
    const temporary = readFileSync(join(temporaryRoot, file))
    const tracked = readFileSync(join(trackedRoot, file))

    assert.deepEqual(tracked, temporary, `tracked ${label}/${file} differs from fresh generation`)
    if (file === "SKILL.md") {
      const sourceText = source.toString("utf8")
      const temporaryText = temporary.toString("utf8")
      const normalizedSourceBody = sourceText.trimEnd()
      assert.ok(temporaryText.startsWith(normalizedSourceBody), `${label} router does not preserve the normalized source body`)
      routerSuffix = temporaryText.slice(normalizedSourceBody.length)
      assert.match(routerSuffix, /^\r?\n\r?\n## Codex Compatibility/, `${label} router suffix`)
    } else {
      assert.deepEqual(temporary, source, `${label}/${file} is not a byte-for-byte source copy`)
    }
  }

  return routerSuffix
}
```

This encodes the existing generator boundary accurately: non-router files are raw byte copies, while each generated `SKILL.md` is the source body after the generator's existing trailing-whitespace normalization plus the canonical Codex compatibility suffix. Do not change `normalizeSkillForCodex` or weaken its existing callable-contract tests.

- [ ] **Step 2: Add the fresh-versus-source-versus-tracked test**

Add this test before the existing all-normalized-skills callable-schema test:

```ts
test("Codex generated debugging and frontend skill trees mirror source inventory and bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "deepwork-codex-shared-skills-"))
  try {
    const result = await generateCodexPlugin({
      projectRoot: process.cwd(),
      pluginRoot: join(root, "plugins", "deepwork"),
      marketplacePath: join(root, ".agents", "plugins", "marketplace.json"),
      projectAgentsRoot: join(root, CODEX_PROJECT_AGENTS_DIR),
      config: { ...defaultConfig(), workflow: "codex" },
      packageVersion: "9.9.9",
    })

    const suffixes = new Map<string, string>()
    for (const [name, requiredFile] of [
      ["debugging", "references/methodology/03-flaky-triage.md"],
      ["frontend", "references/design/interaction-skill.md"],
    ] as const) {
      suffixes.set(
        name,
        assertGeneratedSharedSkillTree(
          name,
          join(process.cwd(), "skills", name),
          join(result.pluginRoot, "skills", name),
          join(process.cwd(), CODEX_PLUGIN_DIR, "skills", name),
          requiredFile,
        ),
      )
    }

    assert.equal(
      suffixes.get("debugging"),
      suffixes.get("frontend"),
      "normalized shared-skill routers must carry the same canonical compatibility suffix",
    )
    for (const name of ["debugging", "frontend"] as const) {
      const generatedRouter = readFileSync(join(result.pluginRoot, "skills", name, "SKILL.md"), "utf8")
      const contract = extractCallableDispatchContract(generatedRouter, `${name} generated router`)
      assertCanonicalCodexDispatchContract(contract, `${name} generated router`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

Keep the existing tracked-agent/workflow freshness test and the all-normalized-skills callable-schema test intact.

- [ ] **Step 3: Run the generator test to verify RED before tracked regeneration**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="generated debugging and frontend skill trees" src/codex/plugin-generator.test.ts
```

Expected: FAIL with `tracked debugging skill inventory is stale` because the Task 2 source reference exists but has not yet been generated into `plugins/deepwork/skills/debugging/`. If debugging happens to be compared after frontend, the equivalent accepted RED is `tracked frontend skill inventory is stale`. No unrelated selected test fails.

- [ ] **Step 4: Build TypeScript, generate twice, and compare the complete generated inventory and SHA-256 byte map**

Run this PowerShell block exactly. It treats `.agents/plugins/marketplace.json`, `.codex/agents`, and the complete `plugins/deepwork` tree as the generated inventory; evidence is written only under the approved temporary root and removed after comparison.

```powershell
$repoRoot = (Get-Location).Path
$evidenceRoot = Join-Path "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode" ("project4-generation-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

function Get-GeneratedManifest([string]$Root) {
  $entries = [System.Collections.Generic.List[string]]::new()
  $file = Join-Path $Root ".agents\plugins\marketplace.json"
  $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  $entries.Add(".agents/plugins/marketplace.json`t$hash")

  foreach ($relativeRoot in @(".codex\agents", "plugins\deepwork")) {
    $absoluteRoot = Join-Path $Root $relativeRoot
    foreach ($item in Get-ChildItem -LiteralPath $absoluteRoot -File -Recurse) {
      $relativePath = [IO.Path]::GetRelativePath($Root, $item.FullName).Replace("\", "/")
      $itemHash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      $entries.Add("$relativePath`t$itemHash")
    }
  }

  return @($entries | Sort-Object)
}

try {
  pnpm run build:ts
  if ($LASTEXITCODE -ne 0) { throw "pnpm run build:ts failed" }

  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "first pnpm run gen:codex-plugin failed" }
  $first = Get-GeneratedManifest $repoRoot
  [IO.File]::WriteAllLines((Join-Path $evidenceRoot "first.tsv"), $first)

  pnpm run gen:codex-plugin
  if ($LASTEXITCODE -ne 0) { throw "second pnpm run gen:codex-plugin failed" }
  $second = Get-GeneratedManifest $repoRoot
  [IO.File]::WriteAllLines((Join-Path $evidenceRoot "second.tsv"), $second)

  $difference = @(Compare-Object -ReferenceObject $first -DifferenceObject $second)
  if ($difference.Count -ne 0) {
    $difference | Format-Table | Out-String
    throw "Codex generation changed inventory or bytes on the second run"
  }
  "Deterministic generation: $($second.Count) files with identical SHA-256 manifests"
} finally {
  if (Test-Path -LiteralPath $evidenceRoot) {
    Remove-Item -LiteralPath $evidenceRoot -Recurse -Force
  }
}
```

Expected: `build:ts` succeeds; each generator run reports the same agent/skill counts; the final line reports a positive file count and identical manifests; the temporary evidence root is absent afterward. Review `git diff` to confirm generator-created changes are limited to approved prompt-derived agents and the debugging/frontend skill trees.

- [ ] **Step 5: Run targeted generator and prompt tests to verify GREEN**

Run:

```powershell
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="generated debugging and frontend skill trees" src/codex/plugin-generator.test.ts
node --test --experimental-strip-types --test-reporter=spec --test-name-pattern="GPT run contract" src/intent/prompt-loader.test.ts
```

Expected: both named tests pass with zero failures. The generator test proves complete source/fresh/tracked inventory equality, raw byte equality for every non-`SKILL.md` file, normalized router source body plus canonical compatibility suffix, and explicit presence of both new references.

- [ ] **Step 6: Run all repository quality gates**

Run each command independently so a failure cannot be hidden by command chaining:

```powershell
pnpm run typecheck
pnpm test
pnpm run build
git diff --check
```

Expected:

- `pnpm run typecheck`: TypeScript exits 0 with no diagnostics.
- `pnpm test`: TypeScript `node:test` and `cargo test -p ocmm-lsp` both exit 0.
- `pnpm run build`: TypeScript and native LSP release build exit 0 and refresh `dist/` without unexpected tracked changes.
- `git diff --check`: exits 0 with no whitespace errors.

Do not install a missing tool or dependency. Report a missing preinstalled command as a blocker with its exact command/error.

- [ ] **Step 7: Verify the effective GPT prompt through isolated, credential-free OpenCode configurations**

Run the following PowerShell script after `pnpm run build`. It snapshots and restores every touched process environment variable, disables update/share behavior, uses all four isolated XDG roots, performs no model request, captures evidence only under the temporary root, and cleans that root in `finally`.

```powershell
$repoRoot = (Get-Location).Path
$testRoot = Join-Path "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode" ("project4-prompt-load-" + [guid]::NewGuid().ToString("N"))
$envNames = @(
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME",
  "OPENCODE_CONFIG", "OPENCODE_CONFIG_CONTENT", "OPENCODE_CONFIG_DIR", "OPENCODE_DISABLE_AUTOUPDATE",
  "OCMM_DEBUG", "OCMM_PROFILE", "OCMM_NO_PROFILE", "OCMM_FAST"
)
$savedEnv = @{}
foreach ($name in $envNames) { $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
$pushed = $false

try {
  foreach ($directory in @(".opencode", "xdg-config", "xdg-data", "xdg-state", "xdg-cache", "evidence")) {
    New-Item -ItemType Directory -Path (Join-Path $testRoot $directory) -Force | Out-Null
  }

  $opencodeConfig = [ordered]@{
    '$schema' = "https://opencode.ai/config.json"
    plugin = @((Join-Path $repoRoot "dist\index.js"))
    autoupdate = $false
    share = "disabled"
    disabled_providers = @("opencode", "openrouter", "github-copilot", "openai")
  }
  [IO.File]::WriteAllText(
    (Join-Path $testRoot "opencode.json"),
    ($opencodeConfig | ConvertTo-Json -Depth 20),
    [Text.UTF8Encoding]::new($false)
  )

  $env:XDG_CONFIG_HOME = Join-Path $testRoot "xdg-config"
  $env:XDG_DATA_HOME = Join-Path $testRoot "xdg-data"
  $env:XDG_STATE_HOME = Join-Path $testRoot "xdg-state"
  $env:XDG_CACHE_HOME = Join-Path $testRoot "xdg-cache"
  $env:OPENCODE_CONFIG = $null
  $env:OPENCODE_CONFIG_CONTENT = $null
  $env:OPENCODE_CONFIG_DIR = $null
  $env:OPENCODE_DISABLE_AUTOUPDATE = "1"
  $env:OCMM_DEBUG = "1"
  $env:OCMM_PROFILE = $null
  $env:OCMM_NO_PROFILE = $null
  $env:OCMM_FAST = $null

  Push-Location $testRoot
  $pushed = $true

  $pathsOutput = @(& opencode debug paths 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "opencode debug paths failed" }
  [IO.File]::WriteAllLines((Join-Path $testRoot "evidence\opencode-debug-paths.txt"), [string[]]$pathsOutput)
  $normalizedPaths = ($pathsOutput -join "`n").Replace("\", "/").ToLowerInvariant()
  foreach ($name in @("xdg-config", "xdg-data", "xdg-state", "xdg-cache")) {
    $expected = (Join-Path $testRoot $name).Replace("\", "/").ToLowerInvariant()
    if (-not $normalizedPaths.Contains($expected)) { throw "OpenCode path escaped isolation: $expected" }
  }

  foreach ($workflow in @("omo", "v1")) {
    $ocmmConfig = [ordered]@{
      workflow = $workflow
      debug = $true
      agents = [ordered]@{
        orchestrator = [ordered]@{ model = "openai/gpt-5.6-sol"; variant = "max" }
      }
    }
    [IO.File]::WriteAllText(
      (Join-Path $testRoot ".opencode\ocmm.jsonc"),
      ($ocmmConfig | ConvertTo-Json -Depth 20),
      [Text.UTF8Encoding]::new($false)
    )

    $agentOutput = @(& opencode debug agent orchestrator --print-logs --log-level DEBUG 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "OpenCode $workflow orchestrator prompt load failed" }
    [IO.File]::WriteAllLines((Join-Path $testRoot "evidence\$workflow-orchestrator.txt"), [string[]]$agentOutput)
    $agentText = $agentOutput -join "`n"
    foreach ($pattern in @(
      "Run-scoped tracking and stop contract",
      "exactly one active item",
      "create_goal",
      "Tracking completion never authorizes a Git write"
    )) {
      if ($agentText -notmatch [regex]::Escape($pattern)) { throw "$workflow prompt missing: $pattern" }
    }
    if ($agentText -notmatch 'child delegation''s\s+`?STOP WHEN`?.*ends only the child') {
      throw "$workflow prompt missing child STOP WHEN boundary"
    }
    if ($agentText -match '(?i)commit after (every|each) increment|history-mimicking commits|always (call|use)\s+`?create_goal`?') {
      throw "$workflow prompt exposes rejected goal/commit behavior"
    }
  }
  "Isolated OpenCode prompt-load QA passed for omo and v1 without a model request"
} finally {
  if ($pushed) { Pop-Location }
  foreach ($name in $envNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], "Process")
  }
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
```

Expected: both workflows expose every positive marker, neither exposes a rejected imperative, no provider/model request occurs, every XDG path points under the unique root, and the root is removed after the pass or failure.

- [ ] **Step 8: Verify packaged Codex skill-path resolution through an isolated, credential-free Codex home**

Run this PowerShell script from the repository root. It registers only the local marketplace, disables startup update/response storage, clears common provider credential variables for the probe, requires the isolated installed path returned by `codex plugin add --json`, verifies both generated references from that cache path, compares SHA-256 bytes to tracked generated files, restores the environment, and removes the isolated root.

```powershell
$repoRoot = (Get-Location).Path
$testRoot = Join-Path "C:\Users\HUGEFI~1\AppData\Local\Temp\opencode" ("project4-codex-plugin-" + [guid]::NewGuid().ToString("N"))
$envNames = @(
  "CODEX_HOME", "CODEX_DISABLE_AUTO_UPDATE",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME",
  "OPENAI_API_KEY", "CODEX_API_KEY", "AZURE_OPENAI_API_KEY"
)
$savedEnv = @{}
foreach ($name in $envNames) { $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
$pushed = $false

try {
  foreach ($directory in @("codex-home", "xdg-config", "xdg-data", "xdg-state", "xdg-cache", "evidence")) {
    New-Item -ItemType Directory -Path (Join-Path $testRoot $directory) -Force | Out-Null
  }
  $env:CODEX_HOME = Join-Path $testRoot "codex-home"
  $env:CODEX_DISABLE_AUTO_UPDATE = "1"
  $env:XDG_CONFIG_HOME = Join-Path $testRoot "xdg-config"
  $env:XDG_DATA_HOME = Join-Path $testRoot "xdg-data"
  $env:XDG_STATE_HOME = Join-Path $testRoot "xdg-state"
  $env:XDG_CACHE_HOME = Join-Path $testRoot "xdg-cache"
  $env:OPENAI_API_KEY = $null
  $env:CODEX_API_KEY = $null
  $env:AZURE_OPENAI_API_KEY = $null
  [IO.File]::WriteAllText(
    (Join-Path $env:CODEX_HOME "config.toml"),
    "check_for_update_on_startup = false`ndisable_response_storage = true`n",
    [Text.UTF8Encoding]::new($false)
  )

  Push-Location $repoRoot
  $pushed = $true
  $marketplaceOutput = @(& codex plugin marketplace add $repoRoot --json 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "codex plugin marketplace add failed" }
  $addOutput = @(& codex plugin add deepwork@deepwork-local --json 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "codex plugin add failed" }
  $listOutput = @(& codex plugin list --available --json 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "codex plugin list failed" }

  [IO.File]::WriteAllLines((Join-Path $testRoot "evidence\marketplace-add.txt"), [string[]]$marketplaceOutput)
  [IO.File]::WriteAllLines((Join-Path $testRoot "evidence\plugin-add.txt"), [string[]]$addOutput)
  [IO.File]::WriteAllLines((Join-Path $testRoot "evidence\plugin-list.json"), [string[]]$listOutput)
  $listText = $listOutput -join "`n"
  if ($listText -notmatch "deepwork" -or $listText -notmatch "deepwork-local") {
    throw "isolated Codex registry does not list deepwork@deepwork-local"
  }

  $addJson = ($addOutput -join "`n") | ConvertFrom-Json
  if (-not $addJson.installedPath) { throw "codex plugin add did not return installedPath" }
  $pluginRoot = [IO.Path]::GetFullPath([string]$addJson.installedPath)
  $codexHomeRoot = [IO.Path]::GetFullPath($env:CODEX_HOME)
  $relativeToCodexHome = [IO.Path]::GetRelativePath($codexHomeRoot, $pluginRoot)
  if ($relativeToCodexHome -eq ".." -or $relativeToCodexHome.StartsWith("..\")) {
    throw "installed plugin escaped isolated CODEX_HOME: $pluginRoot"
  }
  $trackedPluginRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot "plugins\deepwork"))
  if ($pluginRoot -eq $trackedPluginRoot) { throw "Codex QA resolved the tracked source instead of the installed cache" }
  if (-not (Test-Path -LiteralPath (Join-Path $pluginRoot ".codex-plugin\plugin.json") -PathType Leaf)) {
    throw "installed plugin manifest missing: $pluginRoot"
  }

  foreach ($relativePath in @(
    "skills\debugging\references\methodology\03-flaky-triage.md",
    "skills\frontend\references\design\interaction-skill.md"
  )) {
    $resolved = Join-Path $pluginRoot $relativePath
    $tracked = Join-Path $trackedPluginRoot $relativePath
    $resolvedHash = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash
    $trackedHash = (Get-FileHash -LiteralPath $tracked -Algorithm SHA256).Hash
    if ($resolvedHash -ne $trackedHash) { throw "packaged byte mismatch: $relativePath" }
  }
  "Isolated Codex skill-path QA passed: $pluginRoot"
} finally {
  if ($pushed) { Pop-Location }
  foreach ($name in $envNames) {
    [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], "Process")
  }
  if (Test-Path -LiteralPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
```

Expected: all three plugin commands exit 0 without registry/network credentials; `deepwork@deepwork-local` is listed; `codex plugin add --json` returns an `installedPath` under the isolated `CODEX_HOME` cache and distinct from the tracked source root; both reference paths resolve from that installed root; each SHA-256 equals its tracked generated counterpart; the real Codex/OpenCode config is untouched; the temporary root is removed.

- [ ] **Step 9: Run final scope, staged-index, secret, release/project-5, and cleanup checks**

Run:

```powershell
$statusLines = @(git status --porcelain=v1)
$changedPaths = @($statusLines | ForEach-Object { $_.Substring(3).Trim('"') })
$allowedExact = @(
  "docs/superpowers/specs/2026-07-29-prompt-skill-upstream-sync-design.md",
  "docs/superpowers/plans/2026-07-29-prompt-skill-upstream-sync.md",
  "prompts/omo/deepwork/gpt.md",
  "prompts/v1/deepwork/gpt.md",
  "prompts/codex/deepwork/gpt.md",
  "src/intent/prompt-loader.test.ts",
  "src/codex/plugin-generator.test.ts",
  "skills/debugging/SKILL.md",
  "skills/debugging/references/methodology/03-flaky-triage.md",
  "skills/frontend/SKILL.md",
  "skills/frontend/.gitignore",
  "skills/frontend/references/design/interaction-skill.md",
  "skills/frontend/references/design/README.md",
  "skills/frontend/references/design/_INDEX.md",
  "skills/frontend/ATTRIBUTION.md",
  "docs/prompt-sync.md",
  "docs/v1-maintenance.md"
)
$allowedPrefixes = @(
  ".codex/agents/",
  "plugins/deepwork/agents/",
  "plugins/deepwork/skills/debugging/",
  "plugins/deepwork/skills/frontend/"
)
$unexpected = @($changedPaths | Where-Object {
  $path = $_.Replace("\", "/")
  $prefixAllowed = @($allowedPrefixes | Where-Object { $path.StartsWith($_) }).Count -gt 0
  ($allowedExact -notcontains $path) -and -not $prefixAllowed
})
if ($unexpected.Count -ne 0) { throw "Out-of-scope paths: $($unexpected -join ', ')" }

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw "staged index is not empty" }

git diff --exit-code -- "package.json" "schema.json" "src/config/schema.ts" ".github/workflows/release.yml" "crates/ocmm-lsp/Cargo.toml"
if ($LASTEXITCODE -ne 0) { throw "version/schema/release/project-5 surface changed" }
git diff --cached --exit-code -- "package.json" "schema.json" "src/config/schema.ts" ".github/workflows/release.yml" "crates/ocmm-lsp/Cargo.toml"
if ($LASTEXITCODE -ne 0) { throw "staged version/schema/release/project-5 surface changed" }

$package = [IO.File]::ReadAllText((Join-Path (Get-Location) "package.json")) | ConvertFrom-Json
if ($package.version -ne "0.6.4" -or $package.ocmm.lspVersion -ne "0.3.2") {
  throw "project 4 changed package or LSP version"
}

$secretPattern = '(?i)(?:sk-[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token)\s*[:=]\s*["''][a-z0-9_./+=-]{16,}["''])'
if ($changedPaths.Count -gt 0) {
  & rg -n --hidden $secretPattern -- $changedPaths
  if ($LASTEXITCODE -eq 0) { throw "possible credential or private key found in changed files" }
  if ($LASTEXITCODE -gt 1) { throw "secret scan failed to inspect changed files" }
}

git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check failed" }
git diff --stat
git status --short
```

Expected:

- scope allowlist is satisfied;
- staged index is empty;
- package version remains `0.6.4`, LSP version remains `0.3.2`, and schema/release/project-5 surfaces have no diff;
- secret scan returns exit code 1 (no match), not 0 or an error;
- `git diff --check` exits 0;
- status contains the preserved approved spec, this plan, the intended project-4 source/test/docs files, and generator-owned outputs only;
- no isolated OpenCode/Codex/generation temp root remains.

- [ ] **Step 10: Hand the complete implementation diff to orchestrator-owned acceptance review**

The implementation worker stops after returning:

1. current `git status --short` and `git diff --stat`;
2. the two targeted test outputs;
3. `pnpm run typecheck`, `pnpm test`, and `pnpm run build` exit evidence;
4. deterministic generation file count and identical SHA-256 manifest result;
5. isolated OpenCode omo/v1 prompt-load result;
6. isolated Codex packaged skill-path and hash result;
7. scope, empty-index, secret, version/schema/release-negative, cleanup, and `git diff --check` results.

The orchestrator, not this planner or a worker, must then select and dispatch the first currently available Oracle and the primary-lane Reviewer over the complete current project-4 working-tree diff and the evidence above. Acceptance requires both current full-diff reviews to pass with no unresolved blocker. Any implementation edit after a review invalidates that review and requires fresh acceptance over the new complete diff.

Do not claim a plan-critic receipt. Do not stage or commit after acceptance. In the final report, suggest only this semantic commit for later explicit user authorization:

```text
chore: sync prompt and skill guidance from upstream

Adapt GPT run tracking, deterministic flaky triage, and frontend interaction mechanics; regenerate the Codex bundle and update provenance.
```

Project 5, the `0.6.5` release, tagging/publishing, and local installation of the final verified release remain separate approved-spec/plan/implementation cycles.

---

## Requirement coverage and self-review checklist

- **GPT behavior:** Task 1 covers the available tracking surface, atomic items, exactly one active item, immediate transitions, discovered work, no batch completion, conditional `create_goal`, parent whole-run stop, child-only `STOP WHEN`, required evidence/cleanup/triggered review, unchanged-input restraint, and Git authorization.
- **Flaky triage:** Task 2 covers unchanged/isolated/quiet-scope/optional seeded runs, four classifications, shared resources, shell pairing, no install/process kill, cause-oriented repair, unresolved evidence, and unchanged local escalation ownership.
- **Frontend mechanics:** Task 3 covers project/design/motion-stack inspection, complete relevant state matrix, transform/opacity and immediate input, interruptible supported springs, dependency cost/authorization, real-browser normal/reduced-motion pointer/keyboard evidence, exact `83 -> 84` count, unchanged 12/70 counts, stacking classification, and project-original provenance.
- **Generator:** Task 4 covers source/fresh/tracked complete inventories, bytes for every copied non-router file, canonical normalized routers, explicit new paths, preserved freshness/callable contracts, build-before-generate, two identical generations, and no hand edits.
- **QA and safety:** Task 4 covers targeted tests, typecheck, full tests, build, diff checks, secret/scope/staged/version/schema/release/project-5 negatives, isolated OpenCode, isolated packaged Codex, environment restoration, no credentials, update/share disablement, cleanup, and orchestrator-owned Oracle + Reviewer acceptance.
- **Placeholder review:** every new file path, test name, helper signature, command, expected RED/GREEN result, content contract, and handoff artifact is explicit; no deferred implementation choice remains.
- **Consistency review:** Task 2 and Task 3 produced paths exactly match the Task 4 required-file assertions and generated destinations; prompt test vocabulary exactly matches the proposed prompt blocks; all commands use PowerShell-compatible sequencing.
- **Scope review:** this plan covers project 4 only and explicitly excludes schema/version, project 5, release, tag/publish, and final installed-release work.
