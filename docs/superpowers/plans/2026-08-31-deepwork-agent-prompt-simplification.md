# Deepwork Agent Prompt Simplification Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify and synchronize the five functional-agent prompts across omo, v1, and Codex so concise unambiguous assignments need no fixed labels, while preserving role boundaries, evidence verification, child-versus-parent completion semantics, tests, documentation provenance, and generated Codex parity.

**Architecture:** Change only model-facing Markdown prompt sources, their semantic contract tests, synchronization documentation, and official Codex-generated consumers. Lock the intended behavior in `src/intent/prompt-loader.test.ts` before editing prompts; keep runtime prompt loading, terminal policies, permissions, routing, schemas, and generator implementation untouched.

**Tech Stack:** Markdown prompt sources, TypeScript 6, Node.js 22 built-in test runner, pnpm 11, the existing Codex plugin generator, PowerShell 7, and Git read-only inspection commands.

**Spec:** `docs/superpowers/specs/2026-08-31-deepwork-agent-prompt-simplification-design.md`

**Global Constraints:**
- Keep `prompts/v1`, `prompts/omo`, and `prompts/codex` behavior aligned.
- Simplify only the five functional-agent role prompts: orchestrator, planner, reviewer, clarifier, and plan-critic.
- A simple, unambiguous assignment may be a single imperative sentence; labels and a fixed section order are never required.
- Add target files or scope only when they are not obvious; add constraints or non-goals only when accidental scope expansion is plausible; add completion conditions or requested evidence only when the result cannot be checked directly; add a tool requirement only when a specific tool is required rather than merely available.
- Complex or coordinated delegations must remain self-contained enough to execute safely; the parent verifies returned evidence, and a child's completion condition bounds only that child assignment.
- Preserve orchestrator routing/composition/tier/final-integration ownership, planner plan-only scope, reviewer unconditional implementation verdicts, clarifier intent/risk/planner directives, and plan-critic current-revision three-state receipts.
- Preserve each functional agent's concise leaf read-only lookup allowance and prohibition on nested planning, review, coordination, or implementation workflows.
- Do not change runtime permissions, routing, registration, prompt-loader implementation, terminal policies, schema, release behavior, or Codex generator implementation.
- Do not add a shared prompt-fragment loader or any new prompt composition mechanism.
- Generated Codex outputs may be refreshed only by `pnpm run gen:codex-plugin`; never hand-edit `.agents/plugins/marketplace.json`, `.codex/agents/**`, or `plugins/deepwork/**`.
- Any `prompts/v1/**` change must update `docs/v1-maintenance.md`; any `prompts/omo/**` change must update `docs/prompt-sync.md`; this cross-workflow change updates both documents.
- Use PowerShell syntax for executable commands, install no software, and perform no Git write operation without separate explicit user authorization.

---

## File Map

### Test contract

- `src/intent/prompt-loader.test.ts` — replace fixed delegation-label requirements with semantic assertions for concise assignments, conditional context, preserved role boundaries, parent evidence verification, child-only completion, and three-workflow synchronization.

### Functional-agent source prompts

- `prompts/v1/agents/{orchestrator,planner,reviewer,clarifier,plan-critic}.md` — concise skill-driven functional roles without the repeated `<deepwork-agent-layer>` explanation.
- `prompts/omo/agents/{orchestrator,planner,reviewer,clarifier,plan-critic}.md` — the same functional-role semantics for the default OpenCode workflow.
- `prompts/codex/agents/{orchestrator,planner,reviewer,clarifier,plan-critic}.md` — the same role semantics with Codex-native profile/tool vocabulary only where the role requires it.

### Flexible delegation source prompts

- `prompts/{v1,omo,codex}/deepwork/codex.md` — replace the mandatory nine-field delegation envelope with concise-input and conditional-context semantics while preserving environment-specific dispatch/reliability behavior.
- `prompts/{v1,omo,codex}/deepwork/gpt-5.6.md` — replace mandatory `GOAL`/`STOP WHEN`/`EVIDENCE`/scope/non-goal serialization with proportional context guidance, retaining the compact synchronized GPT-5.6 calibration.
- `prompts/{v1,omo,codex}/category/quick.md` — accept a clear one-sentence mechanical assignment without requiring four labeled sections.
- `prompts/{v1,omo,codex}/category/coding.md` — describe the information needed for determined code work without a `TASK`/`CONTEXT`/`ACCEPTANCE`/`OUT OF SCOPE` template.
- `prompts/{v1,omo,codex}/category/normal-task.md` — describe bounded-task inputs semantically rather than by fixed labels or order.

### Synchronization documentation

- `docs/v1-maintenance.md` — record the v1/Codex functional-agent reduction, flexible delegation contract, retained local differences, and generated-output rule.
- `docs/prompt-sync.md` — update functional-agent/model/category mappings and replace the obsolete fixed-envelope policy with the approved semantic contract.

### Official generated Codex outputs

- `.agents/plugins/marketplace.json` — generator-owned marketplace output; regenerate, but expect no content delta from prompt-only inputs.
- `.codex/agents/dw-{builder,clarifier,code-search,coding,complex,creative,deep,doc-search,documenting,explore,frontend,hard-reasoning,media-reader,normal-task,oracle,oracle-2nd,orchestrator,plan-critic,planner,quick,research,reviewer}.toml` — project agent profiles regenerated from the synchronized Codex prompt sources.
- `plugins/deepwork/agents/dw-{builder,clarifier,code-search,coding,complex,creative,deep,doc-search,documenting,explore,frontend,hard-reasoning,media-reader,normal-task,oracle,oracle-2nd,orchestrator,plan-critic,planner,quick,research,reviewer}.toml` — bundled copies that must remain byte-identical to `.codex/agents/**`.
- `plugins/deepwork/{.codex-plugin/plugin.json,.mcp.json,README.md,package.json,skills/**}` — generator-owned inventory that is refreshed by the command but should remain byte-identical because this plan changes neither metadata nor skill sources.

### Explicitly unchanged implementation surfaces

- `src/intent/prompt-loader.ts` — no loader or composition change.
- `src/hooks/config.ts` and `prompts/shared/shell-safety.md` — terminal delegation, compression, review-session, and shell-safety authority remains unchanged.
- `src/codex/plugin-generator.ts`, `scripts/gen-codex-plugin.ts`, and `src/codex/plugin-generator.test.ts` — no generator implementation or compatibility-protocol change; existing tests verify fresh-generation parity.
- `src/config/schema.ts` and `schema.json` — no schema change and no schema generation.

