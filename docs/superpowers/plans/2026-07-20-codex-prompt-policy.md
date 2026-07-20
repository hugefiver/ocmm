# Codex Prompt Policy Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize the three Codex deepwork prompts on changed-input validation and evidence-bounded delegation while preserving final acceptance and proving that Codex runtime V1/V2 generation remains unchanged.

**Architecture:** Treat `prompts/{v1,omo,codex}/deepwork/codex.md` as the only behavioral sources, lock their shared contract in `src/intent/prompt-loader.test.ts`, and update the two required synchronization records. Keep GPT-5.6, prompt assembly, and `src/codex/plugin-generator.ts` untouched; run the existing generator test as a characterization gate, regenerate through the existing command, and require no tracked generated-bundle delta.

**Tech Stack:** Markdown prompts and documentation, TypeScript 6 ESM, Node.js 22 built-in `node:test`, pnpm 11 scripts, PowerShell 7, existing Codex plugin generator, Git.

**Global Constraints:**
- The approved design is `docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md`; read it before implementation.
- Do not modify `prompts/{v1,omo,codex}/deepwork/gpt-5.6.md`, `src/hooks/config.ts`, `src/intent/prompt-loader.ts`, `src/codex/plugin-generator.ts`, `src/codex/plugin-generator.test.ts`, config/schema files, runtime tool schemas, model routing, or profile selection.
- Preserve each prompt's local dispatch/session wording, LIGHT/HEAVY classification, RED/GREEN/SURFACE/CLEAN evidence, cleanup receipts, and final review authority.
- Preserve local delegation fields `TASK`, `EXPECTED OUTCOME`, `REQUIRED TOOLS`, `MUST DO`, `MUST NOT DO`, and `CONTEXT`; add `GOAL`, `STOP WHEN`, and `EVIDENCE` without replacing existing fields.
- Per increment, run only tests for changed files and affected scenarios. Re-run suite/typecheck/build only when relevant inputs changed after the last green result. Run one fresh full integrated pass before the final message.
- Do not hand-edit `.agents/plugins/marketplace.json`, `.codex/agents/**`, or `plugins/deepwork/**`; regenerate them only with `pnpm run gen:codex-plugin` and require no tracked content delta.
- A generated bundle delta is a blocker. Do not use it as justification to change runtime V1/V2 compatibility or the generator.
- Do not install or upgrade software.
- Do not run `git add`, `git commit`, `git push`, `git tag`, or any Git write until the user explicitly authorizes Git writes for implementation. Never push or tag under this plan.
- After authorization, create exactly one semantic commit for the whole requirement; there are no per-task commits.
- Preserve unrelated working-tree changes. Stage only the exact eight-file allowlist in Task 5.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md` | Include in the eventual commit | Approved design authority. |
| `docs/superpowers/plans/2026-07-20-codex-prompt-policy.md` | Include in the eventual commit | Executable implementation and verification plan. |
| `prompts/v1/deepwork/codex.md` | Modify | v1 increment cadence, evidence-bounded delegation, and whole-goal stop rule. |
| `prompts/omo/deepwork/codex.md` | Modify | omo counterpart while preserving its unconditional verification gate. |
| `prompts/codex/deepwork/codex.md` | Modify | Codex counterpart while preserving `multi_agent_v1`, `fork_context`, and session limitations. |
| `src/intent/prompt-loader.test.ts` | Modify | RED/GREEN assertions shared by all three source prompts. |
| `docs/v1-maintenance.md` | Modify | Required v1 row and Codex plugin prompt synchronization record. |
| `docs/prompt-sync.md` | Modify | Required omo/Codex mapping and policy/runtime-boundary record. |
| `src/codex/plugin-generator.test.ts` | Test only; require unchanged | Existing runtime V1/V2 and generated-bundle characterization. |
| `src/codex/plugin-generator.ts` | Inspect only; require unchanged | Existing runtime compatibility and generation implementation. |
| `.agents/plugins/marketplace.json` | Regenerate; require unchanged | Generator-owned marketplace output. |
| `.codex/agents/**` | Regenerate; require unchanged | Generated project profiles. |
| `plugins/deepwork/**` | Regenerate; require unchanged | Generated plugin bundle. |

## Requirement Coverage

| Requirement | Plan evidence |
|---|---|
| Touched tests/affected scenarios per increment | Task 1 RED assertions; Task 2 prompt text. |
| Changed-input suite/typecheck/build cadence and one final full pass | Task 1 RED assertions; Task 2 prompt text; Task 4 command order. |
| Preserve RED/GREEN/SURFACE/CLEAN and final acceptance | Task 1 loop-scoped retention assertions plus workflow-specific final-authority checks; Task 2 limits edits to verification frequency and parent-stop prefix. |
| Preserve local delegation fields and add `GOAL`/`STOP WHEN`/`EVIDENCE` | Task 1 field loop plus workflow-specific dispatch/session assertions; Task 2 environment-specific reliability paragraphs. |
| Parent verifies evidence; run stop means whole user goal | Task 1 semantic assertions; Task 2 delegation and stop-rule text. |
| GPT-5.6 unchanged; no style expansion | Task 2 path scope; Task 5 staged allowlist. |
| Runtime V1/V2 compatibility distinct and unchanged | Task 1 generator characterization; Task 4 no-diff and real-surface probes. |
| Required maintenance synchronization | Task 3 exact documentation changes. |
| Codex bundle generation | Task 4 build, generation, status/diff proof. |
| Exactly one eventual commit | Task 5 single authorization-gated commit. |

## Execution and Review Boundaries

1. Task 1 characterizes the existing generated compatibility surface and establishes one source-level RED.
2. Task 2 is the only behavior-changing increment: all three source prompts move to GREEN together because they are one synchronized contract.
3. Task 3 updates the mandatory synchronization records and runs only documentation/text checks; the Task 2 test receipt remains current because no tested input changes.
4. Task 4 performs the latest full repository pass once, then regenerates and proves the runtime bundle has no tracked delta.
5. Task 5 self-reviews and, only after explicit Git-write authorization, stages the eight intended files and creates the sole commit. No test is rerun after commit because the commit does not change file contents.

### Task 1: Pin Runtime Compatibility and Add the Failing Prompt Contract

**Files:**
- Modify: `src/intent/prompt-loader.test.ts`
- Test unchanged: `src/codex/plugin-generator.test.ts`
- Read: `prompts/v1/deepwork/codex.md`
- Read: `prompts/omo/deepwork/codex.md`
- Read: `prompts/codex/deepwork/codex.md`

**Interfaces:**
- Consumes: existing source prompt structure and existing generator compatibility assertions.
- Produces: one failing source-level contract test; a green characterization receipt for current runtime V1/V2 behavior.

- [ ] **Step 1: Re-read the design and confirm protected paths are currently unchanged**

Read `docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md` through `## Self-Review`. Then run in `C:\Users\hugefiver\source\ocmm`:

```powershell
git status --short --untracked-files=all -- prompts/v1/deepwork/codex.md prompts/omo/deepwork/codex.md prompts/codex/deepwork/codex.md src/intent/prompt-loader.test.ts src/codex/plugin-generator.ts src/codex/plugin-generator.test.ts docs/v1-maintenance.md docs/prompt-sync.md .agents/plugins/marketplace.json .codex/agents plugins/deepwork
if ($LASTEXITCODE -ne 0) { throw "path-scoped status failed with exit $LASTEXITCODE" }
```

Expected: only this task's specification and plan may be untracked outside the pathspec; every path listed in the command is clean. If any listed path is already dirty, stop and report it instead of overwriting concurrent work.

- [ ] **Step 2: Run the existing generator compatibility test as a characterization PIN**

Run in `C:\Users\hugefiver\source\ocmm`:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -ne 0) { throw "generator characterization failed with exit $LASTEXITCODE" }
```

Expected: PASS with zero failures. In particular, the existing `generateCodexPlugin writes a self-contained bundle` test continues to cover `Subagent Dispatch Compatibility (HARD-GATE)`, MultiAgent V1/V2 names, exact-profile/direct-composition/generic route order, and the generated runtime envelope. This is a PIN, not the RED; do not edit the generator or its test.

- [ ] **Step 3: Add the exact failing source-policy test**

Append this test after `real deepwork prompts do not retain obsolete planner or broad review triggers` in `src/intent/prompt-loader.test.ts`. The file already imports `readFileSync` and `join`; add no imports.

```typescript
test("Codex deepwork prompts use incremental validation and evidence-bounded delegation", () => {
  for (const workflow of ["omo", "v1", "codex"] as const) {
    const label = `${workflow}/codex`
    const prompt = readFileSync(join(process.cwd(), "prompts", workflow, "deepwork", "codex.md"), "utf8")
    const loopStart = prompt.indexOf("Until every success criterion PASSES with its evidence captured:")
    const loopEnd = prompt.indexOf("Parallel-batch independent reads / searches / subagents within a step,", loopStart)
    const reliabilityHeading = workflow === "codex"
      ? "# Codex subagent reliability"
      : "# OpenCode subagent reliability"
    const reliabilityStart = prompt.indexOf(reliabilityHeading)
    const reliabilityEnd = prompt.indexOf("# Subagent-dependent transition barrier", reliabilityStart)
    const triageStart = prompt.indexOf("# Tier triage")
    const triageEnd = prompt.indexOf("# Manual-QA channels", triageStart)

    assert.notEqual(loopStart, -1, `${label} missing incremental loop start`)
    assert.notEqual(loopEnd, -1, `${label} missing incremental loop end`)
    assert.notEqual(reliabilityStart, -1, `${label} missing reliability section`)
    assert.notEqual(reliabilityEnd, -1, `${label} missing reliability section boundary`)
    assert.notEqual(triageStart, -1, `${label} missing tier triage`)
    assert.notEqual(triageEnd, -1, `${label} missing tier triage boundary`)
    const loop = prompt.slice(loopStart, loopEnd)
    const reliability = prompt.slice(reliabilityStart, reliabilityEnd)
    const triage = prompt.slice(triageStart, triageEnd)

    assert.match(
      loop,
      /only the tests and scenarios touched or affected\s+by this increment/i,
      `${label} lacks incremental validation`,
    )
    assert.match(
      loop,
      /Re-run a broader suite, typecheck, or build only\s+when relevant inputs\s+have changed since its last green result/i,
      `${label} lacks changed-input broader validation`,
    )
    assert.match(
      loop,
      /Before the final user-visible message, run one appropriate full pass\s+over the integrated change/i,
      `${label} lacks final integrated validation`,
    )
    assert.doesNotMatch(loop, /full test suite\s+green/i, `${label} retains per-increment full-suite validation`)
    assert.doesNotMatch(
      loop,
      /After each increment, re-run every criterion's scenario/i,
      `${label} retains per-increment scenario reruns`,
    )
    assert.match(loop, /PIN \+ RED:/, `${label} lacks PIN + RED evidence`)
    assert.match(loop, /GREEN:/, `${label} lacks GREEN evidence`)
    assert.match(loop, /SURFACE:/, `${label} lacks SURFACE evidence`)
    assert.match(
      loop,
      /CLEANUP \(PAIRED — NEVER SKIP\):[\s\S]*No receipt → criterion stays in_progress\./,
      `${label} lacks paired cleanup evidence`,
    )

    assert.match(triage, /Default is LIGHT/i, `${label} lacks default LIGHT classification`)
    assert.match(triage, /LIGHT —/, `${label} lacks LIGHT classification`)
    assert.match(triage, /HEAVY —/, `${label} lacks HEAVY classification`)
    assert.ok(triage.indexOf("LIGHT —") < triage.indexOf("HEAVY —"), `${label} orders LIGHT after HEAVY`)

    for (const field of [
      "TASK",
      "EXPECTED OUTCOME",
      "REQUIRED TOOLS",
      "MUST DO",
      "MUST NOT DO",
      "CONTEXT",
      "GOAL",
      "STOP WHEN",
      "EVIDENCE",
    ]) {
      assert.match(reliability, new RegExp("`" + field + "`"), `${label} reliability section lacks ${field}`)
    }
    assert.match(
      reliability,
      /parent verifies\s+returned `EVIDENCE` against the delegated `GOAL` rather\s+than trusting a\s+completion claim/i,
      `${label} does not require parent evidence verification`,
    )
    assert.match(
      reliability,
      /delegated `STOP WHEN` bounds only that child assignment/i,
      `${label} does not bound child stopping`,
    )

    if (workflow === "codex") {
      assert.match(reliability, /Every `multi_agent_v1\.spawn_agent\(\)` delegation prompt/i, `${label} lacks Codex dispatch`)
      assert.match(reliability, /Use `fork_context=false` \(the default\) only\s+when the parent has independent work to do while the child runs; otherwise\s+prefer synchronous spawns so results return in the same turn\./i, `${label} lacks Codex background dispatch policy`)
      assert.match(reliability, /Track background agent results separately\./, `${label} lacks Codex background tracking`)
      assert.match(reliability, /Codex does not support session resume via `task_id`\s+— each follow-up spawns a fresh agent with the full accumulated context\./, `${label} lacks Codex session limitation`)
    } else {
      assert.match(reliability, /Every `task\(\)` delegation prompt/i, `${label} lacks OpenCode task dispatch`)
      assert.match(reliability, /Use `run_in_background=true` only when the parent has independent work to do\s+while the child runs; otherwise prefer blocking task calls so results return\s+in the same turn\./i, `${label} lacks OpenCode background dispatch policy`)
      assert.match(reliability, /Track background task IDs and continuation session IDs separately\./, `${label} lacks OpenCode task/session tracking`)
      assert.match(reliability, /Use `background_output\(task_id="bg_\.\.\."\)` only after the harness notifies completion\./, `${label} lacks background output policy`)
      assert.match(reliability, /Use `task\(task_id="ses_\.\.\."\)` for follow-up with the same child context\./, `${label} lacks continuation session policy`)
    }

    assert.match(prompt, /Stop the parent run ONLY when the entire user goal is complete/i, `${label} does not preserve whole-goal parent stopping`)

    if (workflow === "omo") {
      const gateStart = prompt.indexOf("# Verification gate (TRIGGERED, NOT OPTIONAL)")
      const gateEnd = prompt.indexOf("# Commits", gateStart)
      assert.notEqual(gateStart, -1, `${label} missing verification gate`)
      assert.notEqual(gateEnd, -1, `${label} missing verification gate boundary`)
      const gate = prompt.slice(gateStart, gateEnd)
      assert.match(gate, /Treat the reviewer's verdict as binding\./, `${label} lacks binding reviewer verdict`)
      assert.match(gate, /UNCONDITIONAL approval/, `${label} lacks unconditional reviewer approval`)
    } else {
      const finalReviewStart = prompt.indexOf("## Final Acceptance Review")
      assert.notEqual(finalReviewStart, -1, `${label} missing final acceptance review`)
      const finalReview = prompt.slice(finalReviewStart)
      assert.match(finalReview, /After all plan tasks complete, dispatch a final acceptance review over the full change set\./, `${label} lacks integrated final review dispatch`)
      assert.match(finalReview, /skip it only on explicit user delegation\./, `${label} allows final review to be skipped too broadly`)
    }
  }
})
```

- [ ] **Step 4: Run the prompt-loader test and capture the intended RED**

Run in `C:\Users\hugefiver\source\ocmm`:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts
if ($LASTEXITCODE -eq 0) { throw "expected the new Codex prompt policy test to fail before source edits" }
```

Expected: FAIL only in `Codex deepwork prompts use incremental validation and evidence-bounded delegation`. The failure must cite missing increment-scoped validation, retained per-increment full-suite/all-scenario wording, or missing delegation fields. Syntax, import, path, or unrelated test failures are not a valid RED and must be corrected before Task 2.

### Task 2: Make the Three Prompt Sources GREEN

**Files:**
- Modify: `prompts/v1/deepwork/codex.md`
- Modify: `prompts/omo/deepwork/codex.md`
- Modify: `prompts/codex/deepwork/codex.md`
- Test: `src/intent/prompt-loader.test.ts`

**Interfaces:**
- Consumes: the failing contract from Task 1 and each source's existing local tool/review wording.
- Produces: synchronized validation/delegation semantics with no GPT-5.6, assembly, or runtime compatibility change.

- [ ] **Step 1: Replace only execution-loop verification steps 6 and 8 in the OpenCode sources**

In both `prompts/v1/deepwork/codex.md` and `prompts/omo/deepwork/codex.md`, replace the current step 6 full-suite lines and step 8 all-scenario replay lines with this exact text. Keep existing step 7 unchanged.

```markdown
6. Incremental verification: run LSP diagnostics on changed files plus
   only the tests and scenarios touched or affected by this increment.
   Re-run a broader suite, typecheck, or build only when relevant inputs
   have changed since its last green result.
7. Mark completed. Append non-obvious findings / learnings.
8. Before the final user-visible message, run one appropriate full pass
   over the integrated change. HEAVY work still requires complete
   RED/GREEN/SURFACE/CLEAN evidence for every criterion and the required
   final acceptance authority; do not re-run unchanged criteria after
   every increment.
```

Do not change PIN, RED, GREEN, SURFACE, CLEANUP, LIGHT/HEAVY, or either file's review section.

- [ ] **Step 2: Apply the Codex-local execution-loop wording**

In `prompts/codex/deepwork/codex.md`, replace only steps 6 through 8 with the exact Codex-local equivalent:

```markdown
6. Incremental verification: run LSP diagnostics (via `lsp` MCP) on
   changed files plus only the tests and scenarios touched or affected
   by this increment. Re-run a broader suite, typecheck, or build only
   when relevant inputs have changed since its last green result.
7. Mark completed. Append non-obvious findings / learnings.
8. Before the final user-visible message, run one appropriate full pass
   over the integrated change. HEAVY work still requires complete
   RED/GREEN/SURFACE/CLEAN evidence for every criterion and the required
   final acceptance authority; do not re-run unchanged criteria after
   every increment.
```

Do not alter Codex tool names, `update_plan`, `lsp` MCP references outside this replacement, or the Final Acceptance Review section.

- [ ] **Step 3: Replace the OpenCode delegation reliability contract and restore local background behavior**

In `prompts/v1/deepwork/codex.md` and `prompts/omo/deepwork/codex.md`, replace the first paragraph under `# OpenCode subagent reliability` with these two paragraphs, restore the local background-dispatch paragraph immediately after them, then retain the existing background task/session paragraph:

```markdown
Every `task()` delegation prompt must preserve the local fields `TASK`,
`EXPECTED OUTCOME`, `REQUIRED TOOLS`, `MUST DO`, `MUST NOT DO`, and
`CONTEXT`, and add `GOAL`, `STOP WHEN`, and `EVIDENCE`. `GOAL` names the
bounded child outcome; `STOP WHEN` names the child's observable completion
condition; `EVIDENCE` names what the child must return. The parent verifies
returned `EVIDENCE` against the delegated `GOAL` rather than trusting a
completion claim.

A delegated `STOP WHEN` bounds only that child assignment. The parent run
stops only when the entire user goal and all required verification are
complete.

Use `run_in_background=true` only when the parent has independent work to do
while the child runs; otherwise prefer blocking task calls so results return
in the same turn.
```

The restored `run_in_background=true` versus blocking-call paragraph must appear between the new G/S/E contract and the retained paragraph beginning `Track background task IDs and continuation session IDs separately.` Together they preserve all OpenCode background dispatch and session behavior; no background/session behavior changes are permitted.

- [ ] **Step 4: Replace the Codex delegation reliability contract without changing V1/V2 compatibility**

In `prompts/codex/deepwork/codex.md`, replace the first paragraph under `# Codex subagent reliability` with these two paragraphs, then retain the existing Codex background/session paragraph:

```markdown
Every `multi_agent_v1.spawn_agent()` delegation prompt must preserve the
local fields `TASK`, `EXPECTED OUTCOME`, `REQUIRED TOOLS`, `MUST DO`,
`MUST NOT DO`, and `CONTEXT`, and add `GOAL`, `STOP WHEN`, and `EVIDENCE`.
`GOAL` names the bounded child outcome; `STOP WHEN` names the child's
observable completion condition; `EVIDENCE` names what the child must return.
The parent verifies returned `EVIDENCE` against the delegated `GOAL` rather
than trusting a completion claim. Use `fork_context=false` (the default) only
when the parent has independent work to do while the child runs; otherwise
prefer synchronous spawns so results return in the same turn.

A delegated `STOP WHEN` bounds only that child assignment. The parent run
stops only when the entire user goal and all required verification are
complete.
```

The retained next paragraph must still begin `Track background agent results separately.` Do not edit generated runtime fallback text or add V2 routing language here.

- [ ] **Step 5: Prefix each parent stop rule with the whole-goal condition**

In each of the three prompt sources, replace the first bullet under `# Stop rules`:

```markdown
- Stop ONLY when every scenario PASSES with captured evidence, every
```

with:

```markdown
- Stop the parent run ONLY when the entire user goal is complete: every
  scenario PASSES with captured evidence, every cleanup receipt is
```

Then remove the now-duplicated continuation fragment from the old lines so each complete bullet reads exactly as follows in v1 and Codex:

```markdown
- Stop the parent run ONLY when the entire user goal is complete: every
  scenario PASSES with captured evidence, every cleanup receipt is
  recorded, notepad is current, and final acceptance review (if required)
  has approved unconditionally.
```

The omo bullet must preserve its local conditional gate wording:

```markdown
- Stop the parent run ONLY when the entire user goal is complete: every
  scenario PASSES with captured evidence, every cleanup receipt is
  recorded, notepad is current, and (if gate triggered) reviewer approved
  unconditionally.
```

- [ ] **Step 6: Run the affected prompt-loader test and capture GREEN**

Run in `C:\Users\hugefiver\source\ocmm`:

```powershell
node --test --experimental-strip-types --test-reporter=spec src/intent/prompt-loader.test.ts
if ($LASTEXITCODE -ne 0) { throw "prompt-loader GREEN failed with exit $LASTEXITCODE" }
```

Expected: PASS with zero failures, including `Codex deepwork prompts use incremental validation and evidence-bounded delegation`. Do not run typecheck, build, or the full suite at this increment; the targeted proof is sufficient here and the single final integrated pass remains pending after synchronization records settle.

### Task 3: Synchronize Maintenance Records

**Files:**
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`

**Interfaces:**
- Consumes: the green prompt contract and repository maintenance rules.
- Produces: durable source mapping for v1/omo/Codex without invalidating the current targeted-test receipts.

- [ ] **Step 1: Update the v1 source mapping and Codex plugin note**

In the `deepwork/codex.md` row of `docs/v1-maintenance.md`, append this sentence to the `Adapted for v1` cell before the closing `|`:

```markdown
**2026-07-20 validation/delegation refresh:** per-increment verification now runs only touched tests and affected scenarios; broader suite/typecheck/build gates rerun only after relevant input changes, followed by one final full pass. HEAVY RED/GREEN/SURFACE/CLEAN and final acceptance remain mandatory. Delegations preserve the local envelope and add `GOAL`/`STOP WHEN`/`EVIDENCE`, parent evidence verification, and child-stop versus whole-goal parent-stop separation.
```

Under `## Codex Plugin Prompts (prompts/codex/)`, add this bullet after the GPT-5.6 compact calibration bullet:

```markdown
- **Codex prompt policy refresh (2026-07-20)**: `prompts/codex/deepwork/codex.md` mirrors the v1/omo changed-input validation cadence and evidence-bounded delegation contract while retaining Codex-native dispatch/session wording. This source policy is distinct from `src/codex/plugin-generator.ts` MultiAgent V1/V2 compatibility; current generated profiles do not consume this `codex.md`, so regeneration must produce no tracked bundle delta.
```

- [ ] **Step 2: Update the omo/Codex source mapping and runtime boundary**

In the `deepwork/codex.md` row of `docs/prompt-sync.md`, append this sentence to the Notes cell:

```markdown
**2026-07-20 local policy refresh:** all three workflow sources use touched/affected increment checks, changed-input broader gates, one final full pass, and a local-envelope-plus-`GOAL`/`STOP WHEN`/`EVIDENCE` delegation contract without weakening complex-task evidence or final acceptance.
```

Add this section immediately before `## Observation-Only Upstream Items (2026-07-13)`:

```markdown
## Codex Prompt Policy Refresh (2026-07-20)

- `prompts/{omo,v1,codex}/deepwork/codex.md` rerun only touched tests and affected scenarios per increment; suite/typecheck/build rerun only when relevant inputs changed after their last green result; one full integrated pass remains required before final reporting.
- Complex-task RED/GREEN/SURFACE/CLEAN evidence, cleanup receipts, and each environment's final acceptance authority remain unchanged.
- Delegation keeps `TASK`, `EXPECTED OUTCOME`, `REQUIRED TOOLS`, `MUST DO`, `MUST NOT DO`, and `CONTEXT`, and adds observable `GOAL`, `STOP WHEN`, and `EVIDENCE`; the parent verifies evidence, and a child's stop condition never replaces whole-user-goal completion.
- Prompt policy is separate from generated Codex MultiAgent V1/V2 compatibility. `src/codex/plugin-generator.ts` and its compatibility tests remain unchanged; the existing generator path does not consume `prompts/codex/deepwork/codex.md`, so tracked bundle regeneration is expected to be a no-op.
```

- [ ] **Step 3: Check the edited text surfaces and whitespace without rerunning unchanged tests**

Run in `C:\Users\hugefiver\source\ocmm`:

```powershell
rg -n "only the tests and scenarios touched or affected|GOAL|STOP WHEN|EVIDENCE|Stop the parent run ONLY" prompts/v1/deepwork/codex.md prompts/omo/deepwork/codex.md prompts/codex/deepwork/codex.md
if ($LASTEXITCODE -ne 0) { throw "prompt policy surface probe failed with exit $LASTEXITCODE" }
git diff --check -- prompts/v1/deepwork/codex.md prompts/omo/deepwork/codex.md prompts/codex/deepwork/codex.md src/intent/prompt-loader.test.ts docs/v1-maintenance.md docs/prompt-sync.md
if ($LASTEXITCODE -ne 0) { throw "edited-file diff check failed with exit $LASTEXITCODE" }
```

Expected: every prompt appears in the `rg` output and `git diff --check` emits no errors.
The Task 2 prompt-loader GREEN and Task 1 generator characterization remain current because Task 3 changes only documentation. Do not rerun either test, the full suite, typecheck, or build at this increment.

### Task 4: Run the Final Full Pass and Prove Generated Non-Interference

**Files:**
- Verify: all implementation files from Tasks 1-3
- Regenerate and require unchanged: `.agents/plugins/marketplace.json`
- Regenerate and require unchanged: `.codex/agents/**`
- Regenerate and require unchanged: `plugins/deepwork/**`
- Require unchanged: `src/codex/plugin-generator.ts`
- Require unchanged: `src/codex/plugin-generator.test.ts`

**Interfaces:**
- Consumes: settled source/test/doc inputs and clean generated roots.
- Produces: latest full-pass evidence, regenerated bundle no-diff evidence, and real-surface proof that runtime V1/V2 compatibility is intact.

- [ ] **Step 1: Confirm generated roots and protected runtime files are clean before generation**

Run in `C:\Users\hugefiver\source\ocmm`:

```powershell
$protected = @(
  "src/codex/plugin-generator.ts",
  "src/codex/plugin-generator.test.ts",
  ".agents/plugins/marketplace.json",
  ".codex/agents",
  "plugins/deepwork"
)
$protectedStatus = @(git status --short --untracked-files=all -- $protected)
if ($LASTEXITCODE -ne 0) { throw "protected-path status failed with exit $LASTEXITCODE" }
if ($protectedStatus.Count -ne 0) { throw "protected paths are dirty before generation:`n$($protectedStatus -join "`n")" }
```

Expected: no status entries. If any appear, stop without generating or cleaning them.

- [ ] **Step 2: Run one latest full integrated repository pass**

Run each command once in this order in `C:\Users\hugefiver\source\ocmm`:

```powershell
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "typecheck failed with exit $LASTEXITCODE" }
pnpm test
if ($LASTEXITCODE -ne 0) { throw "full test suite failed with exit $LASTEXITCODE" }
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "build failed with exit $LASTEXITCODE" }
```

Expected: all three commands exit 0. This is the final full pass. If a failure requires a source/test/doc change, run the directly affected check while fixing it, then repeat this three-command block once after inputs settle. Do not repeat a green command when none of its relevant inputs changed.

- [ ] **Step 3: Regenerate the Codex bundle through the existing path**

Run after the successful build so staged runtime inputs, if present, are current:

```powershell
pnpm run gen:codex-plugin
if ($LASTEXITCODE -ne 0) { throw "Codex plugin generation failed with exit $LASTEXITCODE" }
```

Expected: the command reports the generated plugin, project agent profiles, and marketplace path. Do not edit generated output manually.

- [ ] **Step 4: Require an empty tracked and untracked generated delta**

Run:

```powershell
$generatedPaths = @(
  ".agents/plugins/marketplace.json",
  ".codex/agents",
  "plugins/deepwork"
)
$generatedStatus = @(git status --short --untracked-files=all -- $generatedPaths)
if ($LASTEXITCODE -ne 0) { throw "post-generation status failed with exit $LASTEXITCODE" }
if ($generatedStatus.Count -ne 0) { throw "unexpected generated bundle delta:`n$($generatedStatus -join "`n")" }
git diff --exit-code -- src/codex/plugin-generator.ts src/codex/plugin-generator.test.ts .agents/plugins/marketplace.json .codex/agents plugins/deepwork
if ($LASTEXITCODE -ne 0) { throw "runtime compatibility or generated bundle changed unexpectedly" }
```

Expected: no status output and exit 0. Any delta blocks Task 5. Preserve it for diagnosis and ask for a revised design; do not stage, revert, or expand into generator changes.

- [ ] **Step 5: Probe the real generated compatibility surface without rerunning unchanged tests**

Run:

```powershell
rg -n "Subagent Dispatch Compatibility \(HARD-GATE\)|MultiAgent V1/V2 names|TASK, ROLE, DELIVERABLE, SCOPE, VERIFY, REQUIRED SKILLS, CONTEXT, and CONSTRAINTS" .codex/agents/dw-orchestrator.toml plugins/deepwork/agents/dw-orchestrator.toml
if ($LASTEXITCODE -ne 0) { throw "generated orchestrator compatibility probe failed with exit $LASTEXITCODE" }
rg -n "MultiAgentV2 flat tools|spawn_agent|wait_agent|followup_task|interrupt_agent|fork_turns" plugins/deepwork/skills/deepwork/SKILL.md
if ($LASTEXITCODE -ne 0) { throw "generated workflow V2 compatibility probe failed with exit $LASTEXITCODE" }
```

Expected: both generated orchestrator copies show the compatibility gate and local runtime envelope; the generated workflow skill shows all five flat V2 tool names. Do not rerun `pnpm test`: generation changed no tracked test input, and the latest full pass is still current.

### Task 5: Self-Review and Create the Single Authorized Commit

**Files:**
- Stage only: `docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md`
- Stage only: `docs/superpowers/plans/2026-07-20-codex-prompt-policy.md`
- Stage only: `prompts/v1/deepwork/codex.md`
- Stage only: `prompts/omo/deepwork/codex.md`
- Stage only: `prompts/codex/deepwork/codex.md`
- Stage only: `src/intent/prompt-loader.test.ts`
- Stage only: `docs/v1-maintenance.md`
- Stage only: `docs/prompt-sync.md`

**Interfaces:**
- Consumes: current RED/GREEN evidence, latest full pass, generation no-diff proof, and explicit user authorization for Git writes.
- Produces: exactly one semantic commit containing the complete requirement and no generated/runtime/unrelated delta.

- [ ] **Step 1: Run the plan/spec self-review and placeholder scan**

Run in `C:\Users\hugefiver\source\ocmm`:

```powershell
$placeholderPatterns = @(
  ("T" + "BD"),
  ("TO" + "DO"),
  ("implement" + " later"),
  ("fill in" + " details"),
  ("similar to" + " above")
)
foreach ($pattern in $placeholderPatterns) {
  rg -n --fixed-strings $pattern docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md docs/superpowers/plans/2026-07-20-codex-prompt-policy.md
  if ($LASTEXITCODE -eq 0) { throw "placeholder language remains in the task artifacts: $pattern" }
  if ($LASTEXITCODE -ne 1) { throw "placeholder scan failed for '$pattern' with exit $LASTEXITCODE" }
}
git diff --check -- docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md docs/superpowers/plans/2026-07-20-codex-prompt-policy.md prompts/v1/deepwork/codex.md prompts/omo/deepwork/codex.md prompts/codex/deepwork/codex.md src/intent/prompt-loader.test.ts docs/v1-maintenance.md docs/prompt-sync.md
if ($LASTEXITCODE -ne 0) { throw "final allowlist diff check failed with exit $LASTEXITCODE" }
```

Then manually map the ten acceptance criteria in the design to Tasks 1-5. Expected: no gap, no inconsistent name, no protected-file change, and no placeholder. If a task artifact changes during this review, it is documentation input; rerun `git diff --check`, but do not rerun tests because product/test inputs did not change.

- [ ] **Step 2: Verify exact task scope and no pre-existing staged content**

Run:

```powershell
$stagedBefore = @(git diff --cached --name-only)
if ($LASTEXITCODE -ne 0) { throw "pre-stage index inspection failed with exit $LASTEXITCODE" }
if ($stagedBefore.Count -ne 0) { throw "index already contains staged paths; do not mix them into this commit" }
git status --short --untracked-files=all -- docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md docs/superpowers/plans/2026-07-20-codex-prompt-policy.md prompts/v1/deepwork/codex.md prompts/omo/deepwork/codex.md prompts/codex/deepwork/codex.md src/intent/prompt-loader.test.ts docs/v1-maintenance.md docs/prompt-sync.md src/codex/plugin-generator.ts src/codex/plugin-generator.test.ts .agents/plugins/marketplace.json .codex/agents plugins/deepwork
if ($LASTEXITCODE -ne 0) { throw "final scope status failed with exit $LASTEXITCODE" }
```

Expected: exactly the two task artifacts and six intended implementation files are untracked/modified; generator source/test and generated roots are absent. Unrelated paths outside this pathspec may exist and must remain untouched.

- [ ] **Step 3: Obtain explicit Git-write authorization**

Present the eight-file scope, latest verification results, and proposed commit message to the user. Ask for explicit permission to stage and create the single commit. If permission is not granted, stop with all changes uncommitted and report `waiting for Git-write authorization`.

- [ ] **Step 4: Stage exactly the eight allowed files after authorization**

Only after explicit permission, run:

```powershell
$allowed = @(
  "docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md",
  "docs/superpowers/plans/2026-07-20-codex-prompt-policy.md",
  "prompts/v1/deepwork/codex.md",
  "prompts/omo/deepwork/codex.md",
  "prompts/codex/deepwork/codex.md",
  "src/intent/prompt-loader.test.ts",
  "docs/v1-maintenance.md",
  "docs/prompt-sync.md"
)
git add -- $allowed
if ($LASTEXITCODE -ne 0) { throw "staging failed with exit $LASTEXITCODE" }
$staged = @(git diff --cached --name-only)
if ($LASTEXITCODE -ne 0) { throw "staged-path inspection failed with exit $LASTEXITCODE" }
$scopeDiff = @(Compare-Object ($allowed | Sort-Object) ($staged | Sort-Object))
if ($scopeDiff.Count -ne 0) { throw "staged scope differs from the exact eight-file allowlist:`n$($scopeDiff | Out-String)" }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "staged diff check failed with exit $LASTEXITCODE" }
git diff --cached --stat
if ($LASTEXITCODE -ne 0) { throw "staged stat failed with exit $LASTEXITCODE" }
git diff --cached -- docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md docs/superpowers/plans/2026-07-20-codex-prompt-policy.md prompts/v1/deepwork/codex.md prompts/omo/deepwork/codex.md prompts/codex/deepwork/codex.md src/intent/prompt-loader.test.ts docs/v1-maintenance.md docs/prompt-sync.md
if ($LASTEXITCODE -ne 0) { throw "staged diff inspection failed with exit $LASTEXITCODE" }
```

Expected: staged names equal the eight-file allowlist exactly; no generated or runtime file is staged.

- [ ] **Step 5: Create the sole semantic commit and report the receipt**

Run exactly one commit:

```powershell
git commit -m "refactor(prompts): tighten Codex validation cadence" -m "Align prompt verification and delegation evidence contracts without changing runtime V1/V2 routing."
if ($LASTEXITCODE -ne 0) { throw "commit failed with exit $LASTEXITCODE" }
git log -1 --oneline
if ($LASTEXITCODE -ne 0) { throw "commit receipt query failed with exit $LASTEXITCODE" }
git status --short --untracked-files=all -- docs/superpowers/specs/2026-07-20-codex-prompt-policy-design.md docs/superpowers/plans/2026-07-20-codex-prompt-policy.md prompts/v1/deepwork/codex.md prompts/omo/deepwork/codex.md prompts/codex/deepwork/codex.md src/intent/prompt-loader.test.ts docs/v1-maintenance.md docs/prompt-sync.md src/codex/plugin-generator.ts src/codex/plugin-generator.test.ts .agents/plugins/marketplace.json .codex/agents plugins/deepwork
if ($LASTEXITCODE -ne 0) { throw "post-commit scope status failed with exit $LASTEXITCODE" }
```

Expected: one new commit with subject `refactor(prompts): tighten Codex validation cadence`; the path-scoped status is empty. Do not amend, create a second commit, push, tag, or rerun unchanged validation. Report the commit SHA, targeted RED/GREEN, generator characterization, final typecheck/test/build pass, generation no-diff receipt, and any unrelated working-tree state without modifying it.

## Plan Self-Review

- Spec coverage: every goal, non-goal, file boundary, test, generation command, and one-commit rule maps to a task above.
- Placeholder scan: no deferred implementation text or undefined API.
- Type/name consistency: the test name, nine delegation fields, three prompt paths, generated roots, and eight-file commit allowlist are identical throughout.
- TDD: Task 1 captures a source-policy RED; Task 2 makes the smallest synchronized GREEN; runtime compatibility is separately pinned before and after because it must not change.
- QA: Task 4 runs exact repository commands and binary generated no-diff checks; no user-manual behavior judgment is required.
- Commit boundary: all work is one authorization-gated semantic commit; no task-level commit exists.

## Handoff

- Execution order: Tasks 1 → 2 → 3 → 4 → 5, with no parallel RED/GREEN and no generation before the final build.
- Plan-review receipt status: `waiting for receipt`.
- Residual assumption: current `src/hooks/config.ts` composition remains as inspected, so `prompts/codex/deepwork/codex.md` does not affect generated `dw-*` profiles. Task 4 converts that assumption into a no-diff gate and stops on contradiction.
