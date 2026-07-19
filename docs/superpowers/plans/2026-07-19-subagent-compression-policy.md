# Subagent Compression and Review-Session Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic ocmm prompt policies that limit compression to real capacity need, a fully completed >100k-token exploration before more same-assignment work, or an economically justified continued review, while making the orchestrator reuse reviewer/plan-critic sessions within a stage, start fresh across stages, pass changed-file context, and avoid redundant review fan-out.

**Architecture:** `src/hooks/config.ts` remains the single source of truth. It will compose a tagged compression policy for every managed subagent-capable profile and a separate review-session efficiency policy only for `orchestrator`, remove stale ocmm-owned terminal blocks idempotently, and preserve the existing delegation contract as the final authoritative block. `buildCodexAgents()` will propagate the same assembled prompts into generated Codex profiles; no workflow prompt, provider cache, schema, telemetry, or runtime session-controller change is part of this plan.

**Tech Stack:** TypeScript 6 ESM, Node.js 22 built-in `node:test`, PowerShell 7, pnpm, existing Codex plugin generator, Git read-only inspection.

---

## Global Constraints

- The authoritative design is `docs/superpowers/specs/2026-07-19-subagent-compression-policy-design.md`. If implementation evidence conflicts with it, stop and correct the implementation rather than weakening the design.
- The working tree is heavily modified, including source/test paths in this plan and generated Codex outputs. Capture exact baselines under the approved OS temp directory and apply incremental patches only.
- Never run `git reset`, `git checkout`, `git restore`, `git stash`, or overwrite-style recovery against repository files. Stop on unexpected generation deltas.
- Do not run `git add`, `git commit`, `git push`, `git tag`, or any other Git write command. Product implementation and Git writes require later explicit user authorization.
- Do not modify `prompts/v1/**`, `prompts/omo/**`, `prompts/codex/**`, `skills/v1/**`, `docs/v1-maintenance.md`, `docs/prompt-sync.md`, `src/config/schema.ts`, `schema.json`, provider adapters, routing code, tool schemas, or telemetry.
- Do not add DCP detection/configuration, provider cache keys, explicit cache breakpoints, cache billing logic, a session controller, or runtime enforcement.
- The 130k current-context, 50k removable-context, and ten-future-turn values are proactive prompt guardrails only when trustworthy estimates are available. The implementation must explicitly forbid inventing unavailable measurements and must preserve emergency compression when continuation would otherwise fail.
- Do not hand-edit `.codex/agents/**` or `plugins/deepwork/**`; update them only through the generator after a temp-root candidate passes exact delta checks.
- Use PowerShell-compatible commands only. After every native command, inspect `$LASTEXITCODE` before running another native command.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/hooks/config.ts` | Modify | Own both tagged policies, ocmm-terminal-block cleanup, role selection, suffix order, and all managed registration paths. |
| `src/hooks/config.test.ts` | Modify | Cover capability/economic semantics, review identities, orchestrator continuation/fan-out rules, exclusions, deterministic text, host preservation, and idempotence. |
| `src/hooks/config.category.test.ts` | Modify | Prove every built-in category receives one common compression block and neither review-only block. |
| `src/codex/plugin-generator.test.ts` | Modify | Prove in-memory and emitted Codex profiles inherit the correct compression/orchestrator distinction. |
| `src/codex/plugin-generator.ts` | Inspect only | Existing generator already calls `createConfigHandler()`; no implementation belongs here. |
| `.codex/agents/dw-*.toml` | Regenerate | 20 subagent profiles gain compression guidance; orchestrator gains review-session guidance; builder gains neither. |
| `plugins/deepwork/agents/dw-*.toml` | Regenerate | Bundled mirror of the project agent profiles. |
| `.agents/plugins/marketplace.json` and non-agent `plugins/deepwork/**` | Verify unchanged | Candidate preflight must reject unrelated generated drift. |

No new config, schema, runtime, provider, prompt-source, skill, or telemetry file is required.

## Requirement Coverage

| Requirement | Plan evidence |
|---|---|
| Long context alone does not trigger compression | Task 1 common-policy RED assertions; Task 3 formatter. |
| Real capacity failure permits minimal emergency compression | Task 1 emergency assertions; Task 3 common policy. |
| A fully completed >100k-token exploration recommends closed-range compression before another phase | Task 1 exploration assertions; Task 3 common policy. |
| Reviewer/Oracle retains the common >100k exploration path and gets a separate same-stage path for other closed review material | Task 1 review RED assertions; Task 3 review branch. |
| No planned follow-up forbids stage-ending proactive compression | Task 1 exact assertion; Task 3 review branch. |
| Orchestrator reuses reviewer/plan-critic `task_id` for corrections inside one stage | Task 1 orchestrator RED test; Task 3 orchestrator policy. |
| Stage boundaries force a fresh session | Task 1 stage examples; Task 3 orchestrator policy. |
| Continuation includes current artifact plus changed files/sections | Task 1 focus-manifest assertions; Task 3 orchestrator policy. |
| Fresh review session and extra fan-out require explicit reasons | Task 1 orchestrator assertions; Task 3 orchestrator policy. |
| Primary compression, builder behavior, and custom agents are unchanged | Task 1 exclusions; Task 3 role flags; Task 4 generated probes. |
| v1, omo, model families, and Codex share deterministic policy text | Tasks 1–4 assembly/generation tests. |
| No provider/cache/runtime/session-controller work appears | Global constraints; Task 5 scope audit. |

### Task 1: RED — Lock OpenCode Config-Assembly Semantics

**Files:**
- Modify: `src/hooks/config.test.ts`
- Modify: `src/hooks/config.category.test.ts`
- Inspect: `src/hooks/config.ts`

- [ ] **Step 1: Capture exact target baselines outside the repository**

```powershell
$tempParent = Join-Path $env:LOCALAPPDATA "Temp\opencode"
if (-not (Test-Path -LiteralPath $tempParent)) { throw "Approved temp parent is missing: $tempParent" }
$baseline = Join-Path $tempParent "ocmm-subagent-compression-policy-source-baseline"
if (Test-Path -LiteralPath $baseline) { throw "Baseline already exists: $baseline" }
New-Item -ItemType Directory -Path $baseline | Out-Null

$targets = @(
  "src/hooks/config.ts",
  "src/hooks/config.test.ts",
  "src/hooks/config.category.test.ts",
  "src/codex/plugin-generator.ts",
  "src/codex/plugin-generator.test.ts"
)
$statusBefore = @(git status --short)
if ($LASTEXITCODE -ne 0) { throw "git status failed with exit $LASTEXITCODE" }
[System.IO.File]::WriteAllLines((Join-Path $baseline "git-status-before.txt"), $statusBefore)
git diff -- $targets | Tee-Object -FilePath (Join-Path $baseline "target-diff-before.patch") | Out-Null
if ($LASTEXITCODE -ne 0) { throw "git diff failed with exit $LASTEXITCODE" }
foreach ($path in $targets) {
  $destination = Join-Path $baseline $path
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath $path -Destination $destination
}
```

Expected: exact current target files, status, and pre-existing target diff are preserved outside the repository.

- [ ] **Step 2: Add strict tagged-policy helpers to `src/hooks/config.test.ts`**

Insert after the existing delegation-contract helper:

```ts
const COMPRESSION_POLICY_TAG = "ocmm-subagent-compression-policy"
const REVIEW_SESSION_POLICY_TAG = "ocmm-review-session-efficiency-policy"

function taggedPolicy(
  agentMap: Record<string, unknown>,
  name: string,
  tag: string,
): string {
  const prompt = String((agentMap[name] as Record<string, unknown>).prompt)
  const openingTags = prompt.match(new RegExp(`<${tag}>`, "g")) ?? []
  assert.equal(openingTags.length, 1, `expected exactly one ${tag} block for ${name}`)
  const match = prompt.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
  assert.ok(match, `missing ${tag} block for ${name}`)
  return match[1]!
}

function compressionPolicy(agentMap: Record<string, unknown>, name: string): string {
  return taggedPolicy(agentMap, name, COMPRESSION_POLICY_TAG)
}

function reviewSessionPolicy(agentMap: Record<string, unknown>, name: string): string {
  return taggedPolicy(agentMap, name, REVIEW_SESSION_POLICY_TAG)
}
```

- [ ] **Step 3: Add the common emergency-policy and exclusion RED test**

```ts
test("config scopes conservative compression to managed subagent execution", async () => {
  const configured = {
    ...defaultConfig(),
    agents: { "custom-worker": { model: "openai/gpt-5.5" } },
  }
  const target: { agent: Record<string, unknown> } = {
    agent: { "custom-worker": { prompt: "Host custom prompt." } },
  }
  await createConfigHandler({ getConfig: () => configured })(target, undefined)

  for (const name of ["orchestrator", "builder", "custom-worker"]) {
    const prompt = String((target.agent[name] as Record<string, unknown>).prompt)
    assert.doesNotMatch(prompt, /<ocmm-subagent-compression-policy>/, name)
  }
  assert.match(String((target.agent["custom-worker"] as Record<string, unknown>).prompt), /Host custom prompt\./)

  const ordinary = compressionPolicy(target.agent, "code-search")
  assert.match(ordinary, /only when the current execution is a subagent session and a `compress` tool is available/i)
  assert.match(ordinary, /If `compress` is unavailable, do not propose, simulate, or attempt compression/i)
  assert.match(ordinary, /long conversation, a high message count, one large tool result, or a stage boundary is not sufficient/i)
  assert.match(ordinary, /When no trustworthy capacity signal or size estimate exists, do not compress proactively/i)
  assert.match(ordinary, /next bounded task cannot fit/i)
  assert.match(ordinary, /smallest closed range needed to continue safely/i)
  assert.match(ordinary, /task goal, constraints, current state, pending work, decisions, paths, interfaces, and necessary evidence/i)
  assert.match(ordinary, /Never compress the active phase, unresolved errors, or source material/i)
  assert.match(ordinary, /Completed large-exploration recommendation/i)
  assert.match(ordinary, /exploration is completely finished/i)
  assert.match(ordinary, /more than 100k tokens of source material/i)
  assert.match(ordinary, /findings, paths, decisions, constraints, and exact evidence.*materialized/i)
  assert.match(ordinary, /same subagent will continue into a subsequent synthesis, planning, implementation, or review phase/i)
  assert.match(ordinary, /If exploration completes the assignment.*do not compress/i)
  assert.match(ordinary, /Never compress during an active exploration/i)
  assert.doesNotMatch(ordinary, /130k|50k|ten additional model turns/i)
  assert.doesNotMatch(ordinary, /Additional continued Reviewer\/Oracle proactive exception/i)

  const planner = compressionPolicy(target.agent, "planner")
  assert.match(planner, /subagent session/i)
  assert.doesNotMatch(planner, /Additional continued Reviewer\/Oracle proactive exception/i)
  assert.equal((target.agent.planner as Record<string, unknown>).mode, "all")
})
```

- [ ] **Step 4: Add the exact Reviewer/Oracle economic exception RED test**

```ts
test("only parsed Reviewer and Oracle identities receive proactive compression guardrails", async () => {
  const configured = {
    ...defaultConfig(),
    agents: {
      reviewer: { variants: { high: "max" as const } },
      "oracle-3rd": {
        model: "anthropic/claude-opus-4-7",
        variants: { max: "max" as const },
      },
    },
  }
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => configured })(target, undefined)

  for (const name of ["reviewer", "reviewer-high", "oracle", "oracle-2nd", "oracle-3rd-max"]) {
    const policy = compressionPolicy(target.agent, name)
    assert.match(policy, /Completed large-exploration recommendation/i, name)
    assert.match(policy, /more than 100k tokens of source material/i, name)
    assert.match(policy, /common emergency and completed >100k exploration paths remain independently available/i, name)
    assert.match(policy, /Additional continued Reviewer\/Oracle proactive exception/i, name)
    assert.match(policy, /other closed review material/i, name)
    assert.match(policy, /continued this same review session inside the current review stage/i, name)
    assert.match(policy, /rather than starting a fresh consultation or crossing a stage boundary/i, name)
    assert.match(policy, /substantial phase has closed/i, name)
    assert.match(policy, /materialized in a response or durable note/i, name)
    assert.match(policy, /selected range is closed and is no longer needed verbatim/i, name)
    assert.match(policy, /stage-ending compression with no expected follow-up is forbidden/i, name)
    assert.match(policy, /approximately 130k or more current context/i, name)
    assert.match(policy, /at least 50k removable closed context/i, name)
    assert.match(policy, /about ten additional model turns/i, name)
    assert.match(policy, /If any estimate is unavailable, do not invent it/i, name)
    assert.match(policy, /single completed tool call is not a phase boundary/i, name)
  }

  for (const name of ["planner", "plan-critic", "clarifier", "code-search", "creative"]) {
    assert.doesNotMatch(compressionPolicy(target.agent, name), /Additional continued Reviewer\/Oracle proactive exception/i, name)
  }
})
```

- [ ] **Step 5: Add the orchestrator review-session efficiency RED test**

```ts
test("only orchestrator receives deterministic review-session reuse guidance", async () => {
  const target: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => defaultConfig() })(target, undefined)

  const policy = reviewSessionPolicy(target.agent, "orchestrator")
  assert.match(policy, /continue the same reviewer or plan-critic `task_id` for corrections and rechecks inside that stage/i)
  assert.match(policy, /plan-critic rejection followed by a corrected version of the same plan remains the same stage/i)
  assert.match(policy, /reviewer findings followed by fixes to the same implementation review also remain the same stage/i)
  assert.match(policy, /start a fresh session at every stage boundary/i)
  assert.match(policy, /design review to plan review/i)
  assert.match(policy, /plan-critic approval to implementation/i)
  assert.match(policy, /implementation to final acceptance/i)
  assert.match(policy, /role, artifact, or review objective/i)
  assert.match(policy, /prior context is unavailable or invalid/i)
  assert.match(policy, /continuation fails/i)
  assert.match(policy, /intentionally independent evidence is required/i)
  assert.match(policy, /Do not fan out additional reviewers merely because profiles or tiers are configured/i)
  assert.match(policy, /current authoritative artifact path\/revision/i)
  assert.match(policy, /files changed since the previous pass/i)
  assert.match(policy, /changed plan sections when applicable/i)
  assert.match(policy, /new or updated evidence/i)
  assert.match(policy, /never excuses the reviewer or plan-critic from reading the current authoritative artifact/i)
  assert.match(policy, /Do not paste the whole accumulated conversation/i)
  assert.match(policy, /timeout, partial response, stale-revision receipt, or failed continuation is not approval/i)
  assert.doesNotMatch(policy, /ses_[A-Za-z0-9]+|Date\.now|\d{4}-\d{2}-\d{2}T/i)

  for (const name of ["builder", "planner", "reviewer", "plan-critic", "coding"]) {
    const prompt = String((target.agent[name] as Record<string, unknown>).prompt)
    assert.doesNotMatch(prompt, /<ocmm-review-session-efficiency-policy>/, name)
  }
})
```

- [ ] **Step 6: Add workflow/model independence and idempotence RED coverage**

Add this workflow/model test, preserving the global prompt-loader state with `finally`:

```ts
test("compression policy is independent of workflow and model family", async () => {
  const cases = [
    { workflow: "omo" as const, model: "anthropic/claude-sonnet-4-6" },
    { workflow: "v1" as const, model: "zhipu/glm-5.1" },
  ]

  try {
    for (const { workflow, model } of cases) {
      loadAllPrompts(join(process.cwd(), "prompts"), workflow)
      const configured = {
        ...defaultConfig(),
        workflow,
        agents: { "code-search": { model } },
      }
      const target: { agent: Record<string, unknown> } = { agent: {} }
      await createConfigHandler({ getConfig: () => configured })(target, undefined)
      assert.match(
        compressionPolicy(target.agent, "code-search"),
        /subagent session/i,
        `${workflow}/${model}`,
      )
    }
  } finally {
    loadAllPrompts(join(process.cwd(), "prompts"), "omo")
  }
})
```

Then replace the existing terminal idempotence test with:

```ts
test("config preserves host text and keeps all owned terminal policies idempotent", async () => {
  const cfg = {
    agent: {
      orchestrator: {
        prompt: [
          "Host orchestrator prompt.",
          "<ocmm-review-session-efficiency-policy>",
          "stale review policy",
          "</ocmm-review-session-efficiency-policy>",
        ].join("\n"),
      },
      planner: {
        prompt: [
          "Host planner prompt.",
          "<ocmm-subagent-compression-policy>",
          "stale compression policy",
          "</ocmm-subagent-compression-policy>",
          "<ocmm-delegation-contract>",
          "stale delegation contract",
          "</ocmm-delegation-contract>",
        ].join("\n"),
      },
    },
  }
  const handler = createConfigHandler({ getConfig: () => defaultConfig() })
  await handler(cfg, undefined)
  await handler(cfg, undefined)

  const orchestrator = String((cfg.agent.orchestrator as Record<string, unknown>).prompt)
  assert.match(orchestrator, /Host orchestrator prompt\./)
  assert.doesNotMatch(orchestrator, /stale review policy/)
  assert.equal(orchestrator.match(/<ocmm-review-session-efficiency-policy>/g)?.length, 1)

  const planner = String((cfg.agent.planner as Record<string, unknown>).prompt)
  assert.match(planner, /Host planner prompt\./)
  assert.doesNotMatch(planner, /stale compression policy|stale delegation contract/)
  assert.equal(planner.match(/<ocmm-subagent-compression-policy>/g)?.length, 1)
  assert.equal(planner.match(/<ocmm-delegation-contract>/g)?.length, 1)
  assert.ok(
    planner.indexOf("</ocmm-subagent-compression-policy>") < planner.indexOf("<ocmm-delegation-contract>"),
  )
  assert.match(planner, /<\/ocmm-delegation-contract>\s*$/)
})
```

- [ ] **Step 7: Add all-category RED coverage to `src/hooks/config.category.test.ts`**

```ts
test("every category receives only the common compression policy", async () => {
  const cfg: { agent: Record<string, unknown> } = { agent: {} }
  await createConfigHandler({ getConfig: () => defaultConfig() })(cfg, undefined)

  for (const category of BUILTIN_CATEGORIES) {
    const prompt = String((cfg.agent[category.name] as Record<string, unknown>).prompt)
    assert.equal(prompt.match(/<ocmm-subagent-compression-policy>/g)?.length, 1, category.name)
    assert.match(prompt, /only when the current execution is a subagent session/i, category.name)
    assert.match(prompt, /When no trustworthy capacity signal or size estimate exists, do not compress proactively/i, category.name)
    assert.match(prompt, /more than 100k tokens of source material/i, category.name)
    assert.match(prompt, /Never compress during an active exploration/i, category.name)
    assert.doesNotMatch(prompt, /Additional continued Reviewer\/Oracle proactive exception/i, category.name)
    assert.doesNotMatch(prompt, /<ocmm-review-session-efficiency-policy>/, category.name)
  }
})
```

- [ ] **Step 8: Run focused config tests and capture RED**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts
if ($LASTEXITCODE -eq 0) { throw "Expected RED: tagged policies are not implemented" }
```

Expected: failure comes from missing new tagged policies, not syntax or unrelated assertions.

### Task 2: RED — Lock Codex Propagation

**Files:**
- Modify: `src/codex/plugin-generator.test.ts`
- Inspect only: `src/codex/plugin-generator.ts`

- [ ] **Step 1: Add a strict generated-policy extractor**

```ts
function extractTaggedPolicy(instructions: string, tag: string): string {
  const openingTags = instructions.match(new RegExp(`<${tag}>`, "g")) ?? []
  assert.equal(openingTags.length, 1, `generated instructions must contain one ${tag} block`)
  const match = instructions.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
  assert.ok(match, `generated instructions are missing ${tag}`)
  return match[1]!
}
```

- [ ] **Step 2: Add in-memory managed-identity RED coverage**

```ts
test("Codex agents inherit compression and review-session policies by managed identity", async () => {
  const agents = await buildCodexAgents({
    config: {
      ...defaultConfig(),
      workflow: "codex",
      agents: { reviewer: { variants: { high: "max" as const } } },
    },
    cwd: process.cwd(),
    skillsRoot: join(process.cwd(), "skills"),
  })
  const instructionsFor = (sourceName: string): string => {
    const agent = agents.find((candidate) => candidate.sourceName === sourceName)
    assert.ok(agent, `missing generated agent ${sourceName}`)
    return agent.developerInstructions
  }

  assert.doesNotMatch(instructionsFor("orchestrator"), /<ocmm-subagent-compression-policy>/)
  assert.match(
    extractTaggedPolicy(instructionsFor("orchestrator"), "ocmm-review-session-efficiency-policy"),
    /same reviewer or plan-critic `task_id` for corrections and rechecks inside that stage/i,
  )
  for (const name of ["builder", "planner", "reviewer", "plan-critic", "coding"]) {
    assert.doesNotMatch(instructionsFor(name), /<ocmm-review-session-efficiency-policy>/, name)
  }
  assert.doesNotMatch(instructionsFor("builder"), /<ocmm-subagent-compression-policy>/)
  for (const name of ["code-search", "explore", "planner", "creative"]) {
    const policy = extractTaggedPolicy(instructionsFor(name), "ocmm-subagent-compression-policy")
    assert.match(policy, /When no trustworthy capacity signal or size estimate exists, do not compress proactively/i, name)
    assert.doesNotMatch(policy, /Additional continued Reviewer\/Oracle proactive exception/i, name)
  }
  for (const name of ["reviewer", "reviewer-high", "oracle", "oracle-2nd"]) {
    const policy = extractTaggedPolicy(instructionsFor(name), "ocmm-subagent-compression-policy")
    assert.match(policy, /Completed large-exploration recommendation/i, name)
    assert.match(policy, /more than 100k tokens of source material/i, name)
    assert.match(policy, /common emergency and completed >100k exploration paths remain independently available/i, name)
    assert.match(policy, /stage-ending compression with no expected follow-up is forbidden/i, name)
    assert.match(policy, /approximately 130k or more current context/i, name)
  }
})
```

- [ ] **Step 3: Extend emitted-TOML assertions**

In `generateCodexPlugin writes a self-contained bundle`, read `dw-builder.toml`:

```ts
const builder = readFileSync(
  join(result.pluginRoot, "agents", `${CODEX_AGENT_PREFIX}-builder.toml`),
  "utf8",
)
```

Then add:

```ts
assert.doesNotMatch(orchestrator, /<ocmm-subagent-compression-policy>/)
assert.match(
  extractTaggedPolicy(orchestrator, "ocmm-review-session-efficiency-policy"),
  /files changed since the previous pass/i,
)
assert.doesNotMatch(builder, /<ocmm-subagent-compression-policy>|<ocmm-review-session-efficiency-policy>/)
assert.match(
  extractTaggedPolicy(coding, "ocmm-subagent-compression-policy"),
  /smallest closed range needed to continue safely/i,
)
assert.match(
  extractTaggedPolicy(reviewer, "ocmm-subagent-compression-policy"),
  /about ten additional model turns/i,
)
assert.match(
  extractTaggedPolicy(oracle2nd, "ocmm-subagent-compression-policy"),
  /do not invent it/i,
)
```

- [ ] **Step 4: Run the Codex test and capture RED**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -eq 0) { throw "Expected RED: generated agents do not contain the new policies" }
```

### Task 3: GREEN — Implement Shared Deterministic Policies

**Files:**
- Modify: `src/hooks/config.ts`
- Test: `src/hooks/config.test.ts`
- Test: `src/hooks/config.category.test.ts`
- Test: `src/codex/plugin-generator.test.ts`

- [ ] **Step 1: Replace delegation-only cleanup with owned-terminal-policy cleanup**

```ts
const DELEGATION_CONTRACT_TAG = "ocmm-delegation-contract"
const SUBAGENT_COMPRESSION_POLICY_TAG = "ocmm-subagent-compression-policy"
const REVIEW_SESSION_EFFICIENCY_POLICY_TAG = "ocmm-review-session-efficiency-policy"
const OCMM_TERMINAL_POLICY_BLOCK = new RegExp(
  `(?:\\n\\n---\\n\\n)?<(${DELEGATION_CONTRACT_TAG}|${SUBAGENT_COMPRESSION_POLICY_TAG}|${REVIEW_SESSION_EFFICIENCY_POLICY_TAG})>[\\s\\S]*?<\\/\\1>\\s*`,
  "g",
)

function appendPromptSuffix(prompt: string, suffix: string): string {
  const body = prompt.replace(OCMM_TERMINAL_POLICY_BLOCK, "").trim()
  const cleanSuffix = suffix.trim()
  return body ? `${body}\n\n---\n\n${cleanSuffix}` : cleanSuffix
}
```

- [ ] **Step 2: Add complete policy formatters**

```ts
function wrapTerminalPolicy(tag: string, title: string, lines: readonly string[]): string {
  return [
    `<${tag}>`,
    `## ${title}`,
    ...lines,
    `</${tag}>`,
  ].join("\n")
}

function compressionPolicyFor(name: string): string {
  const lines = [
    "Apply this policy only when the current execution is a subagent session and a `compress` tool is available.",
    "If `compress` is unavailable, do not propose, simulate, or attempt compression.",
    "A long conversation, a high message count, one large tool result, or a stage boundary is not sufficient reason to compress.",
    "When no trustworthy capacity signal or size estimate exists, do not compress proactively.",
    "Emergency compression is permitted when an explicit system/tool capacity warning, a context-budget signal, or concrete evidence shows that the next bounded task cannot fit.",
    "Emergency compression must remove only the smallest closed range needed to continue safely.",
    "Preserve the task goal, constraints, current state, pending work, decisions, paths, interfaces, and necessary evidence.",
    "Never compress the active phase, unresolved errors, or source material that still needs exact quotation or verification.",
    "",
    "### Completed large-exploration recommendation",
    "Any managed subagent may proactively compress one completed exploration/read/search batch only when every condition below is true:",
    "1. The exploration is completely finished; no file, search branch, or evidence question from that batch remains open.",
    "2. A trustworthy estimate shows that the completed exploration introduced more than 100k tokens of source material into the current context.",
    "3. Required findings, paths, decisions, constraints, and exact evidence that must survive have been materialized in the response or a durable note.",
    "4. The selected raw exploration range is closed and is no longer needed verbatim.",
    "5. The same subagent will continue into a subsequent synthesis, planning, implementation, or review phase within the same assignment. If exploration completes the assignment and the subagent will return immediately, do not compress.",
    "This is a recommendation, not a mandatory tool call. If the token estimate is unavailable, do not invent it. Never compress during an active exploration.",
  ]

  if (isReviewAgentName(name)) {
    lines.push(
      "",
      "### Additional continued Reviewer/Oracle proactive exception",
      "The common emergency and completed >100k exploration paths remain independently available to review agents.",
      "For other closed review material, proactive compression before imminent exhaustion is permitted only when all conditions below are true:",
      "1. The caller continued this same review session inside the current review stage rather than starting a fresh consultation or crossing a stage boundary.",
      "2. A substantial phase has closed, such as a large read/search batch with recorded findings or a review pass with stable conclusions.",
      "3. Those conclusions have been materialized in a response or durable note.",
      "4. The selected range is closed and is no longer needed verbatim by the active review.",
      "5. The same session is expected to continue; stage-ending compression with no expected follow-up is forbidden.",
      "6. Trustworthy estimates indicate approximately 130k or more current context, at least 50k removable closed context, and either a real capacity signal or about ten additional model turns.",
      "If any estimate is unavailable, do not invent it; only this additional path is unavailable, while the common emergency and completed >100k exploration paths remain available.",
      "A single completed tool call is not a phase boundary.",
    )
  }

  return wrapTerminalPolicy(
    SUBAGENT_COMPRESSION_POLICY_TAG,
    "Subagent Compression Policy",
    lines,
  )
}

function reviewSessionEfficiencyPolicy(): string {
  return wrapTerminalPolicy(
    REVIEW_SESSION_EFFICIENCY_POLICY_TAG,
    "Review Session Efficiency Policy",
    [
      "A review stage is one role, one authoritative artifact or decision target, and one review objective from initial dispatch through corrections until that stage receives approval or a receipt, is abandoned, or hands off to another workflow phase.",
      "Continue the same reviewer or plan-critic `task_id` for corrections and rechecks inside that stage. A plan-critic rejection followed by a corrected version of the same plan remains the same stage; reviewer findings followed by fixes to the same implementation review also remain the same stage.",
      "Start a fresh session at every stage boundary, including design review to plan review, plan-critic approval to implementation, implementation to final acceptance, or any change of role, artifact, or review objective.",
      "Also start fresh when prior context is unavailable or invalid for the current target, continuation fails, or intentionally independent evidence is required.",
      "Do not fan out additional reviewers merely because profiles or tiers are configured; existing reviewer-selection rules remain authoritative.",
      "When continuing, provide the current authoritative artifact path/revision, the files changed since the previous pass, changed plan sections when applicable, and new or updated evidence. This focus manifest avoids repeated broad exploration but never excuses the reviewer or plan-critic from reading the current authoritative artifact required for its verdict.",
      "Do not paste the whole accumulated conversation when the current artifact, focus manifest, and evidence are sufficient.",
      "A timeout, partial response, stale-revision receipt, or failed continuation is not approval.",
    ],
  )
}
```

- [ ] **Step 3: Add one terminal-suffix composer**

```ts
function terminalPromptSuffixFor(args: {
  name: string
  includeCompressionPolicy: boolean
  includeReviewSessionEfficiency?: boolean
  compressionIdentity?: string
}): string {
  const blocks: string[] = []
  if (args.includeCompressionPolicy) {
    blocks.push(compressionPolicyFor(args.compressionIdentity ?? args.name))
  }
  if (args.includeReviewSessionEfficiency) {
    blocks.push(reviewSessionEfficiencyPolicy())
  }
  const delegationContract = delegationContractFor(args.name)
  if (delegationContract) blocks.push(delegationContract)
  return blocks.join("\n\n")
}
```

Ordering is compression, orchestrator efficiency, then delegation contract. In current identities no profile receives both compression and orchestrator efficiency, but the composer remains deterministic.

- [ ] **Step 4: Wire all managed registration paths**

In the built-in loop:

```ts
const terminalSuffix = terminalPromptSuffixFor({
  name: a.name,
  includeCompressionPolicy: mode !== "primary",
  includeReviewSessionEfficiency: a.name === "orchestrator",
})
if (terminalSuffix) extras.promptSuffix = terminalSuffix
```

In expanded review profiles and categories, call `terminalPromptSuffixFor({ name, includeCompressionPolicy: true })`. In `registerCompatAgentAliases()`, use:

```ts
const compressionIdentity = isReviewAgentName(alias) ? alias : target
const terminalSuffix = terminalPromptSuffixFor({
  name: alias,
  includeCompressionPolicy: aliasEntry.mode !== "primary",
  compressionIdentity,
})
if (terminalSuffix) {
  const basePrompt = typeof aliasEntry.prompt === "string" ? aliasEntry.prompt : ""
  aliasEntry.prompt = appendPromptSuffix(basePrompt, terminalSuffix)
}
```

Custom agent/category registration remains untouched.

- [ ] **Step 5: Run all targeted tests and confirm GREEN**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -ne 0) { throw "Targeted policy tests failed with exit $LASTEXITCODE" }
```

- [ ] **Step 6: Compare every source/test target to the saved baseline**

```powershell
$baseline = Join-Path $env:LOCALAPPDATA "Temp\opencode\ocmm-subagent-compression-policy-source-baseline"
foreach ($path in @(
  "src/hooks/config.ts",
  "src/hooks/config.test.ts",
  "src/hooks/config.category.test.ts",
  "src/codex/plugin-generator.ts",
  "src/codex/plugin-generator.test.ts"
)) {
  git diff --no-index -- (Join-Path $baseline $path) $path
  $code = $LASTEXITCODE
  if ($code -notin 0, 1) { throw "Comparison failed for $path with exit $code" }
}
```

Expected: only specified policy/tests are new; `src/codex/plugin-generator.ts` is unchanged from its baseline.

### Task 4: Preflight and Regenerate Codex Outputs Safely

**Files:**
- Generate candidate: `$env:LOCALAPPDATA/Temp/opencode/ocmm-subagent-compression-policy-candidate/**`
- Regenerate after preflight: `.codex/agents/**`, `plugins/deepwork/**`, `.agents/plugins/marketplace.json`

- [ ] **Step 1: Generate a complete candidate outside the repository**

```powershell
$tempParent = Join-Path $env:LOCALAPPDATA "Temp\opencode"
$candidate = Join-Path $tempParent "ocmm-subagent-compression-policy-candidate"
if (Test-Path -LiteralPath $candidate) { throw "Candidate already exists: $candidate" }
New-Item -ItemType Directory -Path $candidate | Out-Null
$env:OCMM_CANDIDATE_ROOT = $candidate
$statusBefore = @(git status --short)
if ($LASTEXITCODE -ne 0) { throw "Pre-candidate status failed with exit $LASTEXITCODE" }
node --experimental-strip-types --input-type=module -e "import path from 'node:path'; import { generateCodexPlugin } from './src/codex/plugin-generator.ts'; const root = process.env.OCMM_CANDIDATE_ROOT; if (!root) throw new Error('OCMM_CANDIDATE_ROOT is missing'); console.log(JSON.stringify(await generateCodexPlugin({ projectRoot: process.cwd(), pluginRoot: path.join(root, 'plugins', 'deepwork'), marketplacePath: path.join(root, '.agents', 'plugins', 'marketplace.json'), projectAgentsRoot: path.join(root, '.codex', 'agents') })));"
$code = $LASTEXITCODE
$env:OCMM_CANDIDATE_ROOT = $null
if ($code -ne 0) { throw "Candidate generation failed with exit $code" }
$statusAfter = @(git status --short)
if ($LASTEXITCODE -ne 0) { throw "Post-candidate status failed with exit $LASTEXITCODE" }
if (Compare-Object $statusBefore $statusAfter) { throw "Candidate generation changed repository status" }
```

- [ ] **Step 2: Prove agent candidates differ only by expected tagged blocks**

```powershell
$candidate = Join-Path $env:LOCALAPPDATA "Temp\opencode\ocmm-subagent-compression-policy-candidate"
$prefix = "developer_instructions = "
$compressionPattern = "(?s)<ocmm-subagent-compression-policy>.*?</ocmm-subagent-compression-policy>\s*"
$reviewBeforeCompatibilityPattern = "(?s)\r?\n\r?\n---\r?\n\r?\n<ocmm-review-session-efficiency-policy>.*?</ocmm-review-session-efficiency-policy>(?=\r?\n\r?\n## Subagent Dispatch Compatibility)"
function Read-AgentProfile([string]$path) {
  $lines = [System.IO.File]::ReadAllLines((Resolve-Path $path))
  $instructionLines = @($lines | Where-Object { $_.StartsWith($prefix) })
  if ($instructionLines.Count -ne 1) { throw "Expected one developer_instructions line in $path" }
  [pscustomobject]@{
    Metadata = (($lines | Where-Object { -not $_.StartsWith($prefix) }) -join "`n")
    Instructions = ($instructionLines[0].Substring($prefix.Length) | ConvertFrom-Json)
  }
}
function Assert-AgentDelta([string]$currentRoot, [string]$candidateRoot, [string]$label) {
  $currentPath = (Resolve-Path $currentRoot).Path
  $candidatePath = (Resolve-Path $candidateRoot).Path
  $currentFiles = @([System.IO.Directory]::GetFiles($currentPath, "dw-*.toml") | ForEach-Object { [System.IO.Path]::GetFileName($_) } | Sort-Object)
  $candidateFiles = @([System.IO.Directory]::GetFiles($candidatePath, "dw-*.toml") | ForEach-Object { [System.IO.Path]::GetFileName($_) } | Sort-Object)
  if (Compare-Object $currentFiles $candidateFiles) { throw "$label agent file set changed" }
  foreach ($file in $currentFiles) {
    $current = Read-AgentProfile (Join-Path $currentPath $file)
    $next = Read-AgentProfile (Join-Path $candidatePath $file)
    if ($current.Metadata -cne $next.Metadata) { throw "$label metadata changed in $file" }
    if ($current.Instructions -match "<ocmm-(subagent-compression|review-session-efficiency)-policy>") {
      throw "$label current profile already contains a new policy: $file"
    }
    $compressionExpected = if ($file -in @("dw-orchestrator.toml", "dw-builder.toml")) { 0 } else { 1 }
    $reviewExpected = if ($file -eq "dw-orchestrator.toml") { 1 } else { 0 }
    if ([regex]::Matches($next.Instructions, "<ocmm-subagent-compression-policy>").Count -ne $compressionExpected) {
      throw "$label bad compression count in $file"
    }
    if ([regex]::Matches($next.Instructions, "<ocmm-review-session-efficiency-policy>").Count -ne $reviewExpected) {
      throw "$label bad review-session count in $file"
    }
    if ($file -eq "dw-orchestrator.toml" -and -not [regex]::IsMatch($next.Instructions, $reviewBeforeCompatibilityPattern)) {
      throw "$label orchestrator review-session block is not immediately before Codex compatibility text"
    }
    $stripped = [regex]::Replace($next.Instructions, $compressionPattern, "")
    $stripped = [regex]::Replace($stripped, $reviewBeforeCompatibilityPattern, "")
    if ($stripped -cne $current.Instructions) { throw "$label changes more than expected policies in $file" }
  }
}
Assert-AgentDelta ".codex/agents" (Join-Path $candidate ".codex/agents") "project"
Assert-AgentDelta "plugins/deepwork/agents" (Join-Path $candidate "plugins/deepwork/agents") "bundled"
```

The compression pattern intentionally keeps the suffix-level `---` separator because removing the compression block reveals the existing delegation contract. Codex wraps the Original Deepwork prompt before `## Subagent Dispatch Compatibility`, so the orchestrator pattern removes its separator and review-session block only at that boundary instead of incorrectly anchoring to the end of all `developer_instructions`. Expected: 20 profiles differ only by compression, orchestrator differs only by review-session efficiency, and builder is byte-equivalent in instructions and metadata.

- [ ] **Step 3: Prove non-agent candidate outputs are unchanged**

Build sorted SHA-256 manifests for current and candidate `plugins/deepwork`, excluding `agents/`, and compare the marketplace hash. Also compare candidate project and bundled agent manifests. Any mismatch stops execution before repository generation.

Use this exact helper:

```powershell
function Get-TreeManifest([string]$root, [bool]$excludeAgents) {
  $resolvedRoot = (Resolve-Path $root).Path
  @([System.IO.Directory]::GetFiles($resolvedRoot, "*", [System.IO.SearchOption]::AllDirectories) | ForEach-Object {
    $relative = [System.IO.Path]::GetRelativePath($resolvedRoot, $_).Replace("\", "/")
    if (-not $excludeAgents -or -not $relative.StartsWith("agents/")) {
      "$relative`t$((Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash)"
    }
  } | Sort-Object)
}
$currentNonAgents = Get-TreeManifest "plugins/deepwork" $true
$candidateNonAgents = Get-TreeManifest (Join-Path $candidate "plugins/deepwork") $true
if (Compare-Object $currentNonAgents $candidateNonAgents) { throw "Candidate changes non-agent plugin output" }
if (Compare-Object (Get-TreeManifest (Join-Path $candidate ".codex/agents") $false) (Get-TreeManifest (Join-Path $candidate "plugins/deepwork/agents") $false)) {
  throw "Candidate project and bundled agents differ"
}
$currentMarketplace = (Get-FileHash -LiteralPath ".agents/plugins/marketplace.json" -Algorithm SHA256).Hash
$candidateMarketplace = (Get-FileHash -LiteralPath (Join-Path $candidate ".agents/plugins/marketplace.json") -Algorithm SHA256).Hash
if ($currentMarketplace -cne $candidateMarketplace) { throw "Candidate changes marketplace content" }
```

- [ ] **Step 4: Regenerate the repository and compare byte-for-byte with candidate**

```powershell
pnpm run gen:codex-plugin
if ($LASTEXITCODE -ne 0) { throw "Codex generation failed with exit $LASTEXITCODE" }
```

Generate full SHA-256 manifests for `.codex/agents` and `plugins/deepwork` and require exact equality with the corresponding candidate manifests; require marketplace hash equality. Do not clean or regenerate again if a mismatch occurs.

```powershell
if (Compare-Object (Get-TreeManifest ".codex/agents" $false) (Get-TreeManifest (Join-Path $candidate ".codex/agents") $false)) {
  throw "Project agents do not match the preflighted candidate"
}
if (Compare-Object (Get-TreeManifest "plugins/deepwork" $false) (Get-TreeManifest (Join-Path $candidate "plugins/deepwork") $false)) {
  throw "Bundled plugin does not match the preflighted candidate"
}
$actualMarketplace = (Get-FileHash -LiteralPath ".agents/plugins/marketplace.json" -Algorithm SHA256).Hash
$candidateMarketplace = (Get-FileHash -LiteralPath (Join-Path $candidate ".agents/plugins/marketplace.json") -Algorithm SHA256).Hash
if ($actualMarketplace -cne $candidateMarketplace) { throw "Marketplace does not match the preflighted candidate" }
```

- [ ] **Step 5: Verify real policy counts and representative semantics**

```powershell
foreach ($root in @(".codex/agents", "plugins/deepwork/agents")) {
  $compressionFiles = @(rg -l "<ocmm-subagent-compression-policy>" $root -g "dw-*.toml")
  if ($LASTEXITCODE -ne 0 -or $compressionFiles.Count -ne 20) { throw "Expected 20 compression profiles under $root" }
  $reviewFiles = @(rg -l "<ocmm-review-session-efficiency-policy>" $root -g "dw-*.toml")
  if ($LASTEXITCODE -ne 0 -or $reviewFiles.Count -ne 1) { throw "Expected one review-session profile under $root" }
  if ([System.IO.Path]::GetFileName($reviewFiles[0]) -ne "dw-orchestrator.toml") { throw "Review-session policy belongs only to orchestrator" }
}
rg -n "100k tokens of source material|Never compress during an active exploration" .codex/agents/dw-coding.toml .codex/agents/dw-code-search.toml
if ($LASTEXITCODE -ne 0) { throw "Generated exploration compression probe failed" }
rg -n "130k|50k|ten additional model turns|no expected follow-up" .codex/agents/dw-reviewer.toml .codex/agents/dw-oracle-2nd.toml
if ($LASTEXITCODE -ne 0) { throw "Generated review compression probe failed" }
rg -n "same reviewer or plan-critic.*task_id|Do not fan out additional reviewers" .codex/agents/dw-orchestrator.toml plugins/deepwork/agents/dw-orchestrator.toml
if ($LASTEXITCODE -ne 0) { throw "Generated orchestrator efficiency probe failed" }
rg -n "<ocmm-(subagent-compression|review-session-efficiency)-policy>" .codex/agents/dw-builder.toml plugins/deepwork/agents/dw-builder.toml
if ($LASTEXITCODE -ne 1) { throw "Builder unexpectedly contains a new policy" }
```

### Task 5: Full Verification, Scope Audit, and Handoff

**Files:**
- Verify all source/test and generated paths listed above.

- [ ] **Step 1: Re-run targeted tests on the generated revision**

```powershell
node --test --experimental-strip-types --test-reporter=spec src/hooks/config.test.ts src/hooks/config.category.test.ts src/codex/plugin-generator.test.ts
if ($LASTEXITCODE -ne 0) { throw "Targeted tests failed with exit $LASTEXITCODE" }
```

- [ ] **Step 2: Run project quality gates**

```powershell
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed with exit $LASTEXITCODE" }
pnpm test
if ($LASTEXITCODE -ne 0) { throw "Full test suite failed with exit $LASTEXITCODE" }
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed with exit $LASTEXITCODE" }
```

Expected: all three commands exit `0`. If a pre-existing concurrent failure remains, compare it against the recorded baseline and report it instead of changing unrelated code.

- [ ] **Step 3: Run deterministic prompt and scope checks**

Render two fresh targets and compare them byte-for-byte:

```powershell
node --experimental-strip-types --input-type=module -e "import assert from 'node:assert/strict'; import path from 'node:path'; import { defaultConfig } from './src/config/schema.ts'; import { createConfigHandler } from './src/hooks/config.ts'; import { loadAllPrompts } from './src/intent/prompt-loader.ts'; loadAllPrompts(path.join(process.cwd(), 'prompts'), 'v1'); const render = async () => { const target = { agent: {} }; await createConfigHandler({ getConfig: () => ({ ...defaultConfig(), workflow: 'v1' }) })(target, undefined); return target.agent; }; const first = await render(); const second = await render(); assert.deepEqual(first, second); const prompt = String(first.orchestrator.prompt); assert.equal((prompt.match(/<ocmm-review-session-efficiency-policy>/g) ?? []).length, 1); assert.doesNotMatch(prompt, /ses_[A-Za-z0-9]+|Date\.now|\d{4}-\d{2}-\d{2}T/);"
if ($LASTEXITCODE -ne 0) { throw "Deterministic prompt check failed with exit $LASTEXITCODE" }

function Get-AgentManifest([string]$root) {
  $resolvedRoot = (Resolve-Path $root).Path
  @([System.IO.Directory]::GetFiles($resolvedRoot, "dw-*.toml") | ForEach-Object {
    "$([System.IO.Path]::GetFileName($_))`t$((Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash)"
  } | Sort-Object)
}
if (Compare-Object (Get-AgentManifest ".codex/agents") (Get-AgentManifest "plugins/deepwork/agents")) {
  throw "Generated project and bundled agent roots differ"
}
```

Then run:

```powershell
git diff --check -- src/hooks/config.ts src/hooks/config.test.ts src/hooks/config.category.test.ts src/codex/plugin-generator.test.ts .codex/agents plugins/deepwork/agents
if ($LASTEXITCODE -ne 0) { throw "Whitespace check failed with exit $LASTEXITCODE" }
git status --short
if ($LASTEXITCODE -ne 0) { throw "Final status failed with exit $LASTEXITCODE" }
```

- [ ] **Step 4: Perform the final requirement-to-evidence audit**

Confirm each item maps to a passing test or inspected generated prompt:

1. ordinary long context alone does not trigger compression;
2. capacity failure permits only minimal closed-range emergency compression;
3. unavailable `compress` forbids proposing or simulating it;
4. reviewer/Oracle identities retain the common >100k exploration path independently of their additional review-specific path;
5. only the additional review-specific path requires same-stage continuation, closed/materialized evidence, planned follow-up, 130k/50k estimates, and capacity need or ten future turns;
6. when neither the >100k exploration volume nor the additional review guardrails can be estimated reliably, no proactive path is available and only emergency behavior remains;
7. a completed exploration above 100k source tokens is compressed only after full closure/materialization and before another phase in the same subagent;
8. orchestrator reuses reviewer/plan-critic `task_id` only inside the current stage and passes current artifact plus changed files/sections;
9. every stage boundary starts fresh, while continuation failure and intentional independent evidence remain explicit fresh-session reasons;
10. additional review fan-out is not automatic;
11. builder, primary compression, custom agents, provider/cache/schema/runtime behavior remain unchanged;
12. repeated config assembly is idempotent and deterministic;
13. v1, omo, model families, and Codex consume one source;
14. candidate and actual generation introduce no unrelated delta.

- [ ] **Step 5: Remove approved temporary evidence directories**

```powershell
$tempParent = (Resolve-Path (Join-Path $env:LOCALAPPDATA "Temp\opencode")).Path
foreach ($path in @(
  (Join-Path $tempParent "ocmm-subagent-compression-policy-source-baseline"),
  (Join-Path $tempParent "ocmm-subagent-compression-policy-candidate")
)) {
  if (-not $path.StartsWith($tempParent, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe cleanup path: $path" }
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
  if (Test-Path -LiteralPath $path) { throw "Temporary path still exists: $path" }
}
```

- [ ] **Step 6: Report completion without committing**

Report changed source/tests, generated roots, targeted/typecheck/test/build results, deterministic prompt evidence, candidate/baseline cleanup, and any residual pre-existing failure. State explicitly that no provider cache, telemetry, schema, runtime controller, commit, push, or tag was performed.