## Dependency Waves

| Wave | Tasks | Dependency and parallelism |
|---|---|---|
| 1 | 1 | Establish the complete RED semantic contract before any prompt source edit. |
| 2 | 2, 3 | Run in parallel after Task 1; Task 2 owns functional-agent files and Task 3 owns deepwork/category files. |
| 3 | 4 | Update both synchronization documents after the final source wording and boundaries are known. |
| 4 | 5 | Build TypeScript and run the one official Codex generation pass after all source and docs changes. |
| 5 | 6 | Run targeted, repository-wide, generated-surface, and scope verification on the integrated tree. |
| 6 | 7 | The parent orchestrator obtains identity-bound final implementation acceptance without performing Git writes. |

## Wave 1 — Test contract first

### Task 1: Replace fixed-label assertions with semantic prompt contracts

**Depends on:** None

**Files:**
- Modify: `src/intent/prompt-loader.test.ts`
- Read: `docs/superpowers/specs/2026-08-31-deepwork-agent-prompt-simplification-design.md`
- Read: every source prompt listed in the File Map

**Interfaces:**
- Consumes: `GPT56_WORKFLOWS`, `readFileSync`, `join`, `countOccurrences`, and the existing real-prompt test fixtures in `src/intent/prompt-loader.test.ts`.
- Produces: `FUNCTIONAL_AGENT_NAMES`, `assertNoRequiredDelegationEnvelope(text, label)`, `assertConciseAssignmentAccepted(text, label)`, `assertConditionalDelegationContext(text, label)`, `assertProportionalDelegationContext(text, label)`, and semantic tests that downstream prompt tasks must satisfy.

**Recommended executor:** `coding`

- [ ] **Step 1: Add reusable semantic assertion helpers near the existing prompt constants**

Add these exact helper contracts; the regexes intentionally test meaning and prohibited requirements rather than requiring a new label vocabulary:

```ts
const FUNCTIONAL_AGENT_NAMES = [
  "orchestrator",
  "planner",
  "reviewer",
  "clarifier",
  "plan-critic",
] as const

const REQUIRED_ENVELOPE_PATTERNS = [
  /Every delegation must include task, expected outcome, required tools, must do, must not do, and context/i,
  /Every .*delegation prompt must preserve the local fields/is,
  /Every delegated task must state `GOAL`, `STOP WHEN`, `EVIDENCE`, scope, and non-goals/i,
  /If any are missing.*re-issue/is,
  /Vague prompts are rejected/i,
] as const

function assertNoRequiredDelegationEnvelope(text: string, label: string): void {
  for (const pattern of REQUIRED_ENVELOPE_PATTERNS) {
    assert.doesNotMatch(text, pattern, `${label} requires a fixed delegation envelope`)
  }
}

function assertConciseAssignmentAccepted(text: string, label: string): void {
  assert.match(
    text,
    /(?:(?:clear,? self-contained assignment|one clear sentence).*(?:single|one) imperative sentence|one clear sentence.*(?:may|can) suffice)/is,
    `${label} does not accept a concise unambiguous assignment`,
  )
  assert.match(
    text,
    /labels?.{0,100}(?:(?:never|not) required|optional)/is,
    `${label} still implies labels or section order are required`,
  )
  assertNoRequiredDelegationEnvelope(text, label)
}

function assertConditionalDelegationContext(text: string, label: string): void {
  assert.match(text, /(?:target files or )?scope.*(?:not obvious|unclear)/is, `${label} scope condition`)
  assert.match(text, /constraints(?: or non-goals|\/non-goals).*scope expansion.*plausible/is, `${label} constraint condition`)
  assert.match(text, /(?:completion conditions? or requested evidence|completion\/evidence).*(?:cannot be checked directly|direct checking.*unavailable)/is, `${label} evidence condition`)
  assert.match(text, /(?:tool requirement|tools?).*only when.*(?:specific tool.*required|specifically required)/is, `${label} tool condition`)
}

function assertProportionalDelegationContext(text: string, label: string): void {
  assert.match(text, /scope.*(?:limits|constraints).*proof|scope.*proof.*tools/is, `${label} context kinds`)
  assert.match(text, /only as needed|only when.*(?:ambiguity|risk)/is, `${label} proportional context`)
  assert.match(text, /verify (?:returned )?(?:proof|evidence|results)/is, `${label} verification`)
}
```

- [ ] **Step 2: Replace the fixed-field loop in the Codex reliability test**

In the existing test named `Codex deepwork prompts use incremental validation and evidence-bounded delegation`, delete the loop that requires all nine literals (`TASK` through `EVIDENCE`). Apply the helpers to the extracted `reliability` section and preserve every existing assertion for incremental verification, environment-specific dispatch, parent evidence verification, child-only stopping, background/session semantics, and final acceptance:

```ts
assertConciseAssignmentAccepted(reliability, `${label} reliability`)
assertConditionalDelegationContext(reliability, `${label} reliability`)
assert.match(
  reliability,
  /parent verifies returned evidence.*rather than trusting a completion claim/is,
  `${label} does not require parent evidence verification`,
)
assert.match(
  reliability,
  /child(?:'s)? completion condition.*only that (?:child )?assignment/is,
  `${label} does not bound child stopping`,
)
```

Do not remove the existing OpenCode `task()` versus Codex `multi_agent_v1.spawn_agent()` assertions; update only wording-sensitive fragments that referred to mandatory labels.

- [ ] **Step 3: Replace the GPT-5.6 fixed-label assertion**

In the existing test named `GPT-5.6 specializations are compact additive calibrations synchronized across workflows`, replace the line that requires `GOAL`/`STOP WHEN`/`EVIDENCE`/scope/non-goals with the compact-layer assertions below. The GPT-5.6 specialization carries the proportional rule, while the orchestrator and Codex reliability prompts carry the full conditional detail:

```ts
assertConciseAssignmentAccepted(text, `${label} delegation`)
assertProportionalDelegationContext(text, `${label} delegation`)
```

Keep the 3,500-character and 60%-of-baseline limits, authority, outcome, waiting, cache, wrapper, and shared-doctrine equality assertions unchanged.

- [ ] **Step 4: Add one cross-workflow functional-role contract test**

Add a test named `functional agent prompts stay role-focused and synchronized across workflows`. For every workflow and every functional agent, require the role-specific contract below, reject `<deepwork-agent-layer>`, and reject generic tool-selection prose now owned by effective model/terminal layers:

```ts
const roleContracts: Record<(typeof FUNCTIONAL_AGENT_NAMES)[number], readonly RegExp[]> = {
  orchestrator: [
    /exclusive owner.*workflow-agent composition/is,
    /final implementation acceptance.*identity-bound requesting-code-review/is,
    /complex.*configured high.*otherwise.*normal/is,
  ],
  planner: [
    /never implement.*directly.*proxy/is,
    /Return the completed plan to (?:the orchestrator|the caller)/i,
    /leaf.*read-only/is,
  ],
  reviewer: [
    /read-only.*implementation acceptance.*code-quality verification/is,
    /\[APPROVED\].*\[REJECTED\]/s,
    /Never return a qualified approval/i,
  ],
  clarifier: [
    /Intent Classification/i,
    /Questions for User/i,
    /Directives for planner/i,
  ],
  "plan-critic": [
    /current.*plan revision/is,
    /Any plan edit invalidates.*receipt/is,
    /\[REJECT\].*\[OKAY\].*\[OKAY-UNAMBIGUOUS\]/s,
  ],
}

for (const workflow of ["v1", "omo", "codex"] as const) {
  for (const name of FUNCTIONAL_AGENT_NAMES) {
    const text = readFileSync(join(process.cwd(), "prompts", workflow, "agents", `${name}.md`), "utf8")
    const label = `${workflow}/${name}`
    for (const contract of roleContracts[name]) assert.match(text, contract, label)
    assert.doesNotMatch(text, /<\/?deepwork-agent-layer>/, `${label} retains the repeated agent layer`)
    assert.doesNotMatch(
      text,
      /Survey the enabled MCP tools|When specifying how tasks should be executed, pick the sharpest available tool|Terminal commands: the shell type is stated/is,
      `${label} retains generic tool or shell strategy`,
    )
  }
}
```

Keep the existing bounded-leaf, orchestrator composition, identity-bound review, native OpenCode background, and review-role tests. If prompt shortening invalidates an exact sentence while retaining the requirement, convert only that assertion to the narrowest equivalent semantic regex; do not delete the requirement.

- [ ] **Step 5: Add one cross-workflow concise-assignment test for caller-facing sources**

Add a test named `delegation prompt sources accept concise assignments and request only material context` with these source groups:

```ts
for (const workflow of ["v1", "omo", "codex"] as const) {
  const root = join(process.cwd(), "prompts", workflow)
  for (const relativePath of [join("agents", "orchestrator.md"), join("deepwork", "codex.md")]) {
    const text = readFileSync(join(root, relativePath), "utf8")
    assertConciseAssignmentAccepted(text, `${workflow}/${relativePath}`)
    assertConditionalDelegationContext(text, `${workflow}/${relativePath}`)
  }

  const gpt56 = readFileSync(join(root, "deepwork", "gpt-5.6.md"), "utf8")
  assertConciseAssignmentAccepted(gpt56, `${workflow}/deepwork/gpt-5.6.md`)
  assertProportionalDelegationContext(gpt56, `${workflow}/deepwork/gpt-5.6.md`)

  for (const category of ["quick", "coding", "normal-task"] as const) {
    const text = readFileSync(join(root, "category", `${category}.md`), "utf8")
    assertConciseAssignmentAccepted(text, `${workflow}/${category}`)
    assert.match(
      text,
      /ask one (?:short|focused) question only when.*(?:target|deliverable|result|acceptance).*change/is,
      `${workflow}/${category} does not bound clarification to material ambiguity`,
    )
  }
}
```

- [ ] **Step 6: Run the complete prompt-loader test and record RED**

Run:

```powershell
node --test --experimental-strip-types "src/intent/prompt-loader.test.ts"
```

Expected: FAIL only on the new semantic contracts because current prompts still contain `<deepwork-agent-layer>`, mandatory fixed-envelope wording, and fixed category templates, and do not yet state that a clear one-sentence imperative is accepted. Existing unrelated prompt contracts must not regress.

- [ ] **Step 7: Report the test-only checkpoint**

Report the changed test file, exact failing test names, and observed failure messages. Do not edit prompt sources in this task, weaken existing role/dispatch/evidence assertions, stage, or commit.

## Wave 2 — Parallel source updates

### Task 2: Simplify the five functional-agent roles across all workflows

**Depends on:** Task 1

**Files:**
- Modify: `prompts/v1/agents/{orchestrator,planner,reviewer,clarifier,plan-critic}.md`
- Modify: `prompts/omo/agents/{orchestrator,planner,reviewer,clarifier,plan-critic}.md`
- Modify: `prompts/codex/agents/{orchestrator,planner,reviewer,clarifier,plan-critic}.md`
- Test: `src/intent/prompt-loader.test.ts` from Task 1; do not edit it in this task

**Interfaces:**
- Consumes: Task 1's role contracts; effective terminal policies from `src/hooks/config.ts`; existing workflow-specific OpenCode/Codex dispatch vocabulary.
- Produces: 15 concise functional-agent prompt sources with synchronized role purpose, decisions, permissions, output, and handoff boundaries.

**Recommended executor:** `complex`

For planner, reviewer, clarifier, and plan-critic, keep the permitted lookup set explicit rather than replacing it with “use subagents as needed”: OpenCode sources name `code-search`, `explore`, `doc-search`, `research`, and `media-reader`; Codex sources use the corresponding callable `dw-*` profile names where required by the existing Codex vocabulary. Each role must also explicitly prohibit planner, plan-critic, Reviewer/Oracle, clarifier, coordination, and implementation delegation as applicable to that role; these concise role boundaries must agree with, not duplicate, the authoritative terminal contract.

- [ ] **Step 1: Remove the repeated agent-layer explanation from v1 and Codex**

Delete only the complete wrapper block below from all ten v1/Codex functional-agent files; keep each file's existing outer `<agent-role>` envelope and `# Agent Role:` heading:

```markdown
<deepwork-agent-layer>
This role prompt is shared with the default agent layer. In the skill-driven deepwork workflow, the injected deepwork skills provide the phase mechanics; keep the role scope and constraints below authoritative for this functional agent.
</deepwork-agent-layer>
```

OMO already lacks this block; do not add a replacement explanation there.

- [ ] **Step 2: Reduce all three orchestrator prompts to role-owned decisions**

Retain: current-message authorization/intent classification, the smallest-fit routing table, exclusive workflow-agent composition, deterministic available-profile tier selection, ordered Oracle semantics, the exact identity-bound requesting-code-review mandate, and OpenCode-versus-Codex dispatch vocabulary. Replace the fixed delegation contract with the exact shared semantic paragraph below:

```markdown
## Delegation Input

A clear, self-contained assignment may be a single imperative sentence. Labels and a fixed section order are never required.

For complex or coordinated work, add target files or scope when they are not obvious, constraints or non-goals when scope expansion is plausible, completion conditions or requested evidence when the result cannot be checked directly, and a tool requirement only when a specific tool is required rather than merely available. Verify returned evidence rather than trusting a completion claim; a child's completion condition bounds only that assignment and never replaces the parent user's full goal.
```

Remove generic sections that merely repeat effective model, skill, or terminal policy: exhaustive tool-selection instructions, generic shell strategy, generic parallel-dispatch prose, generic post-work verification checklist, generic scope boilerplate, and the repeated subagent Git explanation. Keep the capability-gated `## Native OpenCode Background Subagents` section in omo/v1 because it is an OpenCode orchestration rule with existing contract coverage; do not add it to Codex. Keep skill/design approval gates only once in each effective workflow rather than duplicating their full operational checklists in the role prompt.

- [ ] **Step 3: Reduce all three planner prompts to plan-only scope and handoff**

Retain these exact semantics in compact sections: read/search/analyze/write only the plan artifact; never implement directly or by proxy; require an approved design for new behavior; use direct evidence first; allow only leaf read-only lookup when materially necessary; return genuinely difficult unresolved decisions to the orchestrator; never dispatch plan-critic, Reviewer/Oracle, implementation, or decision agents; follow `writing-plans`; return the completed plan with receipt status `waiting for receipt`.

Remove duplicated tool catalog, shell-selection table, parallel-utility instructions, full plan-format checklist, and self-review checklist because `writing-plans` remains authoritative. Preserve a literal sentence matching both boundaries:

```markdown
You never implement product code, directly or by proxy: a subagent that edits product files is still you implementing.

Return the completed plan to the orchestrator with its path, execution order, material risks, and receipt status `waiting for receipt`; the orchestrator owns plan-critic and every formal review dispatch.
```

- [ ] **Step 4: Reduce all three reviewer prompts to implementation validation**

Retain: read-only implementation acceptance/focused code-quality purpose, primary Reviewer versus external Oracle lane meaning, implemented-diff prerequisite, evidence grounding, `[product]` versus `[evidence]`, unconditional `[APPROVED]`/`[REJECTED]`, scope boundary, and leaf read-only lookup with no nested workflow/review dispatch. Remove generic developer-experience advice, effort-estimate ceremony, and repeated generic verification strategy that does not change the verdict contract.

The response contract must still contain:

```markdown
For full acceptance, return exactly one unconditional verdict: `[APPROVED]` or `[REJECTED]`. Never return a qualified approval. List blocking findings first with `[product]` or `[evidence]`, severity, file path, concrete evidence, and the smallest valid correction.
```

- [ ] **Step 5: Reduce all three clarifier prompts without weakening planner input**

Keep the seven intent classes, material-ambiguity rule, full-request/no-default-MVP boundary, AI-slop and verification-risk checks, at most three user questions, planner directives, recommended approach, read-only behavior, and leaf-only discovery. Collapse repeated prose inside each intent subsection into a compact classification/directive table, but retain these output headings exactly so callers remain stable:

```markdown
## Intent Classification
## Pre-Analysis Findings
## Questions for User
## Identified Risks
## Directives for planner
## Recommended Approach
```

Keep architecture/reviewer/hard-reasoning routing and no-nested-workflow constraints semantically unchanged.

- [ ] **Step 6: Reduce all three plan-critic prompts around one current-revision receipt**

Retain one copy each of: input-path resolution/re-read, current-revision receipt invalidation, five blocker eligibility classes, non-blocking notes, frozen blocker ledger, executability/ambiguity checks, leaf read-only lookup, and the three verdict definitions. Remove duplicate Purpose/What You Check/What You Do Not Check/Decision prose where one concise section carries the same rule.

OMO currently lacks the explicit receipt section present in v1/Codex. Add this synchronized contract to all three:

```markdown
## Receipt Contract

The current `plan-critic` receipt covers exactly one complete, current plan revision. Any plan edit invalidates that receipt and requires a fresh review. Read the complete current revision and make the first line exactly `[REJECT]`, `[OKAY]`, or `[OKAY-UNAMBIGUOUS]`; a path that was not read, an older revision, a partial result, or an acknowledgement can never receive an approval verdict.
```

- [ ] **Step 7: Run the focused functional-role tests and record GREEN**

Run:

```powershell
node --test --experimental-strip-types --test-name-pattern="functional agent prompts|agent-specific prompts enforce bounded leaf delegation|orchestrator alone owns workflow-role composition|review roles are implementation-only|orchestrator prompts|OpenCode orchestrators" "src/intent/prompt-loader.test.ts"
```

Expected: PASS. The 15 role prompts have no `<deepwork-agent-layer>` block, retain role-specific boundaries and workflow differences, and satisfy existing identity/background/composition contracts. The full prompt-loader file may remain RED until Task 3 replaces caller-envelope sources.

- [ ] **Step 8: Report the functional-role checkpoint**

Report all 15 files, the focused command, and a concise role-by-role list of preserved invariants. Confirm that `src/hooks/config.ts`, runtime permissions, routing, schema, tests, docs, and generated artifacts were not edited by this task.

### Task 3: Make delegation input proportional in model and category prompts

**Depends on:** Task 1

**Files:**
- Modify: `prompts/{v1,omo,codex}/deepwork/codex.md`
- Modify: `prompts/{v1,omo,codex}/deepwork/gpt-5.6.md`
- Modify: `prompts/{v1,omo,codex}/category/{quick,coding,normal-task}.md`
- Test: `src/intent/prompt-loader.test.ts` from Task 1; do not edit it in this task

**Interfaces:**
- Consumes: Task 1's concise-input and conditional-context helpers; existing incremental validation, dispatch, shell adaptation, category selection, and output contracts.
- Produces: 15 synchronized caller-facing prompt sources that accept one-sentence clear assignments and request extra context only when risk requires it.

**Recommended executor:** `complex`

- [ ] **Step 1: Replace the reliability envelope in all three `deepwork/codex.md` sources**

Keep each current reliability heading (`# OpenCode subagent reliability` or `# Codex subagent reliability`) and every environment-specific paragraph after the input contract. Replace only the mandatory field-preservation paragraph and label-bound child-stop language with:

```markdown
A clear, self-contained assignment may be a single imperative sentence. Labels and a fixed section order are never required.

For complex or coordinated work, add target files or scope when they are not obvious, constraints or non-goals when scope expansion is plausible, completion conditions or requested evidence when the result cannot be checked directly, and a tool requirement only when a specific tool is required rather than merely available. The parent verifies returned evidence rather than trusting a completion claim.

A child's completion condition bounds only that child assignment. The parent run stops only when the entire user goal and all required verification are complete.
```

Do not change incremental RED/GREEN/SURFACE/CLEAN rules, OpenCode `task()`/background/session guidance, Codex `multi_agent_v1.spawn_agent()`/`fork_context` guidance, transition barriers, or final acceptance cadence.

- [ ] **Step 2: Replace the mandatory GPT-5.6 delegation bullet in all three workflows**

Under `## Retrieval and delegation`, replace the current mandatory serialization bullet with this synchronized compact bullet. It is 115 UTF-8 bytes versus the current 109-byte bullet, so the largest Codex source remains approximately 3,498 bytes and below the retained 3,500-character contract:

```markdown
- One clear sentence may suffice; labels optional. Add scope, limits, proof, or tools only as needed; verify proof.
```

Preserve wrapper differences (omo unwrapped; v1/Codex one `<deepwork-mode>` envelope), Codex applicability guard, OpenCode-versus-Codex cache wording, the ≤3,500-character and ≤60%-of-baseline budgets, and exact shared-doctrine equality outside the documented cache-policy difference. After replacement, measure all three files with `wc.exe -c` and treat any value above 3,500 as a blocker before tests.

- [ ] **Step 3: Replace fixed category templates with semantic assignment shapes**

In each `quick.md`, `coding.md`, and `normal-task.md`, rename `## CALLER CONTRACT` to `## ASSIGNMENT SHAPE`, delete the fenced label template, and use the same first two sentences:

```markdown
A clear, self-contained assignment may be a single imperative sentence. Labels and a fixed section order are never required.
```

Then use the following category-specific material-ambiguity wording.

In each `quick.md`:

```markdown
The assignment must still make the mechanical action, target, and expected result clear. Ask one short question only when the missing target or result would change the deliverable; if design, investigation, coordination, or implementation judgment is required, report the better-fitting category.
```

In each `coding.md`:

```markdown
Include code location or local pattern, acceptance behavior, and exclusions only when they are not already obvious from the assignment or repository. Ask one focused question only when the missing target, behavior, acceptance result, or boundary would change the deliverable; route investigation to `research` or autonomous delivery to `deep`.
```

In each `normal-task.md`:

```markdown
Include relevant files or conventions, acceptance evidence, and exclusions only when they are not already obvious. Ask one focused question only when the missing target, result, acceptance evidence, or boundary would change the deliverable.
```

Update references such as “named in TASK”, “meets ACCEPTANCE”, and “EXPECTED OUTPUT” to plain semantic nouns (`named target`, `requested result`, `acceptance result`). Preserve each category's work-shape gate, Shell Adaptation section, smallest-scope execution rule, anti-patterns, and deliverable.

- [ ] **Step 4: Verify no source requires the obsolete envelope**

Run:

```powershell
$fixedMatches = @(rg -n "Every delegation must include|must preserve the local fields|Every delegated task must state|If any are missing.*re-issue|Vague prompts are rejected" "prompts/v1" "prompts/omo" "prompts/codex")
if ($LASTEXITCODE -eq 0) { $fixedMatches; throw "fixed delegation envelope remains in source prompts" }
if ($LASTEXITCODE -ne 1) { throw "rg failed while checking fixed delegation envelopes" }
```

Expected: exits successfully through the explicit no-match branch. Literal labels may remain in unrelated illustrative examples or the separate generated Codex compatibility protocol only when they are not required input; this source scan targets the known mandatory wording, not every occurrence of `GOAL` or `EVIDENCE`.

- [ ] **Step 5: Run the focused delegation tests and record GREEN**

Run:

```powershell
node --test --experimental-strip-types --test-name-pattern="Codex deepwork prompts use incremental validation and evidence-bounded delegation|GPT-5.6 specializations are compact additive calibrations synchronized across workflows|delegation prompt sources accept concise assignments" "src/intent/prompt-loader.test.ts"
```

Expected: PASS for omo, v1, and Codex. Parent evidence verification, child-only completion, environment-specific dispatch/session behavior, category work shapes, GPT-5.6 wrapper/cache/budget rules, and cross-workflow shared doctrine remain intact.

- [ ] **Step 6: Report the proportional-input checkpoint**

Report all 15 changed sources, the no-match scan, the focused test output, and confirmation that no generator output or implementation file was hand-edited.

## Wave 3 — Documentation synchronization

### Task 4: Synchronize v1 and omo/Codex prompt provenance

**Depends on:** Tasks 2 and 3

**Files:**
- Modify: `docs/v1-maintenance.md`
- Modify: `docs/prompt-sync.md`
- Read: the 30 prompt source files changed by Tasks 2 and 3
- Test: `src/intent/prompt-loader.test.ts`

**Interfaces:**
- Consumes: final role/delegation semantics and workflow-specific differences from Tasks 2 and 3.
- Produces: synchronized dated provenance and maintenance guidance with no obsolete fixed-envelope claims.

**Recommended executor:** `documenting`

- [ ] **Step 1: Update `docs/v1-maintenance.md` mappings**

Update the `deepwork/gpt-5.6.md`, `deepwork/codex.md`, five `agents/*.md`, and `category/{quick,coding,normal-task}.md` rows so they describe concise role ownership and proportional assignment context. Preserve prior provenance and unrelated dated adaptations; replace only claims that the local envelope or `GOAL`/`STOP WHEN`/`EVIDENCE` fields are universally mandatory.

Add a dated section named exactly:

```markdown
## Functional Agent and Delegation Prompt Simplification (2026-08-31)
```

Record: the 15 synchronized functional agents, removal of repeated `<deepwork-agent-layer>` and generic duplicated strategy, retained role/leaf/nested-workflow boundaries, one-sentence clear-assignment acceptance, conditional scope/constraints/completion/evidence/tool context, unchanged terminal-policy authority, and generator-only Codex refresh.

- [ ] **Step 2: Update `docs/prompt-sync.md` mappings and policy history**

Update `## Functional Agent Mapping`, the `deepwork/gpt-5.6.md` and `deepwork/codex.md` model rows, category maintenance guidance, `## GPT-5.6 Prompt Simplification`, and `## Codex Prompt Policy Refresh`. Replace the obsolete line that says delegation keeps six local labels plus three additional labels with the semantic contract from the approved design.

Add the same dated heading and state explicitly:

```markdown
- Clear, self-contained assignments may be one imperative sentence; labels and section order are optional.
- Additional scope, constraints/non-goals, completion/evidence, and tool requirements are conditional on ambiguity or execution risk.
- Parent evidence verification and child-only completion boundaries remain mandatory behavior.
- `src/codex/plugin-generator.ts` keeps its separate MultiAgent compatibility envelope unchanged; source prompt simplification does not create a new loader, permission, routing, or schema mechanism.
```

- [ ] **Step 3: Scan both documents for stale policy claims**

Run:

```powershell
$staleDocs = @(rg -n 'Delegation keeps `TASK`|Delegations preserve the local envelope|Every delegated task must state|must preserve the local fields' "docs/v1-maintenance.md" "docs/prompt-sync.md")
if ($LASTEXITCODE -eq 0) { $staleDocs; throw "obsolete fixed-envelope documentation remains" }
if ($LASTEXITCODE -ne 1) { throw "rg failed while checking prompt synchronization docs" }
```

Expected: no stale fixed-envelope claim. Historical provenance remains, but current policy text no longer presents labels as required serialization.

- [ ] **Step 4: Run the complete prompt-loader contract GREEN**

Run:

```powershell
node --test --experimental-strip-types "src/intent/prompt-loader.test.ts"
```

Expected: PASS with all prompt-loader tests green across omo, v1, and Codex.

- [ ] **Step 5: Report the documentation checkpoint**

Report the two changed docs, the exact sections updated, the stale-policy scan, and the complete prompt-loader result. Do not edit README, release docs, design, schema, runtime source, or generated artifacts.

## Wave 4 — Official Codex generation

### Task 5: Regenerate and verify Codex derived artifacts

**Depends on:** Task 4

**Files:**
- Generate only: `.agents/plugins/marketplace.json`
- Generate only: `.codex/agents/dw-*.toml`
- Generate only: `plugins/deepwork/**`
- Read/test only: `src/codex/plugin-generator.test.ts`
- Must remain unchanged: `src/codex/plugin-generator.ts`, `scripts/gen-codex-plugin.ts`

**Interfaces:**
- Consumes: all synchronized `prompts/codex/**` sources plus the existing generator and current package/config inventory.
- Produces: fresh project/bundled Codex agent TOMLs, byte-identical mirrored agent roots, and no hand-edited generated file.

**Recommended executor:** `coding`

- [ ] **Step 1: Build the TypeScript generator prerequisite**

Run:

```powershell
pnpm run build:ts
```

Expected: exit 0 and a current `dist/**` build. Do not treat ignored `dist/**` output as a source artifact.

- [ ] **Step 2: Run the official generator exactly once for the integrated source revision**

Run:

```powershell
pnpm run gen:codex-plugin
```

Expected: exit 0. Accept only deterministic generator output under `.agents/plugins/marketplace.json`, `.codex/agents/**`, and `plugins/deepwork/**`; do not manually correct a generated TOML.

- [ ] **Step 3: Inspect the generated path inventory**

Run:

```powershell
git diff --name-only -- ".agents/plugins/marketplace.json" ".codex/agents" "plugins/deepwork"
git status --short --untracked-files=all
```

Expected: prompt-derived changes are limited to the 22 `.codex/agents/dw-*.toml` files and their 22 `plugins/deepwork/agents/dw-*.toml` mirrors. Marketplace metadata, manifests, runtime files, README, and generated skills remain byte-identical unless the existing generator deterministically proves an input-dependent delta; any unexpected non-agent delta is a blocker to investigate before proceeding.

- [ ] **Step 4: Prove project/bundle agent copies are byte-identical**

Run:

```powershell
git diff --no-index -- ".codex/agents" "plugins/deepwork/agents"
```

Expected: exit 0 and no diff across all 22 profile files.

- [ ] **Step 5: Run the focused generator parity tests**

Run:

```powershell
node --test --experimental-strip-types "src/codex/plugin-generator.test.ts"
```

Expected: PASS, including fresh temporary generation, tracked agent inventory parity, project/plugin copy equality, original Deepwork prompt carriage, identity contract, and the separate callable-schema compatibility contract.

- [ ] **Step 6: Inspect generated real-surface prompt carriage**

Run:

```powershell
rg -n "(?:single|one) imperative sentence|fixed section order" ".codex/agents/dw-orchestrator.toml" "plugins/deepwork/agents/dw-orchestrator.toml" ".codex/agents/dw-quick.toml" "plugins/deepwork/agents/dw-quick.toml"
```

Expected: both project and bundled orchestrator/quick profiles carry the concise-assignment semantics. Do not globally reject `GOAL:`, `STOP WHEN:`, or `EVIDENCE:` in generated TOMLs because the generator's independent Codex compatibility suffix intentionally retains its canonical adapter protocol.

- [ ] **Step 7: Report the generation checkpoint**

Report the generation commands, exact generated diff inventory, mirror parity result, generator test result, and unexpected-delta disposition. Confirm generator source and generated compatibility tests were not edited.

## Wave 5 — Integrated verification

### Task 6: Run final source, generated-surface, and repository gates

**Depends on:** Task 5

**Files:**
- Verify: every source, test, documentation, and generated file in the File Map
- Diagnose: `src/intent/prompt-loader.test.ts`
- Must remain unchanged: all explicitly unchanged implementation surfaces

**Interfaces:**
- Consumes: the complete integrated prompt/test/docs/generated working tree and Task 5 generation evidence.
- Produces: one executable verification table covering targeted tests, semantic source scans, generated parity, TypeScript/Cargo repository gates, build, scope, and diff hygiene.

**Recommended executor:** `complex`

- [ ] **Step 1: Run the two targeted test files on the generated tree**

Run:

```powershell
node --test --experimental-strip-types "src/intent/prompt-loader.test.ts"
node --test --experimental-strip-types "src/codex/plugin-generator.test.ts"
```

Expected: both commands exit 0. The first proves semantic prompt behavior across all three workflows; the second proves tracked Codex generation and compatibility-protocol parity.

- [ ] **Step 2: Run TypeScript diagnostics on the changed test file**

Use `lsp_diagnostics` on `src/intent/prompt-loader.test.ts` with severity `all`.

Expected: no error or warning diagnostic introduced by this change. Markdown prompt/docs files have no language-server requirement.

- [ ] **Step 3: Prove source prompts contain no repeated layer or mandatory envelope**

Run:

```powershell
$agentLayerMatches = @(rg -n "<deepwork-agent-layer>" "prompts/v1/agents" "prompts/omo/agents" "prompts/codex/agents")
if ($LASTEXITCODE -eq 0) { $agentLayerMatches; throw "repeated deepwork agent layer remains" }
if ($LASTEXITCODE -ne 1) { throw "rg failed while checking functional-agent layers" }

$fixedMatches = @(rg -n "Every delegation must include|must preserve the local fields|Every delegated task must state|If any are missing.*re-issue|Vague prompts are rejected" "prompts/v1" "prompts/omo" "prompts/codex" "docs/v1-maintenance.md" "docs/prompt-sync.md")
if ($LASTEXITCODE -eq 0) { $fixedMatches; throw "mandatory fixed delegation envelope remains" }
if ($LASTEXITCODE -ne 1) { throw "rg failed while checking fixed delegation envelopes" }
```

Expected: both scans take the explicit no-match path. These scans do not ban optional examples or the generated adapter compatibility suffix.

- [ ] **Step 4: Run all repository quality gates in order**

Run each command separately and stop on the first failure:

```powershell
pnpm run typecheck
pnpm test
pnpm run build
```

Expected: all three exit 0. `pnpm test` includes TypeScript prompt/generator tests and `cargo test -p ocmm-lsp`; `pnpm run build` produces TypeScript and native LSP outputs without changing the approved source scope.

- [ ] **Step 5: Verify scope and non-goal surfaces**

Run:

```powershell
git diff -- "src/intent/prompt-loader.ts" "src/hooks/config.ts" "prompts/shared/shell-safety.md" "src/codex/plugin-generator.ts" "scripts/gen-codex-plugin.ts" "src/config/schema.ts" "schema.json"
git status --short --untracked-files=all
```

Expected: the first command prints no diff. Status contains only the approved design/plan, `src/intent/prompt-loader.test.ts`, the 30 source prompts, two synchronization docs, and deterministic generated agent TOMLs. No new loader, permission, routing, schema, release, temporary, credential, or local-config file exists.

- [ ] **Step 6: Check diff hygiene and mirrored generated agents**

Run:

```powershell
git diff --check
git diff --no-index -- ".codex/agents" "plugins/deepwork/agents"
```

Expected: both exit 0; there is no whitespace error and all 22 generated profile pairs remain byte-identical after the full build.

- [ ] **Step 7: Produce the integrated evidence table**

Report every command, exit code, asserted behavior, exact changed-file inventory, generated-output inventory, and any environmental blocker. Do not rerun unchanged green commands, modify code after evidence capture, stage, commit, push, or tag.

## Wave 6 — Identity-bound final acceptance

### Task 7: Obtain final review receipts for one unchanged working-tree identity

**Depends on:** Task 6

**Files:**
- Read: `skills/v1/requesting-code-review/SKILL.md`
- Read: `docs/superpowers/specs/2026-08-31-deepwork-agent-prompt-simplification-design.md`
- Read: `docs/superpowers/plans/2026-08-31-deepwork-agent-prompt-simplification.md`
- Review input: complete tracked binary diff plus typed untracked inventory from Task 6
- Product-file modifications: none unless a reviewer identifies a verified in-scope blocker

**Interfaces:**
- Consumes: unchanged Task 6 working tree and verification table.
- Produces: one current working-tree identity, one seven-field review packet, and current-identity unconditional approval receipts from the required implementation-review lanes.

**Recommended executor:** `deep`

- [ ] **Step 1: Freeze the candidate and load the authoritative review workflow**

Read and follow the current `skills/v1/requesting-code-review/SKILL.md`; do not copy an older identity algorithm into this plan. Capture:

```powershell
git status --short --untracked-files=all
git diff --binary --no-ext-diff HEAD --
```

Expected: review input contains exactly the Task 6 inventory, including untracked approved design/plan files, with no staging required.

- [ ] **Step 2: Compute the current artifact identity and build one packet**

Use the canonical working-tree identity procedure embedded in the current requesting-code-review skill. Build the exact packet shape:

```text
ARTIFACT_KIND: working-tree
ARTIFACT_IDENTITY: current canonical identity from the skill
DESCRIPTION: Simplify and synchronize Deepwork functional-agent and delegation prompt contracts across omo, v1, and Codex without changing runtime permissions, routing, schema, loader, or generator implementation.
PLAN_OR_REQUIREMENTS: docs/superpowers/plans/2026-08-31-deepwork-agent-prompt-simplification.md and docs/superpowers/specs/2026-08-31-deepwork-agent-prompt-simplification-design.md
REVIEW_INPUT: complete tracked binary diff plus typed untracked inventory
VERIFICATION_EVIDENCE: Task 6 command/evidence table stamped with the same identity
GLOBAL_CONSTRAINTS: the complete Global Constraints section from this plan
```

Expected: no omitted field, explanatory placeholder, stale identity, or different packet between lanes.

- [ ] **Step 3: Have the parent orchestrator select the required implementation-review lanes**

This is cross-workflow prompt and generated-artifact work. The parent orchestrator, not a functional worker, inspects currently callable profiles and dispatches the first available Oracle lane plus the primary Reviewer lane in parallel, preferring configured `high` then unsuffixed normal. Generated TOML files are not availability proof; do not fan out to extra Oracle slots and do not use either lane to review this plan.

- [ ] **Step 4: Validate current-identity unconditional receipts**

Require each lane to return the five receipt fields defined by the current requesting-code-review skill: role/profile lane, task/session receipt, artifact identity, unconditional `approved` or `rejected` verdict, and report source. Recompute identity after each return. A missing field, qualified approval, stale identity, partial response, timeout, or changed working tree is not approval.

- [ ] **Step 5: Resolve verified blockers without reusing stale evidence**

For a valid `[product]` blocker, return to the owning Task 2 or 3 source group, update the Task 1 semantic contract only when the requirement itself was missing, rerun affected focused tests, rerun Task 4 docs synchronization if semantics changed, regenerate through Task 5 when any generator input changed, then rerun Task 6 and request new receipts. For an `[evidence]` blocker, add only the missing executable proof and issue a fresh packet/identity. Never edit generated files by hand or preserve an earlier receipt after any file edit.

- [ ] **Step 6: Report final acceptance without Git writes**

Report the common current identity, selected lanes, both receipt sources/verdicts, verification table, exact changed files, generated artifacts, and residual risks. Completion requires all required receipts to say `approved` for the same unchanged identity. Suggest semantic commit message `refactor: simplify deepwork agent prompts`, but do not stage, commit, push, or tag without separate explicit authorization.

## Requirement-to-Task Traceability

| Approved requirement | Implementing tasks | Acceptance evidence |
|---|---|---|
| Synchronize omo, v1, and Codex | 1, 2, 3, 4 | Cross-workflow semantic tests and both sync docs |
| Simplify five functional agents | 1, 2 | Fifteen source prompts, no repeated layer, role invariant tests |
| Accept a clear one-sentence assignment without fixed labels/order | 1, 2, 3 | Positive concise-assignment assertions and negative mandatory-envelope assertions |
| Add scope/constraints/completion/evidence/tools only by risk | 1, 2, 3 | `assertConditionalDelegationContext` across orchestrator/model sources |
| Preserve evidence verification and child-versus-parent stopping | 1, 2, 3 | Codex reliability tests and orchestrator/model semantics |
| Preserve role permissions and workflow ownership | 1, 2 | Role contracts, bounded-leaf tests, identity/composition/background tests |
| No loader, permission, routing, schema, or generator mechanism | 2, 3, 5, 6 | Explicit no-diff scope command and unchanged implementation surfaces |
| Synchronize `docs/v1-maintenance.md` and `docs/prompt-sync.md` | 4 | Dated sections, mapping updates, stale-policy no-match scan |
| Refresh Codex generated outputs without hand edits | 5 | Official generator, 22-pair parity, fresh-generation tests, generated real-surface probe |
| Run targeted and full repository verification | 6 | Prompt/generator tests, diagnostics, typecheck, full tests, build, diff hygiene |
| Final implementation acceptance and no autonomous Git | 7 | Same-identity unconditional receipts and report-only handoff |

## Review and Commit Boundaries

- Task 1 is a test-only RED boundary and is not independently ready to merge.
- Tasks 2 and 3 are parallel source boundaries with disjoint files; neither may edit tests, docs, or generated artifacts.
- Task 4 is the only hand-maintained documentation boundary.
- Task 5 is the only generated-artifact boundary; every generated delta must come from the official generator.
- Tasks 6 and 7 are verification/review boundaries and make no product edits unless they return to an owning task and invalidate downstream evidence.
- The intended integrated semantic commit is `refactor: simplify deepwork agent prompts`; execution agents only suggest it. Git writes require separate explicit user authorization.

## Risks and Assumptions

- The approved design and this plan are currently untracked; they must be included in scope and review inventories even though no Git write is authorized.
- GPT-5.6 prompt carriage can update all 22 Codex agent profiles, so the generated diff is intentionally broader than the five functional profiles; project and bundled copies must still match byte-for-byte.
- The Codex generator's independent compatibility suffix still uses canonical adapter fields. Global negative matching of generated TOMLs for every `GOAL`/`STOP WHEN`/`EVIDENCE` token would be a false failure; semantic source tests and bounded generated-surface probes are authoritative.
- OMO's current `plan-critic.md` lacks the explicit receipt heading present in v1/Codex. Task 2 makes that existing three-state behavior explicit and synchronized; it does not create a new receipt mechanism.
- Existing exact-prose tests outside the fixed delegation envelope may need narrow regex adjustments after shortening. Such adjustments are allowed only when they preserve the same role, dispatch, evidence, or review invariant.

## Self-Review

- **Spec coverage:** Passed. Every Goal, Scope, Architecture, Functional-Agent Simplification, Flexible Delegation Input, Files and Synchronization, Verification, and Non-Goal requirement maps to Tasks 1-7 above.
- **Test-first order:** Passed. Task 1 creates and runs the complete RED semantic contract before Tasks 2 and 3 edit any prompt source.
- **Placeholder scan:** Passed. The plan contains no deferred implementation decision; packet examples name concrete runtime-derived values rather than asking an implementer to invent content.
- **Name/path consistency:** Passed. The same five roles, three workflows, 30 hand-maintained prompt sources, two docs, one test file, 22 project agent TOMLs, and 22 bundled mirrors are used consistently.
- **QA executability:** Passed. Every command is PowerShell-compatible, has an expected outcome, and can be executed by an agent without user manual confirmation.
- **Scope check:** Passed. Runtime loader, terminal policies, permissions, routing, schema, release behavior, generator implementation, and generated compatibility protocol remain explicit non-goals.

## Execution Handoff

Execute Tasks 1-7 in dependency-wave order. Use fresh implementation workers for Tasks 1-5, keep Tasks 2 and 3 parallel because they own disjoint files, and reserve final review dispatch for the parent orchestrator. Current plan-critic receipt status: `waiting for receipt`; this planner session is not permitted to dispatch plan-critic, Reviewer, or Oracle profiles, and any later plan edit invalidates a receipt for an earlier revision.
